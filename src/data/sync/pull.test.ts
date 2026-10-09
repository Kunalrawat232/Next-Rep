import { describe, expect, it } from 'vitest';
import type { LoggedSet } from '../../domain/schemas';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout, freshLocal, uuid } from '../../test/localDb';
import { pullHistory } from './pull';

type Setup = ReturnType<typeof setup>;

function setup() {
  const local = freshLocal();
  const server = createFakeRemoteLog();
  const pull = (over: Partial<Parameters<typeof pullHistory>[0]> = {}) =>
    pullHistory({ store: local.store, remote: server.remote, userId: local.userId, ...over });
  return { ...local, server, pull };
}

/** A finished workout and some sets on the server only, as if another device had sent them. */
function onServer(s: Setup, sets = 2, startedAt = '2026-10-01T10:00:00.000Z') {
  const workout = aWorkout({ startedAt });
  s.server.seedWorkout({
    ...workout,
    endedAt: new Date(Date.parse(startedAt) + 3_600_000).toISOString(),
  });
  const rows: LoggedSet[] = [];
  for (let i = 0; i < sets; i += 1) {
    const row = aSet(workout.id, {
      loggedAt: new Date(Date.parse(startedAt) + (i + 1) * 60_000).toISOString(),
    });
    s.server.seedSet(row);
    rows.push(row);
  }
  return { workout, sets: rows };
}

describe('pulling history', () => {
  it('has nothing to do on an empty server', async () => {
    const s = setup();
    expect(await s.pull()).toMatchObject({ status: 'done', changed: false, addedSets: 0 });
  });

  it('brings in finished workouts and their sets as synced, with times in canonical form', async () => {
    const s = setup();
    const { workout, sets } = onServer(s, 2);
    const outcome = await s.pull();
    expect(outcome).toMatchObject({
      status: 'done',
      changed: true,
      addedWorkouts: 1,
      addedSets: 2,
    });
    const stored = await s.store.getWorkout(workout.id);
    expect(stored).toMatchObject({ syncStatus: 'synced', everSynced: true, rev: 1, attempts: 0 });
    expect(stored?.startedAt.endsWith('Z')).toBe(true);
    const rows = await s.store.listSets(workout.id);
    expect(rows.map((r) => r.id)).toEqual(sets.map((r) => r.id));
    expect(rows.every((r) => r.syncStatus === 'synced' && r.loggedAt.endsWith('Z'))).toBe(true);
    expect(await s.store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('sorts a pulled set among local ones by time, whatever way the server writes the offset', async () => {
    const s = setup();
    const { workout } = onServer(s, 1, '2026-10-01T10:00:00.000Z');
    await s.store.startWorkout(workout);
    const local = await s.store.logSet(aSet(workout.id, { loggedAt: '2026-10-01T10:00:30.000Z' }));
    await s.pull();
    const times = (await s.store.listSets(workout.id)).map((r) => r.loggedAt);
    expect(times).toEqual([...times].sort());
    expect(times).toHaveLength(2);
    expect((await s.store.listSets(workout.id)).map((r) => r.id)).toContain(local.id);
  });

  it('does not bring in a workout that is still open on the server', async () => {
    const s = setup();
    const open = aWorkout();
    s.server.seedWorkout({ ...open, endedAt: null });
    await s.pull();
    expect(await s.store.getWorkout(open.id)).toBeUndefined();
    expect(await s.store.activeWorkout()).toBeUndefined();
  });

  it('is the same on a second pull', async () => {
    const s = setup();
    onServer(s, 3);
    await s.pull();
    expect(await s.pull()).toMatchObject({
      status: 'done',
      changed: false,
      addedSets: 0,
      addedWorkouts: 0,
    });
    expect(await s.db.sets.count()).toBe(3);
  });

  it('reads every page, including an exact multiple of the page size', async () => {
    const s = setup();
    onServer(s, 10);
    onServer(s, 10, '2026-10-02T10:00:00.000Z');
    const outcome = await s.pull({ pageSize: 5 });
    expect(outcome).toMatchObject({ addedSets: 20, addedWorkouts: 2 });
    // Four full pages of sets and then an empty one, which is how the end is known.
    expect(s.server.callsTo('fetchSets')).toHaveLength(5);
    expect(s.server.callsTo('fetchWorkouts')).toHaveLength(2);
  });

  it('names the gym of a pulled workout from the saved gym list, and leaves it empty without one', async () => {
    const s = setup();
    const gymId = uuid();
    const w = aWorkout({ gymId });
    s.server.seedWorkout({ ...w, endedAt: '2026-10-10T11:00:00.000Z' });
    s.server.seedSet(aSet(w.id));
    await s.pull();
    expect((await s.store.getWorkout(w.id))?.gymSnapshot).toBeNull();
    await s.db.workouts.clear();
    await s.db.sets.clear();
    await s.store.saveGyms([
      {
        id: gymId,
        name: 'Away gym',
        barbellKg: 20,
        isDefault: true,
        createdAt: '2026-10-01T00:00:00.000Z',
        bars: [],
      },
    ]);
    await s.pull();
    expect((await s.store.getWorkout(w.id))?.gymSnapshot).toEqual({
      name: 'Away gym',
      barbellKg: 20,
      bars: [],
    });
  });

  it('updates a synced workout that was changed on the server', async () => {
    const s = setup();
    const w = aWorkout();
    await s.store.startWorkout(w);
    await s.db.workouts.update(w.id, { syncStatus: 'synced' });
    s.server.seedWorkout({ ...w, endedAt: '2026-10-10T11:00:00.000Z' });
    s.server.seedSet(aSet(w.id));
    const outcome = await s.pull();
    expect(outcome).toMatchObject({ updatedWorkouts: 1 });
    expect((await s.store.getWorkout(w.id))?.endedAt).toBe('2026-10-10T11:00:00.000Z');
  });
});

describe('the gym of a workout that changed on the server', () => {
  it('follows the new gym, and keeps the old snapshot when the gym did not change', async () => {
    const s = setup();
    const gymA = uuid();
    const gymB = uuid();
    const gym = (id: string, name: string) => ({
      id,
      name,
      barbellKg: 20,
      isDefault: false,
      createdAt: '2026-10-01T00:00:00.000Z',
      bars: [],
    });
    await s.store.saveGyms([gym(gymA, 'Gym A'), gym(gymB, 'Gym B')]);
    const w = aWorkout({ gymId: gymA });
    await s.store.startWorkout({ ...w, gymSnapshot: { name: 'Gym A', barbellKg: 20, bars: [] } });
    await s.db.workouts.update(w.id, { syncStatus: 'synced' });
    s.server.seedWorkout({ ...w, gymId: gymA, endedAt: '2026-10-10T11:00:00.000Z' });
    s.server.seedSet(aSet(w.id));
    await s.pull();
    expect((await s.store.getWorkout(w.id))?.gymSnapshot?.name).toBe('Gym A');
    s.server.seedWorkout({ ...w, gymId: gymB, endedAt: '2026-10-10T11:00:00.000Z' });
    await s.pull();
    expect((await s.store.getWorkout(w.id))?.gymSnapshot?.name).toBe('Gym B');
  });
});

describe('what is never overwritten', () => {
  it('leaves a workout and sets that are waiting to sync alone, even when the server has the same ids', async () => {
    const s = setup();
    const w = aWorkout();
    await s.store.startWorkout(w);
    await s.store.endWorkout(w.id, '2026-10-10T12:00:00.000Z');
    const set = await s.store.logSet(aSet(w.id, { reps: 5 }));
    s.server.seedWorkout({ ...w, endedAt: '2026-10-10T11:00:00.000Z' });
    s.server.seedSet({ ...aSet(w.id, { reps: 9 }), id: set.id });
    await s.pull();
    expect((await s.store.getWorkout(w.id))?.endedAt).toBe('2026-10-10T12:00:00.000Z');
    expect((await s.store.listSets(w.id))[0]).toMatchObject({ reps: 5, syncStatus: 'pending' });
  });

  it('keeps an open local workout the server has not seen', async () => {
    const s = setup();
    const w = aWorkout();
    await s.store.startWorkout(w);
    await s.pull();
    expect((await s.store.activeWorkout())?.id).toBe(w.id);
  });

  it('does not bring back a set that was removed here and whose delete is still queued', async () => {
    const s = setup();
    const { workout, sets } = onServer(s, 2);
    await s.pull();
    await s.db.sets.delete(sets[0]!.id);
    await s.store.outbox.queueDeletion(sets[0]!.id, '2026-10-10T10:00:00.000Z');
    await s.pull();
    expect((await s.store.listSets(workout.id)).map((r) => r.id)).toEqual([sets[1]!.id]);
  });

  it('keeps a set that is waiting to sync when the server does not list it', async () => {
    const s = setup();
    const { workout } = onServer(s, 1);
    await s.pull();
    const mine = await s.store.logSet(aSet(workout.id));
    await s.pull();
    expect((await s.store.listSets(workout.id)).map((r) => r.id)).toContain(mine.id);
  });
});

describe('what the server no longer has', () => {
  it('removes synced sets that were deleted elsewhere, and then the empty workout', async () => {
    const s = setup();
    const { workout, sets } = onServer(s, 2);
    onServer(s, 2, '2026-10-02T10:00:00.000Z'); // other history, so the server is not empty
    await s.pull();
    s.server.deleteElsewhere(sets[0]!.id);
    expect(await s.pull()).toMatchObject({ removedSets: 1, changed: true });
    expect((await s.store.listSets(workout.id)).map((r) => r.id)).toEqual([sets[1]!.id]);
    s.server.deleteElsewhere(sets[1]!.id);
    s.server.hideWorkout(workout.id);
    expect(await s.pull()).toMatchObject({ removedSets: 1, removedWorkouts: 1 });
    expect(await s.store.getWorkout(workout.id)).toBeUndefined();
  });

  it('does not empty the device when the server answers with nothing at all', async () => {
    const s = setup();
    const { workout } = onServer(s, 3);
    await s.pull();
    s.server.hideWorkout(workout.id);
    for (const set of await s.db.sets.toArray()) s.server.deleteElsewhere(set.id);
    const outcome = await s.pull();
    expect(outcome).toMatchObject({ status: 'done', removalsSkipped: true, removedSets: 0 });
    expect(await s.db.sets.count()).toBe(3);
    expect(await s.db.workouts.count()).toBe(1);
  });

  it('does not accept most of the history going missing at once, but does accept a few', async () => {
    const s = setup();
    const { workout, sets } = onServer(s, 12);
    onServer(s, 2, '2026-10-02T10:00:00.000Z');
    await s.pull();
    for (const set of sets.slice(0, 11)) s.server.deleteElsewhere(set.id);
    expect(await s.pull()).toMatchObject({ removalsSkipped: true, removedSets: 0 });
    expect(await s.store.listSets(workout.id)).toHaveLength(12);
    // A smaller change is accepted.
    const t = setup();
    const b = onServer(t, 12);
    onServer(t, 12, '2026-10-02T10:00:00.000Z');
    await t.pull();
    for (const set of b.sets.slice(0, 5)) t.server.deleteElsewhere(set.id);
    expect(await t.pull()).toMatchObject({ removalsSkipped: false, removedSets: 5 });
  });

  it('keeps reading when the server returns fewer rows than asked for', async () => {
    const s = setup();
    onServer(s, 9);
    const real = s.server.remote.fetchSets.getMockImplementation()!;
    s.server.remote.fetchSets.mockImplementation(async (userId, page) =>
      real(userId, { ...page, size: Math.min(page.size, 2) }),
    );
    expect(await s.pull({ pageSize: 5 })).toMatchObject({ addedSets: 9 });
  });

  it('does not let a row deleted during the pull make it skip another', async () => {
    const s = setup();
    const { workout, sets } = onServer(s, 6);
    await s.pull();
    let first = true;
    const real = s.server.remote.fetchSets.getMockImplementation()!;
    s.server.remote.fetchSets.mockImplementation(async (userId, page) => {
      const result = await real(userId, page);
      if (first) {
        first = false;
        s.server.deleteElsewhere(sets[0]!.id); // gone between page one and page two
      }
      return result;
    });
    await s.pull({ pageSize: 3 });
    const ids = (await s.store.listSets(workout.id)).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(sets.slice(1).map((r) => r.id)));
  });

  it('shows a corrupt time as a refused row and still pulls the rest', async () => {
    const s = setup();
    const { workout } = onServer(s, 1);
    s.server.seedSet({ ...aSet(workout.id), loggedAt: '2026-10-01T24:00:00.000Z' });
    s.server.seedSet({ ...aSet(workout.id), loggedAt: '2026-02-30T10:00:00.000Z' });
    const outcome = await s.pull();
    expect(outcome).toMatchObject({ status: 'done', addedSets: 1, refused: 2 });
  });

  it('keeps a workout the server no longer lists while a set of it is waiting to sync', async () => {
    const s = setup();
    const { workout } = onServer(s, 1);
    await s.pull();
    s.server.hideWorkout(workout.id);
    await s.store.logSet(aSet(workout.id));
    await s.pull();
    expect(await s.store.getWorkout(workout.id)).toBeDefined();
  });

  it('removes nothing when the pull did not finish', async () => {
    const s = setup();
    const { workout, sets } = onServer(s, 4);
    await s.pull();
    s.server.deleteElsewhere(sets[0]!.id);
    s.server.failNext('fetchSets', 'unknown');
    expect(await s.pull()).toEqual({ status: 'failed' });
    expect(await s.store.listSets(workout.id)).toHaveLength(4);
    expect(await s.pull()).toMatchObject({ status: 'done', removedSets: 1 });
  });

  it('does not take a row that failed the checks for deleted, and skips it', async () => {
    const s = setup();
    const { workout, sets } = onServer(s, 2);
    await s.pull();
    // The server now has a bad value for the first set (more reps than allowed).
    s.server.seedSet({ ...sets[0]!, reps: 500 });
    const outcome = await s.pull();
    expect(outcome).toMatchObject({ status: 'done', refused: 1, removedSets: 0 });
    expect(await s.store.listSets(workout.id)).toHaveLength(2);
  });
});

describe('when things go wrong', () => {
  it('stores nothing when offline, and says so', async () => {
    const s = setup();
    onServer(s, 2);
    s.server.setOffline(true);
    expect(await s.pull()).toEqual({ status: 'offline' });
    expect(await s.db.sets.count()).toBe(0);
    expect(await s.db.workouts.count()).toBe(0);
  });

  it('stores nothing when it fails half way through the sets', async () => {
    const s = setup();
    onServer(s, 10);
    // The first page of sets works, the second does not.
    s.server.failNext('fetchSets', 'unknown');
    expect(await s.pull({ pageSize: 5 })).toEqual({ status: 'failed' });
    expect(await s.db.sets.count()).toBe(0);
  });

  it('treats a call that throws as trouble on the server, not a crash', async () => {
    const s = setup();
    onServer(s, 1);
    s.server.remote.fetchWorkouts.mockRejectedValueOnce(new Error('boom'));
    expect(await s.pull()).toEqual({ status: 'failed' });
  });

  it('stops without storing when the user has signed out', async () => {
    const s = setup();
    onServer(s, 3);
    let calls = 0;
    const outcome = await s.pull({ pageSize: 1, isActive: () => (calls += 1) < 3 });
    expect(outcome).toEqual({ status: 'stopped' });
    expect(await s.db.sets.count()).toBe(0);
  });

  it('leaves a set whose workout is not on the device for a later pull', async () => {
    const s = setup();
    s.server.seedSet(aSet(uuid()));
    expect(await s.pull()).toMatchObject({ status: 'done', skippedSets: 1, addedSets: 0 });
  });

  it('skips rows with bad values and carries on with the good ones', async () => {
    const s = setup();
    const { workout } = onServer(s, 1);
    s.server.seedSet({ ...aSet(workout.id), reps: 0 });
    s.server.seedSet({ ...aSet(workout.id), totalKg: 9999 });
    const outcome = await s.pull();
    expect(outcome).toMatchObject({ status: 'done', refused: 2, addedSets: 1 });
  });
});

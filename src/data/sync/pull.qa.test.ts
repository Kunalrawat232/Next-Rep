import { describe, expect, it, vi } from 'vitest';
import type { LoggedSet } from '../../domain/schemas';
import type { RemoteLog } from './types';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout, freshLocal, reopenLocal, uuid } from '../../test/localDb';
import { pullHistory } from './pull';

type Rows = unknown[];

/** A server that answers from fixed pages, whatever it is asked, for rows that break the rules. */
function scripted(workoutPages: Rows[], setPages: Rows[] = [[]]): RemoteLog {
  const w = [...workoutPages];
  const s = [...setPages];
  const never = async () => ({ status: 'ok', value: undefined }) as const;
  return {
    upsertWorkouts: never,
    upsertSets: never,
    softDeleteSet: never,
    fetchWorkouts: async () => ({ status: 'ok', value: w.shift() ?? [] }),
    fetchSets: async () => ({ status: 'ok', value: s.shift() ?? [] }),
  };
}

const wRow = (over: Record<string, unknown> = {}) => ({
  id: uuid(),
  gymId: null,
  startedAt: '2026-10-01T10:00:00.000Z',
  endedAt: '2026-10-01T11:00:00.000Z',
  notes: null,
  ...over,
});

const run = (remote: RemoteLog, local = freshLocal()) => ({
  local,
  result: pullHistory({ store: local.store, remote, userId: local.userId }),
});

describe('server rows with odd timestamps', () => {
  const forms: [string, string, string][] = [
    ['Postgres +00:00', '2026-10-01T10:00:00+00:00', '2026-10-01T10:00:00.000Z'],
    ['no milliseconds', '2026-10-01T10:00:00Z', '2026-10-01T10:00:00.000Z'],
    ['microseconds', '2026-10-01T10:00:00.123456+00:00', '2026-10-01T10:00:00.123Z'],
    ['+05:30 offset', '2026-10-01T15:30:00+05:30', '2026-10-01T10:00:00.000Z'],
    ['-08:00 across midnight', '2026-09-30T16:00:00-08:00', '2026-10-01T00:00:00.000Z'],
  ];
  it.each(forms)('%s is stored in canonical UTC form', async (_l, given, canonical) => {
    const wk = wRow({ startedAt: given, endedAt: '2026-10-02T00:00:00Z' });
    const set = aSet(wk.id as string, { loggedAt: given });
    const { local, result } = run(scripted([[wk]], [[set]]));
    expect(await result).toMatchObject({ status: 'done', addedWorkouts: 1, addedSets: 1 });
    expect((await local.store.getWorkout(wk.id as string))?.startedAt).toBe(canonical);
    expect((await local.store.listSets(wk.id as string))[0]?.loggedAt).toBe(canonical);
  });

  it('a pulled set sorts correctly against local sets even when its offset differs', async () => {
    const wk = wRow({ startedAt: '2026-10-01T10:00:00Z', endedAt: '2026-10-01T12:00:00Z' });
    const early = aSet(wk.id as string, { loggedAt: '2026-10-01T15:31:00+05:30' }); // 10:01Z
    const local = freshLocal();
    await local.store.startWorkout({
      id: wk.id as string,
      gymId: null,
      startedAt: wk.startedAt as string,
    });
    const mine = await local.store.logSet(
      aSet(wk.id as string, { loggedAt: '2026-10-01T10:02:00.000Z' }),
    );
    await pullHistory({
      store: local.store,
      remote: scripted([[wk]], [[early]]),
      userId: local.userId,
    });
    expect((await local.store.listSets(wk.id as string)).map((s) => s.id)).toEqual([
      early.id,
      mine.id,
    ]);
  });
});

describe('rows that break the schema', () => {
  it('refuses them, counts them, and does not stop the good ones', async () => {
    const good = wRow();
    const bad = [
      wRow({ startedAt: 'yesterday' }),
      wRow({ endedAt: '2026-09-01T00:00:00.000Z' }), // before start
      wRow({ gymId: 'not-a-uuid' }),
      wRow({ notes: 'x'.repeat(1001) }),
      wRow({ endedAt: '2026-10-01T24:00:00.000Z' }),
    ];
    const rows = [good, ...bad].sort((a, b) => (a.id < b.id ? -1 : 1));
    const { local, result } = run(scripted([rows], [[aSet(good.id)]]));
    expect(await result).toMatchObject({ status: 'done', refused: 5, addedWorkouts: 1 });
    expect(await local.store.getWorkout(good.id)).toBeDefined();
  });

  const badSets: [string, Partial<LoggedSet>][] = [
    ['reps 0', { reps: 0 }],
    ['reps 101', { reps: 101 }],
    ['total 500.01', { totalKg: 500.01, barKg: null, perSideKg: null, inputMode: 'total' }],
    ['negative total', { totalKg: -1, barKg: null, perSideKg: null, inputMode: 'total' }],
    ['inconsistent breakdown', { totalKg: 61 }],
    ['unknown mode', { inputMode: 'wide' as never }],
    ['NaN total', { totalKg: NaN }],
  ];
  it.each(badSets)('a server set with %s is refused, not stored', async (_l, over) => {
    const wk = wRow();
    const set = aSet(wk.id as string, over);
    const { local, result } = run(scripted([[wk]], [[set]]));
    expect(await result).toMatchObject({ status: 'done', refused: 1, addedSets: 0 });
    expect(await local.store.listSets(wk.id as string)).toEqual([]);
  });

  it('a refused server set does not delete the synced local copy (it is still on the server)', async () => {
    const server = createFakeRemoteLog();
    const local = freshLocal();
    const wk = aWorkout();
    server.seedWorkout({ ...wk, endedAt: '2026-10-10T11:00:00.000Z' });
    const good = aSet(wk.id);
    const other = aSet(wk.id);
    server.seedSet(good);
    server.seedSet(other);
    await pullHistory({ store: local.store, remote: server.remote, userId: local.userId });
    expect(await local.store.listSets(wk.id)).toHaveLength(2);
    // Now the server's copy of one set goes bad (reps 0, e.g. edited by hand in the dashboard).
    server.seedSet({ ...other, reps: 0 });
    const out = await pullHistory({
      store: local.store,
      remote: server.remote,
      userId: local.userId,
    });
    expect(out).toMatchObject({ status: 'done', refused: 1, removedSets: 0 });
    expect(await local.store.listSets(wk.id)).toHaveLength(2);
  });

  it('a set whose workout is refused is skipped, not stored without a workout', async () => {
    const badWorkout = wRow({ startedAt: 'nonsense' });
    const set = aSet(badWorkout.id as string);
    const { local, result } = run(scripted([[badWorkout]], [[set]]));
    expect(await result).toMatchObject({ refused: 1, addedSets: 0, skippedSets: 1 });
    expect(await local.db.sets.count()).toBe(0);
  });
});

describe('duplicates and ordering', () => {
  it('the same id twice in one page is stored once', async () => {
    const wk = wRow();
    const set = aSet(wk.id as string);
    const { local, result } = run(scripted([[wk, wk]], [[set, set]]));
    const out = await result;
    expect(out).toMatchObject({ status: 'done', addedWorkouts: 1, addedSets: 1 });
    expect(await local.db.workouts.count()).toBe(1);
    expect(await local.db.sets.count()).toBe(1);
  });

  it('a page that starts by repeating the last row of the previous page is stored once', async () => {
    const a = wRow({ id: uuid(901) });
    const b = wRow({ id: uuid(902) });
    const c = wRow({ id: uuid(903) });
    const sets = [a, b, c].map((wk) => aSet(wk.id));
    const { local, result } = run(scripted([[a, b], [b, c], []], [sets]));
    expect(await result).toMatchObject({ status: 'done', addedWorkouts: 3 });
    expect(await local.db.workouts.count()).toBe(3);
  });

  it('a page that ends on the id it was asked to continue after is trouble, not the end', async () => {
    const a = wRow({ id: uuid(901) });
    const b = wRow({ id: uuid(902) });
    const { local, result } = run(scripted([[a, b], [b], []]));
    expect(await result).toEqual({ status: 'failed' });
    expect(await local.db.workouts.count()).toBe(0);
  });

  it('a server that repeats the same page forever is stopped, and nothing is stored', async () => {
    const a = wRow({ id: uuid(911) });
    let calls = 0;
    const remote = scripted([]);
    remote.fetchWorkouts = async () => {
      calls += 1;
      return { status: 'ok', value: [a] };
    };
    const { local, result } = run(remote);
    expect(await result).toEqual({ status: 'failed' });
    expect(calls).toBeLessThanOrEqual(3);
    expect(await local.db.workouts.count()).toBe(0);
  });

  it('pages that come back in descending order still end (the cursor must not loop)', async () => {
    const hi = wRow({ id: uuid(930) });
    const lo = wRow({ id: uuid(920) });
    let call = 0;
    const remote = scripted([]);
    remote.fetchWorkouts = async () => {
      call += 1;
      return { status: 'ok', value: call === 1 ? [hi, lo] : call === 2 ? [hi, lo] : [] };
    };
    const { result } = run(remote);
    expect(await result).toEqual({ status: 'failed' });
    expect(call).toBeLessThanOrEqual(3);
  });

  it.each([
    ['null', null],
    ['a number id', 5],
    ['an object', { id: 'x' }],
  ])('a last row whose id is %s ends the pull as trouble, not as the end', async (_l, id) => {
    const { local, result } = run(scripted([[{ ...wRow(), id }]]));
    expect(await result).toEqual({ status: 'failed' });
    expect(await local.db.workouts.count()).toBe(0);
  });

  it('a null row in the page is refused without crashing the pull', async () => {
    const good = wRow({ id: uuid(940) });
    const last = wRow({ id: uuid(941) });
    const sets = [good, last].map((wk) => aSet(wk.id));
    const { result } = run(scripted([[null, 'text', 42, good, last]], [sets]));
    expect(await result).toMatchObject({ status: 'done', refused: 3, addedWorkouts: 2 });
  });
});

describe('a pull that fails half way changes nothing', () => {
  it.each([
    ['sets read fails after workouts were read', 'fetchSets'],
    ['workouts read fails first', 'fetchWorkouts'],
  ] as const)('%s', async (_l, method) => {
    const server = createFakeRemoteLog();
    const wk = aWorkout();
    server.seedWorkout({ ...wk, endedAt: '2026-10-10T11:00:00.000Z' });
    server.seedSet(aSet(wk.id));
    server.failNext(method, 'unknown');
    const local = freshLocal();
    const out = await pullHistory({
      store: local.store,
      remote: server.remote,
      userId: local.userId,
    });
    expect(out).toEqual({ status: 'failed' });
    expect(await local.db.workouts.count()).toBe(0);
    expect(await local.db.sets.count()).toBe(0);
  });

  it.each([
    ['offline', 'offline'],
    ['rejected', 'failed'],
    ['conflict', 'failed'],
    ['unknown', 'failed'],
  ] as const)('a %s failure is reported as %s', async (reason, status) => {
    const server = createFakeRemoteLog();
    server.failNext('fetchWorkouts', reason);
    const local = freshLocal();
    expect(
      await pullHistory({ store: local.store, remote: server.remote, userId: local.userId }),
    ).toEqual({ status });
  });

  it('a read that throws is a failure, never an unhandled rejection', async () => {
    const remote = scripted([]);
    remote.fetchWorkouts = vi.fn(async () => {
      throw new Error('boom');
    });
    const { result } = run(remote);
    expect(await result).toEqual({ status: 'failed' });
  });

  it('a user who signs out between the two reads stores nothing', async () => {
    const server = createFakeRemoteLog();
    const wk = aWorkout();
    server.seedWorkout({ ...wk, endedAt: '2026-10-10T11:00:00.000Z' });
    server.seedSet(aSet(wk.id));
    const local = freshLocal();
    let active = true;
    server.remote.fetchSets.mockImplementationOnce(async () => {
      active = false;
      return { status: 'ok', value: [] };
    });
    const out = await pullHistory({
      store: local.store,
      remote: server.remote,
      userId: local.userId,
      isActive: () => active,
    });
    expect(out).toEqual({ status: 'stopped' });
    expect(await local.db.workouts.count()).toBe(0);
  });
});

describe('a bad answer must not wipe the device', () => {
  async function deviceWithSynced(n: number) {
    const server = createFakeRemoteLog();
    const local = freshLocal();
    const wk = aWorkout();
    server.seedWorkout({ ...wk, endedAt: '2026-10-10T11:00:00.000Z' });
    for (let i = 0; i < n; i += 1)
      server.seedSet(
        aSet(wk.id, { loggedAt: `2026-10-10T10:${String(i).padStart(2, '0')}:00.000Z` }),
      );
    await pullHistory({ store: local.store, remote: server.remote, userId: local.userId });
    return { server, local, wk };
  }

  it('an empty answer removes nothing', async () => {
    const { server, local } = await deviceWithSynced(3);
    for (const id of [...server.sets.keys()]) server.deleteElsewhere(id);
    const out = await pullHistory({
      store: local.store,
      remote: server.remote,
      userId: local.userId,
    });
    expect(out).toMatchObject({ status: 'done', removalsSkipped: true, removedSets: 0 });
    expect(await local.db.sets.count()).toBe(3);
  });

  it('9 of 12 missing removes them (below the "10 and most" guard); 10 of 12 removes none', async () => {
    const nine = await deviceWithSynced(12);
    [...nine.server.sets.keys()].slice(0, 9).forEach(nine.server.deleteElsewhere);
    expect(
      await pullHistory({
        store: nine.local.store,
        remote: nine.server.remote,
        userId: nine.local.userId,
      }),
    ).toMatchObject({ removedSets: 9, removalsSkipped: false });

    const ten = await deviceWithSynced(12);
    [...ten.server.sets.keys()].slice(0, 10).forEach(ten.server.deleteElsewhere);
    expect(
      await pullHistory({
        store: ten.local.store,
        remote: ten.server.remote,
        userId: ten.local.userId,
      }),
    ).toMatchObject({ removedSets: 0, removalsSkipped: true });
    expect(await ten.local.db.sets.count()).toBe(12);
  });

  it('pending local sets are never touched by a pull that does not list them', async () => {
    const { server, local, wk } = await deviceWithSynced(1);
    const mine = await local.store.logSet(aSet(wk.id, { loggedAt: '2026-10-10T12:00:00.000Z' }));
    await pullHistory({ store: local.store, remote: server.remote, userId: local.userId });
    expect((await local.store.listSets(wk.id)).map((s) => s.id)).toContain(mine.id);
    expect((await local.db.sets.get(mine.id))?.syncStatus).toBe('pending');
  });

  it('a local pending workout is not overwritten by the server copy', async () => {
    const server = createFakeRemoteLog();
    const local = freshLocal();
    const wk = aWorkout();
    await local.store.startWorkout(wk);
    await local.store.endWorkout(wk.id, '2026-10-10T11:00:00.000Z');
    server.seedWorkout({
      ...wk,
      endedAt: '2026-10-10T09:00:00.000Z' as string,
      startedAt: '2026-10-10T08:00:00.000Z',
    });
    await pullHistory({ store: local.store, remote: server.remote, userId: local.userId });
    expect((await local.store.getWorkout(wk.id))?.endedAt).toBe('2026-10-10T11:00:00.000Z');
  });
});

describe('two users on one device', () => {
  it('each user has their own database; a pull for B never shows A rows', async () => {
    const a = freshLocal('user-a-qa');
    const b = freshLocal('user-b-qa');
    const wk = aWorkout();
    await a.store.startWorkout(wk);
    await a.store.logSet(aSet(wk.id));
    expect(await b.db.sets.count()).toBe(0);
    expect(await b.store.activeWorkout()).toBeUndefined();
    expect(a.db.name).not.toBe(b.db.name);
    expect(a.db.name).toBe('next-rep-user-a-qa');
  });

  it('A returns after B signed in and out: A unsynced rows are still there and still A only', async () => {
    const a = freshLocal('user-a-again');
    const wk = aWorkout();
    await a.store.startWorkout(wk);
    const set = await a.store.logSet(aSet(wk.id));
    a.db.close();
    freshLocal('user-b-again');
    const back = reopenLocal('user-a-again');
    expect((await back.store.listSets(wk.id)).map((s) => s.id)).toEqual([set.id]);
    expect(await back.store.counts()).toEqual({ pending: 2, failed: 0 });
  });

  it('passes the signed-in user id to the server on every page', async () => {
    const server = createFakeRemoteLog();
    const local = freshLocal('user-c-qa');
    await pullHistory({ store: local.store, remote: server.remote, userId: 'user-c-qa' });
    expect(server.calls.every((c) => c.userId === 'user-c-qa')).toBe(true);
  });
});

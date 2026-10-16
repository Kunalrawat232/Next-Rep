import { describe, expect, it } from 'vitest';
import { aSet, aWorkout, freshLocal, uuid } from '../../test/localDb';
import { BACKOFF_MAX_MS } from './logStore';

describe('writes are validated and canonical', () => {
  it.each([
    ['+05:30 offset', '2026-10-10T15:30:00+05:30', '2026-10-10T10:00:00.000Z'],
    ['Postgres +00:00', '2026-10-10T10:00:00+00:00', '2026-10-10T10:00:00.000Z'],
    ['no milliseconds', '2026-10-10T10:00:00Z', '2026-10-10T10:00:00.000Z'],
  ])('a set logged with %s is stored in canonical form', async (_l, given, canonical) => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const row = await store.logSet(aSet(w.id, { loggedAt: given }));
    expect(row.loggedAt).toBe(canonical);
  });

  it('sets logged in different offsets sort by the real instant', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const third = await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T16:15:00+05:30' })); // 10:45Z
    const second = await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T10:30:00+00:00' }));
    const first = await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T15:00:00+05:30' })); // 09:30Z
    expect((await store.listSets(w.id)).map((s) => s.id)).toEqual([first.id, second.id, third.id]);
  });

  it('a set for a workout that does not exist is refused and nothing is stored', async () => {
    const { store, db } = freshLocal();
    await expect(store.logSet(aSet(uuid(5000)))).rejects.toThrow();
    expect(await db.sets.count()).toBe(0);
  });

  it.each([
    ['reps 0', { reps: 0 }],
    ['reps 101', { reps: 101 }],
    ['total 501', { totalKg: 501, barKg: null, perSideKg: null, inputMode: 'total' as const }],
    [
      'total below zero',
      { totalKg: -1, barKg: null, perSideKg: null, inputMode: 'total' as const },
    ],
    ['breakdown that does not add up', { totalKg: 61 }],
    ['time without a zone', { loggedAt: '2026-10-10T10:00:00' }],
  ])('an invalid set (%s) is refused and nothing is stored', async (_l, over) => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await expect(store.logSet(aSet(w.id, over))).rejects.toThrow();
    expect(await db.sets.count()).toBe(0);
  });

  it('logging the same id again keeps the first row, even with different reps (a retry cannot rewrite history)', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const first = await store.logSet(aSet(w.id, { reps: 5 }));
    const again = await store.logSet({ ...aSet(w.id), id: first.id, reps: 9 });
    expect(again.reps).toBe(5);
    expect(await store.listSets(w.id)).toHaveLength(1);
  });

  it('a retried start after the workout ended and synced does not reopen it or reset its sync state', async () => {
    const { store, db } = freshLocal();
    const input = aWorkout();
    await store.startWorkout(input);
    await store.endWorkout(input.id, '2026-10-10T11:00:00.000Z');
    await store.outbox.markSynced('workout', [{ id: input.id, rev: 2 }]);
    await store.startWorkout(input);
    expect(await db.workouts.get(input.id)).toMatchObject({
      endedAt: '2026-10-10T11:00:00.000Z',
      syncStatus: 'synced',
      rev: 2,
    });
    expect(await store.activeWorkout()).toBeUndefined();
  });

  it('ending a workout that does not exist throws and creates nothing', async () => {
    const { store, db } = freshLocal();
    await expect(store.endWorkout(uuid(6000), '2026-10-10T11:00:00.000Z')).rejects.toThrow();
    expect(await db.workouts.count()).toBe(0);
  });

  it('ending before the start is refused and the workout stays open', async () => {
    const { store } = freshLocal();
    const input = aWorkout({ startedAt: '2026-10-10T10:00:00.000Z' });
    await store.startWorkout(input);
    await expect(store.endWorkout(input.id, '2026-10-10T09:00:00.000Z')).rejects.toThrow();
    expect((await store.getWorkout(input.id))?.endedAt).toBeNull();
  });
});

describe('the outbox and the clock', () => {
  it('a wait set far in the future (the clock was wrong) counts as over', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await db.workouts.update(w.id, { nextAttemptAt: 1_000 + BACKOFF_MAX_MS + 1 });
    expect((await store.outbox.dueWorkouts(1_000)).map((r) => r.id)).toEqual([w.id]);
    await db.workouts.update(w.id, { nextAttemptAt: 1_000 + BACKOFF_MAX_MS });
    expect(await store.outbox.dueWorkouts(1_000)).toEqual([]);
  });

  it('a set whose workout never reached the server is not due, however long it waits', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    expect(await store.outbox.dueSets(Number.MAX_SAFE_INTEGER)).toEqual([]);
  });

  it('a set logged for a workout that was pulled (never pushed from here) is due at once', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await db.workouts.update(w.id, { everSynced: true, syncStatus: 'synced' });
    const s = await store.logSet(aSet(w.id));
    expect((await store.outbox.dueSets(0)).map((r) => r.id)).toEqual([s.id]);
  });

  it('marking an unknown id synced or failed does nothing and does not throw', async () => {
    const { store, db } = freshLocal();
    const ghost = { id: uuid(7000), rev: 1 };
    await expect(store.outbox.markSynced('workout', [ghost])).resolves.toEqual([ghost.id]);
    await expect(store.outbox.recordFailure('set', ghost, 'x', 0)).resolves.toBeUndefined();
    await expect(store.outbox.defer('set', [ghost], 5)).resolves.toBeUndefined();
    expect(await db.workouts.count()).toBe(0);
    expect(await db.sets.count()).toBe(0);
  });

  it('a delete queued for a set that was never on the server is dropped once the server says ok', async () => {
    const { store } = freshLocal();
    await store.outbox.queueDeletion(uuid(7100), '2026-10-10T10:00:00.000Z');
    await store.outbox.clearDeletion(uuid(7100));
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  });
});

describe('purgeSynced at sign-out', () => {
  it('keeps unsynced sets and their workout, drops synced ones and the gym cache', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const synced = await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T10:01:00.000Z' }));
    const pending = await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T10:02:00.000Z' }));
    await db.sets.update(synced.id, { syncStatus: 'synced' });
    await store.saveGym(null);
    const out = await store.purgeSynced();
    expect((await db.sets.toArray()).map((s) => s.id)).toEqual([pending.id]);
    expect(await db.workouts.get(w.id)).toBeDefined();
    expect(await store.cachedGym()).toBeNull();
    expect(out.remaining).toBe(2);
  });

  it('keeps a failed set, and a queued server delete', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const bad = await store.logSet(aSet(w.id));
    await db.sets.update(bad.id, { syncStatus: 'failed' });
    await store.outbox.queueDeletion(uuid(8000), '2026-10-10T10:00:00.000Z');
    const out = await store.purgeSynced();
    expect(await db.sets.get(bad.id)).toBeDefined();
    expect(out.remaining).toBe(3);
  });

  it('reports 0 remaining when everything was synced', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const s = await store.logSet(aSet(w.id));
    await db.workouts.update(w.id, { syncStatus: 'synced' });
    await db.sets.update(s.id, { syncStatus: 'synced' });
    expect(await store.purgeSynced()).toEqual({ remaining: 0 });
  });
});

describe('the gym snapshot rule', () => {
  const gym = (barbellKg: number) => ({
    id: uuid(9100),
    barbellKg,
    bars: [],
  });

  it('a workout keeps the bar weight it started with when the gym changes afterwards', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout({
      ...aWorkout({ gymId: uuid(9100) }),
      gymSnapshot: { barbellKg: 20, bars: [] },
    });
    await store.saveGym(gym(15));
    expect((await store.getWorkout(w.id))?.gymSnapshot).toMatchObject({ barbellKg: 20 });
  });

  it('refreshGymSnapshot changes only the named workout', async () => {
    const { store } = freshLocal();
    const a = await store.startWorkout({
      ...aWorkout(),
      gymSnapshot: { barbellKg: 20, bars: [] },
    });
    const b = await store.startWorkout({
      ...aWorkout(),
      gymSnapshot: { barbellKg: 20, bars: [] },
    });
    await store.refreshGymSnapshot(a.id, { barbellKg: 15, bars: [] });
    expect((await store.getWorkout(a.id))?.gymSnapshot?.barbellKg).toBe(15);
    expect((await store.getWorkout(b.id))?.gymSnapshot?.barbellKg).toBe(20);
  });

  it('a damaged snapshot on disk reads as no gym instead of a wrong bar', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await db.workouts.update(w.id, {
      gymSnapshot: { barbellKg: '20', bars: [] } as never,
    });
    expect((await store.getWorkout(w.id))?.gymSnapshot).toBeNull();
    await db.workouts.update(w.id, {
      gymSnapshot: { barbellKg: 9999, bars: [] } as never,
    });
    expect((await store.getWorkout(w.id))?.gymSnapshot).toBeNull();
  });

  it('a gym with no bars other than the barbell survives a cache round trip', async () => {
    const { store } = freshLocal();
    await store.saveGym(gym(20));
    expect(await store.cachedGym()).toEqual({ gym: gym(20) });
  });
});

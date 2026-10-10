import { describe, expect, it } from 'vitest';
import { backoffMs, MAX_ATTEMPTS } from '../local';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout, freshLocal, uuid } from '../../test/localDb';
import { createSyncWorker } from './worker';

function setup(batchSize?: number) {
  const local = freshLocal();
  const server = createFakeRemoteLog();
  const clock = { now: 5_000_000 };
  const worker = createSyncWorker({
    store: local.store,
    remote: server.remote,
    userId: 'u1',
    now: () => clock.now,
    batchSize,
  });
  return { ...local, server, clock, worker };
}

async function withSets(s: ReturnType<typeof setup>, count: number, gymId: string | null = null) {
  const w = await s.store.startWorkout(aWorkout({ gymId }));
  const sets = [];
  for (let i = 0; i < count; i += 1)
    sets.push(await s.store.logSet(aSet(w.id, { loggedAt: `2026-10-10T10:0${i}:00.000Z` })));
  return { w, sets };
}

describe('a batch where one row is bad', () => {
  it('delivers the good rows, fails only the bad one, and does not resend the good ones', async () => {
    const s = setup(10);
    const { sets } = await withSets(s, 4);
    s.server.poison(sets[2]!.id);
    const out = await s.worker.run();
    expect(out).toMatchObject({ pushedSets: 3, refused: 1 });
    expect(s.server.sets.has(sets[2]!.id)).toBe(false);
    expect(await s.db.sets.get(sets[2]!.id)).toMatchObject({ syncStatus: 'pending', attempts: 1 });
    // Next run after the backoff: only the bad row is tried again.
    s.server.calls.length = 0;
    s.clock.now += backoffMs(1) + 1;
    await s.worker.run();
    expect(s.server.callsTo('upsertSets').map((c) => c.ids)).toEqual([[sets[2]!.id]]);
  });

  it('gives up on a poisoned row after MAX_ATTEMPTS and stops retrying it by itself', async () => {
    const s = setup();
    const { sets } = await withSets(s, 1);
    s.server.poison(sets[0]!.id);
    for (let i = 0; i < MAX_ATTEMPTS + 3; i += 1) {
      s.clock.now += 10 * 60_000;
      await s.worker.run();
    }
    expect(await s.db.sets.get(sets[0]!.id)).toMatchObject({
      syncStatus: 'failed',
      attempts: MAX_ATTEMPTS,
    });
    expect(s.server.callsTo('upsertSets').length).toBe(MAX_ATTEMPTS);
    expect(await s.store.counts()).toEqual({ pending: 0, failed: 1 });
  });

  it('a failed row goes out again after retryFailed once the server accepts it', async () => {
    const s = setup();
    const { sets } = await withSets(s, 1);
    s.server.failNext('upsertSets', 'rejected', MAX_ATTEMPTS);
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      s.clock.now += 10 * 60_000;
      await s.worker.run();
    }
    expect((await s.db.sets.get(sets[0]!.id))?.syncStatus).toBe('failed');
    expect(await s.store.retryFailed()).toBe(1);
    await s.worker.run();
    expect(s.server.sets.has(sets[0]!.id)).toBe(true);
    expect(await s.store.counts()).toEqual({ pending: 0, failed: 0 });
  });
});

describe('re-pushing is idempotent', () => {
  it('a lost answer (server stored it, client saw an error) leads to an identical re-push, not a duplicate', async () => {
    const s = setup();
    const { sets } = await withSets(s, 2);
    const real = s.server.remote.upsertSets.getMockImplementation()!;
    let first = true;
    s.server.remote.upsertSets.mockImplementation(async (userId, rows) => {
      const result = await real(userId, rows);
      if (first) {
        first = false;
        return { status: 'error', reason: 'offline' };
      }
      return result;
    });
    await s.worker.run();
    s.clock.now += 60_000;
    await s.worker.run();
    expect(s.server.sets.size).toBe(2);
    expect([...s.server.sets.keys()].sort()).toEqual(sets.map((r) => r.id).sort());
    expect(await s.store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('a re-push never carries a delete mark: a set deleted online stays deleted', async () => {
    const s = setup();
    const { sets } = await withSets(s, 1);
    await s.worker.run();
    s.server.deleteElsewhere(sets[0]!.id);
    await s.db.sets.update(sets[0]!.id, { syncStatus: 'pending' });
    await s.worker.run({ ignoreWait: true });
    expect(s.server.sets.get(sets[0]!.id)?.deletedAt).toBeDefined();
  });
});

describe('how each failure is classified', () => {
  it.each([
    ['offline', { defers: 5_000, counts: false, offline: true }],
    ['unknown', { defers: 30_000, counts: false, offline: false }],
  ] as const)('%s does not count against the row', async (reason, expected) => {
    const s = setup();
    const { w } = await withSets(s, 1);
    s.server.failNext('upsertWorkouts', reason);
    const out = await s.worker.run();
    expect(out.offline).toBe(expected.offline);
    expect(out.refused).toBe(0);
    expect(await s.db.workouts.get(w.id)).toMatchObject({
      attempts: 0,
      syncStatus: 'pending',
      nextAttemptAt: s.clock.now + expected.defers,
    });
  });

  it('a conflict on a workout that has a gym counts against the row (only "rejected" drops the gym)', async () => {
    const s = setup();
    const { w } = await withSets(s, 0, uuid(777));
    s.server.failNext('upsertWorkouts', 'conflict');
    const out = await s.worker.run();
    expect(out.refused).toBe(1);
    expect(await s.db.workouts.get(w.id)).toMatchObject({ gymId: uuid(777), attempts: 1, rev: 1 });
  });

  it('a rejected workout with a gym is resent without the gym in the same run', async () => {
    const s = setup();
    const gym = uuid(778);
    const { w, sets } = await withSets(s, 2, gym);
    s.server.removeGym(gym);
    const out = await s.worker.run();
    expect(out).toMatchObject({ pushedWorkouts: 1, pushedSets: 2, refused: 0 });
    expect(s.server.workouts.get(w.id)?.gymId).toBeNull();
    expect(s.server.sets.size).toBe(sets.length);
  });

  it('a rejected workout without a gym is counted, and its sets wait', async () => {
    const s = setup();
    const { w } = await withSets(s, 2);
    s.server.failNext('upsertWorkouts', 'rejected');
    const out = await s.worker.run();
    expect(out).toMatchObject({ refused: 1, pushedSets: 0 });
    expect(await s.db.workouts.get(w.id)).toMatchObject({ attempts: 1, everSynced: false });
    expect(s.server.callsTo('upsertSets')).toEqual([]);
  });

  it('a remote that throws a non-Error (string, undefined) is treated as trouble', async () => {
    const s = setup();
    await withSets(s, 1);
    s.server.remote.upsertWorkouts.mockImplementation(async () => {
      throw 'plain string';
    });
    await expect(s.worker.run()).resolves.toMatchObject({ refused: 0, pushedWorkouts: 0 });
    expect(await s.store.counts()).toEqual({ pending: 2, failed: 0 });
  });

  // BUG: worker.ts:100 reads result.status without a guard, so a remote that resolves to undefined
  // (a bug in a service, not reachable through the typed Result) rejects run() instead of deferring.
  it('BUG: a remote that returns undefined instead of a Result does not crash the pass', async () => {
    const s = setup();
    await withSets(s, 1);
    s.server.remote.upsertWorkouts.mockImplementation((async () => undefined) as never);
    await expect(s.worker.run()).resolves.toBeDefined();
  });
});

describe('offline then online mid-run', () => {
  it('goes offline after the workout, keeps the workout synced, and sends the sets later', async () => {
    const s = setup();
    const { w, sets } = await withSets(s, 3);
    s.server.failNext('upsertSets', 'offline');
    const out = await s.worker.run();
    expect(out).toMatchObject({ pushedWorkouts: 1, pushedSets: 0, offline: true });
    expect(await s.db.workouts.get(w.id)).toMatchObject({ syncStatus: 'synced' });
    s.clock.now += 5_001;
    expect(await s.worker.run()).toMatchObject({ pushedSets: 3, offline: false });
    expect(s.server.sets.size).toBe(sets.length);
  });

  it('a set logged while the workout push is in flight is sent in the same run', async () => {
    const s = setup();
    const { w } = await withSets(s, 1);
    const release = s.server.hold('upsertWorkouts');
    const run = s.worker.run();
    await new Promise((r) => setTimeout(r, 20));
    const late = await s.store.logSet(aSet(w.id, { loggedAt: '2026-10-10T10:30:00.000Z' }));
    release();
    await run;
    expect(s.server.sets.has(late.id)).toBe(true);
  });

  it('ending a workout while its first push is in flight leaves the end time to go out next', async () => {
    const s = setup();
    const { w } = await withSets(s, 0);
    const release = s.server.hold('upsertWorkouts');
    const run = s.worker.run();
    await new Promise((r) => setTimeout(r, 20));
    await s.store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
    release();
    await run;
    // The stale push must not mark the newer revision synced.
    expect((await s.db.workouts.get(w.id))?.syncStatus).toBe('pending');
    await s.worker.run({ ignoreWait: true });
    expect(s.server.workouts.get(w.id)?.endedAt).toBe('2026-10-10T11:00:00.000Z');
    expect((await s.db.workouts.get(w.id))?.syncStatus).toBe('synced');
  });
});

describe('sign-out mid-run', () => {
  it('pausing during a push leaves the batch pending and unmarked', async () => {
    const s = setup();
    const { w } = await withSets(s, 2);
    const release = s.server.hold('upsertWorkouts');
    const run = s.worker.run();
    await new Promise((r) => setTimeout(r, 20));
    s.worker.pause();
    release();
    await run;
    expect(await s.db.workouts.get(w.id)).toMatchObject({ syncStatus: 'pending' });
    expect(s.server.callsTo('upsertSets')).toEqual([]);
  });

  it('run() while paused sends nothing; resume sends everything', async () => {
    const s = setup();
    await withSets(s, 1);
    s.worker.pause();
    expect(await s.worker.run()).toMatchObject({ pushedWorkouts: 0, pushedSets: 0 });
    expect(s.server.calls).toEqual([]);
    s.worker.resume();
    expect(await s.worker.run()).toMatchObject({ pushedWorkouts: 1, pushedSets: 1 });
  });

  it('sends the signed-in user id with every write', async () => {
    const s = setup();
    await withSets(s, 1);
    await s.worker.run();
    expect(
      s.server.calls.filter((c) => c.userId !== undefined).every((c) => c.userId === 'u1'),
    ).toBe(true);
  });
});

describe('batch size edges', () => {
  it.each([0, -3, NaN, 0.4])(
    'batchSize %s falls back to something that still sends all rows',
    async (size) => {
      const s = setup(size);
      await withSets(s, 3);
      expect(await s.worker.run()).toMatchObject({ pushedSets: 3 });
    },
  );

  it('120 sets with batch 50 go out in 3 requests of 50, 50, 20', async () => {
    const s = setup();
    const w = await s.store.startWorkout(aWorkout());
    for (let i = 0; i < 120; i += 1)
      await s.store.logSet(
        aSet(w.id, { loggedAt: new Date(Date.UTC(2026, 9, 10, 10, 0, i)).toISOString() }),
      );
    await s.worker.run();
    expect(s.server.callsTo('upsertSets').map((c) => c.ids.length)).toEqual([50, 50, 20]);
  });
});

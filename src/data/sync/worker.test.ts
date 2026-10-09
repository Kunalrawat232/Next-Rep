import { describe, expect, it } from 'vitest';
import { backoffMs, MAX_ATTEMPTS } from '../local';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout, freshLocal, reopenLocal, uuid } from '../../test/localDb';
import { createSyncWorker } from './worker';

function setup(options: { batchSize?: number; startAt?: number } = {}) {
  const local = freshLocal();
  const server = createFakeRemoteLog();
  const clock = { now: options.startAt ?? 1_000_000 };
  const worker = createSyncWorker({
    store: local.store,
    remote: server.remote,
    userId: 'u1',
    now: () => clock.now,
    batchSize: options.batchSize,
  });
  return { ...local, server, clock, worker };
}

async function workoutWithSets(store: ReturnType<typeof freshLocal>['store'], count = 3) {
  const w = await store.startWorkout(aWorkout());
  const sets = [];
  for (let i = 0; i < count; i++)
    sets.push(
      await store.logSet(aSet(w.id, { loggedAt: `2026-10-10T10:0${i}:00.000Z`, reps: i + 1 })),
    );
  return { w, sets };
}

describe('pushing', () => {
  it('sends the workout first, then its sets, and marks everything synced', async () => {
    const { store, server, worker } = setup();
    const { w, sets } = await workoutWithSets(store);
    const outcome = await worker.run();
    expect(server.calls.map((c) => c.method)).toEqual(['upsertWorkouts', 'upsertSets']);
    expect(server.workouts.has(w.id)).toBe(true);
    expect([...server.sets.keys()].sort()).toEqual(sets.map((s) => s.id).sort());
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
    expect(outcome).toEqual({
      pushedWorkouts: 1,
      pushedSets: 3,
      deletedSets: 0,
      refused: 0,
      offline: false,
    });
  });

  it('sends the signed-in user id with every push', async () => {
    const { store, server, worker } = setup();
    await workoutWithSets(store, 1);
    await worker.run();
    expect(server.callsTo('upsertWorkouts')[0]?.userId).toBe('u1');
    expect(server.callsTo('upsertSets')[0]?.userId).toBe('u1');
  });

  it('sends sets in batches', async () => {
    const { store, server, worker } = setup({ batchSize: 2 });
    await workoutWithSets(store, 5);
    await worker.run();
    expect(server.callsTo('upsertSets').map((c) => c.ids.length)).toEqual([2, 2, 1]);
    expect(server.sets.size).toBe(5);
  });

  it('does nothing when nothing is waiting', async () => {
    const { server, worker } = setup();
    expect(await worker.run()).toEqual({
      pushedWorkouts: 0,
      pushedSets: 0,
      deletedSets: 0,
      refused: 0,
      offline: false,
    });
    expect(server.calls).toEqual([]);
  });

  it('sends a row only once: a second run finds nothing to do', async () => {
    const { store, server, worker } = setup();
    await workoutWithSets(store);
    await worker.run();
    server.calls.length = 0;
    await worker.run();
    expect(server.calls).toEqual([]);
  });

  it('sends several workouts, oldest first', async () => {
    const { store, server, worker } = setup();
    const late = await store.startWorkout(aWorkout({ startedAt: '2026-10-10T12:00:00.000Z' }));
    const early = await store.startWorkout(aWorkout({ startedAt: '2026-10-10T08:00:00.000Z' }));
    await worker.run();
    expect(server.callsTo('upsertWorkouts')[0]?.ids).toEqual([early.id, late.id]);
  });
});

describe('going offline', () => {
  it('stops without counting an attempt, and leaves the rows pending', async () => {
    const { store, server, worker, db } = setup();
    const { w } = await workoutWithSets(store);
    server.setOffline(true);
    const outcome = await worker.run();
    expect(outcome.offline).toBe(true);
    expect(server.callsTo('upsertSets')).toEqual([]); // no point trying sets when the workout failed
    expect(await db.workouts.get(w.id)).toMatchObject({ syncStatus: 'pending', attempts: 0 });
    expect(await store.counts()).toEqual({ pending: 4, failed: 0 });
  });

  it('catches up after the network returns, without any rows lost', async () => {
    const { store, server, worker, clock } = setup();
    const { sets } = await workoutWithSets(store);
    server.setOffline(true);
    await worker.run();
    server.setOffline(false);
    clock.now += 60_000;
    await worker.run();
    expect(server.sets.size).toBe(sets.length);
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('can be told to try at once, ignoring the short wait after an offline run', async () => {
    const { store, server, worker } = setup();
    await workoutWithSets(store);
    server.setOffline(true);
    await worker.run();
    server.setOffline(false);
    server.calls.length = 0;
    await worker.run(); // still inside the wait
    expect(server.calls).toEqual([]);
    await worker.run({ ignoreWait: true });
    expect(server.sets.size).toBe(3);
  });

  it('stops part-way when the network drops between batches, keeping what already went', async () => {
    const { store, server, worker } = setup({ batchSize: 2 });
    await workoutWithSets(store, 4);
    // first sets batch works, second goes offline
    const original = server.remote.upsertSets.getMockImplementation()!;
    let calls = 0;
    server.remote.upsertSets.mockImplementation(async (userId, rows) => {
      calls += 1;
      if (calls === 2) {
        server.setOffline(true);
      }
      return original(userId, rows);
    });
    const outcome = await worker.run();
    expect(outcome.offline).toBe(true);
    expect(server.sets.size).toBe(2);
    expect(await store.counts()).toEqual({ pending: 2, failed: 0 });
  });
});

describe('refused rows', () => {
  it('counts an attempt and waits longer each time', async () => {
    const { store, server, worker, clock, db } = setup();
    const w = await store.startWorkout(aWorkout());
    server.failNext('upsertWorkouts', 'rejected', 3);
    await worker.run();
    const first = await db.workouts.get(w.id);
    expect(first).toMatchObject({
      attempts: 1,
      syncStatus: 'pending',
      nextAttemptAt: clock.now + backoffMs(1),
    });
    await worker.run(); // still waiting: not tried
    expect(server.callsTo('upsertWorkouts')).toHaveLength(1);
    clock.now += backoffMs(1);
    await worker.run();
    expect(await db.workouts.get(w.id)).toMatchObject({
      attempts: 2,
      nextAttemptAt: clock.now + backoffMs(2),
    });
    expect(backoffMs(2)).toBeGreaterThan(backoffMs(1));
  });

  it('caps the wait', () => {
    expect(backoffMs(1)).toBe(2_000);
    expect(backoffMs(100)).toBe(5 * 60_000);
    expect(backoffMs(0)).toBe(2_000);
  });

  it('gives up after too many refusals, and a failed row is not retried by itself', async () => {
    const { store, server, worker, clock, db } = setup();
    const w = await store.startWorkout(aWorkout());
    server.failNext('upsertWorkouts', 'rejected', 100);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await worker.run({ ignoreWait: true });
      clock.now += 10 * 60_000;
    }
    expect(await db.workouts.get(w.id)).toMatchObject({
      syncStatus: 'failed',
      attempts: MAX_ATTEMPTS,
    });
    expect(await store.counts()).toEqual({ pending: 0, failed: 1 });
    server.calls.length = 0;
    await worker.run({ ignoreWait: true });
    expect(server.calls).toEqual([]);
  });

  it('lets a row go through after a manual retry once the server works again', async () => {
    const { store, server, worker, clock } = setup();
    const w = await store.startWorkout(aWorkout());
    server.failNext('upsertWorkouts', 'rejected', MAX_ATTEMPTS);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await worker.run({ ignoreWait: true });
      clock.now += 10 * 60_000;
    }
    expect((await store.counts()).failed).toBe(1);
    await store.retryFailed();
    await worker.run();
    expect(server.workouts.has(w.id)).toBe(true);
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('treats a duplicate-name conflict like any other refusal', async () => {
    const { store, server, worker, db } = setup();
    const w = await store.startWorkout(aWorkout());
    server.failNext('upsertWorkouts', 'conflict');
    await worker.run();
    expect(await db.workouts.get(w.id)).toMatchObject({ attempts: 1, syncStatus: 'pending' });
  });

  it("does not try a workout's sets while the workout itself is refused", async () => {
    const { store, server, worker, db } = setup();
    const { w, sets } = await workoutWithSets(store);
    server.failNext('upsertWorkouts', 'rejected');
    const outcome = await worker.run();
    expect(server.callsTo('upsertSets')).toEqual([]);
    expect(outcome.refused).toBe(1);
    for (const s of sets)
      expect(await db.sets.get(s.id)).toMatchObject({ attempts: 0, syncStatus: 'pending' });
    expect(await db.workouts.get(w.id)).toMatchObject({ attempts: 1 });
  });

  it('finds the one bad set in a batch and still delivers the others', async () => {
    const { store, server, worker, db } = setup();
    const { sets } = await workoutWithSets(store, 4);
    server.poison(sets[2]!.id);
    const outcome = await worker.run();
    expect(outcome).toMatchObject({ pushedSets: 3, refused: 1 });
    expect([...server.sets.keys()].sort()).toEqual([sets[0]!.id, sets[1]!.id, sets[3]!.id].sort());
    expect(await db.sets.get(sets[2]!.id)).toMatchObject({ attempts: 1, syncStatus: 'pending' });
    expect(await db.sets.get(sets[0]!.id)).toMatchObject({ syncStatus: 'synced' });
  });

  it('survives a server call that throws, treating it as trouble on the server, not as a refusal of the row', async () => {
    const { store, server, worker, db } = setup();
    const w = await store.startWorkout(aWorkout());
    server.remote.upsertWorkouts.mockRejectedValueOnce(new Error('boom'));
    await expect(worker.run()).resolves.toMatchObject({ refused: 0, offline: false });
    expect(await db.workouts.get(w.id)).toMatchObject({ attempts: 0, syncStatus: 'pending' });
  });
});

describe('changes while a push is in flight', () => {
  it("does not run two passes at once; the second caller gets the first one's result", async () => {
    const { store, server, worker } = setup();
    await workoutWithSets(store, 2);
    const release = server.hold('upsertWorkouts');
    const first = worker.run();
    const second = worker.run();
    await Promise.resolve();
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(server.callsTo('upsertWorkouts')).toHaveLength(1);
    expect(server.callsTo('upsertSets')).toHaveLength(1);
  });

  it('can run again after a pass has finished', async () => {
    const { store, server, worker } = setup();
    await workoutWithSets(store, 1);
    await worker.run();
    await store.logSet(aSet((await store.activeWorkout())!.id));
    await worker.run();
    expect(server.sets.size).toBe(2);
  });

  it('deletes online a set the user removed while it was being sent', async () => {
    const { store, server, worker } = setup();
    const { sets } = await workoutWithSets(store, 2);
    const release = server.hold('upsertSets');
    const running = worker.run();
    await waitFor(() => server.callsTo('upsertSets').length > 0);
    expect(await store.removeUnsyncedSet(sets[0]!.id)).toBe('removed');
    release();
    await running;
    expect(server.callsTo('softDeleteSet').map((c) => c.ids[0])).toEqual([sets[0]!.id]);
    expect(server.sets.get(sets[0]!.id)?.deletedAt).toBeTruthy();
    expect(server.sets.get(sets[1]!.id)?.deletedAt).toBeUndefined();
  });

  it('keeps retrying that delete when the first attempt fails, until the server has it', async () => {
    const { store, server, worker, clock } = setup();
    const { sets } = await workoutWithSets(store, 1);
    const release = server.hold('upsertSets');
    const running = worker.run();
    await waitFor(() => server.callsTo('upsertSets').length > 0);
    await store.removeUnsyncedSet(sets[0]!.id);
    server.failNext('softDeleteSet', 'rejected', 2);
    release();
    const first = await running;
    expect(first.refused).toBe(1);
    expect(server.sets.get(sets[0]!.id)?.deletedAt).toBeUndefined();
    expect(await store.counts()).toEqual({ pending: 1, failed: 0 }); // the delete is still owed
    clock.now += 60_000;
    await worker.run();
    clock.now += 60_000;
    const last = await worker.run();
    expect(last.deletedSets).toBe(1);
    expect(server.sets.get(sets[0]!.id)?.deletedAt).toBeTruthy();
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('keeps the owed delete across a reload and while offline', async () => {
    const { store, server, worker, userId, db, clock } = setup();
    const { sets } = await workoutWithSets(store, 1);
    const release = server.hold('upsertSets');
    const running = worker.run();
    await waitFor(() => server.callsTo('upsertSets').length > 0);
    await store.removeUnsyncedSet(sets[0]!.id);
    server.failNext('softDeleteSet', 'offline');
    release();
    expect((await running).offline).toBe(true);
    db.close();
    const again = reopenLocal(userId);
    expect(await again.store.counts()).toEqual({ pending: 1, failed: 0 });
    server.setOffline(false);
    clock.now += 60_000;
    const second = createSyncWorker({
      store: again.store,
      remote: server.remote,
      userId,
      now: () => clock.now,
    });
    await second.run({ ignoreWait: true });
    expect(server.sets.get(sets[0]!.id)?.deletedAt).toBeTruthy();
  });

  it('sends the workout again when it was ended while the first copy was on its way', async () => {
    const { store, server, worker, db } = setup();
    const w = await store.startWorkout(aWorkout());
    const release = server.hold('upsertWorkouts');
    const running = worker.run();
    await waitFor(() => server.callsTo('upsertWorkouts').length > 0);
    await store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
    release();
    await running;
    expect(await db.workouts.get(w.id)).toMatchObject({ syncStatus: 'pending', rev: 2 });
    expect(server.workouts.get(w.id)?.endedAt).toBeNull();
    await worker.run();
    expect(server.workouts.get(w.id)?.endedAt).toBe('2026-10-10T11:00:00.000Z');
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('ending an already synced workout sends it again', async () => {
    const { store, server, worker } = setup();
    const w = await store.startWorkout(aWorkout());
    await worker.run();
    await store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
    await worker.run();
    expect(server.workouts.get(w.id)?.endedAt).toBe('2026-10-10T11:00:00.000Z');
  });
});

describe('after a reload', () => {
  it('a new worker on the same database finishes the job', async () => {
    const { store, server, worker, userId, db, clock } = setup();
    const { sets } = await workoutWithSets(store);
    server.setOffline(true);
    await worker.run();
    db.close();
    const again = reopenLocal(userId);
    server.setOffline(false);
    clock.now += 60_000;
    const second = createSyncWorker({
      store: again.store,
      remote: server.remote,
      userId,
      now: () => clock.now,
    });
    await second.run();
    expect(server.sets.size).toBe(sets.length);
    expect(await again.store.counts()).toEqual({ pending: 0, failed: 0 });
  });
});

describe('a set removed while its workout is not yet sent', () => {
  it('never reaches the server at all', async () => {
    const { store, server, worker } = setup();
    const { sets } = await workoutWithSets(store, 2);
    await store.removeUnsyncedSet(sets[0]!.id);
    await worker.run();
    expect(server.sets.has(sets[0]!.id)).toBe(false);
    expect(server.sets.has(sets[1]!.id)).toBe(true);
    expect(server.callsTo('softDeleteSet')).toEqual([]);
  });

  it('is unaffected by an unknown id', async () => {
    const { store } = setup();
    expect(await store.removeUnsyncedSet(uuid())).toBe('missing');
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

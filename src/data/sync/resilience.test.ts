import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS } from '../local';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout, freshLocal, uuid } from '../../test/localDb';
import { createSyncWorker } from './worker';

function setup(startAt = 1_000_000) {
  const local = freshLocal();
  const server = createFakeRemoteLog();
  const clock = { now: startAt };
  const worker = createSyncWorker({
    store: local.store,
    remote: server.remote,
    userId: 'u1',
    now: () => clock.now,
  });
  return { ...local, server, clock, worker };
}

async function withSets(store: ReturnType<typeof freshLocal>['store'], count: number) {
  const w = await store.startWorkout(aWorkout());
  const sets = [];
  for (let i = 0; i < count; i++)
    sets.push(await store.logSet(aSet(w.id, { loggedAt: `2026-10-10T10:0${i}:00.000Z` })));
  return { w, sets };
}

describe("trouble on the server is not the rows' fault", () => {
  it('never marks rows failed, however long the server is down', async () => {
    const { store, server, worker, clock, db } = setup();
    await withSets(store, 3);
    server.failNext('upsertWorkouts', 'unknown', 1000);
    for (let i = 0; i < MAX_ATTEMPTS * 4; i++) {
      clock.now += 10 * 60_000;
      await worker.run();
    }
    expect(await store.counts()).toEqual({ pending: 4, failed: 0 });
    expect((await db.workouts.toArray())[0]).toMatchObject({ attempts: 0, syncStatus: 'pending' });
  });

  it('delivers everything once the server is back, without anyone retrying by hand', async () => {
    const { store, server, worker, clock } = setup();
    await withSets(store, 3);
    server.failNext('upsertWorkouts', 'unknown', 30);
    for (let i = 0; i < 30; i++) {
      clock.now += 60_000;
      await worker.run();
    }
    server.failNext('upsertWorkouts', 'unknown', 0);
    clock.now += 60_000;
    await worker.run();
    clock.now += 60_000;
    await worker.run();
    expect(server.sets.size).toBe(3);
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('does not split a batch into single requests when the server is in trouble', async () => {
    const { store, server, worker } = setup();
    const { w } = await withSets(store, 10);
    await worker.run(); // workout + sets go
    for (let i = 0; i < 10; i++)
      await store.logSet(
        aSet(w.id, { loggedAt: `2026-10-10T11:${String(i).padStart(2, '0')}:00.000Z` }),
      );
    server.calls.length = 0;
    server.failNext('upsertSets', 'unknown');
    await worker.run({ ignoreWait: true });
    expect(server.callsTo('upsertSets')).toHaveLength(1);
  });

  it('does not let repeated forced runs wear a healthy row down', async () => {
    const { store, server, worker, db } = setup();
    const w = await store.startWorkout(aWorkout());
    server.failNext('upsertWorkouts', 'unknown', 20);
    for (let i = 0; i < 20; i++) await worker.run({ ignoreWait: true });
    expect(await db.workouts.get(w.id)).toMatchObject({ attempts: 0, syncStatus: 'pending' });
  });

  it('counts only a refusal of the row itself', async () => {
    const { store, server, worker, db } = setup();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    server.failNext('upsertWorkouts', 'rejected');
    await worker.run();
    expect(await db.workouts.get(w.id)).toMatchObject({ attempts: 1 });
  });
});

describe('a workout whose gym is gone', () => {
  it('is sent again without the gym, so its sets are not stranded', async () => {
    const { store, server, worker } = setup();
    const gym = uuid();
    const w = await store.startWorkout(aWorkout({ gymId: gym }));
    await store.logSet(aSet(w.id));
    server.removeGym(gym);
    await worker.run();
    expect(server.workouts.get(w.id)?.gymId).toBeNull();
    expect(server.sets.size).toBe(1);
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('is not changed when the refusal has nothing to do with a gym (no gym on it)', async () => {
    const { store, server, worker, db } = setup();
    const w = await store.startWorkout(aWorkout({ gymId: null }));
    await store.logSet(aSet(w.id));
    server.failNext('upsertWorkouts', 'rejected');
    await worker.run();
    expect(await db.workouts.get(w.id)).toMatchObject({ gymId: null, attempts: 1 });
  });
});

describe('rows read back from IndexedDB are checked before they are sent', () => {
  it.each([
    ['a negative weight', { totalKg: -5 }],
    ['a total that is not bar plus two sides', { totalKg: 61 }],
    ['zero reps', { reps: 0 }],
    ['a text weight', { totalKg: '60' as unknown as number }],
    ['an unknown source', { source: 'psychic' as never }],
    ['a transcript over 500 characters', { rawTranscript: 'x'.repeat(5000) }],
  ])('never sends a set with %s, and marks it failed', async (_l, damage) => {
    const { store, server, worker, db } = setup();
    const { w, sets } = await withSets(store, 2);
    await worker.run(); // workout is on the server
    const bad = await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T12:00:00.000Z' }));
    await db.sets.update(bad.id, damage);
    server.calls.length = 0;
    await worker.run({ ignoreWait: true });
    expect(server.sets.has(bad.id)).toBe(false);
    expect(await db.sets.get(bad.id)).toMatchObject({
      syncStatus: 'failed',
      lastError: 'invalid row',
    });
    expect(server.sets.has(sets[0]!.id)).toBe(true);
  });

  it('does not let one corrupt row stop the healthy rows', async () => {
    const { store, server, worker, db } = setup();
    const { sets } = await withSets(store, 3);
    await db.sets.update(sets[1]!.id, { reps: -1 });
    await worker.run();
    expect([...server.sets.keys()].sort()).toEqual([sets[0]!.id, sets[2]!.id].sort());
  });
});

describe('removing a set that may already be on the server', () => {
  it('queues a server delete when a push had started, even if no answer ever came back', async () => {
    const { store, server, worker } = setup();
    const { sets } = await withSets(store, 1);
    server.failNext('upsertSets', 'offline'); // the request may have been processed; the answer was lost
    await worker.run();
    expect(await store.removeUnsyncedSet(sets[0]!.id)).toBe('removed');
    expect(await store.counts()).toEqual({ pending: 1, failed: 0 });
    // the set really did reach the server in this story
    await store.outbox.markAttempted('set', [], 0);
    server.sets.set(sets[0]!.id, { ...sets[0]!, deletedAt: undefined });
    await worker.run({ ignoreWait: true });
    expect(server.sets.get(sets[0]!.id)?.deletedAt).toBeTruthy();
  });

  it('queues nothing when the set was never sent', async () => {
    const { store } = setup();
    const { sets } = await withSets(store, 1);
    expect(await store.removeUnsyncedSet(sets[0]!.id)).toBe('removed');
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 }); // no delete owed, and the empty workout is not waiting either
  });

  it('queues the delete in the same step that marks a row synced, so no moment loses it', async () => {
    const { store, db } = setup();
    const { sets } = await withSets(store, 1);
    await store.removeUnsyncedSet(sets[0]!.id);
    const gone = await store.outbox.markSynced('set', [{ id: sets[0]!.id, rev: 1 }], 'now');
    expect(gone).toEqual([sets[0]!.id]);
    expect(await db.deletions.get(sets[0]!.id)).toBeTruthy();
  });
});

describe('late answers about an older copy of a row', () => {
  it('do not change a row that was edited since', async () => {
    const { store, db } = setup();
    const w = await store.startWorkout(aWorkout());
    await store.endWorkout(w.id, '2026-10-10T11:00:00.000Z'); // rev 2
    await store.outbox.recordFailure('workout', { id: w.id, rev: 1 }, 'rejected', 5);
    await store.outbox.defer('workout', [{ id: w.id, rev: 1 }], 99);
    expect(await db.workouts.get(w.id)).toMatchObject({
      rev: 2,
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
    });
  });

  it('do not turn a row that is already synced back into pending', async () => {
    const { store, db } = setup();
    const w = await store.startWorkout(aWorkout());
    await store.outbox.markSynced('workout', [{ id: w.id, rev: 1 }]);
    await store.outbox.recordFailure('workout', { id: w.id, rev: 1 }, 'rejected', 5);
    expect(await db.workouts.get(w.id)).toMatchObject({ syncStatus: 'synced', attempts: 0 });
  });
});

describe('a workout that was ended again', () => {
  it('does not hold back sets that the server already has a workout for', async () => {
    const { store, server, worker } = setup();
    const { w } = await withSets(store, 1);
    await worker.run();
    await store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
    const late = await store.logSet(aSet(w.id, { loggedAt: '2026-10-10T10:59:00.000Z' }));
    server.failNext('upsertWorkouts', 'rejected', 20);
    await worker.run();
    expect(server.sets.has(late.id)).toBe(true);
  });
});

describe('a forced run that arrives during an ordinary one', () => {
  it('is followed by a forced pass, so rows that were waiting are sent', async () => {
    const { store, server, worker } = setup();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    server.failNext('upsertWorkouts', 'rejected');
    await worker.run(); // now backing off
    server.calls.length = 0;
    const release = server.hold('upsertWorkouts');
    const ordinary = worker.run();
    const forced = worker.run({ ignoreWait: true });
    release();
    await Promise.all([ordinary, forced]);
    expect(server.workouts.has(w.id)).toBe(true);
  });
});

describe('a worker that was paused', () => {
  it('sends nothing, and leaves rows for the next session', async () => {
    const { store, server, worker } = setup();
    await withSets(store, 2);
    worker.pause();
    await worker.run();
    expect(server.calls).toEqual([]);
    worker.resume();
    await worker.run();
    expect(server.sets.size).toBe(2);
  });

  it('stops a pass that is already running at its next step', async () => {
    const { store, server, worker } = setup();
    await withSets(store, 2);
    const release = server.hold('upsertWorkouts');
    const running = worker.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    worker.pause();
    release();
    await running;
    expect(server.callsTo('upsertSets')).toEqual([]);
  });
});

describe('batch size', () => {
  it.each([0, -1, -50, Number.NaN, 0.5])(
    'a batch size of %s still delivers every row',
    async (batchSize) => {
      const local = freshLocal();
      const server = createFakeRemoteLog();
      const worker = createSyncWorker({
        store: local.store,
        remote: server.remote,
        userId: 'u1',
        batchSize,
      });
      await withSets(local.store, 3);
      await worker.run();
      expect(server.sets.size).toBe(3);
    },
  );
});

describe('owed deletes', () => {
  it('give up after too many refusals and show as failed, until a manual retry', async () => {
    const { store, server, worker, clock } = setup();
    await store.outbox.queueDeletion(uuid(), '2026-10-10T10:00:00.000Z');
    server.failNext('softDeleteSet', 'rejected', 100);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      clock.now += 10 * 60_000;
      await worker.run();
    }
    expect(await store.counts()).toEqual({ pending: 0, failed: 1 });
    server.calls.length = 0;
    clock.now += 10 * 60_000;
    await worker.run();
    expect(server.calls).toEqual([]);
    expect(await store.retryFailed()).toBe(1);
    expect(await store.counts()).toEqual({ pending: 1, failed: 0 });
  });

  it('are not counted against while the server is in trouble', async () => {
    const { store, server, worker, clock, db } = setup();
    const id = uuid();
    await store.outbox.queueDeletion(id, '2026-10-10T10:00:00.000Z');
    server.failNext('softDeleteSet', 'unknown', 50);
    for (let i = 0; i < 30; i++) {
      clock.now += 10 * 60_000;
      await worker.run();
    }
    expect(await db.deletions.get(id)).toMatchObject({ attempts: 0, failed: false });
  });

  it('keep their place when queued again', async () => {
    const { store, db } = setup();
    const id = uuid();
    await store.outbox.queueDeletion(id, 'first');
    await store.outbox.recordDeletionFailure(id, 100);
    await store.outbox.queueDeletion(id, 'second');
    expect(await db.deletions.get(id)).toMatchObject({ at: 'first', attempts: 1 });
  });
});

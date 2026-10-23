import { describe, expect, it } from 'vitest';
import { backoffMs, MAX_ATTEMPTS, type StoredSet, type StoredWorkout } from '../local';
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

type Store = ReturnType<typeof freshLocal>['store'];

async function workoutWithSets(store: Store, count: number) {
  const w = await store.startWorkout(aWorkout());
  const sets: StoredSet[] = [];
  for (let i = 0; i < count; i++) sets.push(await store.logSet(aSet(w.id)));
  return { w, sets };
}

const meta = { syncStatus: 'pending', rev: 1, attempts: 0, nextAttemptAt: 0, lastError: null };

async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('corrupt rows already in IndexedDB', () => {
  it.each([
    ['a negative weight', { totalKg: -5, barKg: null, perSideKg: null, inputMode: 'total' }],
    ['weights that do not add up', { totalKg: 999 }],
    ['a weight stored as text', { totalKg: '60' }],
    ['zero reps', { reps: 0 }],
    ['an unknown source', { source: 'psychic' }],
    ['a transcript of 5000 characters', { rawTranscript: 'x'.repeat(5000) }],
  ])('never sends a set with %s, and still delivers the healthy sets', async (_l, over) => {
    const { store, db, server, worker } = setup();
    const { w, sets } = await workoutWithSets(store, 2);
    const bad = { ...aSet(w.id), ...meta, ...over } as unknown as StoredSet;
    await db.sets.put(bad);
    await worker.run().catch(() => undefined);
    expect(server.sets.has(bad.id)).toBe(false);
    expect([...server.sets.keys()].sort()).toEqual(sets.map((s) => s.id).sort());
  });

  it('a set with an unknown syncStatus is not sent and does not crash the run', async () => {
    const { store, db, server, worker } = setup();
    const { w } = await workoutWithSets(store, 1);
    const odd = { ...aSet(w.id), ...meta, syncStatus: 'banana' } as unknown as StoredSet;
    await db.sets.put(odd);
    await expect(worker.run()).resolves.toMatchObject({ pushedSets: 1, refused: 0 });
    expect(server.sets.has(odd.id)).toBe(false);
  });

  it('a set without nextAttemptAt is not sent, and does not crash the run', async () => {
    const { store, db, server, worker } = setup();
    const { w } = await workoutWithSets(store, 1);
    const odd = { ...aSet(w.id), ...meta, nextAttemptAt: undefined } as unknown as StoredSet;
    await db.sets.put(odd);
    await expect(worker.run()).resolves.toBeDefined();
    expect(server.sets.has(odd.id)).toBe(false);
  });

  it('one set with a missing loggedAt does not stop every other set from syncing', async () => {
    const { store, db, server, worker } = setup();
    const { w, sets } = await workoutWithSets(store, 3);
    await db.sets.put({ ...aSet(w.id), ...meta, loggedAt: undefined } as unknown as StoredSet);
    await worker.run().catch(() => undefined);
    expect(server.sets.size).toBeGreaterThanOrEqual(sets.length);
  });

  it('one workout with a missing startedAt does not stop every other workout from syncing', async () => {
    const { store, db, server, worker } = setup();
    const good = await store.startWorkout(aWorkout());
    await store.logSet(aSet(good.id));
    await db.workouts.put({
      ...aWorkout(),
      endedAt: null,
      notes: null,
      ...meta,
      startedAt: undefined,
    } as unknown as StoredWorkout);
    await worker.run().catch(() => undefined);
    expect(server.workouts.has(good.id)).toBe(true);
  });

  it('a set whose workout was never stored is never sent, and does not hold back others', async () => {
    const { store, db, server, worker } = setup();
    const { sets } = await workoutWithSets(store, 2);
    const orphan = { ...aSet(uuid()), ...meta } as StoredSet;
    await db.sets.put(orphan);
    const outcome = await worker.run();
    expect(server.sets.has(orphan.id)).toBe(false);
    expect(outcome.pushedSets).toBe(sets.length);
    expect(outcome.refused).toBe(0);
  });

  it('an orphan set is reported as waiting, not silently forgotten', async () => {
    const { db, store, worker } = setup();
    await db.sets.put({ ...aSet(uuid()), ...meta } as StoredSet);
    await worker.run();
    expect(await store.counts()).toEqual({ pending: 1, failed: 0 });
  });

  it('a set whose workout is itself marked failed is not sent', async () => {
    const { store, db, server, worker } = setup();
    const { w, sets } = await workoutWithSets(store, 1);
    await db.workouts.update(w.id, { syncStatus: 'failed' });
    await worker.run();
    expect(server.sets.has(sets[0]!.id)).toBe(false);
  });
});

describe('batch sizes', () => {
  it.each([
    ['0', 0],
    ['-1', -1],
    ['-50', -50],
    ['NaN', Number.NaN],
  ])('a batch size of %s still delivers every row', async (_l, batchSize) => {
    const { store, server, worker } = setup({ batchSize });
    const { sets } = await workoutWithSets(store, 3);
    await worker.run().catch(() => undefined);
    expect(server.sets.size).toBe(sets.length);
  });

  it('a batch size of 1 sends one request per row', async () => {
    const { store, server, worker } = setup({ batchSize: 1 });
    await workoutWithSets(store, 4);
    await worker.run();
    expect(server.callsTo('upsertSets').map((c) => c.ids.length)).toEqual([1, 1, 1, 1]);
  });

  it('a batch size larger than the queue sends one request', async () => {
    const { store, server, worker } = setup({ batchSize: 10_000 });
    await workoutWithSets(store, 4);
    await worker.run();
    expect(server.callsTo('upsertSets')).toHaveLength(1);
  });

  it('a thousand sets arrive once each, in default batches', async () => {
    const { store, server, worker } = setup();
    const { sets } = await workoutWithSets(store, 1000);
    const outcome = await worker.run();
    expect(outcome.pushedSets).toBe(1000);
    expect(server.sets.size).toBe(1000);
    expect(server.callsTo('upsertSets')).toHaveLength(20);
    expect(new Set(server.callsTo('upsertSets').flatMap((c) => c.ids)).size).toBe(sets.length);
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  }, 60_000);

  it('one poisoned set in a thousand costs one refusal and loses nothing else', async () => {
    const { store, server, worker, db } = setup({ batchSize: 1000 });
    const { sets } = await workoutWithSets(store, 1000);
    server.poison(sets[500]!.id);
    const outcome = await worker.run();
    expect(outcome).toMatchObject({ pushedSets: 999, refused: 1 });
    expect(await db.sets.get(sets[500]!.id)).toMatchObject({ attempts: 1, syncStatus: 'pending' });
    expect(server.sets.size).toBe(999);
  }, 60_000);
});

describe('time', () => {
  it('a clock that goes backwards by hours does not leave a backed-off row waiting for hours', async () => {
    const { store, server, worker, clock } = setup({ startAt: 10_000_000 });
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    server.failNext('upsertWorkouts', 'rejected');
    await worker.run();
    clock.now = 1_000; // the device clock was corrected backwards
    await worker.run();
    expect(server.workouts.has(w.id)).toBe(true);
  });

  it('a row waiting until the far future is sent anyway, because that wait can only come from a wrong clock', async () => {
    const { store, db, server, worker } = setup();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    await db.workouts.update(w.id, { nextAttemptAt: 8.64e15 });
    await worker.run();
    expect(server.workouts.has(w.id)).toBe(true);
  });

  it('a row due at exactly the current time is sent', async () => {
    const { store, db, server, worker, clock } = setup();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    await db.workouts.update(w.id, { nextAttemptAt: clock.now });
    await worker.run();
    expect(server.workouts.has(w.id)).toBe(true);
  });

  it.each([
    [MAX_ATTEMPTS - 2, 'pending'],
    [MAX_ATTEMPTS - 1, 'failed'],
  ])('a set at %i attempts that is refused again is %s', async (attempts, status) => {
    const { store, db, server, worker, clock } = setup();
    const { sets } = await workoutWithSets(store, 1);
    await worker.run(); // deliver the workout and the set once, then pretend the set came back
    await db.sets.update(sets[0]!.id, { syncStatus: 'pending', attempts });
    server.failNext('upsertSets', 'rejected');
    await worker.run();
    expect(await db.sets.get(sets[0]!.id)).toMatchObject({
      syncStatus: status,
      attempts: attempts + 1,
      nextAttemptAt: clock.now + backoffMs(attempts + 1),
    });
  });

  it('after the last allowed attempt the badge shows it as failed, not pending', async () => {
    const { store, server, worker, clock } = setup();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    server.failNext('upsertWorkouts', 'rejected', MAX_ATTEMPTS);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      clock.now += 10 * 60_000;
      await worker.run();
    }
    expect(await store.counts()).toEqual({ pending: 1, failed: 1 }); // the failed workout; its set still waits
  });
});

describe('server answers', () => {
  it('a failed workout is not retried, and so its sets are never sent either', async () => {
    const { store, db, server, worker } = setup();
    const { w } = await workoutWithSets(store, 2);
    await db.workouts.update(w.id, { syncStatus: 'failed', attempts: MAX_ATTEMPTS });
    const outcome = await worker.run({ ignoreWait: true });
    expect(server.calls).toEqual([]);
    expect(outcome).toMatchObject({ pushedWorkouts: 0, pushedSets: 0 });
  });

  it('a workout refused by the server keeps all its sets pending and counts nothing on them', async () => {
    const { store, db, server, worker } = setup();
    const { sets } = await workoutWithSets(store, 3);
    server.failNext('upsertWorkouts', 'conflict');
    await worker.run();
    for (const s of sets) expect((await db.sets.get(s.id))?.attempts).toBe(0);
  });

  it('a remote that throws synchronously, not just rejects, is treated as trouble on the server', async () => {
    const { store, server, worker, db } = setup();
    const w = await store.startWorkout(aWorkout());
    server.remote.upsertWorkouts.mockImplementationOnce(() => {
      throw new Error('sync boom');
    });
    await expect(worker.run()).resolves.toMatchObject({ refused: 0 });
    expect(await db.workouts.get(w.id)).toMatchObject({ attempts: 0, syncStatus: 'pending' });
  });

  it('a remote that resolves with undefined does not crash the worker or lose the row', async () => {
    const { store, server, worker, db } = setup();
    const w = await store.startWorkout(aWorkout());
    server.remote.upsertWorkouts.mockResolvedValueOnce(undefined as never);
    await worker.run().catch(() => undefined);
    expect(await db.workouts.get(w.id)).toMatchObject({ syncStatus: 'pending' });
  });

  it('an offline answer in the middle of a deletion list stops the list and keeps the rest owed', async () => {
    const { store, server, worker } = setup();
    for (let i = 0; i < 3; i++)
      await store.outbox.queueDeletion(uuid(), '2026-10-10T10:00:00.000Z');
    server.failNext('softDeleteSet', 'offline');
    const outcome = await worker.run();
    expect(outcome.offline).toBe(true);
    expect(server.callsTo('softDeleteSet')).toHaveLength(1);
    expect(await store.counts()).toEqual({ pending: 3, failed: 0 });
  });

  it('a refused deletion does not stop the next deletion from going out', async () => {
    const { store, server, worker } = setup();
    for (let i = 0; i < 3; i++)
      await store.outbox.queueDeletion(uuid(), '2026-10-10T10:00:00.000Z');
    server.failNext('softDeleteSet', 'rejected');
    const outcome = await worker.run();
    expect(outcome).toMatchObject({ deletedSets: 2, refused: 1 });
  });

  it('a deletion the server answers with conflict backs off and is retried, not dropped', async () => {
    const { store, server, worker, db, clock } = setup();
    const id = uuid();
    await store.outbox.queueDeletion(id, '2026-10-10T10:00:00.000Z');
    server.failNext('softDeleteSet', 'conflict');
    const outcome = await worker.run();
    expect(outcome.refused).toBe(1);
    expect(await db.deletions.get(id)).toMatchObject({
      attempts: 1,
      nextAttemptAt: clock.now + backoffMs(1),
    });
  });

  it('a deletion the server keeps refusing is eventually given up on or shown as failed', async () => {
    const { store, server, worker, clock } = setup();
    await store.outbox.queueDeletion(uuid(), '2026-10-10T10:00:00.000Z');
    server.failNext('softDeleteSet', 'rejected', 1000);
    for (let i = 0; i < MAX_ATTEMPTS * 3; i++) {
      clock.now += 10 * 60_000;
      await worker.run();
    }
    const counts = await store.counts();
    expect(counts.pending === 0 || counts.failed > 0).toBe(true);
  });

  it('deletion backoff grows with each refusal', async () => {
    const { store, server, worker, db, clock } = setup();
    const id = uuid();
    await store.outbox.queueDeletion(id, '2026-10-10T10:00:00.000Z');
    server.failNext('softDeleteSet', 'rejected', 3);
    const waits: number[] = [];
    for (let i = 0; i < 3; i++) {
      clock.now += 10 * 60_000;
      await worker.run();
      waits.push(((await db.deletions.get(id))?.nextAttemptAt ?? 0) - clock.now);
    }
    expect(waits).toEqual([backoffMs(1), backoffMs(2), backoffMs(3)]);
  });

  it('a set removed while in flight and removed again after: one deletion only', async () => {
    const { store, server, worker } = setup();
    const { sets } = await workoutWithSets(store, 1);
    const release = server.hold('upsertSets');
    const running = worker.run();
    await waitFor(() => server.callsTo('upsertSets').length > 0);
    await store.removeUnsyncedSet(sets[0]!.id);
    expect(await store.removeUnsyncedSet(sets[0]!.id)).toBe('missing');
    release();
    await running;
    expect(server.callsTo('softDeleteSet')).toHaveLength(1);
  });

  it('every set removed in flight is deleted online, none forgotten', async () => {
    const { store, server, worker } = setup();
    const { sets } = await workoutWithSets(store, 5);
    const release = server.hold('upsertSets');
    const running = worker.run();
    await waitFor(() => server.callsTo('upsertSets').length > 0);
    for (const s of sets) await store.removeUnsyncedSet(s.id);
    release();
    await running;
    expect([...server.sets.values()].every((s) => s.deletedAt)).toBe(true);
    expect(server.sets.size).toBe(5);
  });
});

describe('workouts ended around a push', () => {
  it('ending a workout with unsynced sets sends the workout, then the sets, and ends up consistent', async () => {
    const { store, server, worker } = setup();
    const { w, sets } = await workoutWithSets(store, 3);
    await store.endWorkout(w.id, '2026-10-10T12:00:00.000Z');
    await worker.run();
    expect(server.workouts.get(w.id)?.endedAt).toBe('2026-10-10T12:00:00.000Z');
    expect(server.sets.size).toBe(sets.length);
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('ending a workout twice before any push sends it once with the last end time', async () => {
    const { store, server, worker } = setup();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    await store.endWorkout(w.id, '2026-10-10T11:00:00.000Z');
    await store.endWorkout(w.id, '2026-10-10T12:00:00.000Z');
    await worker.run();
    expect(server.callsTo('upsertWorkouts')).toHaveLength(1);
    expect(server.workouts.get(w.id)?.endedAt).toBe('2026-10-10T12:00:00.000Z');
  });

  it('sets logged while the workout upload is in flight are sent after it, with nothing lost', async () => {
    const { store, server, worker } = setup();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id)); // the first set is what sends the workout
    const release = server.hold('upsertWorkouts');
    const running = worker.run();
    await waitFor(() => server.callsTo('upsertWorkouts').length > 0);
    await store.logSet(aSet(w.id));
    await store.logSet(aSet(w.id));
    release();
    await running;
    await worker.run();
    expect(server.sets.size).toBe(3);
  });

  it('many workouts with the same startedAt all arrive', async () => {
    const { store, server, worker } = setup();
    const same = '2026-10-10T10:00:00.000Z';
    for (let i = 0; i < 30; i++) {
      const w = await store.startWorkout(aWorkout({ startedAt: same }));
      await store.logSet(aSet(w.id));
    }
    await worker.run();
    expect(server.workouts.size).toBe(30);
  });
});

describe('two tabs on one database', () => {
  async function twoTabs() {
    const first = setup();
    const secondDb = reopenLocal(first.userId);
    const secondServer = first.server;
    const second = createSyncWorker({
      store: secondDb.store,
      remote: secondServer.remote,
      userId: first.userId,
      now: () => first.clock.now,
    });
    return { ...first, second, secondStore: secondDb.store };
  }

  it('both workers running at once lose nothing, and the database ends fully synced', async () => {
    const { store, server, worker, second, secondStore } = await twoTabs();
    const { sets } = await workoutWithSets(store, 10);
    await Promise.all([worker.run(), second.run()]);
    await Promise.all([worker.run(), second.run()]);
    expect([...server.sets.keys()].sort()).toEqual(sets.map((s) => s.id).sort());
    expect(await secondStore.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('a duplicate push of the same row is harmless: the server still has exactly one copy', async () => {
    const { store, server, worker, second } = await twoTabs();
    await workoutWithSets(store, 3);
    await Promise.all([worker.run(), second.run()]);
    expect(server.workouts.size).toBe(1);
    expect(server.sets.size).toBe(3);
  });

  it('a set removed in tab B while tab A has it in flight is deleted online', async () => {
    const { store, secondStore, server, worker } = await twoTabs();
    const { sets } = await workoutWithSets(store, 1);
    const release = server.hold('upsertSets');
    const running = worker.run();
    await waitFor(() => server.callsTo('upsertSets').length > 0);
    expect(await secondStore.removeUnsyncedSet(sets[0]!.id)).toBe('removed');
    release();
    await running;
    expect(server.sets.get(sets[0]!.id)?.deletedAt).toBeTruthy();
  });

  it('a late refusal in one tab does not turn a row that the other tab already synced back to pending', async () => {
    const { store, server, worker, second, db } = await twoTabs();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    let answer: () => void = () => undefined;
    const late = new Promise<void>((resolve) => (answer = resolve));
    server.remote.upsertWorkouts.mockImplementationOnce(async () => {
      await late;
      return { status: 'error', reason: 'unknown' };
    });
    const slow = worker.run(); // tab A: its answer is a refusal, but it arrives late
    await waitFor(() => server.remote.upsertWorkouts.mock.calls.length > 0);
    await second.run(); // tab B: delivers the workout
    answer();
    await slow;
    expect(await db.workouts.get(w.id)).toMatchObject({ syncStatus: 'synced' });
  });
});

describe('a forced run that arrives during an ordinary run', () => {
  it('still sends rows that are backing off, as the network-is-back signal promises', async () => {
    const { store, db, server, worker } = setup();
    const busy = await store.startWorkout(aWorkout()); // due now: keeps the ordinary pass busy
    await store.logSet(aSet(busy.id));
    const backedOff = await store.startWorkout(aWorkout());
    await store.logSet(aSet(backedOff.id));
    await db.workouts.update(backedOff.id, { nextAttemptAt: 9_000_000 });
    const release = server.hold('upsertWorkouts');
    const ordinary = worker.run();
    await waitFor(() => server.callsTo('upsertWorkouts').length > 0);
    const forced = worker.run({ ignoreWait: true });
    release();
    await Promise.all([ordinary, forced]);
    await Promise.resolve();
    expect(server.workouts.has(backedOff.id)).toBe(true);
  });
});

// An empty workout is never kept: not sent, not counted as waiting, not brought back by the pull, and discarded
// when it is ended with no sets.
import { describe, expect, it } from 'vitest';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout, freshLocal, uuid } from '../../test/localDb';
import { createSyncWorker } from './worker';

function setup() {
  const local = freshLocal();
  const server = createFakeRemoteLog();
  const worker = createSyncWorker({
    store: local.store,
    remote: server.remote,
    userId: 'u1',
    now: () => 1_000_000,
  });
  return { ...local, server, worker };
}

describe('an empty workout is not sent', () => {
  it('stays on the device, and is not counted as waiting, until it has a set', async () => {
    const { store, server, worker } = setup();
    const w = await store.startWorkout(aWorkout());
    await worker.run({ ignoreWait: true });
    expect(server.workouts.size).toBe(0);
    expect(server.calls).toEqual([]);
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
    expect(await store.outbox.dueWorkouts(Number.MAX_SAFE_INTEGER)).toEqual([]);
    expect(await store.getWorkout(w.id)).toBeDefined();
  });

  it('goes out together with its first set, the workout first', async () => {
    const { store, server, worker } = setup();
    const w = await store.startWorkout(aWorkout());
    await worker.run({ ignoreWait: true });
    const set = await store.logSet(aSet(w.id));
    expect(await store.counts()).toEqual({ pending: 2, failed: 0 });
    await worker.run({ ignoreWait: true });
    expect(server.calls.map((c) => c.method)).toEqual(['upsertWorkouts', 'upsertSets']);
    expect(server.workouts.has(w.id)).toBe(true);
    expect(server.sets.has(set.id)).toBe(true);
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('is not sent after its only set was removed before it ever left the device', async () => {
    const { store, server, worker } = setup();
    const w = await store.startWorkout(aWorkout());
    const set = await store.logSet(aSet(w.id));
    expect(await store.removeUnsyncedSet(set.id)).toBe('removed');
    await worker.run({ ignoreWait: true });
    expect(server.workouts.size).toBe(0);
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('keeps sending a workout that already reached the server, even after its sets are gone', async () => {
    const { store, server, worker } = setup();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    await worker.run({ ignoreWait: true });
    expect(server.workouts.has(w.id)).toBe(true);
    // It is on the server now, so ending it stays as it was: an ended workout is sent again.
    expect(await store.finishWorkout(w.id, '2026-10-10T11:00:00.000Z')).toBe('saved');
    await worker.run({ ignoreWait: true });
    expect(server.workouts.get(w.id)?.endedAt).toBe('2026-10-10T11:00:00.000Z');
  });

  it('sends the workouts that have sets and leaves the empty one out of the same pass', async () => {
    const { store, server, worker } = setup();
    const empty = await store.startWorkout(aWorkout({ startedAt: '2026-10-10T08:00:00.000Z' }));
    const full = await store.startWorkout(aWorkout({ startedAt: '2026-10-10T09:00:00.000Z' }));
    await store.logSet(aSet(full.id));
    await worker.run({ ignoreWait: true });
    expect([...server.workouts.keys()]).toEqual([full.id]);
    expect(await store.getWorkout(empty.id)).toBeDefined();
  });
});

describe('finishWorkout', () => {
  it('discards a workout with no sets that never reached the server', async () => {
    const { store } = setup();
    const w = await store.startWorkout(aWorkout());
    expect(await store.finishWorkout(w.id, '2026-10-10T11:00:00.000Z')).toBe('discarded');
    expect(await store.getWorkout(w.id)).toBeUndefined();
    expect(await store.endedWorkouts(10)).toEqual([]);
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('discards a workout whose only set was removed', async () => {
    const { store } = setup();
    const w = await store.startWorkout(aWorkout());
    const set = await store.logSet(aSet(w.id));
    await store.removeUnsyncedSet(set.id);
    expect(await store.finishWorkout(w.id, '2026-10-10T11:00:00.000Z')).toBe('discarded');
    expect(await store.getWorkout(w.id)).toBeUndefined();
  });

  it('ends a workout that has a set, as endWorkout does', async () => {
    const { store } = setup();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    expect(await store.finishWorkout(w.id, '2026-10-10T11:00:00.000Z')).toBe('saved');
    expect((await store.getWorkout(w.id))?.endedAt).toBe('2026-10-10T11:00:00.000Z');
  });

  it('does not discard a workout that is already on the server', async () => {
    const { store } = setup();
    const w = await store.startWorkout(aWorkout());
    await store.outbox.markSynced('workout', [{ id: w.id, rev: w.rev }]);
    expect(await store.finishWorkout(w.id, '2026-10-10T11:00:00.000Z')).toBe('saved');
    expect(await store.getWorkout(w.id)).toBeDefined();
  });

  it('refuses a workout that does not exist, and a time without a zone', async () => {
    const { store } = setup();
    await expect(store.finishWorkout(uuid(), '2026-10-10T11:00:00.000Z')).rejects.toThrow();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id));
    await expect(store.finishWorkout(w.id, 'not a time')).rejects.toThrow();
    expect((await store.getWorkout(w.id))?.endedAt).toBeNull();
  });

  it('leaves the other workouts and their sets alone', async () => {
    const { store } = setup();
    const keep = await store.startWorkout(aWorkout({ startedAt: '2026-10-10T08:00:00.000Z' }));
    const set = await store.logSet(aSet(keep.id));
    const empty = await store.startWorkout(aWorkout({ startedAt: '2026-10-10T09:00:00.000Z' }));
    expect(await store.finishWorkout(empty.id, '2026-10-10T10:00:00.000Z')).toBe('discarded');
    expect(await store.getWorkout(keep.id)).toBeDefined();
    expect((await store.listSets(keep.id)).map((s) => s.id)).toEqual([set.id]);
  });
});

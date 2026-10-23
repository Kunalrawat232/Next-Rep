import { describe, expect, it } from 'vitest';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout, freshLocal, uuid } from '../../test/localDb';
import { createSyncWorker } from './worker';

// Seeded random numbers. The choices are reproducible from the seed; how the overlapping runs
// interleave is up to the event loop, so a failure may need a few reruns to reproduce.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Model = {
  workouts: Map<string, { endedAt: string | null }>;
  sets: Map<string, string>; // logged and not removed: set id -> its workout
};

async function scenario(seed: number, steps: number) {
  const random = mulberry32(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;
  const { store } = freshLocal(`prop-${seed}`);
  const server = createFakeRemoteLog();
  const clock = { now: 1_000_000 };
  const worker = createSyncWorker({
    store,
    remote: server.remote,
    userId: 'u1',
    now: () => clock.now,
    batchSize: 1 + Math.floor(random() * 4),
  });
  const model: Model = { workouts: new Map(), sets: new Map() };
  const running: Promise<unknown>[] = [];
  let minute = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 10, 8, minute++)).toISOString();

  for (let i = 0; i < steps; i++) {
    const roll = random();
    const workoutIds = [...model.workouts.keys()];
    if (roll < 0.12 || workoutIds.length === 0) {
      const w = await store.startWorkout(aWorkout({ id: uuid(), startedAt: stamp() }));
      model.workouts.set(w.id, { endedAt: null });
    } else if (roll < 0.5) {
      const s = await store.logSet(aSet(pick(workoutIds), { id: uuid(), loggedAt: stamp() }));
      model.sets.set(s.id, s.workoutId);
    } else if (roll < 0.58 && model.sets.size > 0) {
      const id = pick([...model.sets.keys()]);
      if ((await store.removeUnsyncedSet(id)) === 'removed') model.sets.delete(id);
    } else if (roll < 0.64) {
      const id = pick(workoutIds);
      const endedAt = new Date(Date.UTC(2026, 9, 10, 20, minute++)).toISOString();
      await store.endWorkout(id, endedAt);
      model.workouts.set(id, { endedAt });
    } else if (roll < 0.72) {
      server.setOffline(random() < 0.5);
    } else if (roll < 0.8) {
      server.failNext(
        pick(['upsertWorkouts', 'upsertSets', 'softDeleteSet'] as const),
        pick(['unknown', 'offline'] as const),
      );
    } else if (roll < 0.95) {
      running.push(worker.run({ ignoreWait: random() < 0.5 }));
    } else {
      clock.now += 60_000;
    }
  }

  // The network returns and the server behaves: everything must now arrive.
  server.setOffline(false);
  await Promise.all(running);
  for (let attempt = 0; attempt < 60; attempt++) {
    clock.now += 10 * 60_000;
    await worker.run({ ignoreWait: true });
    const { pending, failed } = await store.counts();
    if (pending === 0 && failed === 0) break;
  }
  return { model, server, store };
}

describe('no set is ever lost, duplicated or orphaned', () => {
  it.each(Array.from({ length: 150 }, (_, i) => i + 1))('seed %i', async (seed) => {
    const { model, server, store } = await scenario(seed, 70);
    // Nothing needed a manual retry: server trouble and being offline never fail a row.
    expect(await store.counts()).toEqual({ pending: 0, failed: 0 });

    // Every set the user kept is on the server, once, and not deleted.
    const live = [...server.sets.values()].filter((s) => !s.deletedAt).map((s) => s.id);
    expect(live.sort()).toEqual([...model.sets.keys()].sort());

    // Every workout that has a set is on the server with the end time it last had. A workout with no sets is
    // only sent with its first set, so it may or may not be there; the server never has one the user did not make.
    for (const id of new Set(model.sets.values()))
      expect(server.workouts.get(id)?.endedAt).toBe(model.workouts.get(id)?.endedAt);
    for (const id of server.workouts.keys()) expect(model.workouts.has(id)).toBe(true);

    // No set sits on the server without its workout.
    for (const set of server.sets.values()) expect(server.workouts.has(set.workoutId)).toBe(true);
  });
});

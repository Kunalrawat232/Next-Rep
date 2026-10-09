import { describe, expect, it } from 'vitest';
import { recordMarks } from '../../domain/records';
import { createFakeRemoteLog } from '../../test/fakeRemoteLog';
import { aSet, aWorkout, freshLocal, uuid } from '../../test/localDb';
import { pullHistory } from './pull';
import { createSyncWorker } from './worker';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

/** Device A logs, removes, ends and syncs at random; a fresh device B then pulls what A sent. */
async function scenario(seed: number) {
  const random = mulberry32(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;
  const server = createFakeRemoteLog();
  const a = freshLocal(`conv-a-${seed}`);
  const worker = createSyncWorker({
    store: a.store,
    remote: server.remote,
    userId: 'u1',
    batchSize: 1 + Math.floor(random() * 4),
  });
  let minute = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 1, 8, minute++)).toISOString();
  const workouts: string[] = [];
  const exercises = [uuid(9001), uuid(9002)];

  for (let i = 0; i < 40; i += 1) {
    const roll = random();
    if (roll < 0.15 || workouts.length === 0) {
      const w = await a.store.startWorkout(aWorkout({ id: uuid(), startedAt: stamp() }));
      workouts.push(w.id);
    } else if (roll < 0.6) {
      await a.store.logSet(
        aSet(pick(workouts), {
          id: uuid(),
          exerciseId: pick(exercises),
          totalKg: pick([40, 60, 62.5, 80]),
          barKg: null,
          perSideKg: null,
          inputMode: 'total',
          reps: 1 + Math.floor(random() * 10),
          loggedAt: stamp(),
        }),
      );
    } else if (roll < 0.7) {
      const open = (await a.db.workouts.toArray()).filter((w) => w.endedAt === null);
      if (open.length > 0)
        await a.store.endWorkout(
          pick(open).id,
          new Date(Date.UTC(2026, 9, 2, 8, minute++)).toISOString(),
        );
    } else if (roll < 0.78) {
      const unsynced = (await a.db.sets.toArray()).filter((s) => s.syncStatus !== 'synced');
      if (unsynced.length > 0) await a.store.removeUnsyncedSet(pick(unsynced).id);
    } else if (roll < 0.85) {
      server.setOffline(random() < 0.5);
    } else {
      await worker.run({ ignoreWait: true });
    }
  }
  server.setOffline(false);
  for (let i = 0; i < 4; i += 1) await worker.run({ ignoreWait: true });
  return { server, a };
}

describe('a second device that pulls', () => {
  it.each(Array.from({ length: 60 }, (_, i) => i + 1))(
    'ends up with the finished workouts and sets of the first (seed %i)',
    async (seed) => {
      const { server, a } = await scenario(seed);
      const b = freshLocal(`conv-b-${seed}`);
      const pull = () =>
        pullHistory({ store: b.store, remote: server.remote, userId: 'u1', pageSize: 7 });

      expect((await pull()).status).toBe('done');
      const endedA = (await a.db.workouts.toArray()).filter(
        (w) => w.endedAt !== null && w.syncStatus === 'synced',
      );
      const setsA = (await a.db.sets.toArray()).filter(
        (s) => s.syncStatus === 'synced' && endedA.some((w) => w.id === s.workoutId),
      );
      expect(ids(await b.db.workouts.toArray())).toEqual(ids(endedA));
      expect(ids(await b.db.sets.toArray())).toEqual(ids(setsA));
      expect(await b.store.counts()).toEqual({ pending: 0, failed: 0 });

      // The same personal records, from the same sets.
      const marksA = recordMarks(setsA);
      const marksB = recordMarks(await b.db.sets.toArray());
      expect([...marksB]).toEqual([...marksA]);

      // Pulling again, here or on the first device, changes nothing.
      expect(await pull()).toMatchObject({ status: 'done', changed: false });
      const before = ids(await a.db.sets.toArray());
      await pullHistory({ store: a.store, remote: server.remote, userId: 'u1' });
      expect(ids(await a.db.sets.toArray())).toEqual(before);
    },
  );

  it.each(Array.from({ length: 30 }, (_, i) => i + 100))(
    'drops a set that was deleted elsewhere, and no other (seed %i)',
    async (seed) => {
      const { server, a } = await scenario(seed);
      const b = freshLocal(`conv-b-${seed}`);
      const full = { store: b.store, remote: server.remote, userId: 'u1' };
      await pullHistory(full);
      const there = await b.db.sets.toArray();
      if (there.length === 0) return;
      const gone = there[seed % there.length]!;
      server.deleteElsewhere(gone.id);
      await pullHistory(full);
      await pullHistory({ store: a.store, remote: server.remote, userId: 'u1' });
      expect(ids(await b.db.sets.toArray())).toEqual(ids(there.filter((s) => s.id !== gone.id)));
      expect((await a.db.sets.toArray()).some((s) => s.id === gone.id)).toBe(false);
    },
  );
});

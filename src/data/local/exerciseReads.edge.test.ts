import { describe, expect, it } from 'vitest';
import { aSet, aWorkout, freshLocal, uuid } from '../../test/localDb';

const BENCH = '2c49d84c-42d6-5729-8791-bdf87686998a';
const SQUAT = uuid(8002);

describe('setsForExercises and allSets edge cases', () => {
  it('stores timestamps with an offset or without milliseconds in one sortable form', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    // 09:00Z, 10:00Z (written as +05:30 and without ms), 11:00Z
    const late = await store.logSet(
      aSet(w.id, { exerciseId: BENCH, loggedAt: '2026-10-10T11:00:00.000Z' }),
    );
    const offset = await store.logSet(
      aSet(w.id, { exerciseId: BENCH, loggedAt: '2026-10-10T15:30:00+05:30' }),
    );
    const bare = await store.logSet(
      aSet(w.id, { exerciseId: BENCH, loggedAt: '2026-10-10T09:00:00Z' }),
    );
    const ids = (await store.setsForExercises([BENCH])).map((x) => x.id);
    expect(ids).toEqual([bare.id, offset.id, late.id]);
    expect((await store.allSets()).map((x) => x.id)).toEqual(ids);
    expect(offset.loggedAt).toBe('2026-10-10T10:00:00.000Z');
  });

  it.each<[string, string[]]>([
    ['an empty id', ['']],
    ['an id that is a prefix of a real one', [BENCH.slice(0, -1)]],
    ['the same id in another case', [BENCH.toUpperCase()]],
    ['an id with the highest character', ['￿']],
  ])('finds nothing for %s', async (_name, ids) => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    await store.logSet(aSet(w.id, { exerciseId: BENCH }));
    expect(await store.setsForExercises(ids)).toEqual([]);
  });

  it('keeps sets with the same loggedAt in a stable order, the same for one exercise and for all', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const at = '2026-10-10T10:00:00.000Z';
    for (let i = 0; i < 6; i += 1)
      await store.logSet(aSet(w.id, { exerciseId: BENCH, loggedAt: at }));
    const one = (await store.setsForExercises([BENCH])).map((x) => x.id);
    const all = (await store.allSets()).map((x) => x.id);
    expect(one).toEqual(all);
    expect(new Set(one).size).toBe(6);
  });

  it('returns several exercises merged by time, not grouped by exercise', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const sets = [
      [BENCH, '10:00'],
      [SQUAT, '10:01'],
      [BENCH, '10:02'],
      [SQUAT, '10:03'],
    ] as const;
    const logged = [];
    for (const [exerciseId, t] of sets)
      logged.push(
        await store.logSet(aSet(w.id, { exerciseId, loggedAt: `2026-10-10T${t}:00.000Z` })),
      );
    expect((await store.setsForExercises([SQUAT, BENCH])).map((x) => x.id)).toEqual(
      logged.map((x) => x.id),
    );
  });

  it('reads a few thousand sets across workouts quickly and still sorted', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const seed = await store.logSet(aSet(w.id, { exerciseId: BENCH }));
    const rows = Array.from({ length: 3000 }, (_, i) => ({
      ...seed,
      id: uuid(100_000 + i),
      exerciseId: i % 3 === 0 ? SQUAT : BENCH,
      loggedAt: new Date(Date.UTC(2026, 0, 1) + ((i * 7919) % 3000) * 60_000).toISOString(),
    }));
    await db.sets.bulkPut(rows);
    const start = performance.now();
    const bench = await store.setsForExercises([BENCH]);
    const all = await store.allSets();
    expect(performance.now() - start).toBeLessThan(900);
    expect(all).toHaveLength(3001);
    expect(bench.every((x) => x.exerciseId === BENCH)).toBe(true);
    for (const list of [bench, all])
      expect(list.every((x, i) => i === 0 || list[i - 1]!.loggedAt <= x.loggedAt)).toBe(true);
  });

  it('still returns sets whose workout no longer exists', async () => {
    const { store, db } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const set = await store.logSet(aSet(w.id, { exerciseId: BENCH }));
    await db.workouts.delete(w.id);
    expect((await store.setsForExercises([BENCH])).map((x) => x.id)).toEqual([set.id]);
    expect(await store.allSets()).toHaveLength(1);
  });

  it('reflects an undo straight away', async () => {
    const { store } = freshLocal();
    const w = await store.startWorkout(aWorkout());
    const set = await store.logSet(aSet(w.id, { exerciseId: BENCH }));
    expect(await store.removeUnsyncedSet(set.id)).toBe('removed');
    expect(await store.setsForExercises([BENCH])).toEqual([]);
    expect(await store.allSets()).toEqual([]);
  });
});

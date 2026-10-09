import { describe, expect, it } from 'vitest';
import { currentRecords, recordMarks, sessionBests, type RecordKind } from '.';

let n = 0;
const set = (
  totalKg: number,
  reps: number,
  at: string,
  over: Partial<{ id: string; exerciseId: string }> = {},
) => ({
  id: over.id ?? `s${(n += 1)}`,
  exerciseId: over.exerciseId ?? 'bench',
  totalKg,
  reps,
  loggedAt: `2026-10-0${at}T10:00:00.000Z`,
});
const marks = (sets: ReturnType<typeof set>[]) =>
  Object.fromEntries([...recordMarks(sets)].map(([id, kind]) => [id, kind] as const));

describe('recordMarks', () => {
  it('never marks the first set', () => {
    expect(recordMarks([set(100, 5, '1')]).size).toBe(0);
    expect(recordMarks([]).size).toBe(0);
  });

  it.each<[string, [number, number][], (RecordKind | undefined)[]]>([
    [
      'a heavier set',
      [
        [60, 8],
        [62.5, 5],
      ],
      [undefined, 'weight'],
    ],
    [
      'a heavier set with fewer reps still counts',
      [
        [60, 10],
        [100, 1],
      ],
      [undefined, 'weight'],
    ],
    [
      'the same weight and reps is not a record',
      [
        [60, 8],
        [60, 8],
      ],
      [undefined, undefined],
    ],
    [
      'the same weight with more reps',
      [
        [60, 8],
        [60, 9],
      ],
      [undefined, 'reps'],
    ],
    [
      'a lighter set is never a record',
      [
        [60, 8],
        [50, 20],
      ],
      [undefined, undefined],
    ],
    [
      'the first set at a lighter weight has nothing to beat',
      [
        [60, 8],
        [50, 20],
        [50, 21],
      ],
      [undefined, undefined, 'reps'],
    ],
    [
      'reps compare per weight, not overall',
      [
        [60, 8],
        [62.5, 12],
        [60, 9],
      ],
      [undefined, 'weight', 'reps'],
    ],
    [
      'a lighter set with more reps than a heavier one is not a record',
      [
        [60, 5],
        [50, 3],
        [50, 3],
      ],
      [undefined, undefined, undefined],
    ],
    [
      'bodyweight at 0 kg uses reps only',
      [
        [0, 10],
        [0, 12],
        [0, 11],
      ],
      [undefined, 'reps', undefined],
    ],
    [
      '0 kg after weight is not a weight record',
      [
        [0, 10],
        [0, 10],
      ],
      [undefined, undefined],
    ],
    [
      'going back to a lower best reps is not a record',
      [
        [60, 8],
        [60, 10],
        [60, 9],
      ],
      [undefined, 'reps', undefined],
    ],
  ])('%s', (_name, input, expected) => {
    const sets = input.map(([kg, reps], i) => set(kg, reps, String(i + 1)));
    const result = recordMarks(sets);
    expect(sets.map((s) => result.get(s.id))).toEqual(expected);
  });

  it('compares weights as hundredths, so float dust is the same weight', () => {
    const a = set(62.5, 8, '1');
    const b = set(62.5 + 1e-12, 9, '2');
    expect(recordMarks([a, b]).get(b.id)).toBe('reps');
  });

  it('judges by logged time, not the order the sets are given in', () => {
    const early = set(60, 8, '1');
    const late = set(70, 5, '2');
    expect(recordMarks([late, early]).get(late.id)).toBe('weight');
    expect(recordMarks([late, early]).get(early.id)).toBeUndefined();
  });

  it('breaks a tie in logged time by id', () => {
    const a = set(60, 8, '1', { id: 'a' });
    const b = set(70, 8, '1', { id: 'b' });
    expect(marks([b, a])).toEqual({ b: 'weight' });
  });

  it('keeps exercises apart', () => {
    const bench = [set(60, 8, '1'), set(65, 8, '2')];
    const squat = [
      set(100, 5, '1', { exerciseId: 'squat' }),
      set(100, 5, '2', { exerciseId: 'squat' }),
    ];
    const result = recordMarks([...bench, ...squat]);
    expect(result.get(bench[1]!.id)).toBe('weight');
    expect(result.get(squat[1]!.id)).toBeUndefined();
  });

  it('does not change its input', () => {
    const input = [set(70, 5, '2'), set(60, 8, '1')];
    const copy = [...input];
    recordMarks(input);
    expect(input).toEqual(copy);
  });

  it('agrees with a plain comparison against every earlier set, on random histories', () => {
    let seed = 1;
    const rand = (max: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % max;
    };
    for (let round = 0; round < 150; round += 1) {
      const sets = Array.from({ length: 1 + rand(30) }, (_, i) => ({
        id: `r${round}-${i}`,
        exerciseId: rand(2) === 0 ? 'a' : 'b',
        totalKg: [0, 20, 50, 52.5, 60, 60.0000001, 100][rand(7)]!,
        reps: 1 + rand(12),
        loggedAt: `2026-10-01T10:${String(rand(40)).padStart(2, '0')}:00.000Z`,
      }));
      const ordered = [...sets].sort((x, y) =>
        x.loggedAt === y.loggedAt ? (x.id < y.id ? -1 : 1) : x.loggedAt < y.loggedAt ? -1 : 1,
      );
      const result = recordMarks(sets);
      ordered.forEach((s, i) => {
        const earlier = ordered.slice(0, i).filter((e) => e.exerciseId === s.exerciseId);
        const w = Math.round(s.totalKg * 100);
        let expected: RecordKind | undefined;
        if (earlier.length > 0) {
          const heavier = earlier.every((e) => Math.round(e.totalKg * 100) < w);
          const same = earlier.filter((e) => Math.round(e.totalKg * 100) === w);
          if (heavier) expected = 'weight';
          else if (same.length > 0 && same.every((e) => e.reps < s.reps)) expected = 'reps';
        }
        expect(result.get(s.id), `${s.id}`).toBe(expected);
      });
    }
  });
});

describe('sessionBests', () => {
  const inWorkout = (workoutId: string, kg: number, reps: number, at: string) => ({
    ...set(kg, reps, at),
    workoutId,
  });

  it('takes the heaviest set of each workout, then the one with more reps, oldest workout first', () => {
    const result = sessionBests([
      inWorkout('w2', 65, 5, '5'),
      inWorkout('w1', 60, 8, '1'),
      inWorkout('w1', 62.5, 6, '2'),
      inWorkout('w1', 62.5, 8, '3'),
      inWorkout('w2', 60, 10, '4'),
    ]);
    expect(result.map((r) => [r.workoutId, r.totalKg, r.reps])).toEqual([
      ['w1', 62.5, 8],
      ['w2', 65, 5],
    ]);
  });

  it('is empty for no sets and one point for one set', () => {
    expect(sessionBests([])).toEqual([]);
    expect(sessionBests([inWorkout('w', 60, 8, '1')])).toHaveLength(1);
  });
});

describe('currentRecords', () => {
  it('has the heaviest set and the most reps at each weight', () => {
    const records = currentRecords([
      set(60, 8, '1'),
      set(60, 10, '2'),
      set(70, 3, '3'),
      set(70, 3, '4'),
    ]);
    expect(records.heaviest).toMatchObject({ totalKg: 70, reps: 3 });
    expect(records.repsAtWeight.map((r) => [r.totalKg, r.reps])).toEqual([
      [70, 3],
      [60, 10],
    ]);
  });

  it('keeps the earlier set when reps tie', () => {
    const a = set(60, 8, '1', { id: 'a' });
    const b = set(60, 8, '2', { id: 'b' });
    expect(currentRecords([b, a]).heaviest?.setId).toBe('a');
  });

  it('has nothing without sets', () => {
    expect(currentRecords([])).toEqual({ heaviest: null, repsAtWeight: [] });
  });
});

describe('currentRecords for bodyweight', () => {
  it('has no heaviest when every set is at 0 kg, but keeps the most reps', () => {
    const records = currentRecords([set(0, 10, '1'), set(0, 12, '2')]);
    expect(records.heaviest).toBeNull();
    expect(records.repsAtWeight.map((r) => [r.totalKg, r.reps])).toEqual([[0, 12]]);
  });
});

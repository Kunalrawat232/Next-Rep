import { describe, expect, it } from 'vitest';
import { currentRecords, recordMarks, sessionBests } from '.';

type S = { id: string; exerciseId: string; loggedAt: string; totalKg: number; reps: number };
const T = '2026-01-01T00:00:00.000Z';
const s = (id: string, totalKg: number, reps: number, loggedAt = T, exerciseId = 'bench'): S => ({
  id,
  exerciseId,
  totalKg,
  reps,
  loggedAt,
});
const minute = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();

/** Every ordering of a short list. */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

describe('recordMarks edge cases', () => {
  it.each<[string, S[], Record<string, 'weight' | 'reps'>]>([
    [
      'identical loggedAt: the lower id counts as earlier',
      [s('a', 60, 8), s('b', 62.5, 5), s('c', 62.5, 6)],
      { b: 'weight', c: 'reps' },
    ],
    [
      'identical loggedAt, equal sets: neither is a record',
      [s('a', 60, 8), s('b', 60, 8), s('c', 60, 8)],
      {},
    ],
    [
      '0.1 + 0.2 and 0.3 are the same weight',
      [s('a', 0.3, 5), s('b', 0.1 + 0.2, 6, minute(1))],
      { b: 'reps' },
    ],
    ['0.29 is heavier than 0.28', [s('a', 0.28, 5), s('b', 0.29, 5, minute(1))], { b: 'weight' }],
    ['100 reps is a rep PR over 99', [s('a', 40, 99), s('b', 40, 100, minute(1))], { b: 'reps' }],
    [
      '100 reps at a new, heavier weight is a weight PR, not a rep PR',
      [s('a', 40, 99), s('b', 45, 100, minute(1))],
      { b: 'weight' },
    ],
    [
      'a 500 kg set after lighter ones is a weight PR',
      [s('a', 499.99, 1), s('b', 500, 1, minute(1))],
      { b: 'weight' },
    ],
    [
      '0 kg first, then weight: weight beats 0 kg',
      [s('a', 0, 12), s('b', 5, 1, minute(1))],
      { b: 'weight' },
    ],
    [
      'back to 0 kg after weight is nothing, more reps at 0 kg is a rep PR',
      [s('a', 0, 10), s('b', 20, 5, minute(1)), s('c', 0, 11, minute(2))],
      { b: 'weight', c: 'reps' },
    ],
  ])('%s', (_name, sets, expected) => {
    expect(Object.fromEntries(recordMarks(sets, 'kg'))).toEqual(expected);
  });

  it('gives the same marks for every ordering of the input, even with identical loggedAt', () => {
    const sets = [s('a', 60, 8), s('b', 60, 9), s('c', 65, 3), s('d', 65, 3)];
    const reference = Object.fromEntries(recordMarks(sets, 'kg'));
    for (const order of permutations(sets))
      expect(Object.fromEntries(recordMarks(order, 'kg'))).toEqual(reference);
  });

  it('only ever marks 0 kg sets as rep records, whatever else is logged', () => {
    const sets = Array.from({ length: 40 }, (_, i) => s(`z${i}`, 0, 1 + ((i * 7) % 13), minute(i)));
    for (const [id, kind] of recordMarks(sets, 'kg')) expect(kind, id).toBe('reps');
  });

  it('keeps many exercises apart and marks each exactly once', () => {
    const sets = Array.from({ length: 300 }, (_, i) => {
      const exerciseId = `ex${i % 100}`;
      return s(`s${i}`, 50 + Math.floor(i / 100) * 5, 5, minute(i), exerciseId);
    });
    const marks = recordMarks(sets, 'kg');
    // Each exercise has 3 sets at 50, 55, 60: the 2nd and 3rd are weight records.
    expect(marks.size).toBe(200);
    expect([...marks.values()].every((k) => k === 'weight')).toBe(true);
  });

  it('handles thousands of sets quickly', () => {
    const sets = Array.from({ length: 20_000 }, (_, i) =>
      s(`s${i}`, 20 + (i % 50) * 2.5, 1 + (i % 12), minute(i), `ex${i % 20}`),
    );
    const start = performance.now();
    const marks = recordMarks(sets, 'kg');
    const records = currentRecords(
      sets.filter((x) => x.exerciseId === 'ex0'),
      'kg',
    );
    expect(performance.now() - start).toBeLessThan(750);
    expect(marks.size).toBeGreaterThan(0);
    expect(records.heaviest).not.toBeNull();
  });
});

describe('sessionBests edge cases', () => {
  const w = (workoutId: string, x: S) => ({ ...x, workoutId });

  it('is the same whatever order the sets arrive in, when two top sets are identical in weight, reps and time', () => {
    // Both are the top set of w1. recordMarks calls the lower id earlier, so the badge lives on 'a'.
    const sets = [w('w1', s('a', 60, 8)), w('w1', s('b', 60, 8))];
    const ids = permutations(sets).map((order) => sessionBests(order, 'kg')[0]!.setId);
    expect(new Set(ids).size).toBe(1);
  });

  it('shows the badge on the top set row when the top set is a record and times tie', () => {
    const before = w('w0', s('p', 50, 5, minute(0)));
    const top = [w('w1', s('b', 60, 8, minute(5))), w('w1', s('a', 60, 8, minute(5)))];
    const all = [before, ...top];
    const marks = recordMarks(all, 'kg');
    for (const order of permutations(top)) {
      const point = sessionBests([before, ...order], 'kg').find((p) => p.workoutId === 'w1')!;
      expect(marks.has(point.setId), `top set ${point.setId} should carry the PR`).toBe(true);
    }
  });

  it('treats 0.1 + 0.2 and 0.3 as the same weight, so more reps wins', () => {
    const result = sessionBests(
      [w('w', s('a', 0.3, 5)), w('w', s('b', 0.1 + 0.2, 6, minute(1)))],
      'kg',
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ setId: 'b', reps: 6 });
  });

  it('gives one point per workout even with thousands of workouts, oldest first, quickly', () => {
    const sets = Array.from({ length: 5000 }, (_, i) =>
      w(`w${i}`, s(`s${i}`, 40 + (i % 9), 5, minute(i))),
    );
    const start = performance.now();
    const points = sessionBests([...sets].reverse(), 'kg');
    expect(performance.now() - start).toBeLessThan(500);
    expect(points).toHaveLength(5000);
    expect(points[0]!.workoutId).toBe('w0');
    expect(points.at(-1)!.workoutId).toBe('w4999');
  });

  it('orders workouts by when their top set was logged, so a workout started earlier but topped later comes last', () => {
    const points = sessionBests(
      [
        w('long', s('l1', 50, 5, minute(0))),
        w('long', s('l2', 80, 5, minute(100))),
        w('short', s('s1', 60, 5, minute(10))),
      ],
      'kg',
    );
    expect(points.map((p) => p.workoutId)).toEqual(['short', 'long']);
  });

  it('does not change its input', () => {
    const input = [w('b', s('x', 60, 8, minute(2))), w('a', s('y', 70, 8, minute(1)))];
    const copy = structuredClone(input);
    sessionBests(input, 'kg');
    expect(input).toEqual(copy);
  });
});

describe('currentRecords edge cases', () => {
  it('merges float dust into one weight and keeps the heaviest-first order', () => {
    const r = currentRecords(
      [s('a', 0.3, 5), s('b', 0.1 + 0.2, 7, minute(1)), s('c', 0.5, 1, minute(2))],
      'kg',
    );
    expect(r.repsAtWeight.map((x) => [x.reps, x.setId])).toEqual([
      [1, 'c'],
      [7, 'b'],
    ]);
  });

  it('is the same whatever order the sets arrive in, with identical loggedAt', () => {
    const sets = [s('a', 60, 8), s('b', 60, 8), s('c', 60, 9), s('d', 60, 9)];
    const reference = currentRecords(sets, 'kg');
    for (const order of permutations(sets)) expect(currentRecords(order, 'kg')).toEqual(reference);
    expect(reference.heaviest?.setId).toBe('c');
  });

  it('keeps 100 reps at 0 kg as a rep record even though there is no heaviest', () => {
    const r = currentRecords([s('a', 0, 100)], 'kg');
    expect(r.heaviest).toBeNull();
    expect(r.repsAtWeight).toMatchObject([{ totalKg: 0, reps: 100 }]);
  });

  it('has no "heaviest" when every set is 0 kg (a PR is never at 0 kg)', () => {
    // weight-rules.md: "never at 0 kg". The progress screens use `heaviest` for a PR badge and a
    // "Heaviest" line, so a bodyweight-only exercise would claim a heaviest weight of 0 kg.
    expect(currentRecords([s('a', 0, 10), s('b', 0, 12, minute(1))], 'kg').heaviest).toBeNull();
  });
});

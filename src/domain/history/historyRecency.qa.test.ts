// QA pass: the order of "exercises done before" when times tie, many exercises, and odd rows.
import { describe, expect, it } from 'vitest';
import { exercisesByRecency } from '.';

const row = (exerciseId: string, loggedAt: string) => ({ exerciseId, loggedAt });
const iso = (day: number, hour = 10, ms = 0) =>
  new Date(Date.UTC(2026, 9, day, hour, 0, 0, ms)).toISOString();

describe('exercisesByRecency edge cases', () => {
  it('ties on the same instant keep the order the exercises were first seen, whatever the row order', () => {
    const when = iso(5);
    expect(
      exercisesByRecency([row('a', when), row('b', when), row('c', when)]).map((e) => e.exerciseId),
    ).toEqual(['a', 'b', 'c']);
    // Reading the same data again gives the same order, so the list does not shuffle between renders.
    const sets = [row('c', when), row('a', when), row('b', when)];
    expect(exercisesByRecency(sets)).toEqual(exercisesByRecency([...sets]));
  });

  it('a millisecond decides between two sets in the same second', () => {
    const result = exercisesByRecency([row('early', iso(5, 10, 1)), row('late', iso(5, 10, 2))]);
    expect(result.map((e) => e.exerciseId)).toEqual(['late', 'early']);
  });

  it('uses each exercise latest set, not the first or the last row', () => {
    const result = exercisesByRecency([
      row('a', iso(9)),
      row('a', iso(1)),
      row('b', iso(5)),
      row('a', iso(3)),
    ]);
    expect(result).toEqual([
      { exerciseId: 'a', last: iso(9) },
      { exerciseId: 'b', last: iso(5) },
    ]);
  });

  it('works across a year boundary and for exactly 6 and 7 exercises, each listed once', () => {
    const sets = Array.from({ length: 7 }, (_, i) =>
      row(`e${i}`, new Date(Date.UTC(2025, 11, 30 + i, 10)).toISOString()),
    );
    const result = exercisesByRecency([...sets, ...sets]);
    expect(result).toHaveLength(7);
    expect(result[0]!.exerciseId).toBe('e6'); // 5 Jan 2026
    expect(result.at(-1)!.exerciseId).toBe('e0'); // 30 Dec 2025
    expect(exercisesByRecency(sets.slice(0, 6))).toHaveLength(6);
  });

  it('keeps an exercise id it knows nothing about (a deleted exercise) and does not change its input', () => {
    const sets = [row('gone-from-library', iso(2)), row('bench', iso(3))];
    const copy = structuredClone(sets);
    expect(exercisesByRecency(sets).map((e) => e.exerciseId)).toEqual([
      'bench',
      'gone-from-library',
    ]);
    expect(sets).toEqual(copy);
  });

  it('is empty for no sets and handles a hundred thousand', () => {
    expect(exercisesByRecency([])).toEqual([]);
    const many = Array.from({ length: 100_000 }, (_, i) => row(`e${i % 50}`, iso(1 + (i % 28))));
    const result = exercisesByRecency(many);
    expect(result).toHaveLength(50);
    expect(result.every((e, i) => i === 0 || result[i - 1]!.last >= e.last)).toBe(true);
  });
});

// QA pass: topSet with ties, rounding, odd values and scale.
import { describe, expect, it } from 'vitest';
import { topSet } from '.';

const row = (totalKg: number, id: string) => ({ totalKg, id });

describe('topSet', () => {
  it('is null for no sets', () => {
    expect(topSet([])).toBeNull();
  });

  it('is the only set, counted once, and the same object', () => {
    const only = row(60, 'a');
    const r = topSet([only])!;
    expect(r.top).toBe(only);
    expect(r.count).toBe(1);
  });

  it.each([
    ['heaviest last', [60, 60, 70], 2, 70, 1],
    ['heaviest first', [70, 60, 60], 0, 70, 1],
    ['tie keeps the first', [70, 60, 70], 0, 70, 2],
    ['all equal', [60, 60, 60, 60], 0, 60, 4],
    ['zero only (bodyweight)', [0, 0], 0, 0, 2],
    ['zero and added weight', [0, 5, 0], 1, 5, 1],
    ['a hundredth heavier wins', [60, 60.01], 1, 60.01, 1],
    ['half a hundredth apart is the same weight', [60.004, 60.001], 0, 60.004, 2],
    ['floating point noise is the same weight', [0.1 + 0.2, 0.3], 0, 0.1 + 0.2, 2],
    ['500 kg limit', [499.99, 500, 500], 1, 500, 2],
  ])('%s', (_name, weights, topIndex, topKg, count) => {
    const sets = weights.map((w, i) => row(w, `s${i}`));
    const r = topSet(sets)!;
    expect(r.top).toBe(sets[topIndex]);
    expect(r.top.totalKg).toBe(topKg);
    expect(r.count).toBe(count);
  });

  it('does not reorder or change its input', () => {
    const sets = Object.freeze(
      [row(60, 'a'), row(70, 'b'), row(70, 'c')].map((x) => Object.freeze(x)),
    );
    expect(() => topSet(sets as unknown as { totalKg: number }[])).not.toThrow();
    expect(sets.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles a hundred thousand sets', () => {
    const sets = Array.from({ length: 100_000 }, (_, i) => row(i % 1000, `s${i}`));
    const r = topSet(sets)!;
    expect(r.top.totalKg).toBe(999);
    expect(r.count).toBe(100);
  });

  // BUG (low, needs corrupt data): src/domain/history/index.ts:73 a NaN weight is never counted: a list of only NaN gives count 0, shown as "0 sets" on Home.
  it('counts at least one set when it returns a top set', () => {
    expect(topSet([row(Number.NaN, 'a')])!.count).toBeGreaterThanOrEqual(1);
  });
});

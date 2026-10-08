import { describe, expect, it } from 'vitest';
import { roundKg, totalFromPerSide } from '.';

describe('totalFromPerSide', () => {
  it.each([
    { bar: 15, perSide: 22.5, total: 60, note: 'the demo story: 15 kg bar + 22.5 kg each side' },
    { bar: 20, perSide: 20, total: 60, note: 'standard 20 kg bar' },
    { bar: 20, perSide: 0, total: 20, note: 'empty bar' },
    { bar: 0, perSide: 10, total: 20, note: 'no bar (custom setup)' },
    { bar: 15, perSide: 1.25, total: 17.5, note: 'smallest plate' },
    { bar: 20, perSide: 0.1 + 0.2, total: 20.6, note: 'float noise is rounded away' },
  ])('$bar kg bar + $perSide per side = $total ($note)', ({ bar, perSide, total }) => {
    expect(totalFromPerSide(bar, perSide)).toBe(total);
  });

  it.each([
    { bar: -1, perSide: 10 },
    { bar: 20, perSide: -0.5 },
    { bar: Number.NaN, perSide: 10 },
    { bar: 20, perSide: Number.POSITIVE_INFINITY },
  ])('rejects invalid input (bar $bar, per side $perSide)', ({ bar, perSide }) => {
    expect(() => totalFromPerSide(bar, perSide)).toThrow(RangeError);
  });
});

describe('roundKg', () => {
  it('rounds to 2 decimals', () => {
    expect(roundKg(62.5)).toBe(62.5);
    expect(roundKg(60.004)).toBe(60);
    expect(roundKg(60.006)).toBe(60.01);
  });
});

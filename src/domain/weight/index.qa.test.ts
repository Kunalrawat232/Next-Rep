import { describe, expect, it } from 'vitest';
import {
  isMultipleOf,
  kgToLb,
  LB_TO_KG,
  perSideFromTotal,
  roundKg,
  toKg,
  totalFromPerSide,
  weightBreakdown,
} from './index';

describe('weight maths with floats', () => {
  const classic: [string, number, number][] = [
    ['0.1 + 0.2', 0.1 + 0.2, 0.3],
    ['plain 2 decimals', 22.55, 22.55],
    ['20.005', 20.005, 20.01],
    ['1.255 (binary below half)', 1.255, 1.26],
    ['0.285', 0.285, 0.29],
    ['1.005', 1.005, 1.01],
  ];
  it.each(classic.slice(0, 3))('roundKg keeps %s', (_l, input, expected) => {
    expect(roundKg(input)).toBe(expected);
  });

  // BUG: roundKg multiplies before rounding, so a half-cent that is stored a hair below the half
  // in binary rounds down (1.005 -> 1, 0.285 -> 0.28). Typed values with 3 decimals are the trigger.
  it.each(classic.slice(3))('BUG: roundKg rounds %s half up', (_l, input, expected) => {
    expect(roundKg(input)).toBe(expected);
  });

  it('roundKg of 0 and of tiny noise is 0, not -0', () => {
    expect(Object.is(roundKg(0), 0)).toBe(true);
    expect(Object.is(roundKg(0.001), 0)).toBe(true);
  });

  const maths: [number, number, number][] = [
    [20, 0, 20],
    [20, 1.25, 22.5],
    [20, 250, 520],
    [15, 22.5, 60],
    [20.41, 0.01, 20.43],
    [0, 0, 0],
    [7.5, 31.25, 70],
  ];
  it.each(maths)('bar %s + 2 x %s = %s', (bar, side, total) => {
    expect(totalFromPerSide(bar, side)).toBe(total);
  });

  it('per side then total round-trips for every 1.25 step up to 250 on a 20 kg bar', () => {
    for (let side = 0; side <= 250; side += 1.25) {
      const total = totalFromPerSide(20, side);
      expect(perSideFromTotal(total, 20)).toBe(side);
    }
  });

  it.each([NaN, Infinity, -Infinity, -0.01])('rejects %s everywhere', (bad) => {
    expect(() => totalFromPerSide(bad, 1)).toThrow(RangeError);
    expect(() => totalFromPerSide(1, bad)).toThrow(RangeError);
    expect(() => perSideFromTotal(bad, 1)).toThrow(RangeError);
    expect(() => toKg(bad, 'lb')).toThrow(RangeError);
    expect(() => kgToLb(bad)).toThrow(RangeError);
  });

  it('a total exactly the bar has zero per side; one cent below has none', () => {
    expect(perSideFromTotal(20, 20)).toBe(0);
    expect(perSideFromTotal(19.99, 20)).toBeNull();
    expect(weightBreakdown(19.99, 20)).toBeNull();
  });

  it('an odd cent total halves to a half cent that is rounded, not lost', () => {
    expect(perSideFromTotal(20.01, 20)).toBe(0.01); // 0.005 rounds up
  });

  it('lb conversion: 45 lb, 135 lb, 225 lb, 1 lb', () => {
    expect(toKg(45, 'lb')).toBe(20.41);
    expect(toKg(135, 'lb')).toBe(61.23);
    expect(toKg(225, 'lb')).toBe(102.06);
    expect(toKg(1, 'lb')).toBe(0.45);
    expect(toKg(0, 'lb')).toBe(0);
    expect(LB_TO_KG).toBe(0.45359237);
  });

  it('kg to lb to kg drifts by at most one cent for any stored weight to 500 kg', () => {
    for (let hundredths = 0; hundredths <= 50_000; hundredths += 37) {
      const kg = hundredths / 100;
      expect(Math.abs(toKg(kgToLb(kg), 'lb') - kg)).toBeLessThanOrEqual(0.011);
    }
  });

  it('isMultipleOf tolerates float noise but not a real remainder', () => {
    expect(isMultipleOf(0.1 + 0.2, 0.1)).toBe(true);
    expect(isMultipleOf(22.5, 1.25)).toBe(true);
    expect(isMultipleOf(22.51, 1.25)).toBe(false);
    expect(isMultipleOf(0, 1.25)).toBe(true);
  });
});

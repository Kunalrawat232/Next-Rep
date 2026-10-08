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
} from '.';

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

describe('toKg and kgToLb', () => {
  it.each([
    { value: 60, unit: 'kg' as const, kg: 60 },
    { value: 135, unit: 'lb' as const, kg: 61.23 },
    { value: 45, unit: 'lb' as const, kg: 20.41 },
    { value: 100, unit: 'lb' as const, kg: 45.36 },
    { value: 0, unit: 'lb' as const, kg: 0 },
    { value: 62.5, unit: 'kg' as const, kg: 62.5 },
  ])('$value $unit = $kg kg', ({ value, unit, kg }) => {
    expect(toKg(value, unit)).toBe(kg);
  });

  it('uses the exact pound definition', () => {
    expect(LB_TO_KG).toBe(0.45359237);
  });

  it.each([
    { kg: 60, lb: 132.28 },
    { kg: 20, lb: 44.09 },
    { kg: 0, lb: 0 },
  ])('$kg kg = $lb lb', ({ kg, lb }) => {
    expect(kgToLb(kg)).toBe(lb);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid value %s', (v) => {
    expect(() => toKg(v, 'kg')).toThrow(RangeError);
    expect(() => kgToLb(v)).toThrow(RangeError);
  });
});

describe('perSideFromTotal', () => {
  it.each([
    { total: 60, bar: 15, perSide: 22.5 },
    { total: 100, bar: 20, perSide: 40 },
    { total: 20, bar: 20, perSide: 0 },
    { total: 17.5, bar: 15, perSide: 1.25 },
    { total: 61, bar: 20, perSide: 20.5 },
  ])('total $total with a $bar kg bar leaves $perSide per side', ({ total, bar, perSide }) => {
    expect(perSideFromTotal(total, bar)).toBe(perSide);
  });

  it('returns null when the total is below the bar (impossible as a total)', () => {
    expect(perSideFromTotal(19.99, 20)).toBeNull();
    expect(perSideFromTotal(0, 15)).toBeNull();
  });

  it('rejects invalid input', () => {
    expect(() => perSideFromTotal(-1, 20)).toThrow(RangeError);
    expect(() => perSideFromTotal(60, Number.NaN)).toThrow(RangeError);
  });
});

describe('weightBreakdown', () => {
  it('describes the demo story: 60 kg = 15 kg bar + 22.5 kg each side', () => {
    expect(weightBreakdown(60, 15)).toEqual({ totalKg: 60, barKg: 15, perSideKg: 22.5 });
  });

  it('is null when the total is below the bar', () => {
    expect(weightBreakdown(10, 20)).toBeNull();
  });
});

describe('isMultipleOf', () => {
  it.each([
    { value: 22.5, step: 1.25, expected: true },
    { value: 0, step: 1.25, expected: true },
    { value: 21.25, step: 1.25, expected: true },
    { value: 20.5, step: 1.25, expected: false },
    { value: 1.3, step: 1.25, expected: false },
    { value: 0.1 + 0.2, step: 0.3, expected: true },
  ])('$value is a multiple of $step: $expected', ({ value, step, expected }) => {
    expect(isMultipleOf(value, step)).toBe(expected);
  });
});

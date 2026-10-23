// Edge and negative cases for the tap-logging helpers. A failing test here is a suspected bug: do not weaken it.
import { describe, expect, it } from 'vitest';
import type { EquipmentType } from '../schemas';
import {
  breakdownFor as breakdownForUnit,
  initialEntry as initialEntryUnit,
  nextValue as nextValueUnit,
  setSummary as setSummaryUnit,
  stepFor as stepForUnit,
  weightHint,
} from '.';
import { kgFromField, parseNumber } from '../units';

// These tests were written for kg, which is still the default unit: the helpers below pass it.
const breakdownFor = (w: Parameters<typeof breakdownForUnit>[0]) => breakdownForUnit(w, 'kg');
const setSummary = (s: Parameters<typeof setSummaryUnit>[0]) => setSummaryUnit(s, 'kg');
const stepFor = (e: Parameters<typeof stepForUnit>[0], m: Parameters<typeof stepForUnit>[1]) =>
  stepForUnit(e, m, 'kg');
const nextValue = (c: number, s: number, d: 1 | -1, m: 'total' | 'per_side') =>
  nextValueUnit(c, s, d, m, 'kg');
const initialEntry = (
  e: Parameters<typeof initialEntryUnit>[0],
  l: Parameters<typeof initialEntryUnit>[1],
) => {
  const r = initialEntryUnit(e, l, 'kg');
  return { mode: r.mode, weight: kgFromField(r.weight, 'kg') ?? 0, reps: r.reps };
};

describe('parseNumber, typed by people on a phone', () => {
  it.each([
    [',5', 0.5],
    ['62,50', 62.5],
    ['007', 7],
    ['0.005', 0.01],
    ['0,5', 0.5],
    ['\t60\n', 60],
    ['500', 500],
  ])('reads %j as %d', (text, kg) => expect(parseNumber(text)).toBe(kg));

  it.each([
    '62,555', // three decimals after a comma looks like a thousands separator
    '1,5,5',
    '5,',
    ',',
    '.',
    '1.2.3',
    '+5',
    '1 000',
    '60kg',
    '६०', // Devanagari digits, as a Hindi keyboard types them
    '６０', // full-width digits
    '٦٠', // Arabic-Indic digits
    '1'.padEnd(400, '0'), // overflows to Infinity
    '１,５',
  ])('refuses %j instead of guessing', (text) => expect(parseNumber(text)).toBeNull());

  it('never returns NaN, a negative number or Infinity for any odd input', () => {
    for (const text of ['-0', '0e0', '1e309', 'null', '٣.٥', '5 ', '5 5', '5,.5']) {
      const kg = parseNumber(text);
      if (kg !== null) {
        expect(Number.isFinite(kg)).toBe(true);
        expect(kg).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('nextValue at the edges', () => {
  it.each([
    // current, step, direction, mode, expected
    [600, 2.5, -1, 'total', 500],
    [251, 1.25, -1, 'per_side', 250],
    [-5, 2.5, 1, 'total', 0],
    [0.3, 1.25, -1, 'per_side', 0],
    [0.3, 1.25, 1, 'per_side', 1.25],
    [0.01, 2.5, 1, 'total', 2.5],
    [62.5, 1.25, 1, 'per_side', 63.75],
    [63.75, 2.5, -1, 'total', 62.5],
    [499.99, 2.5, 1, 'total', 500],
    [500, 2.5, 1, 'total', 500],
    [500, 2.5, -1, 'total', 497.5],
    [250, 1.25, 1, 'per_side', 250],
    [62.5000000001, 2.5, 1, 'total', 65], // float dust must not count as "between steps"
    [62.4999999999, 2.5, -1, 'total', 60],
  ] as const)('%d by %d (%i) in %s mode gives %d', (current, step, direction, mode, expected) =>
    expect(nextValue(current, step, direction, mode)).toBe(expected),
  );

  it('walks all the way up to the limit and stops, then all the way down to zero', () => {
    let value = 0;
    for (let i = 0; i < 250; i++) value = nextValue(value, 2.5, 1, 'total');
    expect(value).toBe(500);
    for (let i = 0; i < 250; i++) value = nextValue(value, 2.5, -1, 'total');
    expect(value).toBe(0);
  });

  it('always returns a value with at most 2 decimals', () => {
    for (const start of [0.07, 13.33, 61.23, 99.99, 123.456]) {
      for (const step of [1.25, 2.5]) {
        for (const direction of [1, -1] as const) {
          const v = nextValue(start, step, direction, 'total');
          expect(Math.round(v * 100) / 100).toBe(v);
        }
      }
    }
  });
});

describe('stepFor for every equipment and mode', () => {
  const equipment: EquipmentType[] = [
    'barbell',
    'ez_bar',
    'smith',
    'dumbbell',
    'machine',
    'cable',
    'bodyweight',
  ];
  it.each(equipment)('%s: per side only has a finer step when there is a bar', (type) => {
    const hasBar = type === 'barbell' || type === 'ez_bar' || type === 'smith';
    expect(stepFor(type, 'per_side')).toBe(hasBar ? 1.25 : 2.5);
    expect(stepFor(type, 'total')).toBe(2.5);
  });
});

describe('weightHint', () => {
  it.each([
    ['ez_bar', /total including the bar/i],
    ['smith', /total including the bar/i],
  ] as const)('explains %s', (type, pattern) => expect(weightHint(type)).toMatch(pattern));

  it('has a non-empty hint for every equipment type', () => {
    for (const type of [
      'barbell',
      'ez_bar',
      'smith',
      'dumbbell',
      'machine',
      'cable',
      'bodyweight',
    ] as const)
      expect(weightHint(type).length).toBeGreaterThan(5);
  });
});

describe('breakdownFor and setSummary with awkward numbers', () => {
  it('shows a zero bar plainly', () => {
    expect(breakdownFor({ totalKg: 50, barKg: 0, perSideKg: 25 })).toEqual({
      lines: [
        { label: '25 Kg each side × 2', value: '50 Kg' },
        { label: '+ bar', value: '0 Kg' },
      ],
      total: '50 Kg',
    });
  });

  it('does not show floating point dust in plates', () => {
    const { lines } = breakdownFor({ totalKg: 60.3, barKg: 20.1, perSideKg: null });
    expect(lines[0]).toEqual({ label: 'Plates', value: '40.2 Kg' });
  });

  it('describes an empty bar', () => {
    expect(setSummary({ totalKg: 15, barKg: 15, perSideKg: 0, reps: 12 })).toEqual({
      headline: '15 Kg × 12',
      detail: '15 Kg bar + 0 Kg each side',
    });
  });

  it('keeps the headline readable at the limits', () => {
    expect(setSummary({ totalKg: 500, barKg: null, perSideKg: null, reps: 100 }).headline).toBe(
      '500 Kg × 100',
    );
    expect(setSummary({ totalKg: 0, barKg: null, perSideKg: null, reps: 1 }).headline).toBe(
      '0 Kg × 1',
    );
  });
});

describe('initialEntry', () => {
  const lastSet = (over: Partial<Parameters<typeof initialEntry>[1] & object> = {}) => ({
    totalKg: 60,
    barKg: 15,
    perSideKg: 22.5 as number | null,
    inputMode: 'per_side' as const,
    reps: 8,
    ...over,
  });

  it('keeps a per-side weight of zero as per side (an empty bar), not as a total', () => {
    expect(initialEntry('barbell', lastSet({ totalKg: 15, perSideKg: 0 }))).toEqual({
      mode: 'per_side',
      weight: 0,
      reps: 8,
    });
  });

  it.each(['ez_bar', 'smith'] as const)(
    'starts a %s in per side when it was last logged so',
    (type) => expect(initialEntry(type, lastSet()).mode).toBe('per_side'),
  );

  it.each(['dumbbell', 'machine', 'cable', 'bodyweight'] as const)(
    'reads a %s as a total even if an old set says per side',
    (type) => expect(initialEntry(type, lastSet())).toEqual({ mode: 'total', weight: 60, reps: 8 }),
  );

  it.each([1, 100])('carries %d reps over unchanged', (reps) =>
    expect(initialEntry('barbell', lastSet({ reps })).reps).toBe(reps),
  );
});

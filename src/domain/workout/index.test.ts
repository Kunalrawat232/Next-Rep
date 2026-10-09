import { describe, expect, it } from 'vitest';
import {
  breakdownFor,
  initialEntry,
  nextValue,
  parseWeight,
  setSummary,
  stepFor,
  usesModeToggle,
  weightHint,
} from '.';

describe('usesModeToggle', () => {
  it.each([
    ['barbell', true],
    ['ez_bar', true],
    ['smith', true],
    ['dumbbell', false],
    ['machine', false],
    ['cable', false],
    ['bodyweight', false],
  ] as const)('%s: %s', (equipment, expected) => expect(usesModeToggle(equipment)).toBe(expected));
});

describe('stepFor', () => {
  it.each([
    ['barbell', 'total', 2.5],
    ['barbell', 'per_side', 1.25],
    ['ez_bar', 'total', 2.5],
    ['smith', 'per_side', 1.25],
    ['dumbbell', 'total', 2.5],
    ['machine', 'total', 2.5],
    ['cable', 'total', 2.5],
    ['bodyweight', 'total', 2.5],
  ] as const)('%s in %s mode moves by %d', (equipment, mode, step) =>
    expect(stepFor(equipment, mode)).toBe(step),
  );
});

describe('nextValue', () => {
  it('moves by the step in either direction', () => {
    expect(nextValue(60, 2.5, 1, 'total')).toBe(62.5);
    expect(nextValue(60, 2.5, -1, 'total')).toBe(57.5);
    expect(nextValue(20, 1.25, 1, 'per_side')).toBe(21.25);
  });

  it('never goes below zero', () => {
    expect(nextValue(1, 2.5, -1, 'total')).toBe(0);
    expect(nextValue(0, 2.5, -1, 'total')).toBe(0);
  });

  it('never goes above the limit of the mode', () => {
    expect(nextValue(499, 2.5, 1, 'total')).toBe(500);
    expect(nextValue(249, 1.25, 1, 'per_side')).toBe(250);
  });

  it('does not collect floating point error over many steps', () => {
    let value = 0;
    for (let i = 0; i < 100; i++) value = nextValue(value, 1.25, 1, 'per_side');
    expect(value).toBe(125);
  });

  it('lands on a plate step from a value in between', () => {
    expect(nextValue(61, 2.5, 1, 'total')).toBe(62.5);
    expect(nextValue(61, 2.5, -1, 'total')).toBe(60);
  });
});

describe('parseWeight', () => {
  it.each([
    ['60', 60],
    ['62.5', 62.5],
    ['62,5', 62.5],
    ['  20 ', 20],
    ['0', 0],
    ['.5', 0.5],
    ['7.', 7],
    ['20.256', 20.26],
  ])('reads %j as %d', (text, kg) => expect(parseWeight(text)).toBe(kg));

  it.each(['', ' ', 'abc', '-5', '1e2', '12 kg', '1,000', '--', '0x10', 'NaN', 'Infinity'])(
    'refuses %j',
    (text) => expect(parseWeight(text)).toBeNull(),
  );
});

describe('weightHint', () => {
  it.each([
    ['barbell', /total including the bar/i],
    ['dumbbell', /one dumbbell/i],
    ['machine', /stack weight/i],
    ['cable', /stack weight/i],
    ['bodyweight', /weight you add/i],
  ] as const)('explains %s', (equipment, pattern) =>
    expect(weightHint(equipment)).toMatch(pattern),
  );
});

describe('breakdownFor', () => {
  it('shows each side twice, the bar and the total for a per-side set', () => {
    expect(breakdownFor({ totalKg: 60, barKg: 20, perSideKg: 20 })).toEqual({
      lines: [
        { label: '20 kg each side × 2', value: '40 kg' },
        { label: '+ bar', value: '20 kg' },
      ],
      total: '60 kg',
    });
  });

  it('writes fractions plainly', () => {
    expect(breakdownFor({ totalKg: 60, barKg: 15, perSideKg: 22.5 }).lines[0]?.label).toBe(
      '22.5 kg each side × 2',
    );
  });

  it('shows plates and bar when only the bar is known', () => {
    const b = breakdownFor({ totalKg: 61.23, barKg: 20, perSideKg: null });
    expect(b.total).toBe('61.23 kg');
    expect(b.lines).toEqual([
      { label: 'Plates', value: '41.23 kg' },
      { label: '+ bar', value: '20 kg' },
    ]);
  });

  it('says there are no plates when the total is just the bar', () => {
    expect(breakdownFor({ totalKg: 20, barKg: 20, perSideKg: 0 }).lines[0]).toEqual({
      label: '0 kg each side × 2',
      value: '0 kg',
    });
  });

  it('has just the total when there is no bar', () => {
    expect(breakdownFor({ totalKg: 22, barKg: null, perSideKg: null })).toEqual({
      lines: [],
      total: '22 kg',
    });
  });
});

describe('setSummary', () => {
  it('describes a bar set by its weight, reps and how the weight is made up', () => {
    expect(setSummary({ totalKg: 60, barKg: 15, perSideKg: 22.5, reps: 8 })).toEqual({
      headline: '60 kg × 8',
      detail: '15 kg bar + 22.5 kg each side',
    });
  });

  it('has no detail without a bar', () => {
    expect(setSummary({ totalKg: 22, barKg: null, perSideKg: null, reps: 10 })).toEqual({
      headline: '22 kg × 10',
      detail: null,
    });
  });

  it('has no detail when the weight is not exact at two decimals', () => {
    expect(setSummary({ totalKg: 61.23, barKg: 20, perSideKg: null, reps: 5 }).detail).toBe(
      '20 kg bar + 41.23 kg plates',
    );
  });
});

describe('initialEntry', () => {
  it('starts from the last set of the same exercise, in the same way it was entered', () => {
    expect(
      initialEntry('barbell', {
        totalKg: 60,
        barKg: 15,
        perSideKg: 22.5,
        inputMode: 'per_side',
        reps: 8,
      }),
    ).toEqual({
      mode: 'per_side',
      weight: 22.5,
      reps: 8,
    });
    expect(
      initialEntry('barbell', {
        totalKg: 60,
        barKg: 15,
        perSideKg: null,
        inputMode: 'total',
        reps: 6,
      }),
    ).toEqual({
      mode: 'total',
      weight: 60,
      reps: 6,
    });
  });

  it('falls back to a total when the last set has no per-side breakdown', () => {
    expect(
      initialEntry('barbell', {
        totalKg: 60,
        barKg: 15,
        perSideKg: null,
        inputMode: 'per_side',
        reps: 8,
      }).mode,
    ).toBe('total');
  });

  it('never uses per-side for equipment without a bar', () => {
    expect(
      initialEntry('dumbbell', {
        totalKg: 22,
        barKg: null,
        perSideKg: null,
        inputMode: 'total',
        reps: 10,
      }),
    ).toEqual({
      mode: 'total',
      weight: 22,
      reps: 10,
    });
  });

  it('starts empty-handed with no history: 0 kg and 8 reps', () => {
    expect(initialEntry('barbell', undefined)).toEqual({ mode: 'total', weight: 0, reps: 8 });
  });
});

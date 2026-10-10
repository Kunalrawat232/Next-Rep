import { describe, expect, it } from 'vitest';
import {
  breakdownFor,
  convertEntry,
  initialEntry,
  nextValue,
  perSideShown,
  setSummary,
  stepFor,
  weightForValidation,
} from '.';
import { fromDisplay, kgFromField, toDisplay } from '../units';

const BAR_45_LB = fromDisplay(45, 'lb'); // 20.41 kg, as a 45 lb bar is stored
const BAR_35_LB = fromDisplay(35, 'lb'); // 15.88 kg

describe('steps in each unit', () => {
  it.each([
    ['barbell', 'total', 'kg', 2.5],
    ['barbell', 'total', 'lb', 5],
    ['barbell', 'per_side', 'kg', 1.25],
    ['barbell', 'per_side', 'lb', 2.5],
    ['ez_bar', 'per_side', 'lb', 2.5],
    ['dumbbell', 'total', 'lb', 5],
    ['dumbbell', 'per_side', 'lb', 5],
    ['machine', 'total', 'kg', 2.5],
    ['bodyweight', 'total', 'lb', 5],
  ] as const)('%s %s in %s moves %s', (equipment, mode, unit, step) => {
    expect(stepFor(equipment, mode, unit)).toBe(step);
  });

  it('steps up and down by the unit’s step', () => {
    expect(nextValue(135, 5, 1, 'total', 'lb')).toBe(140);
    expect(nextValue(135, 5, -1, 'total', 'lb')).toBe(130);
    expect(nextValue(45, 2.5, 1, 'per_side', 'lb')).toBe(47.5);
    expect(nextValue(132.3, 5, 1, 'total', 'lb')).toBe(135);
    expect(nextValue(132.3, 5, -1, 'total', 'lb')).toBe(130);
  });

  it('stops at what the database allows, in the unit shown', () => {
    expect(nextValue(1100, 5, 1, 'total', 'lb')).toBe(1102.3);
    expect(nextValue(550, 2.5, 1, 'per_side', 'lb')).toBe(551.1);
    expect(nextValue(3, 5, -1, 'total', 'lb')).toBe(0);
    expect(nextValue(499, 2.5, 1, 'total', 'kg')).toBe(500);
  });
});

describe('the weight on each side', () => {
  it('is the stored per-side weight in kg, and nothing when it was not exact', () => {
    expect(perSideShown({ totalKg: 60, barKg: 20, perSideKg: 20 }, 'kg')).toBe(20);
    expect(perSideShown({ totalKg: 61.23, barKg: 20, perSideKg: null }, 'kg')).toBeNull();
  });

  it('is worked out from the shown total and bar in lb, even when the stored one is missing', () => {
    // 140 lb on a 45 lb bar: 63.5 kg and 20.41 kg, whose kg per-side (21.545) is not exact.
    const set = { totalKg: fromDisplay(140, 'lb'), barKg: BAR_45_LB, perSideKg: null };
    expect(perSideShown(set, 'lb')).toBe(47.5);
  });

  it.each([
    [135, 45, 45],
    [185, 45, 70],
    [225, 45, 90],
    [95, 45, 25],
    [45, 45, 0],
    [137.5, 45, 46.25],
    [100, 35, 32.5],
  ])('is %s lb on a %s lb bar: %s lb a side', (total, bar, side) => {
    const set = {
      totalKg: fromDisplay(total, 'lb'),
      barKg: fromDisplay(bar, 'lb'),
      perSideKg: null,
    };
    expect(perSideShown(set, 'lb')).toBe(side);
  });

  it('is nothing without a bar, or for a total less than the bar', () => {
    expect(perSideShown({ totalKg: 40, barKg: null, perSideKg: null }, 'lb')).toBeNull();
    expect(
      perSideShown({ totalKg: fromDisplay(30, 'lb'), barKg: BAR_45_LB, perSideKg: null }, 'lb'),
    ).toBeNull();
  });
});

describe('how a weight is made up, in lb', () => {
  it('shows a 225 lb squat as 90 lb on each side of a 45 lb bar', () => {
    const b = breakdownFor(
      { totalKg: fromDisplay(225, 'lb'), barKg: BAR_45_LB, perSideKg: null },
      'lb',
    );
    expect(b.total).toBe('225 lb');
    expect(b.lines).toEqual([
      { label: '90 lb each side × 2', value: '180 lb' },
      { label: '+ bar', value: '45 lb' },
    ]);
  });

  it('says the same thing as kg for kg', () => {
    expect(breakdownFor({ totalKg: 60, barKg: 20, perSideKg: 20 }, 'kg')).toEqual({
      total: '60 kg',
      lines: [
        { label: '20 kg each side × 2', value: '40 kg' },
        { label: '+ bar', value: '20 kg' },
      ],
    });
  });

  it('has no breakdown without a bar', () => {
    expect(
      breakdownFor({ totalKg: fromDisplay(25, 'lb'), barKg: null, perSideKg: null }, 'lb'),
    ).toEqual({
      lines: [],
      total: '25 lb',
    });
  });
});

describe('a logged set, in lb', () => {
  it('reads "135 lb × 8" and "45 lb bar + 45 lb each side"', () => {
    expect(
      setSummary(
        { totalKg: fromDisplay(135, 'lb'), barKg: BAR_45_LB, perSideKg: null, reps: 8 },
        'lb',
      ),
    ).toEqual({
      headline: '135 lb × 8',
      detail: '45 lb bar + 45 lb each side',
    });
  });

  it('has no detail for a dumbbell', () => {
    expect(
      setSummary({ totalKg: fromDisplay(50, 'lb'), barKg: null, perSideKg: null, reps: 10 }, 'lb'),
    ).toEqual({
      headline: '50 lb × 10',
      detail: null,
    });
  });
});

describe('where the steppers start', () => {
  const last = { totalKg: 60, barKg: 20, perSideKg: 20, inputMode: 'per_side' as const, reps: 8 };

  it('remembers the exact stored weight, so saving it untouched changes nothing', () => {
    const total = initialEntry('barbell', { ...last, inputMode: 'total' }, 'lb');
    expect(total.weight.text).toBe('132.3');
    expect(kgFromField(total.weight, 'lb')).toBe(60);
  });

  it('starts per side, as last time, with the stored weight in kg', () => {
    const e = initialEntry('barbell', last, 'kg');
    expect(e.mode).toBe('per_side');
    expect(kgFromField(e.weight, 'kg')).toBe(20);
  });

  it('starts per side in lb with the worked-out weight', () => {
    const set = {
      totalKg: fromDisplay(185, 'lb'),
      barKg: BAR_45_LB,
      perSideKg: null,
      inputMode: 'per_side' as const,
      reps: 5,
    };
    const e = initialEntry('barbell', set, 'lb');
    expect(e).toMatchObject({ mode: 'per_side', reps: 5 });
    expect(e.weight.text).toBe('70');
  });

  it('starts empty with 8 reps when there is no last set', () => {
    expect(initialEntry('barbell', undefined, 'lb')).toEqual({
      mode: 'total',
      weight: { text: '', origin: null },
      reps: 8,
    });
  });

  it('starts as a total for equipment without a bar, whatever the last mode was', () => {
    const e = initialEntry('dumbbell', last, 'lb');
    expect(e.mode).toBe('total');
    expect(e.weight.text).toBe('132.3');
  });
});

describe('what the validator is given', () => {
  const kgAs = (valueShown: number, unit: 'kg' | 'lb') => fromDisplay(valueShown, unit);

  it('is the weight and mode as typed, in kg', () => {
    expect(
      weightForValidation({ mode: 'total', valueKg: 60, valueShown: 60, barKg: 20 }, 'kg'),
    ).toEqual({ kg: 60, mode: 'total' });
    expect(
      weightForValidation({ mode: 'per_side', valueKg: 22.5, valueShown: 22.5, barKg: 15 }, 'kg'),
    ).toEqual({
      kg: 22.5,
      mode: 'per_side',
    });
  });

  it('adds up lb per side in lb first, so it lands on the same kg as the total', () => {
    const viaSide = weightForValidation(
      { mode: 'per_side', valueKg: kgAs(47.5, 'lb'), valueShown: 47.5, barKg: BAR_45_LB },
      'lb',
    );
    expect(viaSide).toEqual({ kg: fromDisplay(140, 'lb'), mode: 'total' });
    // Converting each part and adding in kg would give 63.51 kg, 0.01 kg above 140 lb: a false record.
    expect(BAR_45_LB + 2 * kgAs(47.5, 'lb')).not.toBe(fromDisplay(140, 'lb'));
  });

  it('agrees for every bar and every per-side weight in 2.5 lb steps (property)', () => {
    for (const bar of [35, 45, 25, 55]) {
      for (let side = 0; side <= 450; side += 2.5) {
        const barKg = fromDisplay(bar, 'lb');
        const viaSide = weightForValidation(
          { mode: 'per_side', valueKg: kgAs(side, 'lb'), valueShown: side, barKg },
          'lb',
        );
        const viaTotal = weightForValidation(
          { mode: 'total', valueKg: kgAs(bar + 2 * side, 'lb'), valueShown: bar + 2 * side, barKg },
          'lb',
        );
        expect(viaSide.kg).toBe(viaTotal.kg);
      }
    }
  });

  it('keeps two decimals typed per side: 45.25 lb a side on a 45 lb bar is 135.5 lb', () => {
    const r = weightForValidation(
      { mode: 'per_side', valueKg: kgAs(45.25, 'lb'), valueShown: 45.25, barKg: BAR_45_LB },
      'lb',
    );
    expect(r.kg).toBe(fromDisplay(135.5, 'lb'));
  });

  it('is the stored total when nothing was changed, however it was entered (lb)', () => {
    // 60 kg on a 20 kg bar, entered per side, shown as 44.1 lb a side: 132.3 lb would be 60.01 kg.
    const r = weightForValidation(
      {
        mode: 'per_side',
        valueKg: kgAs(44.1, 'lb'),
        valueShown: 44.1,
        barKg: 20,
        untouchedTotalKg: 60,
      },
      'lb',
    );
    expect(r).toEqual({ kg: 60, mode: 'total' });
  });

  it.each([60, 61.23, 62.5, 100, 102.06, 227.5])(
    'keeps a stored %s kg total untouched in lb for every bar',
    (total) => {
      for (const bar of [15, 20, 20.41, 7.5, 25]) {
        const r = weightForValidation(
          {
            mode: 'total',
            valueKg: kgAs(toDisplay(total, 'lb'), 'lb'),
            valueShown: toDisplay(total, 'lb'),
            barKg: bar,
            untouchedTotalKg: total,
          },
          'lb',
        );
        expect(r.kg).toBe(total);
      }
    },
  );

  it.each([7.5, 10, 15, 25, 20])(
    'treats the bar as shown (%s kg) as the bar, not as less than it',
    (bar) => {
      const shown = toDisplay(bar, 'lb');
      const asTotal = weightForValidation(
        { mode: 'total', valueKg: kgAs(shown, 'lb'), valueShown: shown, barKg: bar },
        'lb',
      );
      expect(asTotal.kg).toBe(bar);
      const emptyBarPerSide = weightForValidation(
        { mode: 'per_side', valueKg: 0, valueShown: 0, barKg: bar },
        'lb',
      );
      expect(emptyBarPerSide.kg).toBe(bar);
    },
  );

  it('does not snap a weight that is really below the bar', () => {
    const r = weightForValidation(
      { mode: 'total', valueKg: kgAs(30, 'lb'), valueShown: 30, barKg: BAR_45_LB },
      'lb',
    );
    expect(r.kg).toBe(fromDisplay(30, 'lb'));
  });

  it('leaves per side as it is for equipment without a bar in lb', () => {
    expect(
      weightForValidation({ mode: 'per_side', valueKg: 5, valueShown: 11, barKg: null }, 'lb'),
    ).toEqual({ kg: 5, mode: 'per_side' });
  });
});

describe('switching between a total and a weight per side', () => {
  it.each([
    [135, 'total', 45],
    [185, 'total', 70],
    [45, 'total', 0],
  ] as const)(
    'turns a total of %s lb (%s) into %s lb a side on a 45 lb bar',
    (value, from, side) => {
      expect(convertEntry(value, from, BAR_45_LB, 'lb')).toBe(side);
    },
  );

  it('turns a total into the weight per side, and back, exactly (lb, 0 to 700 in 2.5 steps)', () => {
    for (let total = 45; total <= 700; total += 2.5) {
      const side = convertEntry(total, 'total', BAR_45_LB, 'lb');
      expect(side).not.toBeNull();
      expect(convertEntry(side!, 'per_side', BAR_45_LB, 'lb')).toBe(total);
    }
  });

  it('has no weight per side for a total less than the bar', () => {
    expect(convertEntry(30, 'total', BAR_45_LB, 'lb')).toBeNull();
    expect(convertEntry(5, 'total', 20, 'kg')).toBeNull();
  });

  it('works in kg as before', () => {
    expect(convertEntry(60, 'total', 20, 'kg')).toBe(20);
    expect(convertEntry(20, 'per_side', 20, 'kg')).toBe(60);
  });

  it('uses the bar as it is shown, not as stored', () => {
    expect(toDisplay(BAR_35_LB, 'lb')).toBe(35);
    expect(convertEntry(100, 'total', BAR_35_LB, 'lb')).toBe(32.5);
  });
});

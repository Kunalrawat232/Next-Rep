import { describe, expect, it } from 'vitest';
import { formatWeight } from '../units';
import {
  barFor,
  defaultBarbellKg,
  summarizeBars as summarizeBarsUnit,
  validateGymForm as validateGymFormUnit,
  type Gym,
  type GymForm,
} from '.';

// These tests were written for kg, which is still the default unit.
const validateGymForm = (form: Parameters<typeof validateGymFormUnit>[0]) =>
  validateGymFormUnit(form, 'kg');
const summarizeBars = (gym: Parameters<typeof summarizeBarsUnit>[0]) =>
  summarizeBarsUnit(gym, 'kg');

const form = (over: Partial<GymForm> = {}): GymForm => ({
  barbellKg: '15',
  bars: [],
  ...over,
});
const bar = (name: string, weightKg: string, kind: GymForm['bars'][number]['kind'] = 'other') => ({
  name,
  weightKg,
  kind,
});
const gym = (over: Partial<Gym> = {}): Gym => ({
  id: 'g1',
  barbellKg: 15,
  bars: [],
  ...over,
});

describe('validateGymForm', () => {
  it('accepts a plain gym and returns trimmed, numeric values', () => {
    const r = validateGymForm(form({ barbellKg: ' 20 ' }));
    expect(r).toEqual({ ok: true, value: { barbellKg: 20, bars: [] } });
  });

  it.each([
    ['0', 0],
    ['100', 100],
    ['7.5', 7.5],
    ['7,5', 7.5],
    ['20.256', 20.26],
    ['0.004', 0],
  ])('reads barbell weight %j as %d', (text, kg) => {
    const r = validateGymForm(form({ barbellKg: text }));
    expect(r.ok && r.value.barbellKg).toBe(kg);
  });

  it.each([
    '',
    ' ',
    'abc',
    '-1',
    '100.01',
    '101',
    'NaN',
    'Infinity',
    '1e2',
    '12 Kg',
    '--5',
    '0x10',
  ])('rejects the barbell weight %j', (barbellKg) => {
    const r = validateGymForm(form({ barbellKg }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.barbellKg).toBeTruthy();
  });

  it('keeps bar kinds and weights', () => {
    const r = validateGymForm(
      form({ bars: [bar('EZ bar', '7.5', 'ez_bar'), bar('Trap bar', '25')] }),
    );
    expect(r.ok && r.value.bars).toEqual([
      { name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' },
      { name: 'Trap bar', weightKg: 25, kind: 'other' },
    ]);
  });

  it('reports errors against the bar that has them', () => {
    const r = validateGymForm(
      form({ bars: [bar('Good', '10'), bar('', '10'), bar('Heavy', '101')] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.bars[0]).toBeUndefined();
      expect(r.errors.bars[1]?.name).toBeTruthy();
      expect(r.errors.bars[2]?.weightKg).toBeTruthy();
    }
  });

  it('rejects a bar name over 60 characters but accepts exactly 60', () => {
    expect(validateGymForm(form({ bars: [bar('x'.repeat(60), '10')] })).ok).toBe(true);
    expect(validateGymForm(form({ bars: [bar('x'.repeat(61), '10')] })).ok).toBe(false);
  });

  it('rejects duplicate bar names, ignoring case and spaces', () => {
    const r = validateGymForm(form({ bars: [bar('Axle bar', '20'), bar(' axle BAR ', '21')] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.bars[1]?.name).toMatch(/already/i);
  });

  it('rejects a second EZ bar or Smith bar', () => {
    const r = validateGymForm(
      form({ bars: [bar('EZ bar', '7', 'ez_bar'), bar('EZ 2', '8', 'ez_bar')] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.bars[1]?.name).toBeTruthy();
    expect(
      validateGymForm(form({ bars: [bar('S1', '7', 'smith'), bar('S2', '8', 'smith')] })).ok,
    ).toBe(false);
  });

  it('allows many bars of the other kind', () => {
    const bars = Array.from({ length: 12 }, (_, i) => bar(`Bar ${i}`, '10'));
    expect(validateGymForm(form({ bars })).ok).toBe(true);
  });
});

describe('summarizeBars', () => {
  it('lists the barbell first, then the other bars in order', () => {
    expect(
      summarizeBars(
        gym({
          bars: [
            { id: 'b1', name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' },
            { id: 'b2', name: 'Smith bar', weightKg: 12, kind: 'smith' },
          ],
        }),
      ),
    ).toBe('Barbell 15 Kg · EZ bar 7.5 Kg · Smith bar 12 Kg');
  });

  it('shows just the barbell when there are no other bars', () => {
    expect(summarizeBars(gym({ barbellKg: 20 }))).toBe('Barbell 20 Kg');
  });
});

describe('defaultBarbellKg', () => {
  it('is a 20 Kg bar for kg', () => expect(defaultBarbellKg('kg')).toBe(20));

  it('is the stored kg of a 45 Lb bar for lb', () => {
    expect(Math.round(defaultBarbellKg('lb') * 100) / 100).toBe(20.41);
  });

  it('shows as 45 Lb', () => expect(formatWeight(defaultBarbellKg('lb'), 'lb')).toBe('45'));
});

describe('barFor', () => {
  const g = gym({
    barbellKg: 15,
    bars: [
      { id: 'b1', name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' },
      { id: 'b2', name: 'Trap bar', weightKg: 25, kind: 'other' },
    ],
  });

  it('uses the barbell weight for barbell exercises', () => expect(barFor(g, 'barbell')).toBe(15));
  it('uses the EZ bar for EZ-bar exercises', () => expect(barFor(g, 'ez_bar')).toBe(7.5));
  it('has no answer when the gym lacks that bar, so the caller must ask', () =>
    expect(barFor(g, 'smith')).toBeUndefined());
  it.each(['dumbbell', 'machine', 'cable', 'bodyweight'] as const)(
    'has no bar for %s',
    (equipment) => expect(barFor(g, equipment)).toBeUndefined(),
  );
  it('never uses an other-kind bar automatically', () => {
    const only = gym({ bars: [{ id: 'b', name: 'EZ bar', weightKg: 9, kind: 'other' }] });
    expect(barFor(only, 'ez_bar')).toBeUndefined();
  });
});

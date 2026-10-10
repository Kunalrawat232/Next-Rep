import { describe, expect, it } from 'vitest';
import { summarizeBars, validateGymForm, type Gym, type GymForm } from '.';
import { fieldFromKg, fromDisplay } from '../units';

const form = (over: Partial<GymForm> = {}): GymForm => ({
  name: 'Home gym',
  barbellKg: '45',
  bars: [],
  ...over,
});

describe('a gym form typed in lb', () => {
  it('stores a 45 lb barbell as 20.41 kg', () => {
    const r = validateGymForm(form(), 'lb');
    expect(r.ok && r.value.barbellKg).toBe(20.41);
  });

  it('stores other bars in kg too', () => {
    const r = validateGymForm(
      form({ bars: [{ id: 'a', name: 'EZ bar', weightKg: '25', kind: 'ez_bar' }] }),
      'lb',
    );
    expect(r.ok && r.value.bars[0]?.weightKg).toBe(fromDisplay(25, 'lb'));
  });

  it.each([
    ['', 'Enter a weight in lb.'],
    ['abc', 'Use numbers only, for example 7.5.'],
    ['1,000', 'Use numbers only, for example 7.5.'],
    ['221', 'Use a weight between 0 and 220.4 lb.'],
    ['-1', 'Use numbers only, for example 7.5.'],
  ])('refuses %j for the barbell, in lb', (text, message) => {
    const r = validateGymForm(form({ barbellKg: text }), 'lb');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.barbellKg).toBe(message);
  });

  it('accepts the largest bar in lb and refuses one just over', () => {
    expect(validateGymForm(form({ barbellKg: '220.4' }), 'lb').ok).toBe(true);
    expect(validateGymForm(form({ barbellKg: '220.6' }), 'lb').ok).toBe(false);
  });

  it.each([15, 20, 20.41, 25, 7.5, 100])(
    'keeps a stored %s kg bar exactly when the form is saved untouched',
    (kg) => {
      const start = fieldFromKg(kg, 'lb');
      const r = validateGymForm(
        form({
          barbellKg: start.text,
          barbellOrigin: start.origin,
          bars: [
            { id: 'a', name: 'EZ bar', weightKg: start.text, origin: start.origin, kind: 'ez_bar' },
          ],
        }),
        'lb',
      );
      expect(r.ok && r.value.barbellKg).toBe(kg);
      expect(r.ok && r.value.bars[0]?.weightKg).toBe(kg);
    },
  );

  it('converts what was typed once the text is changed', () => {
    const r = validateGymForm(form({ barbellKg: '45', barbellOrigin: 20 }), 'lb');
    expect(r.ok && r.value.barbellKg).toBe(20.41);
  });

  it('says the limit in kg for kg', () => {
    const r = validateGymForm(form({ barbellKg: '101' }), 'kg');
    expect(!r.ok && r.errors.barbellKg).toBe('Use a weight between 0 and 100 kg.');
  });
});

describe('summarizing the bars', () => {
  const gym: Gym = {
    id: 'g',
    name: 'Home gym',
    barbellKg: fromDisplay(45, 'lb'),
    isDefault: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    bars: [{ id: 'b', name: 'EZ bar', weightKg: fromDisplay(25, 'lb'), kind: 'ez_bar' }],
  };

  it('writes them in the unit', () => {
    expect(summarizeBars(gym, 'lb')).toBe('Barbell 45 lb · EZ bar 25 lb');
    expect(summarizeBars(gym, 'kg')).toBe('Barbell 20.41 kg · EZ bar 11.34 kg');
  });
});

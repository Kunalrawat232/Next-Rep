import { describe, expect, it } from 'vitest';
import { validateSet, type SetCandidate } from '.';
import { fromDisplay } from '../units';

const BAR = fromDisplay(45, 'lb'); // a 45 lb bar, stored as 20.41 kg

/** A weight typed in lb, handed over as kg the way the screens do, to be written back in lb. */
const inLb = (value: number, over: Partial<SetCandidate> = {}): SetCandidate => ({
  equipment: 'barbell',
  weight: { value: fromDisplay(value, 'lb'), unit: 'kg', mode: 'total' },
  reps: 8,
  barKg: BAR,
  source: 'tap',
  ...over,
});

const ctx = { displayUnit: 'lb' } as const;
const codes = (r: ReturnType<typeof validateSet>) => r.issues.map((i) => i.code);

describe('plate sizes in lb', () => {
  it.each([45, 95, 135, 185, 225, 275, 315, 405])(
    'does not warn about %s lb on a 45 lb bar',
    (total) => {
      expect(validateSet(inLb(total), ctx).status).toBe('ok');
    },
  );

  it.each([137.5, 142.5, 187.5])('warns about %s lb: not a whole 2.5 lb plate pair', (total) => {
    const r = validateSet(inLb(total), ctx);
    expect(r.status).toBe('warn');
    expect(codes(r)).toContain('PLATE_INCREMENT');
  });

  it('says it in lb', () => {
    const r = validateSet(inLb(137.5), ctx);
    expect(r.issues[0]?.message).toBe(
      '46.3 lb per side is not a multiple of 2.5 lb. Check the plates.',
    );
  });

  it('accepts every total in 5 lb steps from the bar up to 800 lb on a 45 lb bar (property)', () => {
    for (let total = 45; total <= 800; total += 5)
      expect(codes(validateSet(inLb(total), ctx)), `${total} lb`).not.toContain('PLATE_INCREMENT');
  });

  it('accepts every weight per side in 2.5 lb steps, typed per side (property)', () => {
    for (let side = 0; side <= 350; side += 2.5) {
      const r = validateSet(
        inLb(side, { weight: { value: fromDisplay(side, 'lb'), unit: 'kg', mode: 'per_side' } }),
        ctx,
      );
      expect(codes(r), `${side} lb a side`).not.toContain('PLATE_INCREMENT');
    }
  });

  it('keeps 1.25 kg per side in kg', () => {
    const kg = (value: number): SetCandidate => ({
      equipment: 'barbell',
      weight: { value, unit: 'kg', mode: 'total' },
      reps: 5,
      barKg: 20,
      source: 'tap',
    });
    expect(validateSet(kg(62.5), { displayUnit: 'kg' }).status).toBe('ok');
    expect(codes(validateSet(kg(61), { displayUnit: 'kg' }))).toContain('PLATE_INCREMENT');
  });
});

describe('messages in the unit shown', () => {
  it('asks "total or per side?" for less than the bar, in lb', () => {
    const r = validateSet(
      inLb(30, {
        source: 'voice',
        weight: { value: fromDisplay(30, 'lb'), unit: 'kg', mode: 'unspecified' },
      }),
      ctx,
    );
    expect(r.status).toBe('ask');
    if (r.status !== 'ask') return;
    expect(r.issues[0]?.message).toBe(
      '30 lb is less than the 45 lb bar. Is that the total or per side?',
    );
    expect(r.options.map((o) => o.label)).toEqual([
      '30 lb per side (105 lb total)',
      '30 lb total, without the 45 lb bar',
    ]);
  });

  it('writes a big jump in lb', () => {
    const r = validateSet(inLb(315), { ...ctx, lastTotalKg: fromDisplay(135, 'lb') });
    expect(r.issues[0]?.message).toBe('315 lb is a big change from last time (135 lb).');
  });

  it('uses the unit of the typed weight when no display unit is given', () => {
    const r = validateSet({
      equipment: 'barbell',
      weight: { value: 135, unit: 'lb', mode: 'total' },
      reps: 8,
      barKg: BAR,
      source: 'tap',
    });
    expect(r.status).toBe('ok');
    const big = validateSet(
      {
        equipment: 'barbell',
        weight: { value: 315, unit: 'lb', mode: 'total' },
        reps: 8,
        barKg: BAR,
        source: 'tap',
      },
      { lastTotalKg: fromDisplay(135, 'lb') },
    );
    expect(big.issues[0]?.message).toContain('315 lb');
  });

  it('writes the limits in lb', () => {
    const r = validateSet(
      {
        equipment: 'barbell',
        weight: { value: 600, unit: 'kg', mode: 'total' },
        reps: 5,
        barKg: BAR,
        source: 'tap',
      },
      ctx,
    );
    expect(r.status).toBe('reject');
    expect(r.issues[0]?.message).toBe('Total weight must be at most 1102.3 lb.');
    const bar = validateSet(
      {
        equipment: 'barbell',
        weight: { value: 100, unit: 'kg', mode: 'total' },
        reps: 5,
        barKg: 150,
        source: 'tap',
      },
      ctx,
    );
    expect(bar.issues[0]?.message).toBe('Bar weight must be between 0 and 220.4 lb.');
  });

  it('is unchanged in kg', () => {
    const r = validateSet(
      {
        equipment: 'barbell',
        weight: { value: 10, unit: 'kg', mode: 'unspecified' },
        reps: 5,
        barKg: 20,
        source: 'voice',
      },
      { displayUnit: 'kg' },
    );
    expect(r.issues[0]?.message).toBe(
      '10 kg is less than the 20 kg bar. Is that the total or per side?',
    );
  });
});

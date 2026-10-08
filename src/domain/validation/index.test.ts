import { describe, expect, it } from 'vitest';
import { EQUIPMENT_TYPES, SetSchema, type EquipmentType } from '../schemas';
import { VALIDATION_CONFIG } from './config';
import { validateSet, type SetCandidate, type ValidationContext, type ValidationResult } from '.';

const barbell = (over: Partial<SetCandidate> = {}): SetCandidate => ({
  equipment: 'barbell',
  weight: { value: 60, unit: 'kg', mode: 'unspecified' },
  reps: 8,
  barKg: 20,
  ...over,
});
const withWeight = (
  value: number,
  mode: SetCandidate['weight']['mode'] = 'unspecified',
  unit: 'kg' | 'lb' = 'kg',
) => ({
  value,
  unit,
  mode,
});
const codes = (r: ValidationResult) => r.issues.map((i) => i.code);

describe('config', () => {
  it('keeps every threshold in one place', () => {
    expect(VALIDATION_CONFIG.jumpFraction).toBe(0.4);
    expect(VALIDATION_CONFIG.plateStepKg).toBe(1.25);
    expect(VALIDATION_CONFIG.ranges.reps).toEqual({ min: 1, max: 100 });
    expect(VALIDATION_CONFIG.ranges.totalKg).toEqual({ min: 0, max: 500 });
    expect(VALIDATION_CONFIG.ranges.perSideKg).toEqual({ min: 0, max: 250 });
    expect(VALIDATION_CONFIG.ranges.barKg).toEqual({ min: 0, max: 100 });
    expect(VALIDATION_CONFIG.confusablePairs).toHaveLength(7);
  });
});

describe('ok', () => {
  it('accepts a normal barbell set with no history and resolves the breakdown', () => {
    const r = validateSet(barbell({ barKg: 15 }));
    expect(r).toMatchObject({
      status: 'ok',
      resolved: { totalKg: 60, barKg: 15, perSideKg: 22.5, inputMode: 'total' },
      issues: [],
    });
  });

  it('treats the empty bar as a valid total', () => {
    const r = validateSet(barbell({ weight: withWeight(20) }));
    expect(r).toMatchObject({ status: 'ok', resolved: { totalKg: 20, perSideKg: 0 } });
  });

  it('converts pounds to kg, and softly warns that 135 lb is not loadable in 1.25 kg steps', () => {
    const r = validateSet(barbell({ weight: withWeight(135, 'total', 'lb'), barKg: 20 }));
    expect(r).toMatchObject({
      status: 'warn',
      resolved: { totalKg: 61.23, barKg: 20, perSideKg: null },
    });
    expect(codes(r)).toEqual(['PLATE_INCREMENT']);
  });

  it('computes the total from an explicit per-side weight', () => {
    const r = validateSet(barbell({ weight: withWeight(22.5, 'per_side'), barKg: 15 }));
    expect(r).toMatchObject({
      status: 'ok',
      resolved: { totalKg: 60, barKg: 15, perSideKg: 22.5, inputMode: 'per_side' },
    });
  });

  it.each(['dumbbell', 'machine', 'cable', 'bodyweight'] as EquipmentType[])(
    'applies no bar rules to %s: 10 kg is fine even with a 20 kg bar configured',
    (equipment) => {
      const r = validateSet({ equipment, weight: withWeight(10), reps: 10, barKg: 20 });
      expect(r).toMatchObject({
        status: 'ok',
        resolved: { totalKg: 10, barKg: null, perSideKg: null },
      });
    },
  );

  it('allows 0 kg added weight for bodyweight exercises', () => {
    expect(
      validateSet({ equipment: 'bodyweight', weight: withWeight(0), reps: 12, barKg: null }).status,
    ).toBe('ok');
  });
});

describe('reject', () => {
  it.each([
    { name: 'reps 0', c: barbell({ reps: 0 }), code: 'REPS_OUT_OF_RANGE' },
    { name: 'reps 101', c: barbell({ reps: 101 }), code: 'REPS_OUT_OF_RANGE' },
    { name: 'fractional reps', c: barbell({ reps: 8.5 }), code: 'INVALID_NUMBER' },
    { name: 'NaN reps', c: barbell({ reps: Number.NaN }), code: 'INVALID_NUMBER' },
    { name: 'negative weight', c: barbell({ weight: withWeight(-5) }), code: 'INVALID_NUMBER' },
    { name: 'NaN weight', c: barbell({ weight: withWeight(Number.NaN) }), code: 'INVALID_NUMBER' },
    {
      name: 'infinite weight',
      c: barbell({ weight: withWeight(Number.POSITIVE_INFINITY) }),
      code: 'INVALID_NUMBER',
    },
    {
      name: 'total 500.01 kg',
      c: barbell({ weight: withWeight(500.01, 'total') }),
      code: 'WEIGHT_OUT_OF_RANGE',
    },
    {
      name: 'per side 251 kg',
      c: barbell({ weight: withWeight(251, 'per_side') }),
      code: 'PER_SIDE_OUT_OF_RANGE',
    },
    {
      name: 'per side that makes the total exceed 500 kg',
      c: barbell({ weight: withWeight(245, 'per_side'), barKg: 20 }),
      code: 'WEIGHT_OUT_OF_RANGE',
    },
    {
      name: 'per side with no bar weight configured',
      c: barbell({ weight: withWeight(20, 'per_side'), barKg: null }),
      code: 'MISSING_BAR',
    },
  ])('rejects $name', ({ c, code }) => {
    const r = validateSet(c);
    expect(r.status).toBe('reject');
    expect(codes(r)).toContain(code);
    expect(r.issues[0]?.message.length).toBeGreaterThan(0);
  });

  it.each([
    { name: 'reps 1', reps: 1 },
    { name: 'reps 100', reps: 100 },
  ])('accepts the boundary $name', ({ reps }) => {
    expect(validateSet(barbell({ reps })).status).not.toBe('reject');
  });

  it('accepts a total of exactly 500 kg', () => {
    expect(validateSet(barbell({ weight: withWeight(500, 'total') })).status).not.toBe('reject');
  });
});

describe('total below the bar', () => {
  it('asks "total or per side?" and offers both readings', () => {
    const r = validateSet(barbell({ weight: withWeight(10), barKg: 20 }));
    expect(r.status).toBe('ask');
    if (r.status !== 'ask') return;
    expect(codes(r)).toContain('TOTAL_BELOW_BAR');
    expect(r.options.map((o) => o.kind)).toEqual(['per_side', 'total_no_bar']);
    expect(r.options[0]?.resolved).toMatchObject({
      totalKg: 40,
      barKg: 20,
      perSideKg: 10,
      inputMode: 'per_side',
    });
    expect(r.options[1]?.resolved).toMatchObject({
      totalKg: 10,
      barKg: null,
      perSideKg: null,
      inputMode: 'total',
    });
  });

  it('also asks when the user explicitly said total', () => {
    expect(validateSet(barbell({ weight: withWeight(10, 'total'), barKg: 20 })).status).toBe('ask');
  });

  it('does not ask when the total is just above or equal to the bar', () => {
    expect(validateSet(barbell({ weight: withWeight(20.01), barKg: 20 })).status).not.toBe('ask');
    expect(validateSet(barbell({ weight: withWeight(20), barKg: 20 })).status).toBe('ok');
  });
});

describe('large jump versus the last session', () => {
  const ctx = (lastTotalKg: number): ValidationContext => ({ lastTotalKg });

  it.each([
    { name: 'exactly +40%', value: 140, last: 100 },
    { name: 'exactly -40%', value: 60, last: 100 },
    { name: 'a small change', value: 62.5, last: 60 },
    { name: 'the same weight', value: 60, last: 60 },
  ])('does not ask for $name', ({ value, last }) => {
    expect(validateSet(barbell({ weight: withWeight(value, 'total') }), ctx(last)).status).not.toBe(
      'ask',
    );
  });

  it.each([
    { name: 'just over +40%', value: 140.01, last: 100 },
    { name: 'just over -40%', value: 59.99, last: 100 },
    { name: 'a doubling', value: 120, last: 60 },
  ])('asks for $name and offers to confirm what was said', ({ value, last }) => {
    const r = validateSet(barbell({ weight: withWeight(value, 'total') }), ctx(last));
    expect(r.status).toBe('ask');
    expect(codes(r)).toContain('LARGE_JUMP');
    if (r.status === 'ask') expect(r.options.at(-1)).toMatchObject({ kind: 'as_said' });
  });

  it('offers the per-side reading when it fits history and the spoken number does not', () => {
    // last session 100 kg, bar 20: "forty" is a 60% drop, but 40 per side = 100 kg total
    const r = validateSet(barbell({ weight: withWeight(40) }), ctx(100));
    expect(r.status).toBe('ask');
    if (r.status !== 'ask') return;
    expect(codes(r)).toEqual(expect.arrayContaining(['LARGE_JUMP', 'PER_SIDE_PLAUSIBLE']));
    expect(r.options.map((o) => o.kind)).toEqual(['per_side', 'as_said']);
    expect(r.options[0]?.resolved.totalKg).toBe(100);
  });

  it('does not offer a per-side reading when the user explicitly said total', () => {
    const r = validateSet(barbell({ weight: withWeight(40, 'total') }), ctx(100));
    expect(r.status).toBe('ask');
    if (r.status === 'ask') expect(r.options.map((o) => o.kind)).toEqual(['as_said']);
  });

  it('ignores history when there is none or it is not positive', () => {
    expect(validateSet(barbell({ weight: withWeight(200, 'total') })).status).not.toBe('ask');
    expect(validateSet(barbell({ weight: withWeight(200, 'total') }), ctx(0)).status).not.toBe(
      'ask',
    );
    expect(
      validateSet(barbell({ weight: withWeight(200, 'total') }), ctx(Number.NaN)).status,
    ).not.toBe('ask');
  });

  it('applies to non-bar equipment too', () => {
    const r = validateSet(
      { equipment: 'dumbbell', weight: withWeight(40), reps: 8, barKg: null },
      ctx(10),
    );
    expect(r.status).toBe('ask');
    expect(codes(r)).toContain('LARGE_JUMP');
  });
});

describe('speech confusables (13/30 ... 19/90)', () => {
  const ctx = (lastTotalKg: number): ValidationContext => ({ lastTotalKg });

  it.each([
    { heard: 16, meant: 60, last: 60 },
    { heard: 13, meant: 30, last: 32.5 },
    { heard: 90, meant: 19, last: 20 },
    { heard: 70, meant: 17, last: 17.5 },
  ])('heard $heard, history $last: asks "Did you mean $meant?"', ({ heard, meant, last }) => {
    const r = validateSet(
      { equipment: 'machine', weight: withWeight(heard), reps: 10, barKg: null },
      ctx(last),
    );
    expect(r.status).toBe('ask');
    if (r.status !== 'ask') return;
    expect(codes(r)).toEqual(expect.arrayContaining(['CONFUSABLE_NUMBER']));
    expect(r.options[0]).toMatchObject({ kind: 'confusable' });
    expect(r.options[0]?.resolved.totalKg).toBe(meant);
    expect(r.options.at(-1)).toMatchObject({ kind: 'as_said' });
  });

  it('does not suggest an alternative without history', () => {
    expect(
      validateSet({ equipment: 'machine', weight: withWeight(16), reps: 10, barKg: null }).status,
    ).toBe('ok');
  });

  it('does not ask when the spoken number already matches history', () => {
    expect(
      validateSet({ equipment: 'machine', weight: withWeight(16), reps: 10, barKg: null }, ctx(16))
        .status,
    ).toBe('ok');
  });

  it('does not offer the alternative when it does not match history either', () => {
    const r = validateSet(
      { equipment: 'machine', weight: withWeight(16), reps: 10, barKg: null },
      ctx(200),
    );
    expect(r.status).toBe('ask');
    if (r.status === 'ask') expect(r.options.map((o) => o.kind)).toEqual(['as_said']);
  });

  it('ignores numbers that are not on the confusable list', () => {
    const r = validateSet(
      { equipment: 'machine', weight: withWeight(25), reps: 10, barKg: null },
      ctx(60),
    );
    expect(r.status).toBe('ask');
    expect(codes(r)).not.toContain('CONFUSABLE_NUMBER');
  });

  it('keeps the confusable alternative in the same mode (per side)', () => {
    // "sixteen each side" with a 20 kg bar and history 100: 60 per side would give 140 total (+40%): in band
    const r = validateSet(barbell({ weight: withWeight(16, 'per_side'), barKg: 20 }), ctx(140));
    expect(r.status).toBe('ask');
    if (r.status !== 'ask') return;
    expect(r.options[0]).toMatchObject({ kind: 'confusable' });
    expect(r.options[0]?.resolved).toMatchObject({
      totalKg: 140,
      perSideKg: 60,
      inputMode: 'per_side',
    });
  });
});

describe('plate achievability (soft warning)', () => {
  it('warns, but does not block, when the per-side weight needs a plate smaller than 1.25 kg', () => {
    const r = validateSet(barbell({ weight: withWeight(61, 'total'), barKg: 20 }));
    expect(r.status).toBe('warn');
    expect(codes(r)).toContain('PLATE_INCREMENT');
    if (r.status === 'warn') expect(r.resolved.totalKg).toBe(61);
  });

  it.each([
    { value: 60, bar: 20, perSide: 20 },
    { value: 60, bar: 15, perSide: 22.5 },
    { value: 62.5, bar: 15, perSide: 23.75 },
    { value: 20, bar: 20, perSide: 0 },
    { value: 102.5, bar: 20, perSide: 41.25 },
  ])(
    'is silent for $value kg on a $bar kg bar ($perSide kg per side is a multiple of 1.25)',
    ({ value, bar }) => {
      const r = validateSet(barbell({ weight: withWeight(value, 'total'), barKg: bar }));
      expect(codes(r)).not.toContain('PLATE_INCREMENT');
    },
  );

  it('does not check plates for machines or dumbbells', () => {
    expect(
      validateSet({ equipment: 'dumbbell', weight: withWeight(13.3), reps: 8, barKg: null }).status,
    ).toBe('ok');
  });

  it('warns about per-side input that is not a plate multiple', () => {
    const r = validateSet(barbell({ weight: withWeight(21, 'per_side'), barKg: 20 }));
    expect(r.status).toBe('warn');
  });
});

describe('equipment without a bar given per-side input', () => {
  it('uses the number as the per-implement weight and warns', () => {
    const r = validateSet({
      equipment: 'dumbbell',
      weight: withWeight(20, 'per_side'),
      reps: 10,
      barKg: null,
    });
    expect(r.status).toBe('warn');
    expect(codes(r)).toContain('PER_SIDE_IGNORED');
    if (r.status === 'warn')
      expect(r.resolved).toMatchObject({ totalKg: 20, barKg: null, perSideKg: null });
  });
});

describe('invariants over many generated candidates', () => {
  // Small deterministic generator so failures are reproducible.
  let seed = 123456789;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

  const generate = (): [SetCandidate, ValidationContext] => {
    const equipment = pick(EQUIPMENT_TYPES);
    const weirdNumbers = [
      0,
      0.1,
      1,
      13,
      16,
      19,
      30,
      60,
      62.5,
      100,
      249.99,
      250,
      251,
      500,
      501,
      -1,
      1e9,
      Number.NaN,
    ];
    const value = rnd() < 0.3 ? pick(weirdNumbers) : Math.round(rnd() * 3000) / 10;
    const candidate: SetCandidate = {
      equipment,
      weight: {
        value,
        unit: pick(['kg', 'lb'] as const),
        mode: pick(['total', 'per_side', 'unspecified'] as const),
      },
      reps: rnd() < 0.2 ? pick([0, 1, 100, 101, 8.5, -3]) : 1 + Math.floor(rnd() * 20),
      barKg: rnd() < 0.15 ? null : pick([0, 10, 15, 20, 25]),
    };
    const context: ValidationContext =
      rnd() < 0.6 ? { lastTotalKg: Math.round(rnd() * 3000) / 10 } : {};
    return [candidate, context];
  };

  it('never throws, and always returns a consistent result', () => {
    for (let i = 0; i < 3000; i++) {
      const [c, ctx] = generate();
      const r = validateSet(c, ctx);
      expect(['ok', 'warn', 'ask', 'reject']).toContain(r.status);
      if (r.status === 'ok') expect(r.issues).toEqual([]);
      if (r.status === 'reject') expect(r.issues.length).toBeGreaterThan(0);
      const resolvedList =
        r.status === 'ok' || r.status === 'warn'
          ? [r.resolved]
          : r.status === 'ask'
            ? r.options.map((o) => o.resolved)
            : [];
      if (r.status === 'ask') expect(r.options.length).toBeGreaterThan(0);
      for (const res of resolvedList) {
        expect(res.totalKg).toBeGreaterThanOrEqual(0);
        expect(res.totalKg).toBeLessThanOrEqual(500);
        if (res.barKg !== null && res.perSideKg !== null) {
          expect(Math.round((res.barKg + 2 * res.perSideKg) * 100) / 100).toBe(res.totalKg);
        }
        // a resolved weight must always be storable as a set
        const stored = SetSchema.safeParse({
          id: '11111111-1111-4111-8111-111111111111',
          workoutId: '22222222-2222-4222-8222-222222222222',
          exerciseId: '33333333-3333-4333-8333-333333333333',
          totalKg: res.totalKg,
          barKg: res.barKg,
          perSideKg: res.perSideKg,
          inputMode: res.inputMode,
          reps: 8,
          source: 'tap',
          rawTranscript: null,
          loggedAt: '2026-10-08T10:00:00Z',
        });
        expect(stored.success, JSON.stringify([c, ctx, res])).toBe(true);
      }
    }
  });
});

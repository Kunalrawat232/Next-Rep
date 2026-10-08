// Edge cases not covered by index.test.ts. A failing test here is a suspected bug: do not weaken it.
import { describe, expect, it } from 'vitest';
import { VALIDATION_CONFIG } from './config';
import { validateSet, type SetCandidate, type ValidationResult } from '.';

type Unit = 'kg' | 'lb';
type Mode = SetCandidate['weight']['mode'];
const cand = (
  value: number,
  o: Partial<Omit<SetCandidate, 'weight'>> & { mode?: Mode; unit?: Unit } = {},
): SetCandidate => ({
  equipment: o.equipment ?? 'barbell',
  weight: { value, unit: o.unit ?? 'kg', mode: o.mode ?? 'unspecified' },
  reps: o.reps ?? 8,
  barKg: o.barKg === undefined ? 20 : o.barKg,
});
const codes = (r: ValidationResult) => r.issues.map((i) => i.code);
const resolvedOf = (r: ValidationResult) =>
  r.status === 'ok' || r.status === 'warn'
    ? [r.resolved]
    : r.status === 'ask'
      ? r.options.map((o) => o.resolved)
      : [];
const decimals = (n: number) => Math.round(n * 100) / 100 === n;

describe('pound inputs at range boundaries', () => {
  it.each([
    { name: '1102 lb total (499.89 kg)', v: 1102, mode: 'total', bar: 20, status: 'not-reject' },
    { name: '1103 lb total (500.31 kg)', v: 1103, mode: 'total', bar: 20, status: 'reject' },
    {
      name: '551 lb per side, total 519.86 kg',
      v: 551,
      mode: 'per_side',
      bar: 20,
      status: 'reject',
    },
    { name: '553 lb per side (250.8 kg)', v: 553, mode: 'per_side', bar: 0, status: 'reject' },
    {
      name: '551 lb per side on a 0 kg bar (249.93 kg)',
      v: 551,
      mode: 'per_side',
      bar: 0,
      status: 'not-reject',
    },
  ] as const)('$name', ({ v, mode, bar, status }) => {
    const r = validateSet(cand(v, { unit: 'lb', mode, barKg: bar }));
    if (status === 'reject') expect(r.status).toBe('reject');
    else expect(r.status).not.toBe('reject');
  });

  it('uses PER_SIDE_OUT_OF_RANGE for 553 lb per side and WEIGHT_OUT_OF_RANGE when only the sum is too big', () => {
    expect(codes(validateSet(cand(553, { unit: 'lb', mode: 'per_side', barKg: 0 })))).toEqual([
      'PER_SIDE_OUT_OF_RANGE',
    ]);
    expect(codes(validateSet(cand(551, { unit: 'lb', mode: 'per_side' })))).toEqual([
      'WEIGHT_OUT_OF_RANGE',
    ]);
  });

  it('keeps pound per-side consistent: 55 lb each side on a 20 kg bar', () => {
    const r = validateSet(cand(55, { unit: 'lb', mode: 'per_side' }));
    expect(resolvedOf(r)[0]).toMatchObject({ totalKg: 69.9, perSideKg: 24.95, barKg: 20 });
  });

  it('applies the unit to the confusable alternative (16 lb heard, 60 lb meant)', () => {
    const r = validateSet(cand(16, { unit: 'lb', equipment: 'machine', barKg: null }), {
      lastTotalKg: 27.22,
    });
    expect(r.status).toBe('ask');
    if (r.status !== 'ask') return;
    expect(r.options[0]).toMatchObject({ kind: 'confusable' });
    expect(r.options[0]?.resolved.totalKg).toBe(27.22);
  });

  it('asks total-or-per-side for a pound total below the bar (40 lb < 20 kg bar)', () => {
    const r = validateSet(cand(40, { unit: 'lb' }));
    expect(r.status).toBe('ask');
    expect(codes(r)).toContain('TOTAL_BELOW_BAR');
  });
});

describe('equipment and bars', () => {
  it.each(['barbell', 'ez_bar', 'smith'] as const)('%s: per side with a bar works', (equipment) => {
    const r = validateSet(cand(10, { equipment, mode: 'per_side', barKg: 7.5 }));
    expect(resolvedOf(r)[0]).toMatchObject({ totalKg: 27.5, perSideKg: 10, inputMode: 'per_side' });
  });

  it.each(['barbell', 'ez_bar', 'smith'] as const)(
    '%s: per side without a bar is MISSING_BAR',
    (equipment) => {
      expect(codes(validateSet(cand(10, { equipment, mode: 'per_side', barKg: null })))).toEqual([
        'MISSING_BAR',
      ]);
    },
  );

  it.each(['barbell', 'ez_bar', 'smith'] as const)('%s: total below the bar asks', (equipment) => {
    expect(validateSet(cand(5, { equipment, barKg: 10 })).status).toBe('ask');
  });

  it.each(['barbell', 'ez_bar', 'smith'] as const)(
    '%s: total with no bar configured is fine',
    (equipment) => {
      const r = validateSet(cand(5, { equipment, barKg: null }));
      expect(resolvedOf(r)[0]).toMatchObject({ totalKg: 5, barKg: null, perSideKg: null });
      expect(r.status).not.toBe('reject');
    },
  );

  it('bar weight 0 (smith with counterbalance): total splits evenly and nothing is below the bar', () => {
    const r = validateSet(cand(60, { equipment: 'smith', barKg: 0 }));
    expect(r.status).toBe('ok');
    expect(resolvedOf(r)[0]).toMatchObject({ totalKg: 60, barKg: 0, perSideKg: 30 });
    expect(validateSet(cand(0, { barKg: 0 })).status).toBe('ok');
  });

  it('bar weight 0 with per-side input and 250 kg per side gives exactly 500 kg', () => {
    const r = validateSet(cand(250, { mode: 'per_side', barKg: 0 }));
    expect(resolvedOf(r)[0]).toMatchObject({ totalKg: 500, perSideKg: 250 });
  });

  it('bar weight 100 (maximum) is accepted; 100.01 and negative are rejected', () => {
    expect(validateSet(cand(150, { barKg: 100 })).status).not.toBe('reject');
    expect(validateSet(cand(150, { barKg: 100.01 })).status).toBe('reject');
    expect(validateSet(cand(150, { barKg: -1 })).status).toBe('reject');
    expect(validateSet(cand(150, { barKg: Number.NaN })).status).toBe('reject');
  });

  it('ignores an invalid bar weight for equipment that has no bar', () => {
    expect(validateSet(cand(10, { equipment: 'dumbbell', barKg: Number.NaN })).status).toBe('ok');
    expect(validateSet(cand(10, { equipment: 'machine', barKg: -5 })).status).toBe('ok');
  });

  it('bodyweight with per-side input is treated as the added weight and warns', () => {
    const r = validateSet(cand(10, { equipment: 'bodyweight', mode: 'per_side', barKg: null }));
    expect(r.status).toBe('warn');
    expect(codes(r)).toEqual(['PER_SIDE_IGNORED']);
  });

  it('does not offer a per-side reading for dumbbells even with a huge jump', () => {
    const r = validateSet(cand(40, { equipment: 'dumbbell', barKg: 20 }), { lastTotalKg: 100 });
    expect(r.status).toBe('ask');
    if (r.status === 'ask') expect(r.options.map((o) => o.kind)).toEqual(['as_said']);
  });
});

describe('bad input and huge values', () => {
  it.each([
    { name: 'Infinity reps', c: cand(60, { reps: Infinity }), code: 'INVALID_NUMBER' },
    { name: '-Infinity reps', c: cand(60, { reps: -Infinity }), code: 'INVALID_NUMBER' },
    { name: 'negative reps', c: cand(60, { reps: -1 }), code: 'REPS_OUT_OF_RANGE' },
    { name: 'reps 1e21', c: cand(60, { reps: 1e21 }), code: 'REPS_OUT_OF_RANGE' },
    { name: 'reps 100.5', c: cand(60, { reps: 100.5 }), code: 'INVALID_NUMBER' },
    { name: 'weight -Infinity', c: cand(-Infinity), code: 'INVALID_NUMBER' },
    { name: 'weight 1e308 kg', c: cand(1e308), code: 'WEIGHT_OUT_OF_RANGE' },
    { name: 'weight 1e308 lb', c: cand(1e308, { unit: 'lb' }), code: 'WEIGHT_OUT_OF_RANGE' },
    {
      name: 'Number.MAX_VALUE per side',
      c: cand(Number.MAX_VALUE, { mode: 'per_side' }),
      code: 'PER_SIDE_OUT_OF_RANGE',
    },
    {
      name: 'weight 1e308 on dumbbell',
      c: cand(1e308, { equipment: 'dumbbell', barKg: null }),
      code: 'WEIGHT_OUT_OF_RANGE',
    },
    {
      name: 'weight 1e308 dumbbell per_side',
      c: cand(1e308, { equipment: 'dumbbell', mode: 'per_side', barKg: null }),
      code: 'WEIGHT_OUT_OF_RANGE',
    },
    { name: 'bar Infinity', c: cand(60, { barKg: Infinity }), code: 'INVALID_NUMBER' },
  ])('rejects $name', ({ c, code }) => {
    const r = validateSet(c);
    expect(r.status).toBe('reject');
    expect(codes(r)).toContain(code);
  });

  it('never throws on huge values, even with history', () => {
    for (const v of [1e308, Number.MAX_VALUE, Number.MIN_VALUE, 1e-300, 2 ** 53]) {
      for (const mode of ['total', 'per_side', 'unspecified'] as const) {
        expect(() => validateSet(cand(v, { mode }), { lastTotalKg: 1e308 })).not.toThrow();
      }
    }
  });

  it('reports every problem at once when several inputs are bad', () => {
    const r = validateSet(cand(-5, { reps: 0, barKg: 500 }));
    expect(r.status).toBe('reject');
    expect(codes(r).sort()).toEqual(['INVALID_NUMBER', 'INVALID_NUMBER', 'REPS_OUT_OF_RANGE']);
  });

  it('treats -0 weight as zero, and a sub-cent weight as zero', () => {
    expect(validateSet(cand(-0, { equipment: 'bodyweight', barKg: null })).status).toBe('ok');
    expect(validateSet(cand(0.004, { equipment: 'machine', barKg: null })).status).toBe('ok');
  });
});

describe('history edge cases', () => {
  it.each([
    { name: 'Infinity', last: Infinity },
    { name: '-Infinity', last: -Infinity },
    { name: 'negative', last: -60 },
    { name: 'zero', last: 0 },
    { name: 'NaN', last: Number.NaN },
  ])('ignores $name history', ({ last }) => {
    const r = validateSet(cand(200, { mode: 'total' }), { lastTotalKg: last });
    expect(r.status).toBe('ok');
  });

  it('treats undefined history explicitly the same as no history', () => {
    expect(validateSet(cand(200, { mode: 'total' }), { lastTotalKg: undefined }).status).toBe('ok');
  });

  it('history near zero: any real weight is a big jump, and the result is still storable', () => {
    const r = validateSet(cand(20, { equipment: 'machine', barKg: null }), { lastTotalKg: 0.01 });
    expect(r.status).toBe('ask');
    expect(codes(r)).toContain('LARGE_JUMP');
  });

  it('history above the maximum (corrupt) does not crash and asks', () => {
    const r = validateSet(cand(60, { mode: 'total' }), { lastTotalKg: 1e12 });
    expect(r.status).toBe('ask');
  });

  // The band is last x 0.4. Float noise must never flip an exact 40% change into a question.
  it.each([
    { last: 7.5, value: 10.5 },
    { last: 7.5, value: 4.5 },
    { last: 32.5, value: 45.5 },
    { last: 32.5, value: 19.5 },
    { last: 82.5, value: 115.5 },
    { last: 82.5, value: 49.5 },
    { last: 27.5, value: 38.5 },
    { last: 0.5, value: 0.7 },
    { last: 0.5, value: 0.3 },
    { last: 123.45, value: 172.83 },
    { last: 123.45, value: 74.07 },
    { last: 1, value: 1.4 },
    { last: 3, value: 4.2 },
    { last: 0.1, value: 0.14 },
    { last: 300, value: 420 },
    { last: 300, value: 180 },
  ])('exactly 40%% change is not a jump (last $last, value $value)', ({ last, value }) => {
    const r = validateSet(cand(value, { equipment: 'machine', barKg: null }), {
      lastTotalKg: last,
    });
    expect(codes(r)).not.toContain('LARGE_JUMP');
  });

  it.each([
    { last: 7.5, value: 10.51 },
    { last: 7.5, value: 4.49 },
    { last: 123.45, value: 172.84 },
    { last: 123.45, value: 74.06 },
  ])('a hundredth beyond 40%% is a jump (last $last, value $value)', ({ last, value }) => {
    const r = validateSet(cand(value, { equipment: 'machine', barKg: null }), {
      lastTotalKg: last,
    });
    expect(codes(r)).toContain('LARGE_JUMP');
  });

  it('judges the jump on the pound value converted to kg', () => {
    // 220 lb = 99.79 kg vs 100 kg: no jump. 100 (read as lb) = 45.36 kg: jump.
    expect(
      codes(validateSet(cand(220, { unit: 'lb', mode: 'total' }), { lastTotalKg: 100 })),
    ).not.toContain('LARGE_JUMP');
    expect(
      codes(validateSet(cand(100, { unit: 'lb', mode: 'total' }), { lastTotalKg: 100 })),
    ).toContain('LARGE_JUMP');
  });

  it('per side reading is also checked against the jump band (per side reading just outside band is not offered)', () => {
    // bar 10, history 100: 25 per side = 60 total (-40%, in band); 24.99 = 59.98 (outside)
    const r = validateSet(cand(25, { barKg: 10 }), { lastTotalKg: 100 });
    expect(r.status).toBe('ask');
    if (r.status === 'ask') expect(r.options.map((o) => o.kind)).toEqual(['per_side', 'as_said']);
    // value 19.99 -> per side 59.98 (-40.02%): outside band
    const r2 = validateSet(cand(24.99, { barKg: 10 }), { lastTotalKg: 100 });
    expect(r2.status).toBe('ask');
    if (r2.status === 'ask') expect(r2.options.map((o) => o.kind)).toEqual(['as_said']);
  });

  it('with bar weight 0 the per-side reading is double the number', () => {
    const r = validateSet(cand(50, { barKg: 0 }), { lastTotalKg: 100 });
    expect(r.status).toBe('ask');
    if (r.status === 'ask') {
      expect(r.options[0]).toMatchObject({ kind: 'per_side' });
      expect(r.options[0]?.resolved.totalKg).toBe(100);
    }
  });

  it('mode total never offers per side; mode per_side never offers the total reading', () => {
    const t = validateSet(cand(40, { mode: 'total' }), { lastTotalKg: 100 });
    if (t.status === 'ask') expect(t.options.map((o) => o.kind)).not.toContain('per_side');
    const p = validateSet(cand(10, { mode: 'per_side' }), { lastTotalKg: 100 });
    expect(p.status).toBe('ask');
    if (p.status === 'ask') {
      expect(p.options.map((o) => o.kind)).toEqual(['as_said']);
      expect(p.options[0]?.resolved).toMatchObject({ totalKg: 40, inputMode: 'per_side' });
    }
  });

  it('explicit per-side input on a bar with no bar weight is rejected before history is considered', () => {
    const r = validateSet(cand(40, { mode: 'per_side', barKg: null }), { lastTotalKg: 100 });
    expect(codes(r)).toEqual(['MISSING_BAR']);
  });

  it('unspecified mode with no bar weight cannot offer per side', () => {
    const r = validateSet(cand(40, { barKg: null }), { lastTotalKg: 100 });
    expect(r.status).toBe('ask');
    if (r.status === 'ask') expect(r.options.map((o) => o.kind)).toEqual(['as_said']);
  });
});

describe('speech confusables, every pair in both directions', () => {
  const pairs = VALIDATION_CONFIG.confusablePairs.flatMap(([a, b]) => [
    { heard: a, meant: b },
    { heard: b, meant: a },
  ]);
  it.each(pairs)('heard $heard, history matches $meant', ({ heard, meant }) => {
    const r = validateSet(cand(heard, { equipment: 'machine', barKg: null }), {
      lastTotalKg: meant,
    });
    expect(r.status).toBe('ask');
    if (r.status !== 'ask') return;
    expect(codes(r)).toContain('CONFUSABLE_NUMBER');
    expect(r.options.find((o) => o.kind === 'confusable')?.resolved.totalKg).toBe(meant);
    expect(r.options.at(-1)?.kind).toBe('as_said');
  });

  it.each([12, 20, 21, 29, 31, 100, 0, 16.5, 60.5])('%s has no confusable alternative', (v) => {
    const r = validateSet(cand(v, { equipment: 'machine', barKg: null }), { lastTotalKg: 500 });
    expect(codes(r)).not.toContain('CONFUSABLE_NUMBER');
  });

  it('does not offer the alternative when it equals the history only through a below-bar total', () => {
    // 30 heard on a 20 kg bar: "13" would be below the bar and must not be offered as a total
    const r = validateSet(cand(30, { mode: 'total' }), { lastTotalKg: 13 });
    expect(r.status).toBe('ask');
    expect(codes(r)).not.toContain('CONFUSABLE_NUMBER');
  });

  it('a decimal that looks like a pair is not confusable (16.0 is, 16.01 is not)', () => {
    const base = { equipment: 'machine', barKg: null } as const;
    expect(codes(validateSet(cand(16.0, base), { lastTotalKg: 60 }))).toContain(
      'CONFUSABLE_NUMBER',
    );
    expect(codes(validateSet(cand(16.01, base), { lastTotalKg: 60 }))).not.toContain(
      'CONFUSABLE_NUMBER',
    );
  });

  it('offers both the per-side reading and the confusable reading when both fit history', () => {
    // bar 20, unspecified "30": literal 30 (history 50 = -40%: in band, so use history 90).
    // history 90: literal 30 out; per side 80 in band; confusable 13 total=13 out. Expect per side only.
    const r = validateSet(cand(30), { lastTotalKg: 90 });
    expect(r.status).toBe('ask');
    if (r.status === 'ask') expect(r.options.map((o) => o.kind)).toEqual(['per_side', 'as_said']);
  });

  it('keeps per_side first, then confusable, then as_said when all three apply', () => {
    // bar 0, "16" unspecified, history 60: literal 16 (-73%); per side 32 (-47%) out. bar 0 history 32: per side ok, 60 out.
    // bar 0, "30": literal 30; history 15 => 30 is +100%; per side 60 out; confusable 13 => 13 vs 15 in band.
    const r = validateSet(cand(30, { barKg: 0 }), { lastTotalKg: 15 });
    expect(r.status).toBe('ask');
    if (r.status === 'ask') expect(r.options.map((o) => o.kind)).toEqual(['confusable', 'as_said']);
  });

  it('BUG?: a total below the bar that is a misheard number should still offer the confusable', () => {
    // Heard "16" on a 20 kg bar, last session 60 kg: "60" fits history. The below-bar question
    // currently only offers per side (52 kg) and total without bar.
    const r = validateSet(cand(16), { lastTotalKg: 60 });
    expect(r.status).toBe('ask');
    if (r.status === 'ask') expect(r.options.map((o) => o.kind)).toContain('confusable');
  });
});

describe('total below the bar (extra)', () => {
  it('below-bar with value 0: asks, and the per-side option is the bar alone', () => {
    const r = validateSet(cand(0));
    expect(r.status).toBe('ask');
    if (r.status === 'ask') {
      expect(r.options[0]?.resolved).toMatchObject({ totalKg: 20, perSideKg: 0 });
    }
  });

  it('below-bar ask ignores history (no LARGE_JUMP in the same result)', () => {
    const r = validateSet(cand(10), { lastTotalKg: 500 });
    expect(codes(r)).toEqual(['TOTAL_BELOW_BAR']);
  });

  it('explicit per side never triggers the below-bar question', () => {
    const r = validateSet(cand(5, { mode: 'per_side' }));
    expect(codes(r)).not.toContain('TOTAL_BELOW_BAR');
    expect(resolvedOf(r)[0]).toMatchObject({ totalKg: 30, perSideKg: 5 });
  });

  it('without a bar weight, a small total is simply a total', () => {
    expect(validateSet(cand(5, { barKg: null })).status).toBe('ok');
  });
});

describe('plate warnings (extra)', () => {
  it.each([
    { v: 1.25, bar: 20, mode: 'per_side', warn: false },
    { v: 1.26, bar: 20, mode: 'per_side', warn: true },
    { v: 0.5, bar: 20, mode: 'per_side', warn: true },
    { v: 0, bar: 20, mode: 'per_side', warn: false },
    { v: 62.5, bar: 20, mode: 'total', warn: false },
    { v: 61.25, bar: 20, mode: 'total', warn: true },
    { v: 61, bar: 17.5, mode: 'total', warn: true },
    { v: 100, bar: 0, mode: 'total', warn: false },
    { v: 1.25, bar: 0, mode: 'total', warn: true },
  ] as const)('v=$v bar=$bar mode=$mode warns=$warn', ({ v, bar, mode, warn }) => {
    const r = validateSet(cand(v, { barKg: bar, mode }));
    expect(codes(r).includes('PLATE_INCREMENT')).toBe(warn);
    expect(r.status).not.toBe('reject');
    expect(r.status).not.toBe('ask');
  });

  it('BUG?: an odd-hundredths total (60.01 kg on a 20 kg bar) cannot be loaded but is not warned about', () => {
    const r = validateSet(cand(60.01, { mode: 'total' }));
    expect(codes(r)).toContain('PLATE_INCREMENT');
  });

  it('does not check plates for non-bar equipment even with a per-side phrase', () => {
    const r = validateSet(cand(13.3, { equipment: 'cable', mode: 'per_side', barKg: null }));
    expect(codes(r)).toEqual(['PER_SIDE_IGNORED']);
  });
});

describe('results that must always be storable', () => {
  const grid = [
    0, 0.01, 0.005, 1.25, 13, 16, 19.99, 20, 22.68, 45, 61.23, 100.005, 135, 249.99, 250, 500,
  ];
  const bars = [null, 0, 7.5, 15, 17.5, 20, 22.68, 100];
  const equipment = ['barbell', 'ez_bar', 'smith', 'dumbbell', 'machine'] as const;
  const lasts = [undefined, 0.01, 20, 60, 140, 500];

  it('every resolved weight satisfies the database constraints', () => {
    const bad: unknown[] = [];
    for (const eq of equipment)
      for (const unit of ['kg', 'lb'] as const)
        for (const mode of ['total', 'per_side', 'unspecified'] as const)
          for (const barKg of bars)
            for (const v of grid)
              for (const lastTotalKg of lasts) {
                const c = cand(v, { equipment: eq, unit, mode, barKg });
                for (const res of resolvedOf(validateSet(c, { lastTotalKg }))) {
                  const ok =
                    res.totalKg >= 0 &&
                    res.totalKg <= 500 &&
                    decimals(res.totalKg) &&
                    (res.barKg === null ||
                      (res.barKg >= 0 && res.barKg <= 100 && decimals(res.barKg))) &&
                    (res.perSideKg === null ||
                      (res.perSideKg >= 0 && res.perSideKg <= 250 && decimals(res.perSideKg))) &&
                    (res.barKg === null ||
                      res.perSideKg === null ||
                      Math.round((res.barKg + 2 * res.perSideKg) * 100) ===
                        Math.round(res.totalKg * 100)) &&
                    (res.inputMode !== 'per_side' ||
                      (res.barKg !== null && res.perSideKg !== null));
                  if (!ok && bad.length < 5) bad.push({ c, lastTotalKg, res });
                }
              }
    expect(bad).toEqual([]);
  });

  it('ok results never carry issues, warn results always carry at least one, ask offers as_said last', () => {
    for (const mode of ['total', 'per_side', 'unspecified'] as const)
      for (const v of grid)
        for (const lastTotalKg of lasts) {
          const r = validateSet(cand(v, { mode, barKg: 20 }), { lastTotalKg });
          if (r.status === 'warn') expect(r.issues.length).toBeGreaterThan(0);
          if (r.status === 'ok') expect(r.issues).toHaveLength(0);
          if (r.status === 'ask' && codes(r).includes('LARGE_JUMP'))
            expect(r.options.at(-1)?.kind).toBe('as_said');
        }
  });

  it('BUG?: a fractional bar weight is carried through with more than 2 decimals', () => {
    const r = validateSet(cand(60, { barKg: 20.005, mode: 'total' }));
    for (const res of resolvedOf(r)) expect(decimals(res.barKg ?? 0)).toBe(true);
  });

  it('BUG?: PER_SIDE_IGNORED is not lost when a large jump turns the result into a question', () => {
    const r = validateSet(cand(40, { equipment: 'dumbbell', mode: 'per_side', barKg: null }), {
      lastTotalKg: 10,
    });
    expect(r.status).toBe('ask');
    expect(codes(r)).toContain('PER_SIDE_IGNORED');
  });
});

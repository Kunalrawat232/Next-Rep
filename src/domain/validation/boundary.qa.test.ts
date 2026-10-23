import { describe, expect, it } from 'vitest';
import type { EquipmentType } from '../schemas';
import { validateSet, type SetCandidate, type WeightMode } from './index';

const cand = (over: {
  value?: number;
  unit?: 'kg' | 'lb';
  mode?: WeightMode;
  reps?: number;
  barKg?: number | null;
  equipment?: EquipmentType;
  source?: 'tap' | 'voice';
}): SetCandidate => ({
  equipment: over.equipment ?? 'barbell',
  weight: { value: over.value ?? 60, unit: over.unit ?? 'kg', mode: over.mode ?? 'total' },
  reps: over.reps ?? 8,
  barKg: over.barKg === undefined ? 20 : over.barKg,
  source: over.source,
});

describe('reps boundaries', () => {
  const rows: [number, string][] = [
    [1, 'ok'],
    [100, 'ok'],
    [0, 'reject'],
    [101, 'reject'],
    [-1, 'reject'],
    [8.5, 'reject'],
    [NaN, 'reject'],
    [Infinity, 'reject'],
    [Number.MAX_SAFE_INTEGER, 'reject'],
  ];
  it.each(rows)('reps %s is %s', (reps, status) => {
    expect(validateSet(cand({ reps })).status).toBe(status);
  });
});

describe('total weight boundaries (barbell, 20 kg bar)', () => {
  const rows: [number, string][] = [
    [500, 'ok'],
    [500.004, 'ok'], // sub-cent noise is rounded away
    [500.01, 'reject'],
    [501, 'reject'],
    [20, 'ok'], // exactly the bar
    [19.99, 'ask'], // one cent below the bar
    [0, 'ask'], // empty total on a barbell asks
    [-0.01, 'reject'],
    [NaN, 'reject'],
    [Infinity, 'reject'],
    [-Infinity, 'reject'],
    [1e308, 'reject'],
  ];
  it.each(rows)('%s kg is %s', (value, status) => {
    expect(validateSet(cand({ value })).status).toBe(status);
  });

  it('500 kg total keeps a breakdown that satisfies total = bar + 2 x per side', () => {
    const r = validateSet(cand({ value: 500 }));
    if (r.status !== 'ok' && r.status !== 'warn') throw new Error('expected storable');
    expect(r.resolved).toMatchObject({ totalKg: 500, barKg: 20, perSideKg: 240 });
  });
});

describe('per side boundaries', () => {
  const rows: [string, number, number, string][] = [
    ['250 per side on a 0 kg bar is exactly 500', 250, 0, 'ok'],
    ['250 per side on a 20 kg bar is 520 total', 250, 20, 'reject'],
    ['250.01 per side', 250.01, 0, 'reject'],
    ['240 per side on a 20 kg bar is 500 total', 240, 20, 'ok'],
    ['240.01 per side on a 20 kg bar is 500.02 total', 240.01, 20, 'reject'],
    ['0 per side is the empty bar', 0, 20, 'ok'],
    ['100 kg bar, 200 per side is 500', 200, 100, 'ok'],
  ];
  it.each(rows)('%s -> %s', (_l, value, barKg, status) => {
    const r = validateSet(cand({ value, mode: 'per_side', barKg }));
    expect(r.status === 'warn' ? 'ok' : r.status).toBe(status);
  });

  it('per-side rejection says per side, total rejection says total', () => {
    const per = validateSet(cand({ value: 251, mode: 'per_side', barKg: 0 }));
    const tot = validateSet(cand({ value: 501 }));
    expect(per.status === 'reject' && per.issues[0]?.code).toBe('PER_SIDE_OUT_OF_RANGE');
    expect(tot.status === 'reject' && tot.issues[0]?.code).toBe('WEIGHT_OUT_OF_RANGE');
  });

  it('per side with no bar on a barbell is rejected, not guessed', () => {
    const r = validateSet(cand({ value: 20, mode: 'per_side', barKg: null }));
    expect(r).toMatchObject({ status: 'reject', issues: [{ code: 'MISSING_BAR' }] });
  });
});

describe('bar boundaries', () => {
  const rows: [number | null, string][] = [
    [0, 'ok'],
    [100, 'ok'],
    [100.01, 'reject'],
    [-1, 'reject'],
    [NaN, 'reject'],
    [Infinity, 'reject'],
  ];
  it.each(rows)('bar %s is %s', (barKg, status) => {
    expect(validateSet(cand({ value: 120, barKg })).status).toBe(status);
  });

  it('a bad bar is ignored for equipment that has no bar', () => {
    expect(validateSet(cand({ equipment: 'dumbbell', value: 20, barKg: NaN })).status).toBe('ok');
    expect(validateSet(cand({ equipment: 'machine', value: 50, barKg: -5 })).status).toBe('ok');
  });

  it('no bar on a total-mode barbell has no breakdown but is accepted', () => {
    const r = validateSet(cand({ value: 60, barKg: null }));
    expect(r).toMatchObject({ resolved: { totalKg: 60, barKg: null, perSideKg: null } });
  });
});

describe('the 40% jump rule', () => {
  const rows: [string, number, number, string][] = [
    ['exactly +40%', 140, 100, 'ok'],
    ['exactly -40%', 60, 100, 'ok'],
    ['one cent over +40%', 140.01, 100, 'ask'],
    ['one cent under -40%', 59.99, 100, 'ask'],
    ['float-unfriendly 0.4 of 72.5', 101.5, 72.5, 'ok'],
    ['float-unfriendly 0.4 of 72.5 plus a cent', 101.51, 72.5, 'ask'],
    ['last session is 0', 500, 0, 'ok'],
    ['last session negative', 500, -10, 'ok'],
    ['last session NaN', 500, NaN, 'ok'],
    ['last session Infinity', 500, Infinity, 'ok'],
  ];
  it.each(rows)('%s (now %s, last %s) -> %s', (_l, value, lastTotalKg, status) => {
    const r = validateSet(cand({ value, barKg: 20 }), { lastTotalKg });
    expect(r.status === 'warn' ? 'ok' : r.status).toBe(status);
  });

  it('a large jump always ends with "as said" so an intentional jump can be confirmed', () => {
    const r = validateSet(cand({ value: 200 }), { lastTotalKg: 100 });
    if (r.status !== 'ask') throw new Error('expected ask');
    expect(r.options[r.options.length - 1]?.kind).toBe('as_said');
    expect(r.options[r.options.length - 1]?.resolved.totalKg).toBe(200);
  });

  it('every option offered is storable: within ranges and total = bar + 2 x per side', () => {
    const r = validateSet(cand({ value: 30, mode: 'unspecified' }), { lastTotalKg: 80 });
    if (r.status !== 'ask') throw new Error('expected ask');
    for (const { resolved } of r.options) {
      expect(resolved.totalKg).toBeGreaterThanOrEqual(0);
      expect(resolved.totalKg).toBeLessThanOrEqual(500);
      if (resolved.barKg !== null && resolved.perSideKg !== null)
        expect(Math.round((resolved.barKg + 2 * resolved.perSideKg) * 100)).toBe(
          Math.round(resolved.totalKg * 100),
        );
    }
  });
});

describe('the 40% jump rule at floating point boundaries (machine, no bar)', () => {
  // Each pair sits exactly on the 40% line in decimal maths but past it in binary floating point.
  it.each([
    [1.15, 1.61],
    [1.4, 1.96],
    [1.65, 2.31],
    [2.35, 1.41],
    [3.45, 2.07],
    [4.9, 2.94],
  ])('last %s, now %s is exactly 40% and passes without a question', (last, now) => {
    const r = validateSet(cand({ equipment: 'machine', value: now, barKg: null }), {
      lastTotalKg: last,
    });
    expect(r.status === 'warn' || r.status === 'ok').toBe(true);
  });
});

describe('misheard numbers (voice) versus tapped numbers', () => {
  it.each([
    [16, 60],
    [13, 30],
    [19, 90],
    [90, 19],
  ])('voice %s on history near %s offers a confusable', (spoken, near) => {
    const r = validateSet(cand({ value: spoken, barKg: 0, mode: 'total' }), { lastTotalKg: near });
    expect(r.status).toBe('ask');
    if (r.status === 'ask') expect(r.options.map((o) => o.kind)).toContain('confusable');
  });

  it('a tapped 16 against history 60 never asks "did you mean 60"', () => {
    const r = validateSet(cand({ value: 16, barKg: 0, source: 'tap' }), { lastTotalKg: 60 });
    expect(JSON.stringify(r)).not.toContain('confusable');
    expect(r.status).not.toBe('ask');
  });

  it('a non-integer like 16.5 is not a confusable', () => {
    const r = validateSet(cand({ value: 16.5, barKg: 0 }), { lastTotalKg: 60 });
    expect(JSON.stringify(r)).not.toContain('confusable');
  });

  it('the confusable is not offered when the alternative is also far from history', () => {
    const r = validateSet(cand({ value: 16, barKg: 0 }), { lastTotalKg: 200 });
    expect(JSON.stringify(r)).not.toContain('confusable');
  });

  it('a lb 16 is checked as 16 lb, and its alternative is 60 lb (not 60 kg)', () => {
    const r = validateSet(cand({ value: 16, unit: 'lb', barKg: 0 }), { lastTotalKg: 27.22 });
    if (r.status !== 'ask') throw new Error('expected ask');
    const c = r.options.find((o) => o.kind === 'confusable');
    expect(c?.resolved.totalKg).toBe(27.22);
  });
});

describe('equipment without a bar', () => {
  it.each(['dumbbell', 'machine', 'cable', 'bodyweight'] as const)(
    '%s: per side is reinterpreted with a warning and a total is stored',
    (equipment) => {
      const r = validateSet(cand({ equipment, value: 20, mode: 'per_side', barKg: 20 }));
      expect(r.status).toBe('warn');
      if (r.status === 'warn') {
        expect(r.resolved).toMatchObject({ totalKg: 20, barKg: null, perSideKg: null });
        expect(r.issues.map((i) => i.code)).toContain('PER_SIDE_IGNORED');
      }
    },
  );

  it('bodyweight with 0 added kg is ok', () => {
    expect(validateSet(cand({ equipment: 'bodyweight', value: 0, barKg: null })).status).toBe('ok');
  });
});

describe('lb entry at the limits', () => {
  it('1102.3 lb passes the 500 kg limit; 1102.4 lb does not', () => {
    expect(validateSet(cand({ value: 1102.3, unit: 'lb', barKg: 0 })).status).not.toBe('reject');
    expect(validateSet(cand({ value: 1102.4, unit: 'lb', barKg: 0 })).status).toBe('reject');
  });

  it('135 lb on a 45 lb (20.41 kg) bar does not warn about plates', () => {
    const r = validateSet(cand({ value: 135, unit: 'lb', barKg: 20.41 }));
    expect(r.status).toBe('ok');
  });
});

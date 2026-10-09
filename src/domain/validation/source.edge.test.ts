// Edge cases for the tap/voice source of a weight. A failing test here is a suspected bug: do not weaken it.
import { describe, expect, it } from 'vitest';
import { validateSet, type SetCandidate, type ValidationResult } from '.';

type Mode = SetCandidate['weight']['mode'];
const cand = (
  value: number,
  o: Partial<Omit<SetCandidate, 'weight'>> & { mode?: Mode; unit?: 'kg' | 'lb' } = {},
): SetCandidate => ({
  equipment: o.equipment ?? 'barbell',
  weight: { value, unit: o.unit ?? 'kg', mode: o.mode ?? 'total' },
  reps: o.reps ?? 8,
  barKg: o.barKg === undefined ? 20 : o.barKg,
  source: o.source,
});
const codes = (r: ValidationResult) => r.issues.map((i) => i.code);
const kinds = (r: ValidationResult) => (r.status === 'ask' ? r.options.map((o) => o.kind) : []);

describe('a tapped weight that jumps from history', () => {
  it.each([
    // value, last, expected for tap
    [70, 50, 'ok'], // exactly +40% is inside the band
    [30, 50, 'ok'], // exactly -40%
    [70.5, 50, 'warn'],
    [29.5, 50, 'warn'],
    [20, 100, 'warn'], // a big drop is flagged too, and still saved
    [200, 60, 'warn'],
  ] as const)('tap %d after %d is %s', (value, last, status) => {
    const r = validateSet(cand(value, { source: 'tap' }), { lastTotalKg: last });
    expect(r.status === 'ok' || r.status === 'warn' ? r.status : 'other').toBe(status);
    if (status === 'warn') expect(codes(r)).toContain('LARGE_JUMP');
  });

  it('keeps the plate warning next to the jump warning', () => {
    const r = validateSet(cand(100.5, { source: 'tap' }), { lastTotalKg: 60 });
    expect(r.status).toBe('warn');
    expect(codes(r)).toEqual(expect.arrayContaining(['LARGE_JUMP', 'PLATE_INCREMENT']));
  });

  it('resolves a tapped jump to exactly the number that was tapped', () => {
    const r = validateSet(cand(120, { source: 'tap' }), { lastTotalKg: 60 });
    if (r.status !== 'warn') throw new Error(`expected warn, got ${r.status}`);
    expect(r.resolved).toMatchObject({
      totalKg: 120,
      barKg: 20,
      perSideKg: 50,
      inputMode: 'total',
    });
  });

  it('still asks for a tapped jump when the weight has an unstated mode and per side fits history', () => {
    const r = validateSet(cand(30, { source: 'tap', mode: 'unspecified' }), { lastTotalKg: 100 });
    expect(r.status).toBe('ask');
    expect(kinds(r)).toContain('per_side');
  });

  it('keeps the per-side-ignored warning on a tapped dumbbell jump', () => {
    const r = validateSet(
      cand(40, { source: 'tap', equipment: 'dumbbell', barKg: null, mode: 'per_side' }),
      { lastTotalKg: 20 },
    );
    expect(r.status).toBe('warn');
    expect(codes(r)).toEqual(expect.arrayContaining(['PER_SIDE_IGNORED', 'LARGE_JUMP']));
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    'treats a last total of %s as no history, for a tap too',
    (lastTotalKg) => {
      const r = validateSet(cand(100, { source: 'tap' }), { lastTotalKg });
      expect(r.status).toBe('ok');
    },
  );
});

describe('a tapped weight that is not allowed, whatever the source', () => {
  it.each(['tap', 'voice', undefined] as const)(
    'rejects 501 kg and 0 reps for source %s',
    (source) => {
      expect(validateSet(cand(501, { source }), {}).status).toBe('reject');
      expect(validateSet(cand(60, { source, reps: 0 }), {}).status).toBe('reject');
      expect(validateSet(cand(60, { source, reps: 101 }), {}).status).toBe('reject');
      expect(validateSet(cand(251, { source, mode: 'per_side', barKg: 0 }), {}).status).toBe(
        'reject',
      );
    },
  );

  it('rejects a per-side tap on bar equipment with no bar, never guessing a bar', () => {
    const r = validateSet(cand(20, { source: 'tap', mode: 'per_side', barKg: null }), {});
    expect(r.status).toBe('reject');
    expect(codes(r)).toContain('MISSING_BAR');
  });
});

describe('invariants over many tapped and spoken weights', () => {
  const bars = [0, 15, 20];
  const values = [0, 5, 10, 13, 14, 15, 16, 17, 18, 19, 20, 30, 40, 50, 60, 62.5, 100, 140, 250];
  const histories = [undefined, 30, 60, 100];
  const modes: Mode[] = ['total', 'per_side', 'unspecified'];

  it('holds for every combination', () => {
    for (const source of ['tap', 'voice'] as const)
      for (const barKg of bars)
        for (const value of values)
          for (const mode of modes)
            for (const lastTotalKg of histories) {
              const r = validateSet(cand(value, { source, barKg, mode }), { lastTotalKg });
              const label = JSON.stringify({ source, barKg, value, mode, lastTotalKg });
              if (r.status === 'ask') {
                expect(r.options.length, label).toBeGreaterThan(0);
                if (source === 'tap') {
                  expect(kinds(r), label).not.toContain('confusable');
                  expect(codes(r), label).not.toContain('CONFUSABLE_NUMBER');
                }
                // a single option plus nothing else means the user is asked a question with no choice
                if (source === 'tap') expect(r.options.length, label).toBeGreaterThan(1);
              }
              if (r.status === 'ok' || r.status === 'warn') {
                expect(r.resolved.totalKg, label).toBeGreaterThanOrEqual(0);
                expect(r.resolved.totalKg, label).toBeLessThanOrEqual(500);
              }
            }
  });
});

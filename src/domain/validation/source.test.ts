import { describe, expect, it } from 'vitest';
import { validateSet, type SetCandidate } from '.';

const barbell = (over: Partial<SetCandidate> = {}): SetCandidate => ({
  equipment: 'barbell',
  weight: { value: 16, unit: 'kg', mode: 'total' },
  reps: 8,
  barKg: 15,
  ...over,
});
const last60 = { lastTotalKg: 60 };

describe('where the number came from', () => {
  it('asks "Did you mean 60?" for a misheard sixteen, by default and for voice', () => {
    for (const candidate of [barbell(), barbell({ source: 'voice' })]) {
      const r = validateSet(candidate, last60);
      expect(r.status).toBe('ask');
      if (r.status === 'ask') expect(r.options.map((o) => o.kind)).toContain('confusable');
    }
  });

  it('never suggests a confusable number for a tapped weight: the user chose 16 on purpose', () => {
    const r = validateSet(barbell({ source: 'tap' }), last60);
    const kinds = r.status === 'ask' ? r.options.map((o) => o.kind) : [];
    expect(kinds).not.toContain('confusable');
    expect(JSON.stringify(r)).not.toMatch(/Did you mean|sounds like/);
  });

  it('turns a tapped big jump into a warning, not a prompt with a single choice', () => {
    const r = validateSet(
      barbell({ source: 'tap', weight: { value: 100, unit: 'kg', mode: 'total' } }),
      last60,
    );
    expect(r.status).toBe('warn');
    if (r.status === 'warn') {
      expect(r.resolved.totalKg).toBe(100);
      expect(r.issues.map((i) => i.code)).toContain('LARGE_JUMP');
    }
  });

  it('keeps asking for a spoken big jump, because speech can be wrong', () => {
    const r = validateSet(
      barbell({ source: 'voice', weight: { value: 100, unit: 'kg', mode: 'total' } }),
      last60,
    );
    expect(r.status).toBe('ask');
  });

  it('still asks "total or per side?" for a tapped total below the bar, without the confusable option', () => {
    const r = validateSet(
      barbell({ source: 'tap', barKg: 20, weight: { value: 16, unit: 'kg', mode: 'total' } }),
      last60,
    );
    expect(r.status).toBe('ask');
    if (r.status === 'ask') {
      const kinds = r.options.map((o) => o.kind);
      expect(kinds).toEqual(['per_side', 'total_no_bar']);
      expect(r.issues.map((i) => i.code)).not.toContain('CONFUSABLE_NUMBER');
    }
  });

  it('does not change a tapped weight that fits history', () => {
    const r = validateSet(
      barbell({ source: 'tap', weight: { value: 62.5, unit: 'kg', mode: 'total' } }),
      last60,
    );
    expect(r.status === 'ok' || r.status === 'warn').toBe(true);
  });

  it('never reads an explicit per-side tap as a total, even on a big jump', () => {
    const r = validateSet(
      barbell({ source: 'tap', weight: { value: 40, unit: 'kg', mode: 'per_side' } }),
      last60,
    );
    expect(r.status).toBe('warn');
    if (r.status === 'warn')
      expect(r.resolved).toMatchObject({ inputMode: 'per_side', perSideKg: 40, totalKg: 95 });
  });

  it.each([
    [13, 30],
    [14, 40],
    [15, 50],
    [17, 70],
    [18, 80],
    [19, 90],
  ])('a tapped %i is never replaced by %i', (value) => {
    const r = validateSet(
      barbell({ source: 'tap', barKg: 0, weight: { value, unit: 'kg', mode: 'total' } }),
      {
        lastTotalKg: value === 13 ? 30 : value * 10 - (value % 10) * 10,
      },
    );
    const kinds = r.status === 'ask' ? r.options.map((o) => o.kind) : [];
    expect(kinds).not.toContain('confusable');
  });

  it('gives the same answer for tap and voice when there is no history', () => {
    const tap = validateSet(
      barbell({ source: 'tap', weight: { value: 60, unit: 'kg', mode: 'total' } }),
    );
    const voice = validateSet(
      barbell({ source: 'voice', weight: { value: 60, unit: 'kg', mode: 'total' } }),
    );
    expect(tap).toEqual(voice);
  });
});

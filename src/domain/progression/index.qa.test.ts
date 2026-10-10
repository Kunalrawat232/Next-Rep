// QA pass: adversarial sessions for the progression rules (odd order, ties, limits, hostile data).
import { describe, expect, it } from 'vitest';
import { describeSuggestion, suggest, type Session, type SessionSet } from '.';
import type { BodyPart } from '../exercises';
import type { EquipmentType, Unit } from '../schemas';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 9, minute)).toISOString();
const s = (
  totalKg: number,
  reps: number,
  minute: number,
  barKg: number | null = 20,
): SessionSet => ({
  totalKg,
  barKg,
  reps,
  loggedAt: at(minute),
});

const ask = (
  sessions: Session[],
  over: Partial<{ bodyPart: BodyPart; equipment: EquipmentType; unit: Unit }> = {},
) => suggest({ sessions, bodyPart: 'upper', equipment: 'barbell', unit: 'kg', ...over });

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('input is not changed and its order inside a session does not matter', () => {
  it('works on frozen input', () => {
    const sessions = deepFreeze([
      { sets: [s(60, 8, 1), s(60, 8, 2)] },
      { sets: [s(60, 8, 3), s(60, 5, 4)] },
    ]);
    expect(() => ask(sessions)).not.toThrow();
    expect(ask(sessions)?.kind).toBe('same');
  });

  it('takes the target from the earliest set at the top weight, not the first in the array', () => {
    const late = s(60, 6, 5);
    const early = s(60, 8, 1);
    for (const sets of [
      [late, early],
      [early, late],
    ]) {
      const r = ask([{ sets }]);
      expect(r).toMatchObject({ kind: 'same', reps: 8 });
      expect(r?.basis).toMatchObject({ hit: false, workingSets: 2, targetReps: 8 });
    }
  });

  it('is not fooled by a heavier set logged earlier than the working sets', () => {
    const r = ask([{ sets: [s(80, 1, 1), s(60, 8, 2), s(60, 8, 3)] }]);
    expect(r?.basis).toMatchObject({ lastTotalKg: 80, workingSets: 1, targetReps: 1 });
  });

  // BUG: src/domain/progression/index.ts:55 sets logged at the same instant keep array order, so the target (and hit) depends on it.
  it('gives the same answer for two top sets with an identical timestamp, whatever their order', () => {
    const a = s(60, 8, 1);
    const b = s(60, 5, 1);
    expect(ask([{ sets: [a, b] }])?.kind).toBe(ask([{ sets: [b, a] }])?.kind);
  });
});

describe('sessions that give nothing to go on', () => {
  it.each<[string, Session[]]>([
    ['no sessions', []],
    ['only empty sessions', [{ sets: [] }, { sets: [] }, { sets: [] }]],
    ['only zero-weight sets', [{ sets: [s(0, 10, 1, null), s(0, 12, 2, null)] }]],
    [
      'a heavier old session but a zero-weight last one',
      [{ sets: [s(100, 5, 1)] }, { sets: [s(0, 5, 2, null)] }],
    ],
  ])('%s gives null', (_name, sessions) => {
    expect(ask(sessions)).toBeNull();
  });

  it('skips trailing empty sessions to the latest one with sets', () => {
    expect(ask([{ sets: [s(60, 8, 1)] }, { sets: [] }, { sets: [] }])?.totalKg).toBe(62.5);
  });

  it.each<EquipmentType>(['bodyweight'])(
    'gives null for %s even with heavy history',
    (equipment) => {
      expect(ask([{ sets: [s(20, 10, 1, null)] }], { equipment })).toBeNull();
    },
  );
});

describe('the limit of what can be logged', () => {
  const kgs = [490, 495, 497, 497.5, 498, 499, 499.99, 500];
  it.each(
    kgs.flatMap((kg) =>
      (['kg', 'lb'] as const).flatMap((unit) =>
        [true, false].map((bar) => [kg, unit, bar] as const),
      ),
    ),
  )(
    'last %j kg in %s (bar: %s) never suggests more than 500 kg or a falling weight after a hit',
    (kg, unit, bar) => {
      const r = ask([{ sets: [s(kg, 5, 1, bar ? 20 : null)] }], {
        unit,
        equipment: bar ? 'barbell' : 'machine',
      });
      expect(r).not.toBeNull();
      expect(r!.totalKg).toBeLessThanOrEqual(500);
      expect(r!.totalKg).toBeGreaterThanOrEqual(kg);
      expect(Number.isFinite(r!.totalKg)).toBe(true);
      if (r!.kind === 'same') expect(r!.totalKg).toBe(kg);
    },
  );

  it('says it is as heavy as can be logged at exactly 500 kg', () => {
    const r = ask([{ sets: [s(500, 3, 1)] }])!;
    expect(r.kind).toBe('same');
    expect(describeSuggestion(r, 'kg')).toContain('as heavy as can be logged');
  });
});

describe('decreases', () => {
  it('stays on the bar when two misses happen at the bar weight', () => {
    const miss = (m: number) => ({ sets: [s(20, 8, m), s(20, 5, m + 1)] });
    expect(ask([miss(1), miss(3)])?.kind).toBe('same');
  });

  it('is judged on the first set of each session, even when the target reps changed between them', () => {
    const r = ask([
      { sets: [s(100, 8, 1), s(100, 5, 2)] },
      { sets: [s(100, 10, 3), s(100, 6, 4)] },
    ])!;
    expect(r).toMatchObject({ kind: 'decrease', reps: 10 });
    expect(r.basis.missedTwice).toBe(true);
    expect(r.totalKg).toBeLessThan(100);
    expect(r.totalKg).toBeGreaterThanOrEqual(20);
  });

  it('does not count two misses at weights one hundredth apart as the same weight', () => {
    const r = ask([
      { sets: [s(100, 8, 1), s(100, 5, 2)] },
      { sets: [s(100.01, 8, 3), s(100.01, 5, 4)] },
    ])!;
    expect(r.kind).toBe('same');
    expect(r.totalKg).toBe(100.01);
  });

  it('a hit between two misses resets the count', () => {
    const miss = (m: number) => ({ sets: [s(60, 8, m), s(60, 5, m + 1)] });
    const hit = { sets: [s(60, 8, 20), s(60, 8, 21)] };
    expect(ask([miss(1), hit, miss(30)])?.kind).toBe('same');
  });
});

describe('weights that are not on a plate grid', () => {
  // BUG (low, needs corrupt data): src/domain/progression/index.ts:76 `nearest` does not clamp to the bar, so a stored total below its own bar
  // gives an "increase" to a load below the bar (17.5 kg on a 20 kg bar).
  it('never suggests a barbell load below the bar it was logged with', () => {
    const r = ask([{ sets: [s(15, 8, 1, 20)] }]);
    if (r) expect(r.totalKg).toBeGreaterThanOrEqual(20);
  });

  it('without a bar value on a barbell exercise, steps from zero', () => {
    expect(ask([{ sets: [s(60, 8, 1, null)] }])?.totalKg).toBe(62.5);
  });

  it('keeps off-grid weights exactly when the reps were missed, in either unit', () => {
    for (const unit of ['kg', 'lb'] as const)
      expect(ask([{ sets: [s(61.23, 8, 1), s(61.23, 4, 2)] }], { unit })?.totalKg).toBe(61.23);
  });
});

describe('scale', () => {
  it('copes with a thousand sessions and returns on the last one', () => {
    const sessions: Session[] = Array.from({ length: 1000 }, (_, i) => ({
      sets: [s(60 + (i % 3), 8, i % 50)],
    }));
    const r = ask(sessions);
    expect(r).not.toBeNull();
  });

  it('copes with a session of ten thousand sets', () => {
    const big: SessionSet[] = Array.from({ length: 10_000 }, (_, i) => s(60, 8, i % 50));
    expect(ask([{ sets: big }])?.basis.workingSets).toBe(10_000);
  });
});

describe('describeSuggestion', () => {
  it('names exactly what the numbers say for an off-grid increase', () => {
    const r = ask([{ sets: [s(61, 8, 1)] }])!;
    expect(r.totalKg).toBe(62.5);
    expect(describeSuggestion(r, 'kg')).toBe(
      'You hit 1 × 8 at 61 kg last time, so try 1.5 kg more.',
    );
  });

  it('a single working set always counts as hit, whatever its reps', () => {
    expect(ask([{ sets: [s(60, 1, 1)] }])?.basis.hit).toBe(true);
  });
});

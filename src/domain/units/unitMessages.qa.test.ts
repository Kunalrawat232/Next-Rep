// QA pass: every message the domain writes uses "Kg"/"Lb" in the user's own unit, never a lower-case unit word or the other unit.
import { describe, expect, it } from 'vitest';
import type { EquipmentType, Unit } from '../schemas';
import { validateSet, type SetCandidate } from '../validation';
import { summarizeBars, validateGymForm } from '../gyms';
import { breakdownFor, setSummary } from '../workout';
import { describeSuggestion, suggest } from '../progression';
import { trendText } from '../progress';
import { unitLabel, withUnit } from '../units';

const UNITS: Unit[] = ['kg', 'lb'];
const other = (unit: Unit): Unit => (unit === 'kg' ? 'lb' : 'kg');

/** Every piece of text a result carries. */
function textsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textsOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(textsOf);
  return [];
}

const candidate = (
  equipment: EquipmentType,
  value: number,
  unit: Unit,
  over: Partial<SetCandidate> = {},
): SetCandidate => ({
  equipment,
  weight: { value, unit, mode: 'unspecified' },
  reps: 8,
  barKg: equipment === 'barbell' ? 20 : null,
  ...over,
});

describe('unitLabel', () => {
  it.each([
    ['kg', 'Kg'],
    ['lb', 'Lb'],
  ] as const)('writes %s as %s', (unit, label) => {
    expect(unitLabel(unit)).toBe(label);
    expect(withUnit(60, unit).endsWith(` ${label}`)).toBe(true);
  });
});

describe.each(UNITS)('messages for someone who works in %s', (unit) => {
  const mine = unitLabel(unit);
  const theirs = unitLabel(other(unit));
  const check = (texts: string[]) => {
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      // A unit word is always written "Kg" or "Lb", and always the person's own.
      expect(text, text).not.toMatch(/\b(kg|lb|lbs|kgs|KG|LB)\b/);
      expect(text, text).not.toContain(theirs);
    }
  };
  const typed = (n: number) => (unit === 'kg' ? n : Math.round(n * 2.2));

  it('validation: asks, warns and rejects', () => {
    const cases: [SetCandidate, number | undefined][] = [
      [candidate('barbell', typed(10), unit), undefined], // below the bar
      [candidate('barbell', typed(16), unit), 60], // confusable and jump
      [candidate('barbell', typed(200), unit), 60], // big jump
      [candidate('barbell', typed(61), unit, { source: 'tap' }), 60], // plate warning
      [candidate('barbell', typed(9999), unit), undefined], // out of range
      [
        candidate('barbell', typed(30), unit, {
          weight: { value: typed(30), unit, mode: 'per_side' },
          barKg: null,
        }),
        undefined,
      ], // missing bar
      [candidate('barbell', typed(30), unit, { barKg: 900 }), undefined], // bad bar
      [
        candidate('dumbbell', typed(20), unit, {
          weight: { value: typed(20), unit, mode: 'per_side' },
        }),
        undefined,
      ], // per side ignored
      [
        candidate('barbell', typed(125), unit, {
          weight: { value: typed(62.5), unit, mode: 'per_side' },
          barKg: 20,
        }),
        250,
      ],
    ];
    let withUnits = 0;
    for (const [c, lastTotalKg] of cases) {
      const result = validateSet(c, { displayUnit: unit, lastTotalKg });
      const texts = textsOf(result.status === 'ok' ? [] : result);
      // Some inputs are fine as they are; others must carry at least one unit-bearing message.
      const unitTexts = texts.filter((t) => /\b(Kg|Lb)\b/.test(t) || /kg|lb/i.test(t));
      for (const text of texts) {
        expect(text, text).not.toMatch(/\b(kg|lb|lbs|kgs)\b/);
        expect(text, text).not.toContain(theirs);
      }
      for (const text of unitTexts) expect(text).toContain(mine);
      withUnits += unitTexts.length;
    }
    // The corpus must really produce weight messages, or the checks above would pass on nothing.
    expect(withUnits).toBeGreaterThanOrEqual(6);
  });

  it('validation: a total below the bar names the weights in the shown unit', () => {
    const result = validateSet(candidate('barbell', typed(10), unit), { displayUnit: unit });
    expect(result.status).toBe('ask');
    check(textsOf(result));
    expect(textsOf(result).join(' ')).toContain(mine);
  });

  it('validation: the typed unit can differ from the shown one, and the message follows the shown one', () => {
    const result = validateSet(candidate('barbell', 9999, other(unit)), { displayUnit: unit });
    expect(result.status).toBe('reject');
    check(textsOf(result));
  });

  it('gym form errors', () => {
    const empty = validateGymForm({ barbellKg: '', bars: [] }, unit);
    const big = validateGymForm(
      { barbellKg: '9999', bars: [{ name: 'EZ', weightKg: '0', kind: 'ez_bar' }] },
      unit,
    );
    for (const result of [empty, big]) {
      expect(result.ok).toBe(false);
      if (!result.ok) check(textsOf(result.errors));
    }
  });

  it('bar summary and set breakdowns', () => {
    check([
      summarizeBars(
        {
          id: 'g',
          barbellKg: 20,
          bars: [{ id: 'b', name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' }],
        },
        unit,
      ),
    ]);
    const made = { totalKg: 60, barKg: 20, perSideKg: 20 };
    const odd = { totalKg: 61.37, barKg: 20, perSideKg: null };
    const low = { totalKg: 10, barKg: 20, perSideKg: null };
    check([
      ...textsOf(breakdownFor(made, unit)),
      ...textsOf(breakdownFor(odd, unit)),
      ...textsOf(breakdownFor({ totalKg: 40, barKg: null, perSideKg: null }, unit)),
      ...textsOf(setSummary({ ...made, reps: 8 }, unit)),
      ...textsOf(setSummary({ ...odd, reps: 8 }, unit)),
      ...textsOf(setSummary({ ...low, reps: 8 }, unit)),
    ]);
  });

  it('progression reasons and trend text', () => {
    const session = (reps: number) => ({
      sets: [1, 2, 3].map(() => ({
        totalKg: 60,
        barKg: 20,
        reps,
        loggedAt: '2026-10-01T10:00:00.000Z',
      })),
    });
    const kinds = [
      suggest({ sessions: [session(8)], bodyPart: 'upper', equipment: 'barbell', unit }),
      suggest({
        sessions: [
          session(8),
          {
            sets: [
              { totalKg: 60, barKg: 20, reps: 8, loggedAt: 'x' },
              { totalKg: 60, barKg: 20, reps: 5, loggedAt: 'x' },
            ],
          },
        ],
        bodyPart: 'upper',
        equipment: 'barbell',
        unit,
      }),
      suggest({
        sessions: [{ sets: [{ totalKg: 250, barKg: 20, reps: 8, loggedAt: 'x' }] }],
        bodyPart: 'lower',
        equipment: 'barbell',
        unit,
      }),
    ];
    const texts = kinds.flatMap((s) => (s ? [describeSuggestion(s, unit)] : []));
    expect(texts.length).toBeGreaterThan(0);
    check(texts);
    check([
      trendText({ change: 5, sessions: 2, since: '2026-09-14T10:00:00.000Z' }, unit),
      trendText({ change: -1.25, sessions: 2, since: '2026-09-14T10:00:00.000Z' }, unit),
    ]);
  });
});

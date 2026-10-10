import { describe, expect, it } from 'vitest';
import { suggest, type Session, type SessionSet } from '.';
import type { BodyPart } from '../exercises';
import { usesBar, type EquipmentType, type Unit } from '../schemas';
import { ENTRY_STEP, fromDisplay, toDisplay } from '../units';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EQUIPMENT: EquipmentType[] = [
  'barbell',
  'ez_bar',
  'smith',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
];
const BODY: BodyPart[] = ['upper', 'lower', 'core'];
const BARS = [20, 15, 10.5, 20.41, 7.5];
const WEIGHTS = [0, 2.5, 10, 20, 22.5, 45, 60, 61, 61.23, 62.5, 100, 227.5, 450, 497.5, 499, 500];

describe('whatever the sessions, a suggestion obeys the rules (seeded, 4000 cases)', () => {
  it('holds on random histories in both units', () => {
    const random = mulberry32(20261010);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
    let minute = 0;
    for (let round = 0; round < 4000; round += 1) {
      const equipment = pick(EQUIPMENT);
      const bodyPart = pick(BODY);
      const unit: Unit = random() < 0.5 ? 'kg' : 'lb';
      const bar = usesBar(equipment) ? pick(BARS) : null;
      const sessions: Session[] = Array.from({ length: Math.floor(random() * 5) }, () => ({
        sets: Array.from({ length: Math.floor(random() * 7) }, (): SessionSet => ({
          totalKg: Math.max(pick(WEIGHTS), bar ?? 0),
          barKg: bar,
          reps: 1 + Math.floor(random() * 15),
          loggedAt: new Date(Date.UTC(2026, 9, 1, 9, (minute += 1))).toISOString(),
        })),
      }));
      const snapshot = JSON.stringify(sessions);
      const input = { sessions, bodyPart, equipment, unit };
      const r = suggest(input);
      const label = `${round}: ${equipment} ${bodyPart} ${unit} ${snapshot}`;

      expect(JSON.stringify(sessions), `${label} was changed`).toBe(snapshot);
      expect(suggest(input), `${label} is not the same twice`).toEqual(r);

      const withSets = sessions.filter((s) => s.sets.length > 0);
      const lastSession = withSets.at(-1);
      const top = lastSession
        ? Math.max(...lastSession.sets.map((s) => Math.round(s.totalKg * 100))) / 100
        : 0;
      if (equipment === 'bodyweight' || !lastSession || top <= 0) {
        expect(r, label).toBeNull();
        continue;
      }
      expect(r, label).not.toBeNull();
      const s = r!;
      expect(s.totalKg, label).toBeGreaterThanOrEqual(0);
      expect(s.totalKg, label).toBeLessThanOrEqual(500);
      expect(Math.round(s.totalKg * 100) / 100, label).toBe(s.totalKg);
      if (bar !== null)
        expect(s.totalKg, `${label} is under the bar`).toBeGreaterThanOrEqual(bar - 1e-9);
      if (s.kind === 'same') expect(s.totalKg, label).toBe(top);
      if (s.kind === 'increase') {
        expect(s.totalKg, label).toBeGreaterThan(top);
        expect(s.basis.hit, `${label} added weight after a miss`).toBe(true);
      }
      if (s.kind === 'decrease') {
        expect(s.totalKg, label).toBeLessThan(top);
        expect(s.totalKg, label).toBeGreaterThan(0);
        expect(s.basis.missedTwice, `${label} cut weight without two misses`).toBe(true);
      }
      if (s.kind !== 'same') {
        // On the grid of loadable weights, as shown: the bar plus whole plate pairs.
        const origin = bar === null ? 0 : toDisplay(bar, unit);
        const steps = (toDisplay(s.totalKg, unit) - origin) / ENTRY_STEP.total[unit];
        expect(Math.abs(steps - Math.round(steps)), `${label} is off the grid`).toBeLessThan(0.02);
      }
      // The order of the sets in a session does not matter.
      const shuffled = sessions.map((sess) => ({ sets: [...sess.sets].reverse() }));
      expect(suggest({ ...input, sessions: shuffled }), `${label} depends on set order`).toEqual(r);
    }
  });

  it('never suggests more than the limit even when the last weight is at it', () => {
    for (const unit of ['kg', 'lb'] as const) {
      const r = suggest({
        sessions: [
          { sets: [{ totalKg: 500, barKg: 20, reps: 3, loggedAt: '2026-10-01T09:00:00.000Z' }] },
        ],
        bodyPart: 'lower',
        equipment: 'barbell',
        unit,
      });
      expect(r!.totalKg).toBeLessThanOrEqual(500);
      expect(fromDisplay(toDisplay(r!.totalKg, unit), unit)).toBeLessThanOrEqual(500.01);
    }
  });
});

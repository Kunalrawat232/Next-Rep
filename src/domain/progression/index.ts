// "What to lift today" (ADR-005). Simple, explainable, never coaching. Pure: no React, network or storage.
import type { BodyPart } from '../exercises';
import { TOTAL_KG_RANGE, usesBar, type EquipmentType, type Unit } from '../schemas';
import { ENTRY_STEP, fromDisplay, maxDisplay, toDisplay, withUnit } from '../units';
import { roundKg } from '../weight';

export type SessionSet = { totalKg: number; barKg: number | null; reps: number; loggedAt: string };

/** The sets of one exercise in one finished workout. */
export type Session = { sets: SessionSet[] };

export type SuggestionKind = 'increase' | 'same' | 'decrease';

export type Suggestion = {
  kind: SuggestionKind;
  /** The weight to try, in kg. Exactly last time's weight for `same`. */
  totalKg: number;
  /** The reps to aim for: the target of last session. */
  reps: number;
  /** What the suggestion rests on, for the reason shown. */
  basis: {
    lastTotalKg: number;
    workingSets: number;
    targetReps: number;
    /** Every working set reached the target last time. */
    hit: boolean;
    missedTwice: boolean;
  };
};

/** How much more weight after a good session, in the unit shown: upper body 2.5 kg or 5 lb, lower body 5 kg or 10 lb. */
export const INCREASE: Record<BodyPart, Record<Unit, number>> = {
  upper: { kg: 2.5, lb: 5 },
  core: { kg: 2.5, lb: 5 },
  lower: { kg: 5, lb: 10 },
};

/** How much less after two misses in a row: about a tenth. */
export const DECREASE_FRACTION = 0.1;

/** Weights are compared in hundredths of a kg, as records do, so 61.23 and 61.24 are different weights in every unit. */
const hundredths = (kg: number) => Math.round(kg * 100);
const EPSILON = 1e-9;

const isUsable = (s: SessionSet) =>
  Number.isFinite(s.totalKg) && s.totalKg >= 0 && Number.isInteger(s.reps) && s.reps > 0;

type Working = {
  totalKg: number;
  barKg: number | null;
  sets: SessionSet[];
  targetReps: number;
  hit: boolean;
};

/** The top weight of a session, the sets at it, the reps aimed for (the first of them) and whether every one reached that. */
function working(session: Session): Working | null {
  if (session.sets.length === 0) return null;
  const top = Math.max(...session.sets.map((s) => hundredths(s.totalKg)));
  const sets = session.sets
    .filter((s) => hundredths(s.totalKg) === top)
    .sort(
      (a, b) => (a.loggedAt < b.loggedAt ? -1 : a.loggedAt > b.loggedAt ? 1 : 0) || a.reps - b.reps,
    );
  const first = sets[0]!;
  return {
    totalKg: first.totalKg,
    barKg: first.barKg,
    sets,
    targetReps: first.reps,
    hit: sets.every((s) => s.reps >= first.reps),
  };
}

type Grid = { origin: number; step: number; min: number; max: number };

/**
 * The weights that can be loaded, in the unit shown. Plates go on in pairs, so the total is the bar
 * plus a whole number of plate pairs; without a bar it is a whole number of steps. The bar is the
 * one the last set used, not today's gym.
 */
function gridFor(equipment: EquipmentType, barKg: number | null, unit: Unit): Grid {
  const step = ENTRY_STEP.total[unit];
  const origin = usesBar(equipment) && barKg !== null ? toDisplay(barKg, unit) : 0;
  return { origin, step, min: origin, max: maxDisplay(TOTAL_KG_RANGE.max, unit) };
}

const nearest = (g: Grid, value: number) =>
  g.origin + Math.round((value - g.origin) / g.step) * g.step;
const below = (g: Grid, value: number) =>
  g.origin + Math.floor((value - g.origin) / g.step + EPSILON) * g.step;
const above = (g: Grid, value: number) =>
  g.origin + (Math.floor((value - g.origin) / g.step + EPSILON) + 1) * g.step;

/**
 * What to try next for an exercise, from its finished sessions (oldest first), or null when there is
 * nothing to go on or no weight to change (bodyweight).
 *
 * - Every working set of last session reached the target: more weight (`INCREASE`), on the next
 *   plate pair above last time's.
 * - Not every one did: the same weight, exactly.
 * - Not every one did in the last two sessions at the same weight: about 10% less, on a plate pair.
 *
 * With a single working set, "every set reached the target" is always true, so a lifter who does one
 * top set is told to add weight every session. That is the rule as agreed.
 */
export function suggest(input: {
  sessions: Session[];
  bodyPart: BodyPart;
  equipment: EquipmentType;
  unit: Unit;
}): Suggestion | null {
  const { bodyPart, equipment, unit } = input;
  if (equipment === 'bodyweight') return null;
  // Rows come from the device and are not trusted: a set that is not a real weight and rep count is ignored.
  const sessions = input.sessions.map((session) => ({ sets: session.sets.filter(isUsable) }));
  const last =
    [...sessions]
      .reverse()
      .map(working)
      .find((w) => w !== null) ?? null;
  if (last === null || last.totalKg <= 0) return null;
  const sessionsWithSets = sessions.map(working).filter((w): w is Working => w !== null);
  const before =
    sessionsWithSets.length >= 2 ? sessionsWithSets[sessionsWithSets.length - 2]! : null;
  const missedTwice =
    !last.hit &&
    before !== null &&
    !before.hit &&
    hundredths(before.totalKg) === hundredths(last.totalKg);

  const basis = {
    lastTotalKg: last.totalKg,
    workingSets: last.sets.length,
    targetReps: last.targetReps,
    hit: last.hit,
    missedTwice,
  };
  const same: Suggestion = { kind: 'same', totalKg: last.totalKg, reps: last.targetReps, basis };
  const grid = gridFor(equipment, last.barKg, unit);
  const lastShown = toDisplay(last.totalKg, unit);

  if (last.hit) {
    let target = nearest(grid, lastShown + INCREASE[bodyPart][unit]);
    if (target <= lastShown + EPSILON) target = above(grid, lastShown);
    // Never past the limit: the largest load on the grid that is within it, and nothing if that is no more than last time.
    if (target > grid.max) target = below(grid, grid.max);
    if (target <= lastShown + EPSILON) return same;
    return { kind: 'increase', totalKg: fromDisplay(target, unit), reps: last.targetReps, basis };
  }

  if (missedTwice) {
    // Down to a plate pair, never below the bar (or 0 without one).
    const target = Math.max(grid.min, below(grid, lastShown * (1 - DECREASE_FRACTION)));
    // Never down to nothing: with no bar, 10% of a light weight rounds to zero.
    if (target <= 0 || target >= lastShown - EPSILON) return same;
    return { kind: 'decrease', totalKg: fromDisplay(target, unit), reps: last.targetReps, basis };
  }

  return same;
}

/** Why, in words, in the unit shown. The screen adds that it is a suggestion. */
export function describeSuggestion(suggestion: Suggestion, unit: Unit): string {
  const { basis, kind } = suggestion;
  const last = withUnit(basis.lastTotalKg, unit);
  if (kind === 'increase') {
    const more = roundKg(toDisplay(suggestion.totalKg, unit) - toDisplay(basis.lastTotalKg, unit));
    return `You hit ${basis.workingSets} × ${basis.targetReps} at ${last} last time, so try ${more} ${unit} more.`;
  }
  if (kind === 'decrease')
    return `You did not reach ${basis.targetReps} reps on every set at ${last} twice in a row, so try about 10% less.`;
  if (basis.hit)
    return `You hit ${basis.workingSets} × ${basis.targetReps} at ${last} last time, and that is as heavy as can be logged.`;
  return `You did not reach ${basis.targetReps} reps on every set at ${last} last time, so stay at that weight.`;
}

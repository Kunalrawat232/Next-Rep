import type { Unit } from '../schemas';
import { toDisplay } from '../units';

export type RecordKind = 'weight' | 'reps';

type Logged = { id: string; exerciseId: string; loggedAt: string; totalKg: number; reps: number };

/**
 * Weights are compared as the user sees them, in hundredths of the shown unit: 62.5 and
 * 62.50000000001 kg are the same weight, and so are 60 kg and 60.01 kg when both read 132.3 lb
 * (a weight typed in lb comes back from kg a hundredth away). So whether a set is a record never
 * differs from what the screen shows.
 */
const hundredths = (kg: number, unit: Unit) => Math.round(toDisplay(kg, unit) * 100);

const byTime = (a: Logged, b: Logged) =>
  a.loggedAt < b.loggedAt
    ? -1
    : a.loggedAt > b.loggedAt
      ? 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0;

/**
 * Which sets were a personal record when they were logged, by looking only at the sets before them
 * (by time, then id) of the same exercise. A record is one of:
 * - `weight`: heavier than every earlier set. Never the first set, and never at 0 kg.
 * - `reps`: more reps than any earlier set at exactly that weight. Needs an earlier set at that weight.
 * A set is at most one kind. One pass over the sets, so it is cheap for long histories.
 */
export function recordMarks(sets: Logged[], unit: Unit): Map<string, RecordKind> {
  const marks = new Map<string, RecordKind>();
  const history = new Map<string, { heaviest: number; repsAt: Map<number, number> }>();
  for (const set of [...sets].sort(byTime)) {
    const weight = hundredths(set.totalKg, unit);
    const seen = history.get(set.exerciseId);
    if (!seen) {
      history.set(set.exerciseId, { heaviest: weight, repsAt: new Map([[weight, set.reps]]) });
      continue;
    }
    const bestReps = seen.repsAt.get(weight);
    if (weight > seen.heaviest) marks.set(set.id, 'weight');
    else if (bestReps !== undefined && set.reps > bestReps) marks.set(set.id, 'reps');
    seen.heaviest = Math.max(seen.heaviest, weight);
    seen.repsAt.set(weight, Math.max(bestReps ?? 0, set.reps));
  }
  return marks;
}

export type SessionBest = {
  workoutId: string;
  /** The top set itself, and when it was logged. */
  setId: string;
  at: string;
  totalKg: number;
  reps: number;
};

/**
 * The top set of each workout for one exercise, oldest workout first: the heaviest, and on a tie
 * the one with more reps. `at` is when that top set was logged.
 */
export function sessionBests(sets: (Logged & { workoutId: string })[], unit: Unit): SessionBest[] {
  const best = new Map<string, Logged & { workoutId: string }>();
  for (const set of [...sets].sort(byTime)) {
    const top = best.get(set.workoutId);
    const better =
      !top ||
      hundredths(set.totalKg, unit) > hundredths(top.totalKg, unit) ||
      (hundredths(set.totalKg, unit) === hundredths(top.totalKg, unit) && set.reps > top.reps);
    if (better) best.set(set.workoutId, set);
  }
  return [...best.values()].sort(byTime).map((s) => ({
    workoutId: s.workoutId,
    setId: s.id,
    at: s.loggedAt,
    totalKg: s.totalKg,
    reps: s.reps,
  }));
}

export type Records = {
  /** The heaviest set so far; on a tie the one with more reps, then the earlier one. */
  /** Null when nothing was ever lifted above 0 kg (bodyweight only). */
  heaviest: { totalKg: number; reps: number; setId: string; loggedAt: string } | null;
  /** The most reps at each weight, heaviest weight first. */
  repsAtWeight: { totalKg: number; reps: number; setId: string; loggedAt: string }[];
};

/** The current best of one exercise. */
export function currentRecords(sets: Logged[], unit: Unit): Records {
  const atWeight = new Map<number, Logged>();
  for (const set of [...sets].sort(byTime)) {
    const top = atWeight.get(hundredths(set.totalKg, unit));
    if (!top || set.reps > top.reps) atWeight.set(hundredths(set.totalKg, unit), set);
  }
  const all = [...atWeight.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, s]) => ({ totalKg: s.totalKg, reps: s.reps, setId: s.id, loggedAt: s.loggedAt }));
  return { heaviest: all[0] && all[0].totalKg > 0 ? all[0] : null, repsAtWeight: all };
}

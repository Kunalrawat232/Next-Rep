import { cleanText } from './clean';
import { groupByExercise, topSet } from '../history';
import type { Unit } from '../schemas';
import { toDisplay } from '../units';
import {
  COACH_HISTORY_MAX,
  CoachContextSchema,
  type CoachContext,
  type CoachTurn,
} from './schemas';

export * from './schemas';
export { cleanQuestion, cleanText } from './clean';

const DAY_MS = 24 * 60 * 60 * 1000;
/** The last few turns of a chat, the most recent ones. */
export function lastTurns<T>(turns: readonly T[], max: number = COACH_HISTORY_MAX): T[] {
  return turns.slice(Math.max(0, turns.length - max));
}

export type CoachInput = {
  unit: Unit;
  now: Date;
  /** Finished workouts with their sets, in any order. Rows that are not readable are ignored. */
  workouts: {
    startedAt: string;
    sets: { exerciseId: string; totalKg: number; reps: number; loggedAt: string }[];
  }[];
  /** The name of an exercise, or undefined when it is not known. */
  nameOf: (exerciseId: string) => string | undefined;
  /** What Next Rep's own rules suggest next, in kg. */
  suggestion?: { exerciseId: string; totalKg: number; reps: number } | null;
};

const shown = (kg: number, unit: Unit) => Math.round(toDisplay(kg, unit) * 10) / 10;
const tidyName = (name: string) => cleanText(name, 200).replace(/\s+/g, ' ').trim().slice(0, 40);

/**
 * What the coach is told: the last three finished workouts and the suggestion, as small numbers in the user's
 * unit. It carries no ids and no account details, and what it returns always passes the shared schema.
 */
export function buildCoachContext(input: CoachInput): CoachContext {
  const readable = (set: { totalKg: number; reps: number }) =>
    Number.isFinite(set.totalKg) && set.totalKg >= 0 && Number.isInteger(set.reps) && set.reps > 0;
  const sessions = input.workouts
    .map((workout) => ({ at: Date.parse(workout.startedAt), sets: workout.sets.filter(readable) }))
    .filter((workout) => Number.isFinite(workout.at) && workout.sets.length > 0)
    .sort((a, b) => b.at - a.at)
    .slice(0, 3)
    .map((workout) => ({
      daysAgo: Math.max(0, Math.min(3650, Math.floor((input.now.getTime() - workout.at) / DAY_MS))),
      exercises: groupByExercise(workout.sets)
        .flatMap(({ exerciseId, sets }) => {
          const name = tidyName(input.nameOf(exerciseId) ?? 'Custom exercise') || 'Custom exercise';
          const best = topSet(sets);
          return best
            ? [
                {
                  name,
                  sets: sets.length,
                  topWeight: shown(best.top.totalKg, input.unit),
                  topReps: best.top.reps,
                },
              ]
            : [];
        })
        .slice(0, 8),
    }));

  const context: CoachContext = { unit: input.unit, sessions };
  const next = input.suggestion;
  const name = next ? tidyName(input.nameOf(next.exerciseId) ?? '') : '';
  if (next && name && readable(next))
    context.suggestion = {
      exercise: name,
      weight: shown(next.totalKg, input.unit),
      reps: next.reps,
    };
  // Whatever the inputs were, only something the function will accept is ever returned.
  return CoachContextSchema.parse(context);
}

/** A chat message as the app keeps it. */
export type ChatMessage = CoachTurn & { id: string; at: number };

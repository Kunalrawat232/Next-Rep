import type { Exercise } from '../../domain/exercises';
import { barFor, type Gym } from '../../domain/gyms';
import { ISSUE, needsFallback, type ParseResult } from '../../domain/parser';
import type { Unit } from '../../domain/schemas';
import type { SetCandidate } from '../../domain/validation';

export type VoiceContext = {
  exercises: readonly Exercise[];
  /** The gym of the open workout; its bar is added to bar exercises. */
  gym: Pick<Gym, 'barbellKg' | 'bars'> | undefined;
  /** The unit used when a weight is said without one. */
  unit: Unit;
};

/** A weight as the person said it, with the unit and per side or total as spoken (or not said). */
export type SpokenWeight = NonNullable<ParseResult['weight']>;

/** A set whose exercise and one number are sure and the other number was not said: the screen asks for it. */
export type PartialDraft =
  | { kind: 'partial'; missing: 'reps'; exercise: Exercise; weight: SpokenWeight }
  | { kind: 'partial'; missing: 'weight'; exercise: Exercise; reps: number };

export type UnclearReason =
  'nothing_heard' | 'not_understood' | 'no_exercise' | 'no_weight' | 'no_reps' | 'unsure';

/**
 * What a transcript means for the screen. A set is only a candidate: it still goes through the validators
 * and is shown to the user before anything is stored. `edit` carries the new numbers as spoken.
 */
export type VoiceDraft =
  | { kind: 'set'; exercise: Exercise; reps: number; candidate: SetCandidate }
  | { kind: 'repeat'; reps?: number; weight?: NonNullable<ParseResult['weight']> }
  | { kind: 'undo' }
  | { kind: 'edit'; reps?: number; weight?: NonNullable<ParseResult['weight']> }
  | { kind: 'rest'; seconds: number }
  | PartialDraft
  | { kind: 'unclear'; reason: UnclearReason };

/** Friendly words for each reason a phrase could not be used. */
export const UNCLEAR_MESSAGE: Record<UnclearReason, string> = {
  nothing_heard: 'Nothing was heard. Tap the mic and try again.',
  not_understood: 'That was not understood. Try "bench press 60 kilo 8 reps".',
  no_exercise: 'Which exercise? Say its name, or open the exercise first.',
  no_weight: 'How much weight? Try "bench press 60 kilo 8 reps".',
  no_reps: 'How many reps? Try "bench press 60 kilo 8 reps".',
  unsure: 'Not sure what was said. Check it below, or say it again.',
};

function reasonFor(result: ParseResult): UnclearReason {
  const { issues } = result;
  if (issues.includes(ISSUE.NO_SPEECH)) return 'nothing_heard';
  if (result.intent === 'unknown') return 'not_understood';
  if (issues.includes(ISSUE.NO_EXERCISE)) return 'no_exercise';
  if (issues.includes(ISSUE.NO_WEIGHT)) return 'no_weight';
  if (issues.includes(ISSUE.NO_REPS)) return 'no_reps';
  return 'unsure';
}

/** Turns a parse result into something the screen can act on. Pure; trusts nothing the parser said about weights. */
export function draftFromParse(result: ParseResult, context: VoiceContext): VoiceDraft {
  switch (result.intent) {
    case 'undo_last':
      return { kind: 'undo' };
    case 'repeat_last':
      return { kind: 'repeat', reps: result.reps, weight: result.weight };
    case 'edit_last':
      return result.reps === undefined && result.weight === undefined
        ? { kind: 'unclear', reason: 'not_understood' }
        : { kind: 'edit', reps: result.reps, weight: result.weight };
    case 'rest_timer':
      return result.restSeconds === undefined
        ? { kind: 'unclear', reason: 'not_understood' }
        : { kind: 'rest', seconds: result.restSeconds };
    case 'unknown':
      return { kind: 'unclear', reason: reasonFor(result) };
    case 'log_set':
      return setDraft(result, context);
  }
}

// What the parser may have flagged when only a number is missing: nothing else is in doubt.
const ONLY_REPS_MISSING: readonly string[] = [ISSUE.NO_REPS, ISSUE.AMBIGUOUS_WEIGHT_MODE];
const ONLY_WEIGHT_MISSING: readonly string[] = [ISSUE.NO_WEIGHT];

/** The exercise and one number are sure and the other was not said: ask for it instead of starting over. */
function partialDraft(result: ParseResult, exercises: readonly Exercise[]): PartialDraft | null {
  const exercise = exercises.find((e) => e.id === result.exerciseId);
  if (!exercise) return null;
  const onlyIssues = (allowed: readonly string[]) =>
    result.issues.every((issue) => allowed.includes(issue));
  if (result.reps === undefined && result.weight !== undefined && onlyIssues(ONLY_REPS_MISSING))
    return { kind: 'partial', missing: 'reps', exercise, weight: result.weight };
  if (
    result.weight === undefined &&
    result.reps !== undefined &&
    exercise.equipmentType !== 'bodyweight' &&
    onlyIssues(ONLY_WEIGHT_MISSING)
  )
    return { kind: 'partial', missing: 'weight', exercise, reps: result.reps };
  return null;
}

function setFrom(
  exercise: Exercise,
  weight: SpokenWeight,
  reps: number,
  gym: VoiceContext['gym'],
): Extract<VoiceDraft, { kind: 'set' }> {
  return {
    kind: 'set',
    exercise,
    reps,
    candidate: {
      equipment: exercise.equipmentType,
      weight,
      reps,
      barKg: gym ? (barFor(gym, exercise.equipmentType) ?? null) : null,
      source: 'voice',
    },
  };
}

function setDraft(result: ParseResult, { exercises, gym, unit }: VoiceContext): VoiceDraft {
  const partial = partialDraft(result, exercises);
  if (partial) return partial;
  if (needsFallback(result)) return { kind: 'unclear', reason: reasonFor(result) };
  const exercise = exercises.find((e) => e.id === result.exerciseId);
  if (!exercise) return { kind: 'unclear', reason: 'no_exercise' };
  if (result.reps === undefined) return { kind: 'unclear', reason: 'no_reps' };
  const bodyweight = exercise.equipmentType === 'bodyweight';
  // A bodyweight set with no number logs added weight 0.
  if (result.weight === undefined && !bodyweight) return { kind: 'unclear', reason: 'no_weight' };
  const weight = result.weight ?? { value: 0, unit, mode: 'total' as const };
  return setFrom(exercise, weight, result.reps, gym);
}

/** The reps the person gave after being asked: the set as it would have been had they said them at first. */
export function withReps(
  partial: Extract<PartialDraft, { missing: 'reps' }>,
  reps: number,
  { gym }: Pick<VoiceContext, 'gym'>,
): Extract<VoiceDraft, { kind: 'set' }> {
  return setFrom(partial.exercise, partial.weight, reps, gym);
}

/** The weight the person gave after being asked, in the unit they use; no per side or total word, so they choose on the next card. */
export function withWeight(
  partial: Extract<PartialDraft, { missing: 'weight' }>,
  weight: SpokenWeight,
  { gym }: Pick<VoiceContext, 'gym'>,
): Extract<VoiceDraft, { kind: 'set' }> {
  return setFrom(partial.exercise, weight, partial.reps, gym);
}

/** The part of a stored set that "same again" copies. */
export type RepeatSource = { exerciseId: string; totalKg: number; reps: number };

/**
 * "Same again", "same weight 8 reps": the last set with whatever was said instead. The copied weight is the
 * stored total, so it is read as a total; a spoken weight is reported as spoken like any other set.
 */
export function repeatDraft(
  repeat: Extract<VoiceDraft, { kind: 'repeat' }>,
  source: RepeatSource,
  { exercises, gym }: VoiceContext,
): Extract<VoiceDraft, { kind: 'set' }> | null {
  const exercise = exercises.find((e) => e.id === source.exerciseId);
  if (!exercise) return null;
  const reps = repeat.reps ?? source.reps;
  const weight = repeat.weight ?? {
    value: source.totalKg,
    unit: 'kg' as const,
    mode: 'total' as const,
  };
  return setFrom(exercise, weight, reps, gym);
}

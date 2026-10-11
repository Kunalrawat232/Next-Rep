import type { Exercise } from '../exercises';
import type { Unit } from '../schemas';
import { PARSER_CONFIG } from './config';
import { matchExercise, type ExerciseMatch } from './exercise';
import { detectCommand, looksLikeInjection, withoutWake, type Command } from './intent';
import { ISSUE } from './issues';
import { isNumberWord, mergeNumbers } from './numbers';
import { readDuration, readQuantities, type Quantities, type Weight } from './quantities';
import type { ParseResult } from './schema';
import { FILLER, tokenize, type Token } from './tokens';
import { PER_SIDE_PHRASES, REP_PREFIXES, REP_WORDS, TOTAL_WORDS, unitOf } from './vocabulary';

export type ParseContext = {
  /** Every exercise the user can log: curated, imported and their own. The array must not be changed in place. */
  exercises: readonly Exercise[];
  /** Used when a weight is spoken without a unit. */
  unit: Unit;
  /** The exercise of the open workout's last set, used when none is spoken. */
  currentExerciseId?: string;
};

type Parsed = Omit<ParseResult, 'rawTranscript' | 'source'>;

const unknown = (...issues: string[]): Parsed => ({ intent: 'unknown', confidence: 0, issues });

const isReserved = (word: string): boolean =>
  unitOf(word) !== undefined ||
  REP_WORDS.has(word) ||
  REP_PREFIXES.has(word) ||
  TOTAL_WORDS.has(word) ||
  isNumberWord(word) ||
  FILLER.has(word) ||
  PER_SIDE_PHRASES.some((pair) => pair.includes(word));

const round = (value: number): number => Math.round(value * 100) / 100;
const clamp = (value: number): number => round(Math.min(1, Math.max(0, value)));

/** Words nobody explained: not filler, not used. Many of them means the transcript is mostly something else. */
function unexplained(
  tokens: readonly Token[],
  quantities: Quantities,
  end = tokens.length,
): number {
  return tokens
    .slice(0, end)
    .filter((token, i) => token.kind === 'word' && !quantities.used[i] && !FILLER.has(token.text))
    .length;
}

/** The weight with its mode. Without a per-side or total word, or with both, the mode is unspecified. */
function weightField(
  weight: Weight | undefined,
  quantities: Quantities,
  issues: string[],
): Parsed['weight'] {
  if (!weight) return undefined;
  const mode =
    quantities.perSide === quantities.total
      ? 'unspecified'
      : quantities.perSide
        ? 'per_side'
        : 'total';
  if (mode === 'unspecified') issues.push(ISSUE.AMBIGUOUS_WEIGHT_MODE);
  return { ...weight, mode };
}

type Settled = { weight?: Weight; reps?: number; extra: number };

/**
 * Gives the numbers that came with no marker a job: the first is the weight (in the user's unit), the next the
 * reps. With `repsFirst`, a single bare number is the reps. Reps must be a whole number above 0.
 */
function settle(quantities: Quantities, unit: Unit, repsFirst: boolean): Settled {
  const spare = [...quantities.spare];
  let { weight, reps } = quantities;
  if (repsFirst && !weight && reps === undefined && spare.length === 1) reps = spare.shift();
  const first = spare.shift();
  if (!weight && first !== undefined) weight = { value: first, unit };
  else if (first !== undefined) spare.unshift(first);
  if (reps === undefined) reps = spare.shift();
  let extra = spare.length;
  if (reps !== undefined && !(Number.isInteger(reps) && reps > 0)) {
    reps = undefined;
    extra += 1;
  }
  return { ...(weight ? { weight } : {}), ...(reps !== undefined ? { reps } : {}), extra };
}

export function parseCore(transcript: string, context: ParseContext): Parsed {
  if (transcript.length > PARSER_CONFIG.maxChars) return unknown(ISSUE.TOO_LONG);
  const spoken = tokenize(transcript);
  if (spoken.length > PARSER_CONFIG.maxTokens) return unknown(ISSUE.TOO_LONG);
  if (looksLikeInjection(spoken)) return unknown(ISSUE.SUSPICIOUS_INPUT);
  const words = withoutWake(spoken);
  if (words.length === 0) return unknown(ISSUE.NO_SPEECH);

  const command = detectCommand(words);
  if (command?.kind === 'undo_last') return { intent: 'undo_last', confidence: 1, issues: [] };
  if (command) return parseCommand(command, context);
  return parseSet(words, context);
}

/** "rest 90 seconds", "same again", "make it 62.5": a command word and the numbers after it. */
function parseCommand(command: Command, context: ParseContext): Parsed {
  const tokens = mergeNumbers(command.rest, new Set(), null);
  const quantities = readQuantities(tokens);
  const issues: string[] = [];

  if (command.kind === 'rest_timer') {
    const restSeconds = readDuration(tokens);
    if (restSeconds === undefined) return unknown();
    const confidence = unexplained(tokens, quantities) > PARSER_CONFIG.maxLeftoverWords ? 0.7 : 1;
    return { intent: 'rest_timer', restSeconds, confidence, issues };
  }

  // A command followed by words we do not know ("same old story") is not a command.
  if (unexplained(tokens, quantities) > 0) return unknown();
  const edit = command.kind === 'edit_last';
  const { weight: spoken, reps, extra } = settle(quantities, context.unit, !edit);
  const weight = weightField(spoken, quantities, issues);
  if (edit && !weight && reps === undefined) return unknown();
  const result: Parsed = { intent: command.kind, confidence: 1, issues };
  if (weight) result.weight = weight;
  if (reps !== undefined) result.reps = reps;
  if (extra > 0) {
    issues.push(ISSUE.EXTRA_NUMBER);
    result.confidence = 0.7;
  }
  return result;
}

type Evidence = {
  exercise: ExerciseMatch | null;
  hasExercise: boolean;
  bodyweight: boolean;
  weight: boolean;
  reps: boolean;
  extra: number;
  unexplained: number;
  unexplainedBeforeNumbers: number;
};

/** How sure we are, and why not: the issues are the reasons, the confidence only ever goes down. */
function scoreSet(e: Evidence, issues: string[]): number {
  let confidence = 1;
  if (!e.hasExercise) {
    issues.push(ISSUE.NO_EXERCISE);
    confidence = Math.min(confidence, 0.4);
  }
  if (e.exercise) {
    confidence *= e.exercise.score;
    if (e.exercise.ambiguous || e.exercise.score < PARSER_CONFIG.sureExerciseScore) {
      issues.push(ISSUE.LOW_EXERCISE_MATCH);
      if (e.exercise.ambiguous) confidence = Math.min(confidence, 0.7);
    }
  }
  // Words before the numbers that named nothing: probably an exercise we do not have.
  if (e.unexplainedBeforeNumbers > 0) {
    issues.push(ISSUE.UNKNOWN_EXERCISE_WORDS);
    confidence = Math.min(confidence, 0.6);
  }
  if (!e.weight && !e.bodyweight) {
    issues.push(ISSUE.NO_WEIGHT);
    confidence = Math.min(confidence, 0.5);
  }
  if (!e.reps) {
    issues.push(ISSUE.NO_REPS);
    confidence = Math.min(confidence, 0.5);
  }
  if (e.extra > 0) {
    issues.push(ISSUE.EXTRA_NUMBER);
    confidence *= 0.7;
  }
  if (e.unexplained > PARSER_CONFIG.maxLeftoverWords) {
    issues.push(ISSUE.UNRECOGNISED_WORDS);
    confidence *= 0.7;
  }
  return confidence;
}

/** "bench press bench press 60 kilo": a name said twice is one exercise; the second saying is dropped. */
function withoutRepeats(
  words: readonly string[],
  match: ExerciseMatch | null,
): { words: readonly string[]; exercise: ExerciseMatch | null } {
  if (!match) return { words, exercise: null };
  const size = match.end - match.start;
  const phrase = words.slice(match.start, match.end).join(' ');
  const drop = new Set<number>();
  for (let i = 0; i + size <= words.length; i += 1) {
    const overlaps = i < match.end && i + size > match.start;
    if (!overlaps && words.slice(i, i + size).join(' ') === phrase)
      for (let k = i; k < i + size; k += 1) drop.add(k);
  }
  if (drop.size === 0) return { words, exercise: match };
  const before = [...drop].filter((i) => i < match.start).length;
  return {
    words: words.filter((_, i) => !drop.has(i)),
    exercise: { ...match, start: match.start - before, end: match.end - before },
  };
}

/** A set: an exercise (spoken, or the current one), a weight and reps, in the ways the grammar allows. */
function parseSet(words: readonly string[], context: ParseContext): Parsed {
  const found = matchExercise(words, context.exercises, isReserved);
  const { words: heard, exercise } = withoutRepeats(words, found);
  const skip = new Set<number>();
  if (exercise) for (let i = exercise.start + 1; i < exercise.end; i += 1) skip.add(i);
  const tokens = mergeNumbers(heard, skip, exercise ? exercise.start : null);
  const firstNumber = tokens.findIndex((token) => token.kind === 'num');
  if (firstNumber === -1) return unknown();

  const quantities = readQuantities(tokens);
  const current = context.exercises.find((e) => e.id === context.currentExerciseId);
  // Numbers with no exercise and no unit or rep word ("alert 1") are not a set.
  const marked = quantities.weight !== undefined || quantities.reps !== undefined;
  if (!exercise && !current && !marked) return unknown();

  const known = exercise?.exercise ?? current;
  const bodyweight = known?.equipmentType === 'bodyweight';
  const issues: string[] = [];
  const { weight: spoken, reps, extra } = settle(quantities, context.unit, bodyweight);
  const weight = weightField(spoken, quantities, issues);
  const confidence = scoreSet(
    {
      exercise,
      hasExercise: known !== undefined,
      bodyweight,
      weight: weight !== undefined,
      reps: reps !== undefined,
      extra,
      unexplained: unexplained(tokens, quantities),
      unexplainedBeforeNumbers: unexplained(tokens, quantities, firstNumber),
    },
    issues,
  );

  const result: Parsed = { intent: 'log_set', confidence: clamp(confidence), issues };
  if (known) result.exerciseId = known.id;
  if (exercise) result.exerciseMatchScore = round(exercise.score);
  if (weight) result.weight = weight;
  if (reps !== undefined) result.reps = reps;
  return result;
}

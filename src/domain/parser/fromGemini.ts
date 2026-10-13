// Turns what Gemini answered into the same ParseResult the local parser makes, so the rest of the app has one path.
// Gemini is untrusted: its numbers are only carried over to be validated and shown, the exercise is matched here
// by the local matcher, and its own confidence can only lower ours, never raise it.
import { ISSUE } from './issues';
import { matchExercise } from './exercise';
import type { GeminiOutput } from './gemini';
import { clamp, round, scoreSet, type ParseContext } from './parse';
import { ParseResultSchema, type ParseResult } from './schema';
import { tokenize } from './tokens';

const KNOWN_ISSUES: ReadonlySet<string> = new Set(Object.values(ISSUE));

function failed(transcript: string): ParseResult {
  return {
    intent: 'unknown',
    confidence: 0,
    issues: [ISSUE.PARSE_FAILED],
    rawTranscript: transcript,
    source: 'gemini',
  };
}

/** Never throws: anything that does not fit the schema comes back as `unknown`. */
export function fromGemini(
  output: GeminiOutput,
  context: ParseContext,
  transcript: string,
): ParseResult {
  const result = build(output, context, transcript);
  const checked = ParseResultSchema.safeParse(result);
  return checked.success ? checked.data : failed(transcript);
}

function build(output: GeminiOutput, context: ParseContext, transcript: string): ParseResult {
  const base = { rawTranscript: transcript, source: 'gemini' } as const;
  const none = { intent: 'unknown', confidence: 0, issues: [], ...base } satisfies ParseResult;
  // Only codes the app knows are kept; whatever else Gemini wrote is dropped.
  const issues = output.issues.filter((code) => KNOWN_ISSUES.has(code));
  const heard = clamp(output.confidence);

  switch (output.intent) {
    case 'unknown':
      return none;
    case 'undo_last':
      return { intent: 'undo_last', confidence: heard, issues, ...base };
    case 'rest_timer':
      return output.restSeconds === null
        ? none
        : {
            intent: 'rest_timer',
            restSeconds: output.restSeconds,
            confidence: heard,
            issues,
            ...base,
          };
    case 'repeat_last':
    case 'edit_last': {
      if (output.intent === 'edit_last' && output.weight === null && output.reps === null)
        return none;
      const result: ParseResult = { intent: output.intent, confidence: heard, issues, ...base };
      if (output.weight) result.weight = output.weight;
      if (output.reps !== null) result.reps = output.reps;
      return result;
    }
    case 'log_set':
      return logSet(output, context, issues, heard, base);
  }
}

function logSet(
  output: GeminiOutput,
  context: ParseContext,
  issues: string[],
  heard: number,
  base: { rawTranscript: string; source: 'gemini' },
): ParseResult {
  const named = output.exerciseName !== null;
  const match = named
    ? matchExercise(tokenize(output.exerciseName ?? ''), context.exercises, () => false)
    : null;
  // A name we do not have is never swapped for the current exercise: that would log the wrong lift.
  const known = named
    ? match?.exercise
    : context.exercises.find((e) => e.id === context.currentExerciseId);
  const bodyweight = known?.equipmentType === 'bodyweight';
  const scored: string[] = [];
  const structural = scoreSet(
    {
      exercise: match,
      hasExercise: known !== undefined,
      bodyweight,
      weight: output.weight !== null,
      reps: output.reps !== null,
      extra: 0,
      unexplained: 0,
      unexplainedBeforeNumbers: named && !match ? 1 : 0,
    },
    scored,
  );
  if (output.weight?.mode === 'unspecified') scored.push(ISSUE.AMBIGUOUS_WEIGHT_MODE);

  const result: ParseResult = {
    intent: 'log_set',
    // Gemini's own number may lower the result, never raise it.
    confidence: clamp(Math.min(structural, heard)),
    issues: [
      ...new Set([...scored, ...issues.filter((code) => code === ISSUE.AMBIGUOUS_WEIGHT_MODE)]),
    ],
    ...base,
  };
  if (known) result.exerciseId = known.id;
  if (match) result.exerciseMatchScore = round(match.score);
  if (output.weight) result.weight = output.weight;
  if (output.reps !== null) result.reps = output.reps;
  return result;
}

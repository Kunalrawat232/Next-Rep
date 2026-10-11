/** Machine-readable reasons on a ParseResult (docs/domain/voice-grammar.md). */
export const ISSUE = {
  NO_EXERCISE: 'NO_EXERCISE',
  NO_WEIGHT: 'NO_WEIGHT',
  NO_REPS: 'NO_REPS',
  /** No per-side or total word, or both: the app asks. It is not a doubt about what was heard. */
  AMBIGUOUS_WEIGHT_MODE: 'AMBIGUOUS_WEIGHT_MODE',
  LOW_EXERCISE_MATCH: 'LOW_EXERCISE_MATCH',
  /** Words before the numbers that name no known exercise ("cable crunch" when it is not in the list). */
  UNKNOWN_EXERCISE_WORDS: 'UNKNOWN_EXERCISE_WORDS',
  EXTRA_NUMBER: 'EXTRA_NUMBER',
  UNRECOGNISED_WORDS: 'UNRECOGNISED_WORDS',
  SUSPICIOUS_INPUT: 'SUSPICIOUS_INPUT',
  TOO_LONG: 'TOO_LONG',
  NO_SPEECH: 'NO_SPEECH',
  PARSE_FAILED: 'PARSE_FAILED',
} as const;

/** Issues that mean the transcript is never sent to Gemini. */
export const NEVER_SENT: readonly string[] = [
  ISSUE.SUSPICIOUS_INPUT,
  ISSUE.TOO_LONG,
  ISSUE.NO_SPEECH,
];

// Every tunable number of the parser lives here so it can be tested and tuned (docs/domain/voice-grammar.md).
export const PARSER_CONFIG = {
  /** Below this confidence a transcript is handed to the Gemini fallback (when online). */
  confidenceThreshold: 0.8,
  /** A spoken exercise must match an alias at least this well (1 is exact, ignoring spaces). */
  minExerciseScore: 0.8,
  /** Below this a matched exercise is flagged LOW_EXERCISE_MATCH. */
  sureExerciseScore: 0.9,
  /** A name or alias shorter than this is only ever matched exactly: short words are too easy to confuse. */
  minFuzzyLength: 5,
  /** Longer transcripts are not a set: a person says a set in a breath. */
  maxChars: 300,
  maxTokens: 40,
  /** Longest exercise name or alias, in words, that is looked for. */
  maxExerciseWords: 6,
  /** More unexplained words than this lowers confidence. */
  maxLeftoverWords: 2,
} as const;

/** A run of digits longer than this is not a number anyone said (and could overflow). */
export const MAX_DIGITS = 9;

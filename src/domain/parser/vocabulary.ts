// The words the grammar knows besides numbers and exercise names (docs/domain/voice-grammar.md).
import type { Unit } from '../schemas';

const UNIT_WORDS: Readonly<Record<string, Unit>> = {
  kg: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
};

/** After the number: "8 reps", "8 times", "8 baar". */
export const REP_WORDS: ReadonlySet<string> = new Set([
  'reps',
  'rep',
  'times',
  'baar',
  'repetitions',
]);
/** Before the number: "for 8", "x 8", "into 8". */
export const REP_PREFIXES: ReadonlySet<string> = new Set(['for', 'x', 'into', 'reps', 'rep']);

/** Two-word markers that make a weight "per side"; the app asks about the bar later. */
export const PER_SIDE_PHRASES: readonly (readonly [string, string])[] = [
  ['each', 'side'],
  ['per', 'side'],
  ['a', 'side'],
  ['every', 'side'],
  ['har', 'side'],
  ['both', 'sides'],
  ['both', 'side'],
  ['either', 'side'],
];
/** Hindi number words that are not built ("do sau" is 200): said next to a number they make the phrase doubtful. */
export const UNREAD_NUMBER_WORDS: ReadonlySet<string> = new Set(['sau']);

export const TOTAL_WORDS: ReadonlySet<string> = new Set(['total', 'overall']);

export const SECOND_WORDS: ReadonlySet<string> = new Set(['second', 'seconds', 'sec', 'secs']);
export const MINUTE_WORDS: ReadonlySet<string> = new Set(['minute', 'minutes', 'min', 'mins']);

export const UNDO_PHRASES: readonly (readonly string[])[] = [
  ['undo'],
  ['delete', 'that'],
  ['delete', 'last'],
  ['remove', 'that'],
  ['remove', 'last'],
  ['cancel', 'that'],
  ['scratch', 'that'],
  ['galat'],
  ['wrong', 'one'],
];
export const REPEAT_STARTS: readonly (readonly string[])[] = [
  ['same'],
  ['repeat'],
  ['again'],
  ['one', 'more'],
  ['another', 'set'],
  ['next', 'set'],
];
export const EDIT_STARTS: ReadonlySet<string> = new Set([
  'change',
  'edit',
  'make',
  'correct',
  'update',
  'fix',
]);
export const REST_WORDS: ReadonlySet<string> = new Set(['rest', 'timer']);
/** "start rest", "take rest", "set timer": a word before the rest word. */
export const REST_STARTS: ReadonlySet<string> = new Set(['start', 'take', 'set', 'begin']);

/** Words that mean the transcript is trying to instruct the app, not describe a set. */
export const INJECTION_WORDS: ReadonlySet<string> = new Set([
  'ignore',
  'disregard',
  'override',
  'instructions',
  'instruction',
  'jailbreak',
]);

/** The unit a word names. Own keys only: a spoken "constructor" must not find anything on Object. */
export const unitOf = (word: string): Unit | undefined =>
  Object.hasOwn(UNIT_WORDS, word) ? UNIT_WORDS[word] : undefined;

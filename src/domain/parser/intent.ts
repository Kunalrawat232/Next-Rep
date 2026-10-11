import {
  EDIT_STARTS,
  INJECTION_WORDS,
  REPEAT_STARTS,
  REST_STARTS,
  REST_WORDS,
  UNDO_PHRASES,
} from './vocabulary';

const LEADING = new Set([
  'um',
  'umm',
  'uh',
  'uhh',
  'er',
  'erm',
  'hmm',
  'ah',
  'so',
  'okay',
  'ok',
  'please',
  'yeah',
  'well',
  'now',
  'then',
  'actually',
  'hey',
  'hi',
  'hello',
  'oops',
  'whoops',
  'arre',
  'arey',
  'oh',
  'sorry',
  'no',
  'nahi',
  'nahin',
]);

const startsWith = (words: readonly string[], phrase: readonly string[]): boolean =>
  phrase.every((word, i) => words[i] === word);

/** Text that tries to instruct the app instead of describing a set. It is never read as a set. */
export const looksLikeInjection = (words: readonly string[]): boolean =>
  words.some((word) => INJECTION_WORDS.has(word)) ||
  (words.includes('system') && words.includes('prompt'));

/** Drops greetings and the app's name ("hey next rep ...") from the front. */
export function withoutWake(words: readonly string[]): string[] {
  let first = 0;
  while (first < words.length && LEADING.has(words[first] ?? '')) first += 1;
  if (words[first] === 'next' && words[first + 1] === 'rep') first += 2;
  return words.slice(first);
}

export type Command = {
  kind: 'undo_last' | 'repeat_last' | 'edit_last' | 'rest_timer';
  /** The words after the command word itself, which are the numbers to read. */
  rest: string[];
};

/** A command at the start ("undo", "same again", "make it 62.5", "rest 90 seconds"), or null for a set. */
export function detectCommand(words: readonly string[]): Command | null {
  // The words arrive without greetings and filler (see `withoutWake`).
  const first = words[0] ?? '';
  const second = words[1] ?? '';
  if (words.length <= 5 && UNDO_PHRASES.some((phrase) => startsWith(words, phrase)))
    return { kind: 'undo_last', rest: [] };
  const asksForRest = REST_WORDS.has(first) || (REST_STARTS.has(first) && REST_WORDS.has(second));
  if (words.length <= 8 && asksForRest) return { kind: 'rest_timer', rest: words.slice(1) };
  const repeat = REPEAT_STARTS.find((phrase) => startsWith(words, phrase));
  if (repeat) return { kind: 'repeat_last', rest: words.slice(repeat.length) };
  if (EDIT_STARTS.has(first)) return { kind: 'edit_last', rest: words.slice(1) };
  if (startsWith(words, ['that', 'was']) || startsWith(words, ['it', 'was']))
    return { kind: 'edit_last', rest: words.slice(2) };
  return null;
}

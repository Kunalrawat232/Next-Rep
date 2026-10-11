import { nameKey } from '../text';

export type Token =
  { kind: 'word'; text: string } | { kind: 'num'; value: number } | { kind: 'exercise' };

/** Lower case words and digits only: punctuation gone, "62.5kg" split into "62.5" and "kg". */
export function tokenize(transcript: string): string[] {
  return nameKey(transcript)
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/(?<!\d)\.(?=\d)/g, ' 0.')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .split(' ')
    .filter((word) => word !== '');
}

/** Words that carry no meaning for a set and are not worth counting as "not understood". */
export const FILLER: ReadonlySet<string> = new Set([
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
  'and',
  'the',
  'a',
  'an',
  'then',
  'now',
  'like',
  'i',
  'my',
  'did',
  'just',
  'set',
  'of',
  'with',
  'at',
  'on',
  'is',
  'it',
  'was',
  'that',
  'this',
  'weight',
  'weights',
  'to',
  'ke',
  'hai',
  'ho',
  'gaya',
  'me',
  'yeah',
  'again',
  'well',
  'actually',
  'last',
]);

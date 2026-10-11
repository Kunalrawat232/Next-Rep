import { MAX_DIGITS } from './config';
import type { Token } from './tokens';

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
/** Hindi (Hinglish) number words 1 to 20, with the spellings speech recognition commonly gives. */
const HINDI: Record<string, number> = {
  ek: 1,
  do: 2,
  teen: 3,
  chaar: 4,
  char: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  chhah: 6,
  chheh: 6,
  saat: 7,
  aath: 8,
  ath: 8,
  nau: 9,
  das: 10,
  dus: 10,
  gyaarah: 11,
  gyarah: 11,
  baarah: 12,
  barah: 12,
  terah: 13,
  chaudah: 14,
  pandrah: 15,
  solah: 16,
  satrah: 17,
  athaarah: 18,
  atharah: 18,
  unnees: 19,
  unnis: 19,
  bees: 20,
};
const DIGIT_WORD = /^\d+(\.\d+)?$/;

/** Own keys only: a spoken "constructor" must not find anything on Object. */
const own = (table: Record<string, number>, word: string): number | undefined =>
  Object.hasOwn(table, word) ? table[word] : undefined;

export const isNumberWord = (word: string): boolean =>
  own(ONES, word) !== undefined ||
  own(TENS, word) !== undefined ||
  own(HINDI, word) !== undefined ||
  word === 'hundred' ||
  DIGIT_WORD.test(word);

type Found = { value: number; end: number };

/** "sixty two", "a hundred and five", "five hundred": whole numbers spoken as words. */
function wordsAt(tokens: readonly string[], start: number): Found | null {
  let i = start;
  let value = 0;
  // 'digit' may still take "hundred"; 'tens' may take a single digit; 'done' takes nothing more.
  let last: 'start' | 'digit' | 'tens' | 'hundred' | 'done' = 'start';
  if (tokens[i] === 'a' && tokens[i + 1] === 'hundred') {
    value = 1;
    last = 'digit';
    i += 1;
  }
  for (; i < tokens.length; i += 1) {
    const word = tokens[i] ?? '';
    const ones = own(ONES, word);
    const tens = own(TENS, word);
    if (ones !== undefined && (last === 'start' || last === 'hundred')) {
      value += ones;
      last = last === 'start' && ones <= 9 ? 'digit' : 'done';
    } else if (ones !== undefined && last === 'tens' && ones >= 1 && ones <= 9) {
      value += ones;
      last = 'done';
    } else if (tens !== undefined && (last === 'start' || last === 'hundred')) {
      value += tens;
      last = 'tens';
    } else if (tens !== undefined && last === 'digit' && value >= 1) {
      // "two twenty five" is 225 and "one fifty" is 150, as lifters say it.
      value = value * 100 + tens;
      last = 'tens';
    } else if (word === 'hundred' && last === 'digit' && value >= 1) {
      value *= 100;
      last = 'hundred';
    } else if (word === 'and' && last === 'hundred' && isNumberWord(tokens[i + 1] ?? '')) {
      continue;
    } else break;
  }
  return i > start ? { value, end: i } : null;
}

/** Digits after "point": "point five", "point two five", "point 25". */
function fractionAt(
  tokens: readonly string[],
  start: number,
): { digits: string; end: number } | null {
  const first = tokens[start] ?? '';
  if (/^\d+$/.test(first)) return { digits: first, end: start + 1 };
  let digits = '';
  let i = start;
  for (; i < tokens.length && i < start + 3; i += 1) {
    const value = own(ONES, tokens[i] ?? '');
    if (value === undefined || value > 9) break;
    digits += String(value);
  }
  return digits === '' ? null : { digits, end: i };
}

/** A number starting at `start`, in digits or words, with "point" decimals and "and a half". */
export function numberAt(tokens: readonly string[], start: number): Found | null {
  const first = tokens[start] ?? '';
  let found: Found | null;
  const hindi = own(HINDI, first);
  if (hindi !== undefined) return { value: hindi, end: start + 1 };
  if (DIGIT_WORD.test(first)) {
    found = first.length <= MAX_DIGITS ? { value: Number(first), end: start + 1 } : null;
  } else {
    found = wordsAt(tokens, start);
  }
  if (!found) return null;
  const { value, end } = found;
  if (Number.isInteger(value) && tokens[end] === 'point') {
    const fraction = fractionAt(tokens, end + 1);
    if (fraction) return { value: Number(`${value}.${fraction.digits}`), end: fraction.end };
  }
  if (
    Number.isInteger(value) &&
    tokens[end] === 'and' &&
    tokens[end + 1] === 'a' &&
    tokens[end + 2] === 'half'
  )
    return { value: value + 0.5, end: end + 3 };
  if (Number.isInteger(value) && tokens[end] === 'and' && tokens[end + 1] === 'half')
    return { value: value + 0.5, end: end + 2 };
  return found;
}

/** Words to tokens, with every spoken number folded into one `num` token. `skip` marks words already used. */
export function mergeNumbers(
  words: readonly string[],
  skip: ReadonlySet<number>,
  exerciseAt: number | null,
): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < words.length) {
    if (i === exerciseAt) {
      tokens.push({ kind: 'exercise' });
      i += 1;
      while (skip.has(i)) i += 1;
      continue;
    }
    const found = skip.has(i) ? null : numberAt(words, i);
    if (found) {
      tokens.push({ kind: 'num', value: found.value });
      i = found.end;
    } else {
      tokens.push({ kind: 'word', text: words[i] ?? '' });
      i += 1;
    }
  }
  return tokens;
}

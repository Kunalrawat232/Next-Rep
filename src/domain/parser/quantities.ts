import type { Unit } from '../schemas';
import type { Token } from './tokens';
import {
  MINUTE_WORDS,
  PER_SIDE_PHRASES,
  REP_PREFIXES,
  REP_WORDS,
  SECOND_WORDS,
  TOTAL_WORDS,
  unitOf,
} from './vocabulary';

export type Weight = { value: number; unit: Unit };

export type Quantities = {
  /** A number said with a unit. A weight with no unit arrives as a spare number. */
  weight?: Weight;
  reps?: number;
  /** Numbers with no marker, in the order spoken. */
  spare: number[];
  perSide: boolean;
  total: boolean;
  /** Which tokens were explained, so the rest can be counted as "not understood". */
  used: boolean[];
};

const wordAt = (tokens: readonly Token[], i: number): string | undefined => {
  const token = tokens[i];
  return token?.kind === 'word' ? token.text : undefined;
};

/** Reads numbers and the words around them: unit, rep markers, per-side and total markers. */
export function readQuantities(tokens: readonly Token[]): Quantities {
  const used = tokens.map(() => false);
  const result: Quantities = { spare: [], perSide: false, total: false, used };

  for (let i = 0; i < tokens.length; i += 1) {
    const word = wordAt(tokens, i);
    if (word === undefined) continue;
    const next = wordAt(tokens, i + 1);
    if (next !== undefined && PER_SIDE_PHRASES.some(([a, b]) => a === word && b === next)) {
      result.perSide = true;
      used[i] = true;
      used[i + 1] = true;
    } else if (TOTAL_WORDS.has(word)) {
      result.total = true;
      used[i] = true;
    }
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token?.kind !== 'num') continue;
    used[i] = true;
    const next = wordAt(tokens, i + 1);
    const previous = wordAt(tokens, i - 1);
    const unit = next === undefined ? undefined : unitOf(next);
    if (unit && !result.weight) {
      result.weight = { value: token.value, unit };
      used[i + 1] = true;
    } else if (next !== undefined && REP_WORDS.has(next) && result.reps === undefined) {
      result.reps = token.value;
      used[i + 1] = true;
    } else if (previous !== undefined && REP_PREFIXES.has(previous) && result.reps === undefined) {
      result.reps = token.value;
      used[i - 1] = true;
    } else {
      result.spare.push(token.value);
    }
  }
  return result;
}

/** Seconds from "90 seconds", "two minutes", "one and a half minutes"; a bare number is minutes up to 10, else seconds. */
export function readDuration(tokens: readonly Token[]): number | undefined {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token?.kind !== 'num') continue;
    const next = wordAt(tokens, i + 1);
    const seconds =
      next !== undefined && SECOND_WORDS.has(next)
        ? token.value
        : next !== undefined && MINUTE_WORDS.has(next)
          ? token.value * 60
          : token.value <= 10
            ? token.value * 60
            : token.value;
    const whole = Math.round(seconds);
    return whole > 0 ? whole : undefined;
  }
  return undefined;
}

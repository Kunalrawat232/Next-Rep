import type { Exercise } from '../exercises';
import { nameKey } from '../text';
import { PARSER_CONFIG } from './config';

export type ExerciseMatch = {
  exercise: Exercise;
  /** 1 is an exact name or alias (spaces ignored); lower is a close spelling. */
  score: number;
  /** Two exercises answer to the same words, so the choice is a guess. */
  ambiguous: boolean;
  /** Where the words sit in the transcript's word list. */
  start: number;
  end: number;
};

type Index = {
  /** key (words joined by a space) -> exercises */
  spaced: Map<string, [Exercise, ...Exercise[]]>;
  /** key without spaces -> exercises */
  joined: Map<string, [Exercise, ...Exercise[]]>;
  /** length of a joined key -> [joined key, exercises] pairs, for close spellings */
  byLength: Map<number, [string, [Exercise, ...Exercise[]]][]>;
};

const TIER_RANK = { custom: 0, curated: 1, imported: 2 } as const;
const indexes = new WeakMap<readonly Exercise[], Index>();

function add(map: Map<string, [Exercise, ...Exercise[]]>, key: string, exercise: Exercise): void {
  const list = map.get(key);
  if (!list) map.set(key, [exercise]);
  else if (!list.includes(exercise)) list.push(exercise);
}

function indexFor(exercises: readonly Exercise[]): Index {
  const cached = indexes.get(exercises);
  if (cached) return cached;
  const index: Index = { spaced: new Map(), joined: new Map(), byLength: new Map() };
  for (const exercise of exercises) {
    for (const name of [exercise.name, ...exercise.aliases]) {
      const key = nameKey(name)
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      if (key === '') continue;
      add(index.spaced, key, exercise);
      add(index.joined, key.replace(/ /g, ''), exercise);
    }
  }
  for (const [key, list] of index.joined) {
    const bucket = index.byLength.get(key.length);
    if (bucket) bucket.push([key, list]);
    else index.byLength.set(key.length, [[key, list]]);
  }
  indexes.set(exercises, index);
  return index;
}

const rank = (exercise: Exercise): number => TIER_RANK[exercise.tier];

/**
 * The best exercise for words that name several: the user's own, then curated, then imported, then by name.
 * It is a guess only when more than one exercise of that best tier answers to the words.
 */
function choose(list: readonly [Exercise, ...Exercise[]]): {
  exercise: Exercise;
  ambiguous: boolean;
} {
  const exercise = list.reduce((a, b) =>
    rank(b) < rank(a) || (rank(b) === rank(a) && b.name.localeCompare(a.name) < 0) ? b : a,
  );
  return { exercise, ambiguous: list.filter((other) => rank(other) === rank(exercise)).length > 1 };
}

const SCRATCH = 256;
let rowA = new Int32Array(SCRATCH);
let rowB = new Int32Array(SCRATCH);

/** Edit distance, giving up (returning `limit + 1`) once it must exceed `limit`. */
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit || a.length >= SCRATCH || b.length >= SCRATCH)
    return limit + 1;
  let previous = rowA;
  let row = rowB;
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    row[0] = i;
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const value = Math.min(
        (previous[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      row[j] = value;
      if (value < best) best = value;
    }
    if (best > limit) return limit + 1;
    [previous, row] = [row, previous];
  }
  rowA = previous;
  rowB = row;
  return previous[b.length] ?? limit + 1;
}

/** How many edits a spelling of this length may be off by and still score at least the minimum. */
const allowedEdits = (length: number): number =>
  // The small addition guards against 1 - 0.8 being 0.19999999999999996.
  Math.floor(length * (1 - PARSER_CONFIG.minExerciseScore) + 1e-9);

type Window = { start: number; end: number };

/** The closest spelling among windows that pass `allow`; larger windows are tried first, then earlier ones. */
function closest(
  words: readonly string[],
  index: Index,
  blocked: (word: string) => boolean,
  allow: (window: Window) => boolean,
): ExerciseMatch | null {
  let best: ExerciseMatch | null = null;
  for (let size = Math.min(PARSER_CONFIG.maxExerciseWords, words.length); size >= 1; size -= 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const window = { start, end: start + size };
      if (!allow(window)) continue;
      const text = words.slice(start, start + size);
      if (text.some(blocked)) continue;
      const joined = text.join('');
      if (joined.length < PARSER_CONFIG.minFuzzyLength) continue;
      // A key may be longer than the text, which allows one more edit than the text alone does.
      const reach = allowedEdits(joined.length + allowedEdits(joined.length) + 1);
      for (let length = joined.length - reach; length <= joined.length + reach; length += 1) {
        for (const [key, list] of index.byLength.get(length) ?? []) {
          if (key.length < PARSER_CONFIG.minFuzzyLength) continue;
          const longer = Math.max(joined.length, key.length);
          const score = 1 - distance(joined, key, allowedEdits(longer)) / longer;
          if (score < PARSER_CONFIG.minExerciseScore || (best && score <= best.score)) continue;
          best = { ...choose(list), score, ...window };
        }
      }
    }
  }
  return best;
}

/**
 * Finds the exercise the words name. An exact name or alias wins (longest, then earliest), unless a close spelling
 * of a longer phrase around it is nearly as good ("bench pres" beats the alias "bench"). Otherwise the closest
 * spelling of a long enough name. `blocked` words (units, rep markers, numbers) never take part in a close match.
 */
export function matchExercise(
  words: readonly string[],
  exercises: readonly Exercise[],
  blocked: (word: string) => boolean,
): ExerciseMatch | null {
  const index = indexFor(exercises);
  const longest = Math.min(PARSER_CONFIG.maxExerciseWords, words.length);
  for (let size = longest; size >= 1; size -= 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const found =
        index.spaced.get(words.slice(start, start + size).join(' ')) ??
        index.joined.get(words.slice(start, start + size).join(''));
      if (!found) continue;
      const exact = { ...choose(found), score: 1, start, end: start + size };
      const wider = closest(
        words,
        index,
        blocked,
        (w) => w.start <= start && w.end >= start + size && w.end - w.start > size,
      );
      return wider && wider.score >= PARSER_CONFIG.sureExerciseScore ? wider : exact;
    }
  }
  return closest(words, index, blocked, () => true);
}

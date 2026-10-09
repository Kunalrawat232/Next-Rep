import { BODY_PARTS, EQUIPMENT_TYPES, type EquipmentType } from '../schemas';
import { cleanName, nameKey } from '../text';
import { MUSCLE_LABEL, MUSCLE_SYNONYMS, type Muscle } from './muscles';

export { MUSCLES, MUSCLE_LABEL, type Muscle } from './muscles';

export type BodyPart = (typeof BODY_PARTS)[number];

/** `custom` is the user's own, `curated` is hand-checked with voice aliases, `imported` comes from the open dataset. */
export type ExerciseTier = 'custom' | 'curated' | 'imported';

export type Exercise = {
  id: string;
  name: string;
  equipmentType: EquipmentType;
  bodyPart: BodyPart;
  muscle: Muscle | null;
  aliases: string[];
  tier: ExerciseTier;
};

export const EQUIPMENT_LABEL: Record<EquipmentType, string> = {
  barbell: 'Barbell',
  ez_bar: 'EZ bar',
  smith: 'Smith',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
};

export const BODY_PART_LABEL: Record<BodyPart, string> = {
  upper: 'Upper body',
  lower: 'Lower body',
  core: 'Core',
};

export const EQUIPMENT_FILTERS = [
  'all',
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
] as const;
export type EquipmentFilter = (typeof EQUIPMENT_FILTERS)[number];

/** EZ bar and Smith exercises have no chip of their own, so they count as Barbell. */
export function filterByEquipment(list: readonly Exercise[], filter: EquipmentFilter): Exercise[] {
  if (filter === 'all') return [...list];
  return list.filter((e) =>
    filter === 'barbell'
      ? e.equipmentType === 'barbell' || e.equipmentType === 'ez_bar' || e.equipmentType === 'smith'
      : e.equipmentType === filter,
  );
}

export function subtitleFor(exercise: Exercise): string {
  const where = exercise.muscle
    ? MUSCLE_LABEL[exercise.muscle]
    : BODY_PART_LABEL[exercise.bodyPart];
  return `${EQUIPMENT_LABEL[exercise.equipmentType]} · ${where}`;
}

/** Lower case, no Latin accents, punctuation as spaces. Other scripts keep their marks. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '') // "farmer's" and "farmers" are the same word
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

type Indexed = { name: string; aliases: string[]; extra: string };

const indexCache = new WeakMap<Exercise, Indexed>();

function indexOf(exercise: Exercise): Indexed {
  const cached = indexCache.get(exercise);
  if (cached) return cached;
  const extra = [
    EQUIPMENT_LABEL[exercise.equipmentType],

    BODY_PART_LABEL[exercise.bodyPart],
    exercise.muscle
      ? `${MUSCLE_LABEL[exercise.muscle]} ${MUSCLE_SYNONYMS[exercise.muscle].join(' ')}`
      : '',
  ].join(' ');
  const indexed = {
    name: normalize(exercise.name),
    aliases: exercise.aliases.map(normalize),
    extra: normalize(extra),
  };
  indexCache.set(exercise, indexed);
  return indexed;
}

const startsAWord = (haystack: string, token: string) =>
  haystack.startsWith(token) || haystack.includes(` ${token}`);

const TIER_BOOST: Record<ExerciseTier, number> = { custom: 30, curated: 20, imported: 0 };
const TIER_ORDER: Record<ExerciseTier, number> = { custom: 0, curated: 1, imported: 2 };

/** How well one exercise matches the query tokens, or -1 when some word matches nothing. */
function score(exercise: Exercise, whole: string, tokens: string[]): number {
  const { name, aliases, extra } = indexOf(exercise);
  let total = 0;
  for (const token of tokens) {
    let best = -1;
    if (startsAWord(name, token)) best = name.startsWith(token) ? 150 : 100;
    for (const alias of aliases) if (startsAWord(alias, token)) best = Math.max(best, 70);
    if (startsAWord(extra, token)) best = Math.max(best, 40);
    if (best < 0) return -1;
    total += best;
  }
  if (name === whole) total += 1000;
  else if (name.startsWith(whole)) total += 500;
  if (aliases.includes(whole)) total += 450;
  else if (aliases.some((alias) => alias.startsWith(whole))) total += 300;
  return total + TIER_BOOST[exercise.tier];
}

export type SearchResult = { results: Exercise[]; total: number };

/**
 * Finds exercises by name, alias, muscle, body part or equipment. Every word of the query has to
 * match the start of a word somewhere. Names rank above aliases, and aliases above muscles.
 * `total` counts all matches; `results` is cut to `limit`.
 */
export function searchExercises(
  list: readonly Exercise[],
  query: string,
  options: { equipment?: EquipmentFilter; limit?: number } = {},
): SearchResult {
  const pool = filterByEquipment(list, options.equipment ?? 'all');
  // Each word counts once: a stutter such as "deadlift deadlift" must not change the order.
  const tokens = [...new Set(normalize(query).split(' ').filter(Boolean))];
  const whole = tokens.join(' ');
  let matched: Exercise[];
  if (query.trim() === '') {
    matched = pool.sort(
      (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.name.localeCompare(b.name),
    );
  } else if (tokens.length === 0) {
    matched = []; // only punctuation: nothing can match
  } else {
    matched = pool
      .map((exercise) => ({ exercise, points: score(exercise, whole, tokens) }))
      .filter((entry) => entry.points >= 0)
      .sort(
        (a, b) =>
          // Your own and the curated exercises (which have the voice aliases) always come before imported ones.
          TIER_ORDER[a.exercise.tier] - TIER_ORDER[b.exercise.tier] ||
          b.points - a.points ||
          a.exercise.name.length - b.exercise.name.length ||
          a.exercise.name.localeCompare(b.exercise.name),
      )
      .map((entry) => entry.exercise);
  }
  return {
    results: options.limit === undefined ? matched : matched.slice(0, Math.max(0, options.limit)),
    total: matched.length,
  };
}

export const NAME_MAX = 80;
export const ALIAS_MAX = 60;
export const ALIASES_MAX = 20;
/** The database limit is on the comma-joined text, in bytes. */
export const ALIASES_BYTES_MAX = 1000;

/** "zercher, zercher squats" -> ["zercher", "zercher squats"]. Empty and repeated words are dropped. */
export function parseAliases(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,，،]/)) {
    const alias = cleanName(part);
    if (alias === '' || seen.has(nameKey(alias))) continue;
    seen.add(nameKey(alias));
    out.push(alias);
  }
  return out;
}

export type CustomExerciseForm = {
  name: string;
  equipmentType: string;
  bodyPart: string;
  aliasesText: string;
};

export type CustomExerciseInput = {
  name: string;
  equipmentType: EquipmentType;
  bodyPart: BodyPart;
  aliases: string[];
};

export type CustomExerciseErrors = {
  name?: string;
  equipmentType?: string;
  bodyPart?: string;
  aliases?: string;
};

export type CustomExerciseResult =
  { ok: true; value: CustomExerciseInput } | { ok: false; errors: CustomExerciseErrors };

export function validateCustomExercise(
  form: CustomExerciseForm,
  existing: readonly Exercise[],
): CustomExerciseResult {
  const errors: CustomExerciseErrors = {};
  const name = cleanName(form.name);
  const taken = new Set(existing.flatMap((e) => [e.name, ...e.aliases]).map(nameKey));

  if (name === '') errors.name = 'Give the exercise a name.';
  else if (name.length > NAME_MAX) errors.name = `Use ${NAME_MAX} characters or fewer.`;
  else if (taken.has(nameKey(name))) errors.name = 'An exercise with that name already exists.';

  const aliases = parseAliases(form.aliasesText);
  const clash = aliases.filter(
    (alias) => taken.has(nameKey(alias)) || nameKey(alias) === nameKey(name),
  );
  if (aliases.length > ALIASES_MAX) errors.aliases = `Use ${ALIASES_MAX} words or fewer.`;
  else if (aliases.some((alias) => alias.length > ALIAS_MAX))
    errors.aliases = `Each word or phrase can be ${ALIAS_MAX} characters at most.`;
  else if (new TextEncoder().encode(aliases.join(',')).length > ALIASES_BYTES_MAX)
    errors.aliases = 'That is too much text for the words you will say. Remove some.';
  else if (clash.length > 0)
    errors.aliases = `Already used by another exercise: ${clash.join(', ')}.`;

  const equipmentType = EQUIPMENT_TYPES.find((type) => type === form.equipmentType);
  if (!equipmentType) errors.equipmentType = 'Choose the equipment.';
  const bodyPart = BODY_PARTS.find((part) => part === form.bodyPart);
  if (!bodyPart) errors.bodyPart = 'Choose the body part.';

  if (Object.keys(errors).length > 0 || !equipmentType || !bodyPart) return { ok: false, errors };
  return { ok: true, value: { name, equipmentType, bodyPart, aliases } };
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Where to bold the part of a name the query matched: the start of the first word that begins with
 * the first query word, ignoring case and accents. Offsets are into the original name.
 */
export function highlightRange(name: string, query: string): [number, number] | null {
  const token = fold(query.trim()).split(/\s+/)[0] ?? '';
  if (token === '') return null;
  for (let start = 0; start < name.length; start++) {
    const previous = name[start - 1];
    const startsWord = previous === undefined || /[^\p{L}\p{M}\p{N}]/u.test(previous);
    if (!startsWord) continue;
    // A letter can fold to a different number of characters, so grow the slice until it matches.
    for (let end = start + 1; end <= Math.min(name.length, start + token.length * 2 + 2); end++) {
      if (fold(name.slice(start, end)) === token) return [start, end];
    }
  }
  return null;
}

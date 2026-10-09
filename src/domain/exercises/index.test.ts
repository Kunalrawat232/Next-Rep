import { describe, expect, it } from 'vitest';
import {
  BODY_PART_LABEL,
  EQUIPMENT_FILTERS,
  EQUIPMENT_LABEL,
  MUSCLE_LABEL,
  filterByEquipment,
  highlightRange,
  parseAliases,
  searchExercises,
  subtitleFor,
  validateCustomExercise,
  type CustomExerciseForm,
  type Exercise,
} from '.';
import curatedJson from '../exercises.seed.json';
import extendedJson from '../exercises.extended.json';
import { parseExercises } from './catalog';
import { MUSCLE_SYNONYMS } from './muscles';

const curated = parseExercises(curatedJson, 'curated');
const extended = parseExercises(extendedJson, 'imported');

const ex = (over: Partial<Exercise> & { name: string }): Exercise => ({
  id: over.name,
  equipmentType: 'barbell',
  bodyPart: 'upper',
  muscle: 'chest',
  aliases: [],
  tier: 'curated',
  ...over,
});

const library: Exercise[] = [
  ex({ name: 'Barbell Bench Press', aliases: ['bench', 'bench press'] }),
  ex({ name: 'Incline Barbell Bench Press', aliases: ['incline bench'] }),
  ex({ name: 'Incline Dumbbell Press', equipmentType: 'dumbbell' }),
  ex({ name: 'Incline Cable Fly', equipmentType: 'cable', tier: 'imported' }),
  ex({ name: 'Cable Fly', equipmentType: 'cable', aliases: ['cable flies'] }),
  ex({ name: 'Barbell Curl', muscle: 'biceps' }),
  ex({ name: 'Hammer Curl', equipmentType: 'dumbbell', muscle: 'biceps', aliases: ['hammer'] }),
  ex({ name: 'Barbell Back Squat', bodyPart: 'lower', muscle: 'quads', aliases: ['squat'] }),
  ex({ name: 'Leg Press', equipmentType: 'machine', bodyPart: 'lower', muscle: 'quads' }),
  ex({ name: 'Crunch', equipmentType: 'bodyweight', bodyPart: 'core', muscle: 'abs' }),
  ex({ name: 'Zercher Squat', bodyPart: 'lower', muscle: null, tier: 'custom' }),
  ex({ name: 'Café Press', muscle: null, tier: 'imported' }),
];
const names = (list: Exercise[]) => list.map((e) => e.name);
const search = (query: string, equipment: (typeof EQUIPMENT_FILTERS)[number] = 'all') =>
  names(searchExercises(library, query, { equipment }).results);

describe('searchExercises: matching', () => {
  it('returns everything for an empty or blank query', () => {
    expect(search('')).toHaveLength(library.length);
    expect(search('   ')).toHaveLength(library.length);
  });

  it.each([
    ['inc', ['Incline Barbell Bench Press', 'Incline Dumbbell Press', 'Incline Cable Fly']],
    ['INCLINE', ['Incline Barbell Bench Press', 'Incline Dumbbell Press', 'Incline Cable Fly']],
    ['zercher', ['Zercher Squat']],
    ['curl', ['Barbell Curl', 'Hammer Curl']],
  ])('finds %j', (query, expected) => {
    expect(search(query).slice(0, expected.length).sort()).toEqual([...expected].sort());
  });

  it('finds by alias', () => {
    expect(search('flies')).toEqual(['Cable Fly']);
    expect(search('hammer')).toContain('Hammer Curl');
  });

  it('finds by muscle, by its label and by what people say', () => {
    expect(search('biceps').sort()).toEqual(['Barbell Curl', 'Hammer Curl']);
    expect(search('quad')).toEqual(expect.arrayContaining(['Leg Press', 'Barbell Back Squat']));
    expect(search('pecs')).toContain('Barbell Bench Press');
    expect(search('abs')).toEqual(['Crunch']);
  });

  it('finds by body part words', () => {
    expect(search('core')).toEqual(['Crunch']);
    expect(search('lower body')).toEqual(expect.arrayContaining(['Leg Press', 'Zercher Squat']));
  });

  it('finds by equipment word', () => {
    expect(search('machine')).toEqual(['Leg Press']);
    expect(search('cable').sort()).toEqual(['Cable Fly', 'Incline Cable Fly']);
  });

  it('needs every word to match, in any order', () => {
    expect(search('press incline')).toEqual(
      expect.arrayContaining(['Incline Barbell Bench Press', 'Incline Dumbbell Press']),
    );
    expect(search('incline squat')).toEqual([]);
  });

  it('ignores case, accents, punctuation and extra spaces', () => {
    expect(search('cafe')).toEqual(['Café Press']);
    expect(search('CAFÉ')).toEqual(['Café Press']);
    expect(search('  bench   press ')).toContain('Barbell Bench Press');
    expect(search('bench-press')).toContain('Barbell Bench Press');
  });

  it('returns nothing when nothing matches', () => {
    expect(search('zzz')).toEqual([]);
    expect(search('zercher squat deadlift')).toEqual([]);
  });

  it('does not treat query characters as patterns', () => {
    expect(search('.*')).toEqual([]);
    expect(search('(')).toEqual([]);
    expect(search('\\')).toEqual([]);
  });
});

describe('searchExercises: ranking', () => {
  it('puts an exact name first, then names that start with the query', () => {
    expect(search('cable fly')[0]).toBe('Cable Fly');
    // Zercher Squat is the user's own, so it comes first for any word that matches it.
    expect(search('barbell').find((name) => name !== 'Zercher Squat')).toMatch(/^Barbell/);
  });

  it('ranks a name match above an alias match, and an alias above a muscle match', () => {
    const list = [
      ex({ name: 'Zeta Lift', muscle: 'biceps' }),
      ex({ name: 'Alpha Lift', aliases: ['biceps thing'] }),
      ex({ name: 'Biceps Machine Work' }),
    ];
    expect(names(searchExercises(list, 'biceps').results)).toEqual([
      'Biceps Machine Work',
      'Alpha Lift',
      'Zeta Lift',
    ]);
  });

  it('puts your own and curated exercises before imported ones when the match is equal', () => {
    const list = [
      ex({ name: 'Press A', tier: 'imported' }),
      ex({ name: 'Press B', tier: 'curated' }),
      ex({ name: 'Press C', tier: 'custom' }),
    ];
    expect(names(searchExercises(list, 'press').results)).toEqual([
      'Press C',
      'Press B',
      'Press A',
    ]);
  });

  it('breaks ties by shorter name, then alphabetically', () => {
    const list = [ex({ name: 'Curl Long Name' }), ex({ name: 'Curl B' }), ex({ name: 'Curl A' })];
    expect(names(searchExercises(list, 'curl').results)).toEqual([
      'Curl A',
      'Curl B',
      'Curl Long Name',
    ]);
  });

  it('with no query, lists your own first, then curated, then imported, each by name', () => {
    const list = [
      ex({ name: 'B', tier: 'imported' }),
      ex({ name: 'C', tier: 'curated' }),
      ex({ name: 'A', tier: 'imported' }),
      ex({ name: 'D', tier: 'custom' }),
    ];
    expect(names(searchExercises(list, '').results)).toEqual(['D', 'C', 'A', 'B']);
  });

  it('is stable: the same input gives the same order', () => {
    expect(search('press')).toEqual(search('press'));
  });
});

describe('searchExercises: filter and limit', () => {
  it.each([
    ['barbell', ['Barbell Bench Press', 'Barbell Curl']],
    ['dumbbell', ['Hammer Curl']],
    ['machine', ['Leg Press']],
    ['cable', ['Cable Fly']],
    ['bodyweight', ['Crunch']],
  ] as const)('filters by %s', (equipment, expected) => {
    expect(search('', equipment)).toEqual(expect.arrayContaining([...expected]));
    for (const e of searchExercises(library, '', { equipment }).results)
      expect(filterByEquipment([e], equipment)).toHaveLength(1);
  });

  it('counts EZ bar and Smith exercises under Barbell, since they have no chip of their own', () => {
    const list = [
      ex({ name: 'EZ Curl', equipmentType: 'ez_bar' }),
      ex({ name: 'Smith Press', equipmentType: 'smith' }),
      ex({ name: 'Dumbbell Curl', equipmentType: 'dumbbell' }),
    ];
    expect(names(searchExercises(list, '', { equipment: 'barbell' }).results).sort()).toEqual([
      'EZ Curl',
      'Smith Press',
    ]);
  });

  it('combines the filter with a query', () => {
    expect(search('press', 'dumbbell')).toEqual(['Incline Dumbbell Press']);
    expect(search('press', 'cable')).toEqual([]);
  });

  it('reports the total but returns only the first `limit` results', () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      ex({ name: `Curl ${String(i).padStart(3, '0')}` }),
    );
    const r = searchExercises(many, 'curl', { limit: 40 });
    expect(r.total).toBe(100);
    expect(r.results).toHaveLength(40);
    expect(r.results[0]?.name).toBe('Curl 000');
  });

  it('only returns exercises where every query word starts a word in a searchable field', () => {
    const all = [...curated, ...extended];
    const wordsOf = (e: Exercise) =>
      [
        e.name,
        ...e.aliases,
        EQUIPMENT_LABEL[e.equipmentType],
        BODY_PART_LABEL[e.bodyPart],
        ...(e.muscle ? [MUSCLE_LABEL[e.muscle], ...MUSCLE_SYNONYMS[e.muscle]] : []),
      ]
        .join(' ')
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
    for (const query of ['curl', 'incline press', 'chest', 'glutes', 'push up', 'lat', 'pecs']) {
      const { results, total } = searchExercises(all, query, { limit: 5000 });
      expect(total, query).toBe(results.length);
      for (const e of results) {
        const words = wordsOf(e);
        for (const token of query.split(' '))
          expect(
            words.some((word) => word.startsWith(token)),
            `${query} -> ${e.name} (${token})`,
          ).toBe(true);
      }
    }
  });

  it('does not leave out an exercise whose name starts with the query', () => {
    const all = [...curated, ...extended];
    const names = new Set(searchExercises(all, 'curl', { limit: 5000 }).results.map((e) => e.name));
    for (const e of all)
      if (e.name.toLowerCase().startsWith('curl')) expect(names.has(e.name)).toBe(true);
  });

  it('searches the full library in well under a frame, so typing never stutters', () => {
    const all = [...curated, ...extended];
    const start = performance.now();
    for (let i = 0; i < 50; i++) searchExercises(all, 'in', { limit: 40 });
    expect((performance.now() - start) / 50).toBeLessThan(25);
  });
});

describe('the bundled library', () => {
  const all = [...curated, ...extended];

  it('has unique ids', () => expect(new Set(all.map((e) => e.id)).size).toBe(all.length));
  it('has unique names, ignoring case', () =>
    expect(new Set(all.map((e) => e.name.toLowerCase())).size).toBe(all.length));
  it('gives every exercise a muscle, a body part and an equipment type the weight rules know', () => {
    const equipment = new Set([
      'barbell',
      'ez_bar',
      'smith',
      'dumbbell',
      'machine',
      'cable',
      'bodyweight',
    ]);
    for (const e of all) {
      expect(e.muscle, e.name).toBeTruthy();
      expect(equipment.has(e.equipmentType), e.name).toBe(true);
    }
  });
  it('keeps names within the database limit', () => {
    for (const e of all) expect(e.name.length).toBeLessThanOrEqual(80);
  });
  it('keeps the curated exercises first-class: every one has aliases for voice logging', () => {
    for (const e of curated) expect(e.aliases.length, e.name).toBeGreaterThan(0);
  });
});

describe('subtitleFor', () => {
  it('shows equipment and muscle', () => {
    expect(subtitleFor(ex({ name: 'x' }))).toBe('Barbell · Chest');
    expect(subtitleFor(ex({ name: 'x', equipmentType: 'ez_bar', muscle: 'biceps' }))).toBe(
      'EZ bar · Biceps',
    );
  });
  it('falls back to the body part when there is no muscle', () => {
    expect(subtitleFor(ex({ name: 'x', muscle: null, bodyPart: 'lower' }))).toBe(
      'Barbell · Lower body',
    );
    expect(subtitleFor(ex({ name: 'x', muscle: null, bodyPart: 'core' }))).toBe('Barbell · Core');
  });
});

describe('parseAliases', () => {
  it.each([
    ['', []],
    ['  ', []],
    ['zercher', ['zercher']],
    ['zercher, zercher squats', ['zercher', 'zercher squats']],
    [' a ,, b , ', ['a', 'b']],
    ['Zercher, zercher', ['Zercher']],
    ['x  y', ['x y']],
  ])('reads %j', (text, expected) => expect(parseAliases(text)).toEqual(expected));
});

describe('validateCustomExercise', () => {
  const form = (over: Partial<CustomExerciseForm> = {}): CustomExerciseForm => ({
    name: 'Zercher squat',
    equipmentType: 'barbell',
    bodyPart: 'lower',
    aliasesText: 'zercher, zercher squats',
    ...over,
  });
  const existing = [ex({ name: 'Barbell Back Squat', aliases: ['squat'] })];

  it('accepts a good exercise and returns cleaned values', () => {
    const r = validateCustomExercise(form({ name: '  Zercher   squat ' }), existing);
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'Zercher squat',
        equipmentType: 'barbell',
        bodyPart: 'lower',
        aliases: ['zercher', 'zercher squats'],
      },
    });
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['over 80', 'x'.repeat(81)],
  ])('rejects a name that is %s', (_l, name) => {
    const r = validateCustomExercise(form({ name }), existing);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBeTruthy();
  });

  it('accepts 1 and 80 characters', () => {
    expect(validateCustomExercise(form({ name: 'x' }), existing).ok).toBe(true);
    expect(validateCustomExercise(form({ name: 'x'.repeat(80) }), existing).ok).toBe(true);
  });

  it('rejects a name that is already an exercise, ignoring case and spacing', () => {
    const r = validateCustomExercise(form({ name: ' barbell  BACK squat' }), existing);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toMatch(/already/i);
  });

  it("rejects a name that is another exercise's alias, so voice logging stays unambiguous", () => {
    const r = validateCustomExercise(form({ name: 'Squat' }), existing);
    expect(r.ok).toBe(false);
  });

  it('rejects an alias that is already an exercise name or alias', () => {
    const r = validateCustomExercise(form({ aliasesText: 'squat' }), existing);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.aliases).toMatch(/already/i);
  });

  it("rejects an alias that repeats the exercise's own name", () => {
    expect(validateCustomExercise(form({ aliasesText: 'zercher squat' }), existing).ok).toBe(false);
  });

  it('allows up to 20 aliases and rejects 21', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `alias${i}`).join(',');
    expect(validateCustomExercise(form({ aliasesText: many(20) }), existing).ok).toBe(true);
    expect(validateCustomExercise(form({ aliasesText: many(21) }), existing).ok).toBe(false);
  });

  it('rejects an alias over 60 characters but accepts exactly 60', () => {
    expect(validateCustomExercise(form({ aliasesText: 'x'.repeat(60) }), existing).ok).toBe(true);
    expect(validateCustomExercise(form({ aliasesText: 'x'.repeat(61) }), existing).ok).toBe(false);
  });

  it('counts the 1000 limit in bytes, so Devanagari aliases hit it sooner than their length suggests', () => {
    const hindi = Array.from(
      { length: 20 },
      (_, i) => `${'जिम'.repeat(6)}${String.fromCharCode(0x0915 + i)}`,
    );
    const text = hindi.join(',');
    expect(hindi.join(',').length).toBeLessThan(1000);
    expect(new TextEncoder().encode(text).length).toBeGreaterThan(1000);
    const r = validateCustomExercise(form({ aliasesText: text }), existing);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.aliases).toBeTruthy();
  });

  it('accepts a body part and equipment that are in the lists, and nothing else', () => {
    expect(validateCustomExercise(form({ equipmentType: 'ez_bar' }), existing).ok).toBe(true);
    expect(
      validateCustomExercise(form({ equipmentType: 'kettlebell' as never }), existing).ok,
    ).toBe(false);
    expect(validateCustomExercise(form({ bodyPart: 'arms' as never }), existing).ok).toBe(false);
  });
});

describe('highlightRange', () => {
  it.each([
    ['Incline bench press', 'inc', [0, 3]],
    ['Incline bench press', 'BENCH', [8, 13]],
    ['Incline bench press', 'bench press', [8, 13]],
    ['Push-Up', 'up', [5, 7]],
    ['Incline bench press', 'ench', null],
    ['Incline bench press', '', null],
    ['Incline bench press', '   ', null],
    ['Incline bench press', 'zzz', null],
    ['Press', 'pressing', null],
  ])('marks %j for %j', (name, query, expected) => {
    expect(highlightRange(name, query)).toEqual(expected);
  });
});

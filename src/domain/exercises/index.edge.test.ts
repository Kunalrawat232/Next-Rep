import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT_FILTERS,
  EQUIPMENT_LABEL,
  BODY_PART_LABEL,
  filterByEquipment,
  highlightRange,
  parseAliases,
  searchExercises,
  subtitleFor,
  validateCustomExercise,
  type CustomExerciseForm,
  type EquipmentFilter,
  type Exercise,
} from '.';
import curatedJson from '../exercises.seed.json';
import extendedJson from '../exercises.extended.json';
import { nameKey } from '../text';
import { parseExercises } from './catalog';
import type { Muscle } from './muscles';

const curated = parseExercises(curatedJson, 'curated');
const extended = parseExercises(extendedJson, 'imported');
const real = [...curated, ...extended];

const ex = (over: Partial<Exercise> & { name: string }): Exercise => ({
  id: over.name,
  equipmentType: 'barbell',
  bodyPart: 'upper',
  muscle: 'chest',
  aliases: [],
  tier: 'curated',
  ...over,
});
const names = (list: readonly Exercise[]) => list.map((e) => e.name);
const find = (list: Exercise[], q: string, equipment: EquipmentFilter = 'all') =>
  names(searchExercises(list, q, { equipment }).results);

/** Deterministic shuffle so a failure is reproducible. */
function shuffled<T>(list: readonly T[], seed: number): T[] {
  const out = [...list];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

describe('searchExercises edge: unicode and odd characters', () => {
  const lib = [
    ex({ name: 'Café Press', muscle: null, tier: 'imported' }),
    ex({ name: 'बेंच प्रेस', aliases: ['चेस्ट प्रेस'] }),
    ex({ name: 'Barbell Bench Press', aliases: ['bench'] }),
    ex({ name: 'C++ Curl', muscle: 'biceps' }),
    ex({ name: '💪 Pump Curl', muscle: 'biceps' }),
  ];

  it.each([
    ['cafe', ['Café Press']],
    ['CAFÉ', ['Café Press']],
    ['café', ['Café Press']], // decomposed e + combining acute
    ['बेंच', ['बेंच प्रेस']],
    ['चेस्ट', ['बेंच प्रेस']], // alias in Devanagari
    ['pump', ['💪 Pump Curl']],
  ])('finds %j', (query, expected) => {
    expect(find(lib, query)).toEqual(expected);
  });

  it('reads punctuation in a name as a space, so c++ curl finds C++ Curl first', () => {
    expect(find(lib, 'c++ curl')[0]).toBe('C++ Curl');
  });

  it('keeps Devanagari marks, so a different word with the same base letters does not match', () => {
    // बेंच = ब + े + ं + च. The bare consonants are a different word.
    expect(find(lib, 'बच')).toEqual([]);
  });

  it('treats a nukta typed as one letter or as letter + nukta as the same word', () => {
    const l = [ex({ name: 'क़दम' })]; // precomposed क़ (composition-excluded)
    expect(find(l, 'क़दम')).toHaveLength(1);
  });

  it.each(['😀', '💪', '🏋️‍♂️', '!!!', '---', '...', '(){}[]', '\\', '/', '"', "'", '#@$%^&*'])(
    'matches nothing for a query that is only symbols: %j',
    (query) => {
      const r = searchExercises(lib, query);
      expect(r.results).toEqual([]);
      expect(r.total).toBe(0);
    },
  );

  it('ignores an emoji next to a real word', () => {
    expect(find(lib, 'bench 💪')).toEqual(find(lib, 'bench'));
    expect(find(lib, '💪 bench')).toEqual(find(lib, 'bench'));
  });

  it.each(['.*', '[', ']', '(', '+', '\\d', '^bench$', 'bench|squat', '(?<x>', '$', '?', '{1,}'])(
    'never throws on a pattern-like query %j',
    (query) => {
      expect(() => searchExercises(lib, query)).not.toThrow();
    },
  );

  it('does not let a wildcard match everything', () => {
    expect(find(lib, '.*')).toEqual([]);
    expect(find(lib, 'b.nch')).toEqual([]);
  });

  it('treats a leading zero-width space as nothing', () => {
    expect(find(lib, '​bench')).toEqual(['Barbell Bench Press']);
  });

  it('does not split a word because a zero-width character was pasted inside it', () => {
    expect(find(lib, 'ben​ch')).toEqual(['Barbell Bench Press']);
    expect(find(lib, 'ben­ch')).toEqual(['Barbell Bench Press']); // soft hyphen
  });

  it('treats a non-breaking space like a normal space', () => {
    expect(find(lib, 'bench press')).toEqual(find(lib, 'bench press'));
    expect(searchExercises(lib, ' ').total).toBe(lib.length);
  });

  it('treats a zero-width-only query as no match rather than as blank', () => {
    expect(searchExercises(lib, '​').total).toBe(0);
  });
});

describe('searchExercises edge: long and repeated queries', () => {
  it('handles a 10 000 character single word without hanging or matching', () => {
    const t0 = performance.now();
    const r = searchExercises(real, 'a'.repeat(10_000));
    expect(r.total).toBe(0);
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it('handles thousands of repeated words and still finds the exercise', () => {
    const t0 = performance.now();
    const r = searchExercises(real, 'bench '.repeat(3000));
    expect(names(r.results)).toContain('Barbell Bench Press');
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('gives the same matches when a word is repeated', () => {
    const once = new Set(find(real, 'press'));
    expect(new Set(find(real, 'press press press'))).toEqual(once);
  });

  it('does not rank a repeated word above the single word for the best exercise', () => {
    expect(find(real, 'deadlift deadlift')[0]).toBe(find(real, 'deadlift')[0]);
  });
});

describe('searchExercises edge: a word matching several fields', () => {
  const lib = [
    ex({ name: 'Chest Press', aliases: ['chest'] }), // chest in name, alias and muscle
    ex({ name: 'Bench Press', aliases: ['bench'] }),
    ex({ name: 'Skull Crusher', muscle: 'triceps', aliases: ['bench skull'] }),
    ex({ name: 'Smith Squat', equipmentType: 'smith', bodyPart: 'lower', muscle: 'quads' }),
  ];

  it('counts a word once even if it hits name, alias and muscle, and puts the curated exercise first', () => {
    const l = [...lib, ex({ name: 'Chest', muscle: 'chest', tier: 'imported' })];
    expect(find(l, 'chest')[0]).toBe('Chest Press'); // curated before imported
    const imported = [
      ex({ name: 'Chest', muscle: 'chest', tier: 'imported' }),
      ex({ name: 'Chest Press', muscle: 'chest', tier: 'imported' }),
    ];
    expect(find(imported, 'chest')[0]).toBe('Chest'); // among equals, the exact name wins
  });

  it('needs different words to match in different fields', () => {
    expect(find(lib, 'bench triceps')).toEqual(['Skull Crusher']);
    expect(find(lib, 'bench chest')).toEqual(['Bench Press']);
  });

  it('does not find smith by the word machine, matching the Machine chip that excludes it', () => {
    expect(find(lib, 'machine')).toEqual([]);
    expect(find(lib, 'smith')).toEqual(['Smith Squat']);
    expect(find(lib, 'smith', 'barbell')).toEqual(['Smith Squat']);
  });

  it('matches body part and equipment words together with a name word', () => {
    expect(find(lib, 'lower smith squat')).toEqual(['Smith Squat']);
    expect(find(lib, 'upper smith')).toEqual([]);
  });
});

describe('searchExercises edge: filters, limit and input safety', () => {
  const lib = [
    ex({ name: 'B', equipmentType: 'barbell' }),
    ex({ name: 'E', equipmentType: 'ez_bar' }),
    ex({ name: 'S', equipmentType: 'smith' }),
    ex({ name: 'D', equipmentType: 'dumbbell' }),
    ex({ name: 'M', equipmentType: 'machine' }),
    ex({ name: 'C', equipmentType: 'cable' }),
    ex({ name: 'W', equipmentType: 'bodyweight' }),
  ];

  it.each([
    ['all', ['B', 'C', 'D', 'E', 'M', 'S', 'W']],
    ['barbell', ['B', 'E', 'S']],
    ['dumbbell', ['D']],
    ['machine', ['M']],
    ['cable', ['C']],
    ['bodyweight', ['W']],
  ] as const)('filter %s keeps exactly the right exercises', (filter, expected) => {
    expect(names(filterByEquipment(lib, filter)).sort()).toEqual([...expected]);
  });

  it('returns an empty list for an empty library and for an unknown chip', () => {
    for (const f of EQUIPMENT_FILTERS) expect(filterByEquipment([], f)).toEqual([]);
    expect(filterByEquipment(lib, 'banana' as EquipmentFilter)).toEqual([]);
  });

  it('returns a copy for "all", so callers can sort without touching the library', () => {
    const out = filterByEquipment(lib, 'all');
    expect(out).not.toBe(lib);
    expect(out).toEqual(lib);
  });

  it("does not reorder the caller's list, with or without a query", () => {
    const before = names(lib);
    searchExercises(lib, '');
    searchExercises(lib, 'b');
    searchExercises(lib, '', { equipment: 'barbell' });
    expect(names(lib)).toEqual(before);
  });

  it('splits the real library into the five chips with nothing lost or counted twice', () => {
    const chips = EQUIPMENT_FILTERS.filter((f) => f !== 'all');
    const parts = chips.flatMap((f) => filterByEquipment(real, f));
    expect(parts).toHaveLength(real.length);
    expect(new Set(parts.map((e) => e.id)).size).toBe(real.length);
  });

  it('applies the filter before counting the total', () => {
    const all = searchExercises(real, 'bench');
    const dumb = searchExercises(real, 'bench', { equipment: 'dumbbell' });
    expect(dumb.total).toBeLessThan(all.total);
    expect(dumb.results.every((e) => e.equipmentType === 'dumbbell')).toBe(true);
  });

  it.each([
    [0, 0],
    [1, 1],
    [5, 5],
    [10_000, null],
  ])('limit %j cuts the list but keeps the total', (limit, expectedLength) => {
    const full = searchExercises(real, 'curl');
    const r = searchExercises(real, 'curl', { limit });
    expect(r.total).toBe(full.total);
    expect(r.results).toHaveLength(expectedLength ?? full.total);
    expect(names(r.results)).toEqual(names(full.results).slice(0, limit));
  });

  it('never returns more than the total, even for a negative limit', () => {
    const r = searchExercises(real, 'curl', { limit: -1 });
    // A negative limit must not quietly mean "all but the last".
    expect(r.results.length).toBeLessThanOrEqual(0);
  });
});

describe('searchExercises edge: ranking over the real library', () => {
  it.each(['bench', 'squat', 'deadlift', 'curl', 'row'])(
    'puts a curated exercise first for the voice word %j',
    (word) => {
      const top = searchExercises(real, word).results[0];
      expect(top?.tier, `${word} -> ${top?.name}`).toBe('curated');
    },
  );

  it('ranks each curated exercise above all imported ones when the query is its exact name', () => {
    const offenders = curated
      .map((e) => ({ e, top: searchExercises(real, e.name).results[0] }))
      .filter(({ e, top }) => top?.id !== e.id)
      .map(({ e, top }) => `${e.name} -> ${top?.name}`);
    expect(offenders).toEqual([]);
  });

  it('never lets an imported exercise outrank curated ones for a curated alias', () => {
    const offenders: string[] = [];
    for (const e of curated) {
      for (const alias of e.aliases) {
        const top = searchExercises(real, alias).results[0];
        if (top?.tier === 'imported') offenders.push(`${alias} -> ${top.name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('gives the same order whatever order the library arrives in', () => {
    for (const q of ['bench', 'curl', 'press', 'a', 'e', 'legs', 'back', 'pull up', 'dumbbell']) {
      const base = names(searchExercises(real, q).results);
      for (const seed of [1, 7, 99]) {
        expect(names(searchExercises(shuffled(real, seed), q).results), `${q}/${seed}`).toEqual(
          base,
        );
      }
    }
  });

  it('lists the blank query in the same order whatever order the library arrives in', () => {
    const base = names(searchExercises(real, '').results);
    expect(names(searchExercises(shuffled(real, 5), '').results)).toEqual(base);
  });

  it('returns each exercise at most once', () => {
    for (const q of ['a', 'press', 'arms', 'back', 'e']) {
      const r = names(searchExercises(real, q).results);
      expect(new Set(r).size).toBe(r.length);
    }
  });
});

describe('searchExercises edge: muscle words people say', () => {
  const expectedMuscles: [string, Muscle[]][] = [
    ['pecs', ['chest']],
    ['pec', ['chest']],
    ['delts', ['shoulders']],
    ['quads', ['quads']],
    ['lats', ['lats']],
    ['legs', ['quads', 'hamstrings', 'calves', 'adductors', 'abductors', 'glutes']],
    ['arms', ['biceps', 'triceps', 'forearms']],
    ['back', ['lats', 'upper_back', 'lower_back', 'traps']],
  ];

  it.each(expectedMuscles)('%s finds the muscle group at all', (word, muscles) => {
    const results = searchExercises(real, word).results;
    expect(results.some((e) => e.muscle && muscles.includes(e.muscle))).toBe(true);
  });

  // "back" is left out: "Barbell Back Squat" has the word in its name and is a curated exercise,
  // so it rightly comes first.
  it.each(expectedMuscles.filter(([word]) => word !== 'back'))(
    'the first three results for %s train that muscle, not a name that merely contains the word',
    (word, muscles) => {
      const top = searchExercises(real, word).results.slice(0, 3);
      for (const e of top) {
        expect(e.muscle && muscles.includes(e.muscle), `${word} -> ${e.name} (${e.muscle})`).toBe(
          true,
        );
      }
    },
  );

  it('keeps a muscle word and an equipment chip working together', () => {
    const r = searchExercises(real, 'pecs', { equipment: 'cable' }).results;
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.equipmentType === 'cable')).toBe(true);
  });
});

describe('the bundled library: voice words stay unambiguous', () => {
  it('shares no curated alias between two curated exercises', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const e of curated) {
      for (const a of new Set(e.aliases.map(nameKey))) {
        const prev = owner.get(a);
        if (prev && prev !== e.name) clashes.push(`${a}: ${prev} / ${e.name}`);
        owner.set(a, e.name);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("never uses one exercise's alias as another exercise's name", () => {
    const byName = new Map(real.map((e) => [nameKey(e.name), e.name]));
    const clashes: string[] = [];
    for (const e of real)
      for (const a of e.aliases) {
        const hit = byName.get(nameKey(a));
        if (hit && hit !== e.name) clashes.push(`${a}: ${e.name} / ${hit}`);
      }
    expect(clashes).toEqual([]);
  });

  it('has no curated alias that repeats its own name', () => {
    for (const e of curated) expect(e.aliases.map(nameKey), e.name).not.toContain(nameKey(e.name));
  });
});

describe('subtitleFor edge', () => {
  it('never prints undefined or null for any exercise in the library', () => {
    for (const e of real) {
      const s = subtitleFor(e);
      expect(s, e.name).not.toMatch(/undefined|null/);
      expect(s, e.name).toContain(' · ');
    }
  });

  it.each(Object.entries(EQUIPMENT_LABEL))('labels equipment %s as %s', (type, label) => {
    expect(subtitleFor(ex({ name: 'x', equipmentType: type as Exercise['equipmentType'] }))).toBe(
      `${label} · Chest`,
    );
  });

  it.each(Object.entries(BODY_PART_LABEL))('falls back to body part %s as %s', (part, label) => {
    expect(
      subtitleFor(ex({ name: 'x', muscle: null, bodyPart: part as Exercise['bodyPart'] })),
    ).toBe(`Barbell · ${label}`);
  });

  it('prefers the muscle over the body part and ignores the name', () => {
    expect(subtitleFor(ex({ name: '💪 <b>x</b>', muscle: 'upper_back', bodyPart: 'core' }))).toBe(
      'Barbell · Upper back',
    );
  });
});

describe('parseAliases edge', () => {
  const bytes = (s: string) => new TextEncoder().encode(s).length;

  it.each([
    [',', []],
    [' , , ,', []],
    ['\n', []],
    ['a\nb', ['a b']], // a pasted line break is a space, not a split
    ['a\tb', ['a b']],
    ['Bench, bench, BENCH', ['Bench']],
    ['café, café', ['café']], // same word in two Unicode forms
    ['a  b, a b, A B', ['a b']],
    ['बेंच प्रेस, बेंच  प्रेस', ['बेंच प्रेस']],
    ['a;b', ['a;b']], // only commas split
    ['  x  ', ['x']],
    ['💪, 💪', ['💪']],
  ])('reads %j', (text, expected) => {
    expect(parseAliases(text)).toEqual(expected);
  });

  it('keeps the first spelling and the original order', () => {
    expect(parseAliases('b, A, a, B, c')).toEqual(['b', 'A', 'c']);
  });

  it('treats a full-width or Arabic comma as a separator too, since phone keyboards type them', () => {
    expect(parseAliases('bench，press')).toEqual(['bench', 'press']);
    expect(parseAliases('bench،press')).toEqual(['bench', 'press']);
  });

  it('is a pure function of its input', () => {
    const t = 'a, b, a';
    expect(parseAliases(t)).toEqual(parseAliases(t));
    expect(bytes('')).toBe(0);
  });
});

describe('validateCustomExercise edge', () => {
  const form = (over: Partial<CustomExerciseForm> = {}): CustomExerciseForm => ({
    name: 'Zercher squat',
    equipmentType: 'barbell',
    bodyPart: 'lower',
    aliasesText: 'zercher',
    ...over,
  });
  const existing = [
    ex({ name: 'Café Press', aliases: ['Dead  Lift', 'ça va'] }),
    ex({ name: 'बेंच प्रेस', aliases: ['चेस्ट'] }),
  ];
  const run = (over: Partial<CustomExerciseForm>, list: readonly Exercise[] = existing) =>
    validateCustomExercise(form(over), list);
  const bytes = (s: string) => new TextEncoder().encode(s).length;

  /** 20 distinct aliases whose comma-joined text is exactly `target` bytes. */
  function aliasesOfBytes(target: number, unit: string): string[] {
    const count = 20;
    const each = Math.floor((target - (count - 1)) / count);
    const out = Array.from({ length: count }, (_, i) => {
      const lead = String.fromCharCode(97 + i);
      const room = each - 1;
      return lead + unit.repeat(Math.floor(room / bytes(unit))) + 'x'.repeat(room % bytes(unit));
    });
    const extra = target - bytes(out.join(','));
    out[count - 1] += 'x'.repeat(extra);
    return out;
  }

  describe('the 1000 byte limit', () => {
    it.each([
      ['ASCII', 'x'],
      ['accented Latin (2 bytes)', 'é'],
      ['Devanagari (3 bytes)', 'ज'],
    ])('accepts exactly 1000 bytes and rejects 1001: %s', (_label, unit) => {
      const ok = aliasesOfBytes(1000, unit);
      expect(bytes(ok.join(','))).toBe(1000);
      expect(ok.every((a) => a.length <= 60)).toBe(true);
      expect(run({ aliasesText: ok.join(',') }).ok).toBe(true);

      const tooBig = aliasesOfBytes(1001, unit);
      expect(bytes(tooBig.join(','))).toBe(1001);
      const r = run({ aliasesText: tooBig.join(',') });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.aliases).toBeTruthy();
    });

    it('counts the commas between aliases, not only the letters', () => {
      const a = aliasesOfBytes(1000, 'x');
      const withoutCommas = bytes(a.join(''));
      expect(withoutCommas).toBe(981);
      expect(run({ aliasesText: [...a.slice(0, 19), a[19] + 'x'].join(',') }).ok).toBe(false);
    });

    it('measures the cleaned aliases, so extra spaces and repeats do not count', () => {
      const a = aliasesOfBytes(1000, 'x');
      const padded = a.map((x) => `   ${x}   `).join(' ,  ');
      expect(run({ aliasesText: `${padded}, ${a[0]}` }).ok).toBe(true);
    });
  });

  describe('name and alias clashes', () => {
    it.each([
      ['case', 'CAFÉ PRESS'],
      ['inner spacing', 'Café   Press'],
      ['decomposed accent', 'Café Press'],
      ['non-breaking space', 'Café Press'],
      ['an existing alias, spaced and cased', ' dead lift '],
      ['a Devanagari name', 'बेंच  प्रेस'],
      ['a Devanagari alias', 'चेस्ट'],
    ])('rejects a name that clashes by %s', (_l, name) => {
      const r = run({ name });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.name).toMatch(/already/i);
    });

    it('rejects an alias that clashes with an existing alias or name, cased or spaced differently', () => {
      const r = run({ aliasesText: 'fine, DEAD   LIFT, café press' });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors.aliases).toMatch(/dead lift/i);
        expect(r.errors.aliases).not.toMatch(/fine/);
      }
    });

    it('rejects an alias that equals the new name in another case or spacing', () => {
      expect(run({ aliasesText: 'ZERCHER   SQUAT' }).ok).toBe(false);
    });

    it('treats accent-stripped spellings as the same word, since search does', () => {
      // Search matches "cafe" to "Café", so saying "cafe" would be ambiguous.
      expect(run({ name: 'Cafe Press' }).ok).toBe(false);
      expect(run({ aliasesText: 'cafe press' }).ok).toBe(false);
    });

    it('accepts a name that merely contains an existing name', () => {
      expect(run({ name: 'Café Press Plus', aliasesText: 'dead' }).ok).toBe(true);
    });

    it('ignores an empty existing list', () => {
      expect(run({}, []).ok).toBe(true);
    });
  });

  describe('name limits', () => {
    it('accepts 80 characters padded with spaces', () => {
      const r = run({ name: `   ${'x'.repeat(80)}   ` });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.name).toHaveLength(80);
    });

    it('counts the cleaned name, so 80 decomposed accents are 80 characters', () => {
      expect(run({ name: 'é'.repeat(80) }).ok).toBe(true);
      expect(run({ name: 'é'.repeat(81) }).ok).toBe(false);
    });

    it('rejects a name made only of zero-width or invisible characters', () => {
      for (const name of ['​', '​​', '⁠', '﻿']) {
        expect(run({ name }).ok, JSON.stringify(name)).toBe(false);
      }
    });

    it('treats line breaks and tabs in a pasted name as single spaces', () => {
      const r = run({ name: 'Zercher\n\tsquat' });
      expect(r.ok && r.value.name).toBe('Zercher squat');
    });
  });

  describe('several problems at once', () => {
    it('reports every field that is wrong, not just the first', () => {
      const r = run({ name: '', equipmentType: '', bodyPart: '', aliasesText: 'x'.repeat(61) });
      expect(r.ok).toBe(false);
      if (!r.ok)
        expect(Object.keys(r.errors).sort()).toEqual([
          'aliases',
          'bodyPart',
          'equipmentType',
          'name',
        ]);
    });

    it.each([
      '',
      'Barbell',
      'BARBELL',
      ' barbell',
      'ez bar',
      'kettlebell',
      'constructor',
      '__proto__',
    ])('rejects equipment %j', (equipmentType) => {
      const r = run({ equipmentType });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.equipmentType).toBeTruthy();
    });

    it.each(['', 'Upper', 'arms', 'legs', 'toString'])('rejects body part %j', (bodyPart) => {
      const r = run({ bodyPart });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.bodyPart).toBeTruthy();
    });

    it('still validates when there are no aliases', () => {
      const r = run({ aliasesText: '' });
      expect(r.ok && r.value.aliases).toEqual([]);
    });

    it('reports the alias count error before a clash, and a long alias before the byte limit', () => {
      const many = Array.from({ length: 21 }, (_, i) => `a${i}`).join(',') + ',dead lift';
      const r = run({ aliasesText: many });
      expect(!r.ok && r.errors.aliases).toMatch(/20/);
    });

    it('does not mutate the existing list', () => {
      const snapshot = JSON.stringify(existing);
      run({ name: 'Café Press' });
      expect(JSON.stringify(existing)).toBe(snapshot);
    });
  });
});

describe('highlightRange edge', () => {
  it.each([
    ['Push (Up)', '(', [5, 6]],
    ['Push-Up', 'push-up', [0, 7]],
    ['Push-Up', 'push up', [0, 4]], // only the first word is marked
    ['Push-Up', '-', null],
    ['💪 Curl', 'curl', [3, 7]],
    ['Curl', 'curl curl', [0, 4]],
    ['Curl', 'curls', null],
    ['', 'x', null],
    ['x', '.*', null],
    ['a.b', 'a.b', [0, 3]],
    ['aXb', 'a.b', null],
    ['बेंच प्रेस', 'प्रेस', [5, 10]],
    ['Bench', '\t bench \n', [0, 5]],
  ])('marks %j for %j', (name, query, expected) => {
    expect(highlightRange(name, query)).toEqual(expected);
  });

  it('does not mark the middle of a Devanagari word that follows a vowel sign', () => {
    // च follows the anusvara ं inside बेंच, so it is not the start of a word.
    expect(highlightRange('बेंच', 'च')).toBeNull();
  });

  it('marks accented names the way search finds them', () => {
    expect(find([ex({ name: 'Café Press' })], 'cafe')).toHaveLength(1);
    expect(highlightRange('Café Press', 'cafe')).toEqual([0, 4]);
  });

  it('returns offsets into the original name even when lower-casing changes its length', () => {
    // "İ".toLowerCase() is two UTF-16 units, which shifts every later index by one.
    const name = 'İnce Bench';
    const range = highlightRange(name, 'bench');
    expect(range).not.toBeNull();
    if (range) expect(name.slice(range[0], range[1])).toBe('Bench');
  });

  it('always returns a slice of the name that starts with the query, for every library name', () => {
    for (const e of real.slice(0, 400)) {
      const first = e.name.split(/[^\p{L}\p{N}]+/u).find(Boolean) ?? '';
      const q = first.slice(0, 3).toLowerCase();
      const r = highlightRange(e.name, q);
      expect(r, e.name).not.toBeNull();
      if (r) expect(e.name.slice(r[0], r[1]).toLowerCase(), e.name).toBe(q);
    }
  });
});

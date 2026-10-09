import { describe, expect, it } from 'vitest';
import {
  barFor,
  formatKg,
  pickDefaultGym,
  summarizeBars,
  validateGymForm,
  type Gym,
  type GymForm,
} from '.';

const form = (over: Partial<GymForm> = {}): GymForm => ({
  name: 'Home gym',
  barbellKg: '15',
  bars: [],
  ...over,
});
const bar = (name: string, weightKg: string, kind: GymForm['bars'][number]['kind'] = 'other') => ({
  name,
  weightKg,
  kind,
});
const gym = (over: Partial<Gym> = {}): Gym => ({
  id: 'g1',
  name: 'Home gym',
  barbellKg: 15,
  isDefault: false,
  createdAt: '2026-10-01T10:00:00Z',
  bars: [],
  ...over,
});

const barbellOutcome = (text: string) => {
  const r = validateGymForm(form({ barbellKg: text }));
  return r.ok ? r.value.barbellKg : r.errors.barbellKg;
};

describe('validateGymForm: odd numeric input', () => {
  it.each<[string, string, number]>([
    ['tabs and newlines around the number', '\t 20 \n', 20],
    ['non-breaking space padding', ' 20 ', 20],
    ['leading zeros', '007.5', 7.5],
    ['comma decimal', '7,5', 7.5],
    ['more than 2 decimals rounds to 2', '7.504', 7.5],
    ['just over the 2 decimal boundary rounds up', '7.506', 7.51],
    ['lower bound 0 (documented range min)', '0', 0],
    ['upper bound 100', '100', 100],
    ['100.004 rounds down to the upper bound', '100.004', 100],
    ['a tiny positive value that rounds to zero', '0.0001', 0],
    ['very many leading zeros', '0'.repeat(500) + '5', 5],
    ['a leading dot', '.5', 0.5],
    ['a trailing dot', '5.', 5],
  ])('accepts %s', (_label, text, kg) => {
    expect(barbellOutcome(text)).toBe(kg);
  });

  it.each<[string, string]>([
    ['empty', ''],
    ['only spaces', '   '],
    ['lone dot', '.'],
    ['exponent', '1e1'],
    ['capital exponent', '2E0'],
    ['hex', '0x10'],
    ['negative', '-5'],
    ['explicit plus', '+5'],
    ['unit suffix', '20kg'],
    ['unit with space', '20 kg'],
    ['two decimal points', '7.5.1'],
    ['two commas', '7,5,1'],
    ['dot and comma', '7.5,1'],
    ['inner space', '7 5'],
    ['Infinity', 'Infinity'],
    ['NaN', 'NaN'],
    ['Arabic-Indic digits', '٢٠'],
    ['Devanagari digits', '१५'],
    ['fullwidth digits', '２０'],
    ['zero-width space inside', '2​0'],
    ['Hinglish words', 'bees kilo'],
    ['thousands separator with decimals', '1,000.5'],
  ])('rejects %s as not a plain number', (_label, text) => {
    expect(barbellOutcome(text)).toEqual(expect.any(String));
  });

  it.each<[string, string]>([
    ['just over the max', '100.01'],
    ['far over the max', '101'],
    ['5000 digit number (Infinity after Number())', '9'.repeat(5000)],
    ['hundred digits', '1' + '0'.repeat(100)],
  ])('rejects %s as out of range', (_label, text) => {
    expect(barbellOutcome(text)).toMatch(/between 0 and 100/);
  });

  it('never throws on a very long fractional string and still accepts a sane value', () => {
    expect(barbellOutcome('15.' + '0'.repeat(10000))).toBe(15);
  });

  it('refuses a thousands separator instead of reading it as a decimal point (1,000 is not 1 kg)', () => {
    // "1,000" is 1000 in en-IN / en-GB. Silently storing 1 kg is a wrong number reaching storage.
    expect(barbellOutcome('1,000')).toEqual(expect.any(String));
  });
});

describe('validateGymForm: names', () => {
  it.each<[string, string]>([
    ['empty', ''],
    ['spaces', '    '],
    ['tabs and newlines', '\t\n '],
    ['non-breaking spaces', '  '],
    ['ideographic space', '　'],
  ])('rejects a gym name that is only whitespace: %s', (_label, name) => {
    const r = validateGymForm(form({ name }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.name).toBe('Give the gym a name.');
  });

  it.each<[string, string]>([
    ['Devanagari', 'जिम'],
    ['Hinglish', 'Mera apna gym'],
    ['accented', 'Café Fitnéss'],
    ['emoji', '💪 Home'],
    ['markup stays plain text', '<b>Gym</b> & "co"'],
    ['sql-ish', "Robert'); DROP TABLE gyms;--"],
  ])('keeps a %s name byte for byte (after trimming)', (_label, name) => {
    const r = validateGymForm(form({ name: `  ${name}  ` }));
    expect(r.ok && r.value.name).toBe(name);
  });

  it('accepts exactly 80 UTF-16 units and rejects 81', () => {
    expect(validateGymForm(form({ name: 'é'.repeat(80) })).ok).toBe(true);
    expect(validateGymForm(form({ name: 'é'.repeat(81) })).ok).toBe(false);
  });

  it('counts the limit after trimming, so padding cannot push a valid name over', () => {
    expect(validateGymForm(form({ name: ' ' + 'a'.repeat(80) + ' ' })).ok).toBe(true);
  });

  it('rejects a gym name of 10000 characters without throwing', () => {
    const r = validateGymForm(form({ name: 'x'.repeat(10000) }));
    expect(r.ok).toBe(false);
  });
});

describe('validateGymForm: duplicate detection', () => {
  const dupes = (a: string, b: string) => {
    const r = validateGymForm(form({ bars: [bar(a, '10'), bar(b, '12')] }));
    return !r.ok && r.errors.bars[1]?.name === 'A bar with this name already exists.';
  };

  it.each<[string, string, string, boolean]>([
    ['same name', 'Trap bar', 'Trap bar', true],
    ['different case', 'Trap bar', 'TRAP BAR', true],
    ['padding', 'Trap bar', '  Trap bar\t', true],
    ['Cyrillic case', 'Штанга', 'шТАНГА', true],
    ['Greek case', 'ΒΆΡΟΣ', 'βάρος', true],
    ['clearly different names', 'Trap bar', 'Safety squat bar', false],
    ['prefix of the other', 'Bar', 'Bar 2', false],
  ])('%s: %s vs %s', (_label, a, b, expected) => {
    expect(dupes(a, b)).toBe(expected);
  });

  it('the same accented name in composed and decomposed Unicode is not seen as a duplicate', () => {
    expect(dupes('Café bar', 'Café bar')).toBe(true);
  });

  it('names that differ only by inner spacing are not seen as duplicates', () => {
    expect(dupes('Trap bar', 'Trap  bar')).toBe(true);
  });

  it('reports a duplicate on the later bar only, never the first', () => {
    const r = validateGymForm(form({ bars: [bar('A', '10'), bar('a', '12'), bar('A ', '14')] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors.bars)).toEqual(['1', '2']);
  });

  it('still reports a missing bar name when another bar is also blank', () => {
    const r = validateGymForm(form({ bars: [bar('', '10'), bar('  ', '12')] }));
    expect(!r.ok && [r.errors.bars[0]?.name, r.errors.bars[1]?.name]).toEqual([
      'Give the bar a name.',
      'Give the bar a name.',
    ]);
  });

  it('rejects the second EZ bar even when its name is different', () => {
    const r = validateGymForm(
      form({ bars: [bar('EZ', '7', 'ez_bar'), bar('Curl', '8', 'ez_bar')] }),
    );
    expect(!r.ok && r.errors.bars[1]?.name).toBe('This gym already has that kind of bar.');
  });

  it('a bar that fails its own name check still uses up the kind, hiding the real culprit', () => {
    // The first EZ bar has a blank name, the second is fine. Only the first should be flagged.
    const r = validateGymForm(
      form({ bars: [bar('', '7', 'ez_bar'), bar('EZ bar', '7', 'ez_bar')] }),
    );
    expect(!r.ok && r.errors.bars[1]).toBeUndefined();
  });

  it('allows one EZ bar and one Smith bar together', () => {
    expect(
      validateGymForm(form({ bars: [bar('EZ', '7', 'ez_bar'), bar('Smith', '15', 'smith')] })).ok,
    ).toBe(true);
  });
});

describe('validateGymForm: many bars and shape', () => {
  it('accepts 200 distinct other bars, keeps their order and does not mutate the input', () => {
    const bars = Array.from({ length: 200 }, (_, i) => bar(`Bar ${i}`, String(i % 100)));
    const input = form({ bars });
    const copy = structuredClone(input);
    const r = validateGymForm(input);
    expect(r.ok && r.value.bars.map((b) => b.name)).toEqual(bars.map((b) => b.name));
    expect(input).toEqual(copy);
  });

  it('reports errors at the right indexes among many bars', () => {
    const bars = Array.from({ length: 50 }, (_, i) =>
      bar(`Bar ${i}`, i === 7 || i === 42 ? 'x' : '5'),
    );
    const r = validateGymForm(form({ bars }));
    expect(!r.ok && Object.keys(r.errors.bars)).toEqual(['7', '42']);
  });

  it('reports gym, barbell and bar errors together, not just the first', () => {
    const r = validateGymForm(form({ name: '', barbellKg: 'x', bars: [bar('', '')] }));
    expect(r).toEqual({
      ok: false,
      errors: {
        name: 'Give the gym a name.',
        barbellKg: 'Use numbers only, for example 7.5.',
        bars: { 0: { name: 'Give the bar a name.', weightKg: 'Enter a weight in kg.' } },
      },
    });
  });

  it('passes bar ids through untouched, including when the bar has none', () => {
    const r = validateGymForm(form({ bars: [{ id: 'abc', ...bar('A', '5') }, bar('B', '6')] }));
    expect(r.ok && r.value.bars.map((b) => b.id)).toEqual(['abc', undefined]);
  });

  it('is deterministic: the same form gives equal results twice', () => {
    const f = form({ name: ' x ', bars: [bar('A', '5,5')] });
    expect(validateGymForm(f)).toEqual(validateGymForm(f));
  });
});

describe('validateGymForm: seeded property checks (fast-check is not a dependency)', () => {
  // Small deterministic PRNG (mulberry32) so failures are reproducible.
  function rng(seed: number) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const alphabet = ['0', '1', '5', '9', '.', ',', ' ', '-', 'e', 'x', '٣', '\t', '+'];
  const randomText = (next: () => number) =>
    Array.from(
      { length: Math.floor(next() * 9) },
      () => alphabet[Math.floor(next() * alphabet.length)],
    ).join('');

  it('never throws, and ok is true exactly when no error is present, for 2000 random forms', () => {
    const next = rng(42);
    for (let i = 0; i < 2000; i++) {
      const f = form({
        name: randomText(next),
        barbellKg: randomText(next),
        bars: Array.from({ length: Math.floor(next() * 4) }, () =>
          bar(randomText(next), randomText(next)),
        ),
      });
      const r = validateGymForm(f);
      if (r.ok) {
        expect(r.value.barbellKg).toBeGreaterThanOrEqual(0);
        expect(r.value.barbellKg).toBeLessThanOrEqual(100);
        expect(Number.isFinite(r.value.barbellKg)).toBe(true);
        r.value.bars.forEach((b) => {
          expect(b.weightKg).toBeGreaterThanOrEqual(0);
          expect(b.weightKg).toBeLessThanOrEqual(100);
          expect(b.name).toBe(b.name.trim());
          expect(b.name).not.toBe('');
        });
      } else {
        const e = r.errors;
        expect(e.name || e.barbellKg || Object.keys(e.bars).length).toBeTruthy();
      }
    }
  });

  it('round-trips any value with at most 2 decimals in range, with dot or comma', () => {
    const next = rng(7);
    for (let i = 0; i < 1000; i++) {
      const cents = Math.floor(next() * 10001);
      const kg = cents / 100;
      const text = kg.toFixed(2);
      expect(barbellOutcome(text)).toBe(kg);
      expect(barbellOutcome(text.replace('.', ','))).toBe(kg);
    }
  });
});

describe('formatKg', () => {
  it.each<[number, string]>([
    [0, '0'],
    [-0, '0'],
    [20, '20'],
    [7.5, '7.5'],
    [7.25, '7.25'],
    [0.1 + 0.2, '0.3'],
    [7.504, '7.5'],
    [7.506, '7.51'],
    [100, '100'],
    [1e-7, '0'],
    [123456.789, '123456.79'],
  ])('formats %s as %s', (kg, text) => {
    expect(formatKg(kg)).toBe(text);
  });

  it('is idempotent through Number()', () => {
    for (const kg of [0.3, 7.5, 12.34, 99.99, 0.01]) {
      expect(formatKg(Number(formatKg(kg)))).toBe(formatKg(kg));
    }
  });
});

describe('summarizeBars', () => {
  it('uses the same trimmed number format for every bar and keeps order', () => {
    const g = gym({
      barbellKg: 20,
      bars: [
        { id: 'a', name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' },
        { id: 'b', name: 'Trap', weightKg: 25.0, kind: 'other' },
        { id: 'c', name: 'Safety', weightKg: 0.1 + 0.2, kind: 'other' },
      ],
    });
    expect(summarizeBars(g)).toBe('Barbell 20 kg · EZ bar 7.5 kg · Trap 25 kg · Safety 0.3 kg');
  });

  it('handles 100 bars without dropping any', () => {
    const bars = Array.from({ length: 100 }, (_, i) => ({
      id: `b${i}`,
      name: `B${i}`,
      weightKg: i,
      kind: 'other' as const,
    }));
    expect(summarizeBars(gym({ bars })).split(' · ')).toHaveLength(101);
  });

  it('prints bar names as given, including markup and a separator dot', () => {
    const g = gym({ bars: [{ id: 'a', name: '<i>x</i> · y', weightKg: 1, kind: 'other' }] });
    expect(summarizeBars(g)).toBe('Barbell 15 kg · <i>x</i> · y 1 kg');
  });
});

describe('pickDefaultGym', () => {
  it('takes the first marked gym when data wrongly has two defaults', () => {
    const a = gym({ id: 'a', isDefault: true });
    const b = gym({ id: 'b', isDefault: true });
    expect(pickDefaultGym([a, b])?.id).toBe('a');
  });

  it('breaks a createdAt tie by list order, without reordering', () => {
    const a = gym({ id: 'a' });
    const b = gym({ id: 'b' });
    expect(pickDefaultGym([a, b])?.id).toBe('a');
    expect(pickDefaultGym([b, a])?.id).toBe('b');
  });

  it('picks the oldest among many unmarked gyms, whatever the input order', () => {
    const gyms = Array.from({ length: 30 }, (_, i) =>
      gym({ id: `g${i}`, createdAt: `2026-10-${String(30 - i).padStart(2, '0')}T10:00:00Z` }),
    );
    expect(pickDefaultGym(gyms)?.id).toBe('g29');
    expect(pickDefaultGym([...gyms].reverse())?.id).toBe('g29');
  });

  it('a timestamp with fractional seconds sorts before the same second without them', () => {
    const early = gym({ id: 'early', createdAt: '2026-10-01T10:00:00+00:00' });
    const late = gym({ id: 'late', createdAt: '2026-10-01T10:00:00.5+00:00' });
    expect(pickDefaultGym([late, early])?.id).toBe('early');
  });

  it('createdAt is compared as text, so a +05:30 timestamp can win over an older UTC one', () => {
    // 10:00+05:30 is 04:30Z, older than 06:00Z, but sorts after it as a string.
    const older = gym({ id: 'older', createdAt: '2026-10-01T10:00:00+05:30' });
    const newer = gym({ id: 'newer', createdAt: '2026-10-01T06:00:00Z' });
    expect(pickDefaultGym([newer, older])?.id).toBe('older');
  });
});

describe('barFor', () => {
  const g = gym({
    barbellKg: 0,
    bars: [
      { id: 'a', name: 'EZ', weightKg: 7.5, kind: 'ez_bar' },
      { id: 'b', name: 'EZ 2', weightKg: 9, kind: 'ez_bar' },
      { id: 'c', name: 'Other', weightKg: 12, kind: 'other' },
    ],
  });

  it('returns a barbell of 0 as 0, not as "no answer"', () => {
    expect(barFor(g, 'barbell')).toBe(0);
  });

  it('uses the first bar when corrupt data has two of one kind', () => {
    expect(barFor(g, 'ez_bar')).toBe(7.5);
  });

  it('has no answer for smith when only an other bar exists, and none for non-bar equipment', () => {
    expect(barFor(g, 'smith')).toBeUndefined();
    for (const eq of ['dumbbell', 'machine', 'cable', 'bodyweight', 'other'] as const) {
      expect(barFor(g, eq as never)).toBeUndefined();
    }
  });

  it('has no answer for an equipment value that is not in the type (bad data)', () => {
    expect(barFor(g, 'hammer' as never)).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import seed from '../exercises.seed.json';
import { parseExercises } from '../exercises/catalog';
import { ParseResultSchema, parseTranscript } from '.';

const exercises = parseExercises(seed, 'curated');

/** A small seeded generator, so a failure can be repeated. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const WORDS = [
  'bench',
  'press',
  'squat',
  'kg',
  'kilo',
  'lb',
  'pounds',
  'reps',
  'for',
  'x',
  'each',
  'side',
  'total',
  'sixty',
  'two',
  'point',
  'five',
  'and',
  'a',
  'half',
  'hundred',
  'same',
  'again',
  'undo',
  'rest',
  'seconds',
  'minutes',
  'make',
  'it',
  'change',
  'that',
  'to',
  'um',
  'ignore',
  'instructions',
  '62.5',
  '8',
  '0',
  '-5',
  '1e9',
  '99999999999',
  'ek',
  'do',
  'baar',
  'har',
  '😀',
  '\u0000',
  '<b>',
  '"',
  '\\',
];

describe('parser properties', () => {
  it('never throws, and always returns a valid result that keeps the transcript', () => {
    const next = random(11);
    for (let i = 0; i < 3000; i += 1) {
      const count = Math.floor(next() * 14);
      const text = Array.from(
        { length: count },
        () => WORDS[Math.floor(next() * WORDS.length)],
      ).join(' ');
      const result = parseTranscript(text, { exercises, unit: next() < 0.5 ? 'kg' : 'lb' });
      expect(ParseResultSchema.safeParse(result).success, text).toBe(true);
      expect(result.rawTranscript).toBe(text);
      expect(result.source).toBe('parser');
      if (result.weight) expect(Number.isFinite(result.weight.value), text).toBe(true);
      if (result.reps !== undefined) expect(Number.isInteger(result.reps), text).toBe(true);
    }
  });

  it('handles random characters without throwing', () => {
    const next = random(23);
    for (let i = 0; i < 1000; i += 1) {
      const text = Array.from({ length: Math.floor(next() * 120) }, () =>
        String.fromCodePoint(Math.floor(next() * 0x2fff) + 1),
      ).join('');
      expect(() => parseTranscript(text, { exercises, unit: 'kg' }), text).not.toThrow();
    }
  });

  it('reads back the weight, unit and reps of a set built from known values', () => {
    const next = random(5);
    const phrases: ((w: number, u: string, r: number) => string)[] = [
      (w, u, r) => `${w} ${u} ${r} reps`,
      (w, u, r) => `${w} ${u} for ${r}`,
      (w, u, r) => `${w}${u} x ${r}`,
      (w, u, r) => `um ${w} ${u} ${r} times`,
    ];
    for (let i = 0; i < 1500; i += 1) {
      const exercise = exercises[Math.floor(next() * exercises.length)]!;
      if (exercise.equipmentType === 'bodyweight') continue;
      const name = exercise.name.toLowerCase().replace(/-/g, ' ');
      const weight = Math.floor(next() * 4000) / 8;
      const unit = next() < 0.5 ? 'kg' : 'lb';
      const reps = 1 + Math.floor(next() * 60);
      const text = `${name} ${phrases[Math.floor(next() * phrases.length)]!(weight, unit, reps)}`;
      const result = parseTranscript(text, { exercises, unit: 'kg' });
      expect(result.intent, text).toBe('log_set');
      expect(result.weight?.value, text).toBe(weight);
      expect(result.weight?.unit, text).toBe(unit);
      expect(result.reps, text).toBe(reps);
    }
  });
});

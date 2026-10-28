import { describe, expect, it } from 'vitest';
import type { Exercise } from '../exercises';
import { needsFallback, parseTranscript } from '.';

// QA pass: how real speech-recogniser output (punctuation, casing, glued units, Hinglish, misheard numbers)
// is read. Complements parser.edge.test.ts and numbers.test.ts.
const ex = (
  id: string,
  name: string,
  equipmentType: Exercise['equipmentType'],
  aliases: string[] = [],
): Exercise => ({
  id,
  name,
  equipmentType,
  bodyPart: 'upper',
  muscle: null,
  aliases,
  tier: 'curated',
});
const BENCH = ex('11111111-1111-4111-8111-111111111111', 'Bench Press', 'barbell', ['bench']);
const SQUAT = ex('33333333-3333-4333-8333-333333333333', 'Squat', 'barbell');
const exercises = [
  BENCH,
  ex('22222222-2222-4222-8222-222222222222', 'Pull Up', 'bodyweight'),
  SQUAT,
];
const parse = (text: string) => parseTranscript(text, { exercises, unit: 'kg' });

describe('a set, however the recogniser writes it', () => {
  it.each<[string, number, number]>([
    ['bench​press 60 kilo 8 reps', 60, 8], // zero-width space
    ['bench press 60 kilo 8 reps', 60, 8], // non-breaking space
    ['BENCH PRESS 60 KILO 8 REPS', 60, 8],
    ['bench press 60 kilo 8 reps.', 60, 8],
    ['bench press, 60 kilo, 8 reps', 60, 8],
    ['bench press 60 kilo 8 reps\n', 60, 8],
    ['bench press 60kg 8reps', 60, 8],
    ['bench press 60 kgs x8', 60, 8],
    ['bench press sixty-two point five kilo eight reps', 62.5, 8],
    ['bench press sixty point five kilo 8 reps', 60.5, 8],
    ['bench press one hundred and five kilo 8 reps', 105, 8],
    ['bench press 60 kilo aath baar', 60, 8],
    ['bench press das kilo paanch baar', 10, 5],
  ])('%j reads as %d kg x %d', (text, value, reps) => {
    const result = parse(text);
    expect(result).toMatchObject({
      intent: 'log_set',
      exerciseId: BENCH.id,
      weight: { value },
      reps,
    });
    expect(needsFallback(result)).toBe(false);
  });

  it('keeps the spoken unit and does not convert it', () => {
    expect(parse('bench press 60 pounds 8 reps').weight).toMatchObject({ value: 60, unit: 'lb' });
  });
});

describe('numbers the recogniser garbles are never trusted as a clean set', () => {
  it.each([
    'bench press 1,000 kilo 8 reps', // thousands separator is read as two numbers
    'bench press 1e3 kilo 8 reps',
    'bench press 60 kilo 8 reps 10 reps',
    'bench press 45 kilo 8 reps 50 kilo',
  ])('%j goes to the fallback or is refused', (text) => {
    expect(needsFallback(parse(text))).toBe(true);
  });

  it.each([
    'bench press NaN kilo 8 reps',
    'bench press Infinity kilo 8 reps',
    'bench press 9999999999 kilo 8 reps',
    'bench press ٦٠ kilo 8 reps', // Arabic-Indic digits
  ])('%j gives no weight at all', (text) => {
    const result = parse(text);
    expect(result.weight).toBeUndefined();
    expect(result.issues).toContain('NO_WEIGHT');
  });

  it('keeps a teen/ty mix-up (sixteen vs sixty) as spoken, for the validator to question', () => {
    expect(parse('bench press sixteen kilo 8 reps').weight?.value).toBe(16);
    expect(parse('bench press sixty kilo 8 reps').weight?.value).toBe(60);
  });
});

describe('commands', () => {
  it.each<[string, string]>([
    ['Undo', 'undo_last'],
    ['undo that', 'undo_last'],
    ['galat hai', 'undo_last'],
    ['bench press 60 kilo 8 reps undo', 'log_set'], // a command only counts at the start
    ['rest 90', 'rest_timer'],
    ['rest two minutes', 'rest_timer'],
    ['rest do minute', 'rest_timer'],
    ['rest 0 seconds', 'unknown'],
    ['change that to 0 reps', 'unknown'],
  ])('%j is %s', (text, intent) => {
    expect(parse(text).intent).toBe(intent);
  });

  it.each<[string, number]>([
    ['rest 90', 90],
    ['rest 11', 11], // a bare number above 10 is seconds
    ['rest 10', 600], // up to 10 it is minutes
    ['rest 1.5 minutes', 90],
    ['rest two minutes', 120],
  ])('%j rests %d seconds', (text, seconds) => {
    expect(parse(text).restSeconds).toBe(seconds);
  });

  it('reports a huge rest as spoken: the screen, not the parser, caps it', () => {
    expect(parse('rest 99999 seconds').restSeconds).toBe(99999);
  });
});

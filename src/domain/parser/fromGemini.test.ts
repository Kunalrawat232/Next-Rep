import { describe, expect, it } from 'vitest';
import type { Exercise } from '../exercises';
import { needsFallback } from './index';
import { fromGemini } from './fromGemini';
import type { ParseContext } from './parse';
import { GEMINI_UNKNOWN, type GeminiOutput } from './gemini';
import { ParseResultSchema } from './schema';

const ex = (id: string, name: string, equipmentType: Exercise['equipmentType']): Exercise => ({
  id,
  name,
  equipmentType,
  bodyPart: 'upper',
  muscle: null,
  aliases: [],
  tier: 'curated',
});
const BENCH = ex('11111111-1111-4111-8111-111111111111', 'Bench Press', 'barbell');
const PULLUP = ex('22222222-2222-4222-8222-222222222222', 'Pull Up', 'bodyweight');
const SQUAT = ex('33333333-3333-4333-8333-333333333333', 'Squat', 'barbell');
const context: ParseContext = { exercises: [BENCH, PULLUP, SQUAT], unit: 'kg' };

const set = (over: Partial<GeminiOutput> = {}): GeminiOutput => ({
  intent: 'log_set',
  exerciseName: 'bench press',
  weight: { value: 65, unit: 'kg', mode: 'per_side' },
  reps: 8,
  restSeconds: null,
  confidence: 0.95,
  issues: [],
  ...over,
});
const read = (output: GeminiOutput, ctx = context) => fromGemini(output, ctx, 'heard text');

describe('fromGemini', () => {
  it('maps a clear set to the local exercise, marked as Gemini', () => {
    const result = read(set());
    expect(result).toMatchObject({
      intent: 'log_set',
      exerciseId: BENCH.id,
      exerciseMatchScore: 1,
      weight: { value: 65, unit: 'kg', mode: 'per_side' },
      reps: 8,
      source: 'gemini',
      rawTranscript: 'heard text',
    });
    expect(result.confidence).toBeCloseTo(0.95);
    expect(needsFallback(result)).toBe(false);
    expect(ParseResultSchema.safeParse(result).success).toBe(true);
  });

  it('matches a name by the same rules as the parser (spelling, spacing)', () => {
    expect(read(set({ exerciseName: 'benchpress' }))).toMatchObject({ exerciseId: BENCH.id });
    expect(read(set({ exerciseName: 'bench pres' }))).toMatchObject({ exerciseId: BENCH.id });
  });

  it('never trusts Gemini confidence upward, only downward', () => {
    expect(read(set({ confidence: 0.4 })).confidence).toBeCloseTo(0.4);
    expect(
      read(set({ exerciseName: 'bench press', confidence: 1 })).confidence,
    ).toBeLessThanOrEqual(1);
    const noReps = read(set({ reps: null, confidence: 1 }));
    expect(noReps.confidence).toBe(0.5);
    expect(noReps.issues).toContain('NO_REPS');
  });

  it('does not swap an exercise we do not have for the current one', () => {
    const result = read(set({ exerciseName: 'zottman curl' }), {
      ...context,
      currentExerciseId: SQUAT.id,
    });
    expect(result.exerciseId).toBeUndefined();
    expect(result.issues).toContain('NO_EXERCISE');
    expect(needsFallback(result)).toBe(true);
  });

  it('uses the current exercise only when Gemini named none', () => {
    const result = read(set({ exerciseName: null }), { ...context, currentExerciseId: SQUAT.id });
    expect(result.exerciseId).toBe(SQUAT.id);
    expect(read(set({ exerciseName: null })).exerciseId).toBeUndefined();
  });

  it('allows a bodyweight set with no weight, and flags a bar set without one', () => {
    expect(read(set({ exerciseName: 'pull up', weight: null })).confidence).toBeGreaterThan(0.8);
    const bar = read(set({ weight: null }));
    expect(bar.issues).toContain('NO_WEIGHT');
    expect(needsFallback(bar)).toBe(true);
  });

  it('flags a weight with no per-side or total word', () => {
    const result = read(set({ weight: { value: 60, unit: 'kg', mode: 'unspecified' } }));
    expect(result.issues).toContain('AMBIGUOUS_WEIGHT_MODE');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('keeps only issue codes the app knows', () => {
    const result = read(set({ issues: ['NO_REPS', 'IGNORE_RULES', '<script>'] }));
    expect(result.issues).not.toContain('IGNORE_RULES');
    expect(result.issues).not.toContain('<script>');
  });

  it('carries out-of-range numbers as said, for the validators to refuse', () => {
    expect(
      read(set({ weight: { value: 5000, unit: 'kg', mode: 'total' }, reps: 500 })),
    ).toMatchObject({ weight: { value: 5000 }, reps: 500 });
  });

  it('maps commands', () => {
    expect(read({ ...GEMINI_UNKNOWN, intent: 'undo_last', confidence: 0.9 })).toMatchObject({
      intent: 'undo_last',
      confidence: 0.9,
    });
    expect(
      read({ ...GEMINI_UNKNOWN, intent: 'rest_timer', restSeconds: 90, confidence: 0.9 }),
    ).toMatchObject({ intent: 'rest_timer', restSeconds: 90 });
    expect(
      read({ ...GEMINI_UNKNOWN, intent: 'repeat_last', reps: 10, confidence: 0.9 }),
    ).toMatchObject({ intent: 'repeat_last', reps: 10 });
    expect(
      read({ ...GEMINI_UNKNOWN, intent: 'edit_last', reps: 10, confidence: 0.9 }),
    ).toMatchObject({ intent: 'edit_last', reps: 10 });
  });

  it('treats a rest with no seconds, an edit with nothing, and unknown as unknown', () => {
    for (const output of [
      { ...GEMINI_UNKNOWN, intent: 'rest_timer' as const, confidence: 0.9 },
      { ...GEMINI_UNKNOWN, intent: 'edit_last' as const, confidence: 0.9 },
      GEMINI_UNKNOWN,
    ])
      expect(read(output)).toMatchObject({ intent: 'unknown', confidence: 0, source: 'gemini' });
  });

  it('never throws on a value the schema refuses', () => {
    const bad = { ...set(), restSeconds: 1.5 } as GeminiOutput;
    expect(() => read({ ...bad, intent: 'rest_timer' })).not.toThrow();
    expect(read({ ...bad, intent: 'rest_timer' }).intent).toBe('unknown');
  });
});

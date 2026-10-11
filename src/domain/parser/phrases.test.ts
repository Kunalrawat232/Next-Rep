import { describe, expect, it } from 'vitest';
import seed from '../exercises.seed.json';
import { parseExercises } from '../exercises/catalog';
import fixtures from '../../../tests/fixtures/voice-phrases.json';
import { needsFallback, parseTranscript } from '.';

// The phrases were written by a separate agent from the spec alone, before the parser existed.
type Row = {
  id: string;
  group: string;
  stage: 1 | 2;
  transcript: string;
  ctx?: { unit?: 'kg' | 'lb'; currentExercise?: string };
  expect: {
    intent: string;
    exercise?: string;
    weight?: { value: number; unit: string; mode: string };
    reps?: number;
    restSeconds?: number;
    lowConfidence?: boolean;
    issues?: string[];
  };
  note: string;
};

const exercises = parseExercises(seed, 'curated');
const idOf = (name: string): string => {
  const found = exercises.find((exercise) => exercise.name === name);
  if (!found) throw new Error(`Unknown exercise in fixtures: ${name}`);
  return found.id;
};

const rows = (fixtures as Row[]).filter((row) => row.stage === 1);
const hindiRows = (fixtures as Row[]).filter((row) => row.stage === 2);

// Stage 2 (Hindi number words) is not built yet; the rows are listed here so the gap shows in every test run.
describe.skip('voice phrase fixtures (stage 2: Hindi number words, not built yet)', () => {
  it.each(hindiRows.map((row) => [row.id, row.transcript] as const))('%s: %s', () => {});
});

describe('voice phrase fixtures (stage 1)', () => {
  it('has the expected size', () => {
    expect(rows.length).toBeGreaterThanOrEqual(150);
  });

  it.each(rows.map((row) => [row.id, row] as const))('%s', (_id, row) => {
    const current = row.ctx?.currentExercise;
    const result = parseTranscript(row.transcript, {
      exercises,
      unit: row.ctx?.unit ?? 'kg',
      ...(current ? { currentExerciseId: idOf(current) } : {}),
    });
    const want = row.expect;
    const label = `${row.transcript.slice(0, 60)} -> ${JSON.stringify(result)}`;
    expect(result.intent, label).toBe(want.intent);
    expect(result.exerciseId, label).toBe(want.exercise ? idOf(want.exercise) : undefined);
    expect(result.weight, label).toEqual(want.weight);
    expect(result.reps, label).toBe(want.reps);
    expect(result.restSeconds, label).toBe(want.restSeconds);
    if (want.lowConfidence !== undefined)
      expect(needsFallback(result), label).toBe(want.lowConfidence);
    for (const issue of want.issues ?? []) expect(result.issues, label).toContain(issue);
  });
});

import { describe, expect, it } from 'vitest';
import { ParseResultSchema, type ParseResult } from './schema';

const valid: ParseResult = {
  intent: 'log_set',
  weight: { value: 60, unit: 'kg', mode: 'unspecified' },
  reps: 8,
  confidence: 0.9,
  issues: [],
  rawTranscript: 'bench press sixty kilo eight reps',
  source: 'parser',
};

describe('ParseResultSchema', () => {
  it('accepts a complete log_set result', () => {
    expect(ParseResultSchema.parse(valid)).toEqual(valid);
  });

  it('accepts an unknown intent with no fields', () => {
    const r = {
      intent: 'unknown',
      confidence: 0,
      issues: ['NOT_A_COMMAND'],
      rawTranscript: 'hmm',
      source: 'gemini',
    };
    expect(ParseResultSchema.safeParse(r).success).toBe(true);
  });

  it.each([
    { name: 'unknown intent value', patch: { intent: 'delete_everything' } },
    { name: 'confidence above 1', patch: { confidence: 1.2 } },
    { name: 'negative confidence', patch: { confidence: -0.1 } },
    { name: 'fractional reps', patch: { reps: 8.5 } },
    { name: 'negative weight', patch: { weight: { value: -5, unit: 'kg', mode: 'total' } } },
    { name: 'unknown unit', patch: { weight: { value: 5, unit: 'stone', mode: 'total' } } },
    { name: 'unknown weight mode', patch: { weight: { value: 5, unit: 'kg', mode: 'both' } } },
    { name: 'missing issues', patch: { issues: undefined } },
    { name: 'bad source', patch: { source: 'telepathy' } },
  ])('rejects $name', ({ patch }) => {
    expect(ParseResultSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

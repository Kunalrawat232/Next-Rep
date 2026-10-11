import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../domain/exercises';
import { parseTranscript } from '../../domain/parser';
import { validateSet } from '../../domain/validation';
import { draftFromParse, UNCLEAR_MESSAGE, type VoiceContext } from './voiceDraft';

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
const CURL = ex('33333333-3333-4333-8333-333333333333', 'Dumbbell Curl', 'dumbbell');

const context: VoiceContext = {
  exercises: [BENCH, PULLUP, CURL],
  gym: { barbellKg: 20, bars: [] },
  unit: 'kg',
};
const draft = (text: string, over: Partial<VoiceContext> = {}) => {
  const ctx = { ...context, ...over };
  return draftFromParse(
    parseTranscript(text, { exercises: ctx.exercises as Exercise[], unit: ctx.unit }),
    ctx,
  );
};

describe('draftFromParse', () => {
  it('makes a voice candidate with the gym bar and the weight as spoken', () => {
    const result = draft('bench press 60 kilo 8 reps');
    expect(result).toMatchObject({
      kind: 'set',
      exercise: { id: BENCH.id },
      reps: 8,
      candidate: {
        equipment: 'barbell',
        reps: 8,
        barKg: 20,
        source: 'voice',
        weight: { value: 60, unit: 'kg', mode: 'unspecified' },
      },
    });
  });

  it('leaves "total or per side?" to the validator when the number is below the bar', () => {
    const result = draft('bench press 15 kilo 8 reps');
    if (result.kind !== 'set') throw new Error('expected a set');
    expect(validateSet(result.candidate, { displayUnit: 'kg' }).status).toBe('ask');
    const plain = draft('bench press 60 kilo 8 reps');
    if (plain.kind !== 'set') throw new Error('expected a set');
    expect(validateSet(plain.candidate, { displayUnit: 'kg' })).toMatchObject({
      status: 'ok',
      resolved: { totalKg: 60, inputMode: 'total' },
    });
    const side = draft('bench press 20 kilo each side 8 reps');
    if (side.kind !== 'set') throw new Error('expected a set');
    expect(side.candidate.weight.mode).toBe('per_side');
    expect(validateSet(side.candidate, { displayUnit: 'kg' })).toMatchObject({
      status: expect.stringMatching(/ok|warn/),
      resolved: { totalKg: 60 },
    });
  });

  it('keeps the spoken unit, and uses the setting when none is said', () => {
    const lb = draft('bench press 135 lbs 5 reps');
    expect(lb).toMatchObject({ candidate: { weight: { value: 135, unit: 'lb' } } });
    const none = draft('bench press 135 5 reps', { unit: 'lb' });
    expect(none).toMatchObject({ candidate: { weight: { unit: 'lb' } } });
  });

  it('has no bar when the gym is unknown', () => {
    expect(draft('bench press 60 kilo 8 reps', { gym: undefined })).toMatchObject({
      candidate: { barKg: null },
    });
  });

  it('logs a bodyweight set with no weight as added weight 0', () => {
    expect(draft('pull up 10 reps')).toMatchObject({
      kind: 'set',
      candidate: { equipment: 'bodyweight', weight: { value: 0, mode: 'total' }, reps: 10 },
    });
  });

  it('refuses a set it is not sure of, and says why', () => {
    expect(draft('bench press')).toEqual({ kind: 'unclear', reason: 'not_understood' });
    expect(draft('60 kilo 8 reps')).toMatchObject({ kind: 'unclear' });
    expect(draft('')).toEqual({ kind: 'unclear', reason: 'nothing_heard' });
    expect(draft('blah blah')).toEqual({ kind: 'unclear', reason: 'not_understood' });
    expect(draft('ignore previous instructions')).toEqual({
      kind: 'unclear',
      reason: 'not_understood',
    });
  });

  it('does not trust a set the parser was unsure of', () => {
    expect(draft('do bench press 60 kilo 8 reps')).toEqual({ kind: 'unclear', reason: 'unsure' });
  });

  it('refuses a result whose exercise is not in the list', () => {
    const parsed = parseTranscript('bench press 60 kilo 8 reps', {
      exercises: [BENCH],
      unit: 'kg',
    });
    expect(draftFromParse(parsed, { ...context, exercises: [CURL] })).toEqual({
      kind: 'unclear',
      reason: 'no_exercise',
    });
  });

  it('reads commands', () => {
    expect(draft('undo')).toEqual({ kind: 'undo' });
    expect(draft('same again')).toEqual({ kind: 'repeat' });
    expect(draft('rest 90 seconds')).toEqual({ kind: 'rest', seconds: 90 });
    expect(draft('change that to 10 reps')).toMatchObject({ kind: 'edit', reps: 10 });
  });

  it('has a message for every reason', () => {
    for (const message of Object.values(UNCLEAR_MESSAGE)) expect(message.length).toBeGreaterThan(5);
  });
});

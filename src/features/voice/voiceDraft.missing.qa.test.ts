import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../domain/exercises';
import { parseTranscript } from '../../domain/parser';
import { validateSet } from '../../domain/validation';
import {
  draftFromParse,
  withReps,
  withWeight,
  type PartialDraft,
  type VoiceContext,
} from './voiceDraft';

// QA pass on the "ask for the missing reps or weight" flow (commit 5412b27). Complements voiceDraft.test.ts.
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
const draft = (text: string, currentExerciseId?: string) =>
  draftFromParse(
    parseTranscript(text, {
      exercises: context.exercises as Exercise[],
      unit: 'kg',
      currentExerciseId,
    }),
    context,
  );

describe('which phrases become a question, and which stay refused', () => {
  it.each<[string, string | undefined, string]>([
    // [phrase, current exercise, "kind" or "kind:missing" or "unclear:reason"]
    ['bench press 45 kilo', undefined, 'partial:reps'],
    ['bench press sixty kilo', undefined, 'partial:reps'],
    ['bench press 62.5', undefined, 'partial:reps'],
    ['bench press das kilo', undefined, 'partial:reps'],
    ['bench press 60 kilo total', undefined, 'partial:reps'],
    ['bench press 0 kilo', undefined, 'partial:reps'],
    ['bench press 60 kilo for', undefined, 'partial:reps'],
    ['pull up 45 kilo', undefined, 'partial:reps'],
    ['bench press 8 reps', undefined, 'partial:weight'],
    ['bench press aath baar', undefined, 'partial:weight'],
    ['bench press 8 times', undefined, 'partial:weight'],
    ['bench press x 8', undefined, 'partial:weight'],
    ['bench press each side 8 reps', undefined, 'partial:weight'],
    ['dumbbell curl 12 reps', undefined, 'partial:weight'],
    // the current exercise of the open workout counts as the exercise
    ['60 kilo', BENCH.id, 'partial:reps'],
    ['8 reps', BENCH.id, 'partial:weight'],
    // not enough to ask about
    ['60 kilo', undefined, 'unclear:no_exercise'],
    ['8 reps', undefined, 'unclear:no_exercise'],
    ['bench press', undefined, 'unclear:not_understood'],
    ['pull up', undefined, 'unclear:not_understood'],
    // a second number that does not fit is doubt, not a missing number
    ['bench press 60 kilo 8 reps 10 reps', undefined, 'unclear:unsure'],
    ['bench press 45 kilo 8 reps 50 kilo', undefined, 'unclear:unsure'],
    ['bench press 8.5 reps', undefined, 'unclear:no_weight'],
    ['bench press 0 reps', undefined, 'unclear:no_weight'],
  ])('%s (current %s) is %s', (text, current, expected) => {
    const result = draft(text, current);
    const got =
      result.kind === 'partial'
        ? `partial:${result.missing}`
        : result.kind === 'unclear'
          ? `unclear:${result.reason}`
          : result.kind;
    expect(got).toBe(expected);
  });

  it('asks for the weight of a bodyweight exercise never: one number is its reps', () => {
    for (const text of ['pull up 10 reps', 'pull up 10'])
      expect(draft(text)).toMatchObject({ kind: 'set', exercise: { id: PULLUP.id } });
  });
});

describe('an answer still goes through the validators', () => {
  const askedReps = draft('bench press 45 kilo') as Extract<PartialDraft, { missing: 'reps' }>;
  const askedWeight = draft('bench press 8 reps') as Extract<PartialDraft, { missing: 'weight' }>;

  it.each([0, -1, 101, 8.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects %s reps typed as the answer',
    (reps) => {
      const set = withReps(askedReps, reps, context);
      expect(validateSet(set.candidate, { displayUnit: 'kg' }).status).toBe('reject');
    },
  );

  it.each([-5, Number.NaN, 1000, 5000])('rejects a weight answer of %s kg', (value) => {
    const set = withWeight(askedWeight, { value, unit: 'kg', mode: 'unspecified' }, context);
    expect(validateSet(set.candidate, { displayUnit: 'kg' }).status).toBe('reject');
  });

  it('rejects reps heard before a weight was asked for (500 reps), once the weight arrives', () => {
    const asked = draft('bench press 500 reps') as Extract<PartialDraft, { missing: 'weight' }>;
    const set = withWeight(asked, { value: 60, unit: 'kg', mode: 'total' }, context);
    expect(validateSet(set.candidate, { displayUnit: 'kg' }).status).toBe('reject');
  });

  it('asks "total or per side?" for a weight answer below the bar, never logs it silently', () => {
    const set = withWeight(askedWeight, { value: 15, unit: 'kg', mode: 'unspecified' }, context);
    expect(validateSet(set.candidate, { displayUnit: 'kg' }).status).toBe('ask');
  });

  it('keeps the heard weight and the gym bar when reps arrive, and stays a voice set', () => {
    const set = withReps(askedReps, 8, { gym: { barbellKg: 15, bars: [] } });
    expect(set.candidate).toMatchObject({ barKg: 15, source: 'voice', weight: { value: 45 } });
  });

  it('has no bar when the gym is unknown, so a per-side answer is refused for a barbell', () => {
    const set = withWeight(
      askedWeight,
      { value: 20, unit: 'kg', mode: 'per_side' },
      { gym: undefined },
    );
    expect(set.candidate.barKg).toBeNull();
    expect(validateSet(set.candidate, { displayUnit: 'kg' })).toMatchObject({ status: 'reject' });
  });

  it('does not bar a dumbbell: the answer is the weight per dumbbell', () => {
    const asked = draft('dumbbell curl 12 reps') as Extract<PartialDraft, { missing: 'weight' }>;
    const set = withWeight(asked, { value: 12, unit: 'kg', mode: 'unspecified' }, context);
    expect(validateSet(set.candidate, { displayUnit: 'kg' })).toMatchObject({
      status: 'ok',
      resolved: { totalKg: 12, barKg: null },
    });
  });
});

describe('doubtful numbers are not trusted', () => {
  it('does not trust a repeated reps marker as a weight', () => {
    const result = parseTranscript('bench press 8 reps 8 reps', {
      exercises: context.exercises as Exercise[],
      unit: 'kg',
    });
    expect(result.confidence).toBeLessThan(0.8);
  });

  it('does not trust "do sau kilo" as 2 kilo', () => {
    const result = parseTranscript('bench press do sau kilo paanch baar', {
      exercises: context.exercises as Exercise[],
      unit: 'kg',
    });
    expect(result.weight?.value === 2 && result.confidence >= 0.8).toBe(false);
  });
});

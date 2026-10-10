import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseExerciseService } from './exercises';

type Result = { data: unknown; error: { code?: string; message: string } | null };

function client(result: Result) {
  const builder: Record<string, unknown> = {};
  for (const op of ['select', 'upsert', 'not', 'order']) builder[op] = () => builder;
  builder.then = (resolve: (r: Result) => void) => resolve(result);
  return { from: () => builder } as unknown as Pick<SupabaseClient, 'from'>;
}

const row = (over: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Zercher squat',
  equipment_type: 'barbell',
  body_part: 'lower',
  muscle: null,
  aliases: [],
  ...over,
});

describe('custom exercises from the server', () => {
  const names = ['ज़ेर्चर स्क्वाट', '深蹲', 'Übung 💪', "Farmer's walk", 'a'.repeat(80)];
  it.each(names)('reads the name %j unchanged', async (name) => {
    const r = await createSupabaseExerciseService(
      client({ data: [row({ name })], error: null }),
    ).listCustom();
    expect(r.status === 'ok' && r.value[0]?.name).toBe(name);
  });

  it('data: null with no error is an unknown failure, not a crash', async () => {
    const r = await createSupabaseExerciseService(client({ data: null, error: null })).listCustom();
    expect(r).toEqual({ status: 'error', reason: 'unknown' });
  });

  it('a row with an unknown equipment type is an unknown failure', async () => {
    const r = await createSupabaseExerciseService(
      client({ data: [row({ equipment_type: 'kettlebell' })], error: null }),
    ).listCustom();
    expect(r).toEqual({ status: 'error', reason: 'unknown' });
  });

  // BUG: exercises.ts:36 calls parseExercises, which throws a ZodError on a name over 80 chars, a blank
  // name, repeated aliases, a non-uuid id or two exercises with the same name. listCustom must return
  // a Result (see ExerciseService); instead it rejects. useExercises catches it, but any other caller
  // would crash, and one bad row hides every custom exercise.
  it.each([
    ['name over 80 characters', row({ name: 'a'.repeat(81) })],
    ['blank name', row({ name: '   ' })],
    ['repeated aliases', row({ aliases: ['zercher', 'ZERCHER'] })],
    ['id that is not a uuid', row({ id: 'abc' })],
  ])('BUG: %s resolves to an error Result instead of throwing', async (_l, bad) => {
    const r = await createSupabaseExerciseService(
      client({ data: [bad], error: null }),
    ).listCustom();
    expect(r.status).toBe('error');
  });

  it('BUG: two rows whose names differ only by case/accents resolve to an error Result, not a throw', async () => {
    const r = await createSupabaseExerciseService(
      client({
        data: [row(), row({ id: '22222222-2222-4222-8222-222222222222', name: 'ZERCHER SQUAT' })],
        error: null,
      }),
    ).listCustom();
    expect(r.status).toBe('error');
  });

  it.each([
    ['23505', 'conflict'],
    ['23514', 'rejected'],
    ['42501', 'unknown'],
  ])('create: code %s is %s', async (code, reason) => {
    const r = await createSupabaseExerciseService(
      client({ data: null, error: { code, message: 'x' } }),
    ).create('u', '11111111-1111-4111-8111-111111111111', {
      name: 'x',
      equipmentType: 'cable',
      bodyPart: 'upper',
      aliases: [],
    });
    expect(r).toEqual({ status: 'error', reason });
  });
});

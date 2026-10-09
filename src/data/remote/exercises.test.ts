import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseExerciseService } from './exercises';

type Call = { table: string; op: string; args: unknown[]; filters: [string, unknown[]][] };
type Result = { data: unknown; error: { code?: string; message: string } | null };

function fakeClient(result: Result = { data: [], error: null }) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: '', args: [], filters: [] };
    const builder: Record<string, unknown> = {};
    for (const op of ['select', 'upsert'])
      builder[op] = (...args: unknown[]) => {
        call.op = op;
        call.args = args;
        calls.push(call);
        return builder;
      };
    for (const filter of ['eq', 'not', 'order'])
      builder[filter] = (...args: unknown[]) => {
        call.filters.push([filter, args]);
        return builder;
      };
    builder.then = (resolve: (r: Result) => void) => resolve(result);
    return builder;
  };
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, calls };
}

afterEach(() => vi.restoreAllMocks());

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Zercher squat',
  equipment_type: 'barbell',
  body_part: 'lower',
  muscle: null,
  aliases: ['zercher'],
};

describe('listCustom', () => {
  it("reads only the user's own exercises, as camelCase exercises marked custom", async () => {
    const { client, calls } = fakeClient({ data: [row], error: null });
    const r = await createSupabaseExerciseService(client).listCustom();
    expect(r).toEqual({
      status: 'ok',
      value: [
        {
          id: row.id,
          name: 'Zercher squat',
          equipmentType: 'barbell',
          bodyPart: 'lower',
          muscle: null,
          aliases: ['zercher'],
          tier: 'custom',
        },
      ],
    });
    expect(calls[0]?.table).toBe('exercises');
    expect(calls[0]?.filters).toContainEqual(['not', ['user_id', 'is', null]]);
  });

  it('reads an exercise that has a muscle', async () => {
    const { client } = fakeClient({ data: [{ ...row, muscle: 'quads' }], error: null });
    const r = await createSupabaseExerciseService(client).listCustom();
    expect(r.status === 'ok' && r.value[0]?.muscle).toBe('quads');
  });

  it.each([
    ['an unknown equipment type', { ...row, equipment_type: 'kettlebell' }],
    ['an unknown muscle', { ...row, muscle: 'wings' }],
    ['a missing name', { ...row, name: null }],
  ])('reports %s as an error instead of guessing', async (_l, bad) => {
    const { client } = fakeClient({ data: [bad], error: null });
    expect(await createSupabaseExerciseService(client).listCustom()).toEqual({
      status: 'error',
      reason: 'unknown',
    });
  });

  it('reports a network failure as offline, and a server error as unknown', async () => {
    const offline = fakeClient({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    expect(await createSupabaseExerciseService(offline.client).listCustom()).toEqual({
      status: 'error',
      reason: 'offline',
    });
    const server = fakeClient({ data: null, error: { code: '42501', message: 'rls' } });
    expect(await createSupabaseExerciseService(server.client).listCustom()).toEqual({
      status: 'error',
      reason: 'unknown',
    });
  });
});

describe('create', () => {
  const input = {
    name: 'Zercher squat',
    equipmentType: 'barbell' as const,
    bodyPart: 'lower' as const,
    aliases: ['zercher'],
  };

  it('upserts the exercise with the given id, owned by the user', async () => {
    const { client, calls } = fakeClient();
    const r = await createSupabaseExerciseService(client).create('u1', 'ex-1', input);
    expect(r.status).toBe('ok');
    expect(calls[0]).toMatchObject({ table: 'exercises', op: 'upsert' });
    expect(calls[0]?.args[0]).toEqual({
      id: 'ex-1',
      user_id: 'u1',
      name: 'Zercher squat',
      equipment_type: 'barbell',
      body_part: 'lower',
      aliases: ['zercher'],
    });
    expect(calls[0]?.args[1]).toEqual({ onConflict: 'id' });
  });

  it('sends the same id again on a retry', async () => {
    const a = fakeClient();
    const b = fakeClient();
    await createSupabaseExerciseService(a.client).create('u1', 'ex-1', input);
    await createSupabaseExerciseService(b.client).create('u1', 'ex-1', input);
    expect((a.calls[0]?.args[0] as { id: string }).id).toBe(
      (b.calls[0]?.args[0] as { id: string }).id,
    );
  });

  it('calls a duplicate name a conflict', async () => {
    const { client } = fakeClient({ data: null, error: { code: '23505', message: 'dup' } });
    expect(await createSupabaseExerciseService(client).create('u1', 'ex-1', input)).toEqual({
      status: 'error',
      reason: 'conflict',
    });
  });

  it('calls a failed request offline', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'Failed to fetch' } });
    expect(await createSupabaseExerciseService(client).create('u1', 'ex-1', input)).toEqual({
      status: 'error',
      reason: 'offline',
    });
  });
});

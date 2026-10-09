import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseLogRemote } from './log';

type Result = { data: unknown; error: { code?: string; message: string } | null };

/** Records the chain of calls a pull query makes, and answers with the given result. */
function fakeClient(result: Result) {
  const chain: [string, unknown[]][] = [];
  let table = '';
  const builder: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'is', 'not', 'gt', 'order', 'limit'])
    builder[op] = (...args: unknown[]) => {
      chain.push([op, args]);
      return builder;
    };
  builder.then = (resolve: (r: Result) => void) => resolve(result);
  const from = (name: string) => {
    table = name;
    return builder;
  };
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, chain, table: () => table };
}

describe('fetchWorkouts', () => {
  it('asks for this user’s finished, not deleted workouts after the last id read, in id order', async () => {
    const f = fakeClient({ data: [], error: null });
    await createSupabaseLogRemote(f.client).fetchWorkouts('u1', { after: 'w-last', size: 500 });
    expect(f.table()).toBe('workouts');
    expect(f.chain).toContainEqual(['eq', ['user_id', 'u1']]);
    expect(f.chain).toContainEqual(['is', ['deleted_at', null]]);
    expect(f.chain).toContainEqual(['not', ['ended_at', 'is', null]]);
    expect(f.chain).toContainEqual(['gt', ['id', 'w-last']]);
    expect(f.chain.filter(([op]) => op === 'order').map(([, a]) => a[0])).toEqual(['id']);
    expect(f.chain).toContainEqual(['limit', [500]]);
  });

  it('starts from the beginning with no id to continue from', async () => {
    const f = fakeClient({ data: [], error: null });
    await createSupabaseLogRemote(f.client).fetchWorkouts('u1', { after: null, size: 5 });
    expect(f.chain.some(([op]) => op === 'gt')).toBe(false);
  });

  it('turns rows into the shape the app uses', async () => {
    const f = fakeClient({
      data: [
        {
          id: 'w',
          gym_id: null,
          started_at: '2026-10-01T10:00:00+00:00',
          ended_at: '2026-10-01T11:00:00+00:00',
          notes: null,
        },
      ],
      error: null,
    });
    const result = await createSupabaseLogRemote(f.client).fetchWorkouts('u1', {
      after: null,
      size: 5,
    });
    expect(result).toEqual({
      status: 'ok',
      value: [
        {
          id: 'w',
          gymId: null,
          startedAt: '2026-10-01T10:00:00+00:00',
          endedAt: '2026-10-01T11:00:00+00:00',
          notes: null,
        },
      ],
    });
  });

  it('classifies a failure like the pushes do', async () => {
    const f = fakeClient({ data: null, error: { message: 'Failed to fetch' } });
    expect(
      await createSupabaseLogRemote(f.client).fetchWorkouts('u1', { after: null, size: 5 }),
    ).toEqual({
      status: 'error',
      reason: 'offline',
    });
  });
});

describe('fetchSets', () => {
  it('asks for this user’s sets that are not deleted, after the last id read, in id order', async () => {
    const f = fakeClient({ data: [], error: null });
    await createSupabaseLogRemote(f.client).fetchSets('u1', { after: 's-last', size: 500 });
    expect(f.table()).toBe('sets');
    expect(f.chain).toContainEqual(['eq', ['user_id', 'u1']]);
    expect(f.chain).toContainEqual(['is', ['deleted_at', null]]);
    expect(f.chain).toContainEqual(['gt', ['id', 's-last']]);
    expect(f.chain.filter(([op]) => op === 'order').map(([, a]) => a[0])).toEqual(['id']);
    expect(f.chain).toContainEqual(['limit', [500]]);
  });

  it('does not ask for what was said', async () => {
    const f = fakeClient({ data: [], error: null });
    await createSupabaseLogRemote(f.client).fetchSets('u1', { after: null, size: 5 });
    const select = f.chain.find(([op]) => op === 'select')!;
    expect(String(select[1][0])).not.toContain('raw_transcript');
  });

  it('reads numeric columns as numbers whether they arrive as numbers or strings, and keeps null', async () => {
    const row = (total: unknown, bar: unknown, side: unknown) => ({
      id: 's',
      workout_id: 'w',
      exercise_id: 'e',
      total_kg: total,
      bar_kg: bar,
      per_side_kg: side,
      input_mode: 'per_side',
      reps: 8,
      source: 'tap',
      raw_transcript: null,
      logged_at: '2026-10-01T10:05:00+00:00',
    });
    const f = fakeClient({
      data: [row('62.50', '20.00', '21.25'), row(60, null, null)],
      error: null,
    });
    const result = await createSupabaseLogRemote(f.client).fetchSets('u1', {
      after: null,
      size: 5,
    });
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.value).toMatchObject([
      { totalKg: 62.5, barKg: 20, perSideKg: 21.25, loggedAt: '2026-10-01T10:05:00+00:00' },
      { totalKg: 60, barKg: null, perSideKg: null },
    ]);
  });

  it.each(['', ' ', '0x10', '1e2', 'abc'])('does not turn %j into a number', async (text) => {
    const f = fakeClient({
      data: [{ id: 's', total_kg: text, bar_kg: null, per_side_kg: null }],
      error: null,
    });
    const result = await createSupabaseLogRemote(f.client).fetchSets('u1', {
      after: null,
      size: 5,
    });
    if (result.status !== 'ok') throw new Error('expected ok');
    expect((result.value[0] as { totalKg: unknown }).totalKg).toBe(text);
  });

  it('returns an empty list when the server sends nothing', async () => {
    const f = fakeClient({ data: null, error: null });
    expect(
      await createSupabaseLogRemote(f.client).fetchSets('u1', { after: null, size: 5 }),
    ).toEqual({
      status: 'ok',
      value: [],
    });
  });
});

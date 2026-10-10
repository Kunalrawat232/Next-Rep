import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { StoredSet, StoredWorkout } from '../local';
import { createSupabaseLogRemote } from './log';

type Result = { data: unknown; error: { code?: string; message: string } | null };

function fakeClient(result: Result = { data: [], error: null }) {
  const sent: { table: string; op: string; args: unknown[] }[] = [];
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const op of ['select', 'upsert', 'update', 'eq', 'is', 'not', 'gt', 'order', 'limit'])
      builder[op] = (...args: unknown[]) => {
        sent.push({ table, op, args });
        return builder;
      };
    builder.then = (resolve: (r: Result) => void) => resolve(result);
    return builder;
  };
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, sent };
}

const set = {
  id: 's',
  workoutId: 'w',
  exerciseId: 'e',
  totalKg: 60,
  barKg: 20,
  perSideKg: 20,
  inputMode: 'per_side',
  reps: 8,
  source: 'voice',
  rawTranscript: 'bench sixty kilo eight reps',
  loggedAt: '2026-10-10T10:00:00.000Z',
  syncStatus: 'pending',
  rev: 3,
  attempts: 2,
  nextAttemptAt: 99,
  lastError: 'x',
  lastAttemptAt: 5,
} as unknown as StoredSet;

describe('what is sent', () => {
  it('a set upsert never carries deleted_at or local bookkeeping, so a re-push cannot undelete', async () => {
    const f = fakeClient();
    await createSupabaseLogRemote(f.client).upsertSets('u', [set]);
    const row = (f.sent.find((c) => c.op === 'upsert')?.args[0] as Record<string, unknown>[])[0]!;
    expect(Object.keys(row).sort()).toEqual(
      [
        'id',
        'user_id',
        'workout_id',
        'exercise_id',
        'total_kg',
        'bar_kg',
        'per_side_kg',
        'input_mode',
        'reps',
        'source',
        'raw_transcript',
        'logged_at',
      ].sort(),
    );
  });

  it('a workout upsert never carries the local gym snapshot', async () => {
    const f = fakeClient();
    const w = {
      id: 'w',
      gymId: null,
      startedAt: 'a',
      endedAt: null,
      notes: null,
      gymSnapshot: { name: 'x' },
      everSynced: true,
    } as unknown as StoredWorkout;
    await createSupabaseLogRemote(f.client).upsertWorkouts('u', [w]);
    const row = (f.sent.find((c) => c.op === 'upsert')?.args[0] as Record<string, unknown>[])[0]!;
    expect(row).not.toHaveProperty('gymSnapshot');
    expect(row).not.toHaveProperty('everSynced');
    expect(row.user_id).toBe('u');
  });

  it.each([
    ['23503', 'rejected'],
    ['23505', 'conflict'],
    ['PGRST301', 'unknown'],
    ['42501', 'unknown'],
  ])('a write failing with %s is %s', async (code, reason) => {
    const f = fakeClient({ data: null, error: { code, message: 'x' } });
    expect(await createSupabaseLogRemote(f.client).upsertSets('u', [set])).toEqual({
      status: 'error',
      reason,
    });
  });

  it('softDelete sends only deleted_at', async () => {
    const f = fakeClient();
    await createSupabaseLogRemote(f.client).softDeleteSet('s', '2026-10-10T10:00:00.000Z');
    expect(f.sent.find((c) => c.op === 'update')?.args[0]).toEqual({
      deleted_at: '2026-10-10T10:00:00.000Z',
    });
  });
});

describe('what is read back', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 's',
    workout_id: 'w',
    exercise_id: 'e',
    total_kg: '60.00',
    bar_kg: '20.00',
    per_side_kg: '20.00',
    input_mode: 'per_side',
    reps: 8,
    source: 'tap',
    logged_at: '2026-10-10T10:00:00+00:00',
    ...over,
  });
  const read = async (over: Record<string, unknown>) => {
    const f = fakeClient({ data: [row(over)], error: null });
    const r = await createSupabaseLogRemote(f.client).fetchSets('u', { after: null, size: 5 });
    return r.status === 'ok' ? (r.value[0] as Record<string, unknown>) : null;
  };

  it.each([
    ['text with 2 decimals', '62.50', 62.5],
    ['integer text', '60', 60],
    ['a plain number', 62.5, 62.5],
    ['null stays null', null, null],
  ])('total_kg as %s', async (_l, given, expected) => {
    expect((await read({ total_kg: given }))?.totalKg).toBe(expected);
  });

  it.each(['1e2', '', ' 60', '60 ', '+60', '.5', '6,0', 'NaN', 'Infinity', '0x10'])(
    'total_kg text %j is passed on unread so the schema refuses it',
    async (text) => {
      expect(typeof (await read({ total_kg: text }))?.totalKg).toBe('string');
    },
  );

  it('never reads the transcript back', async () => {
    expect((await read({ raw_transcript: 'secret' }))?.rawTranscript).toBeNull();
  });

  it('a workout row with no gym and no end reads as nulls, not undefined', async () => {
    const f = fakeClient({ data: [{ id: 'w', started_at: 'x' }], error: null });
    const r = await createSupabaseLogRemote(f.client).fetchWorkouts('u', { after: null, size: 5 });
    expect(r.status === 'ok' && r.value[0]).toMatchObject({
      gymId: null,
      endedAt: null,
      notes: null,
    });
  });

  it('data: null with no error reads as an empty page, which ends a pull (see report)', async () => {
    const f = fakeClient({ data: null, error: null });
    expect(
      await createSupabaseLogRemote(f.client).fetchSets('u', { after: null, size: 5 }),
    ).toEqual({
      status: 'ok',
      value: [],
    });
  });
});

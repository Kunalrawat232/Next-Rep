import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoredSet, StoredWorkout } from '../local';
import { createSupabaseLogRemote } from './log';

type Call = { table: string; op: string; args: unknown[]; filters: [string, unknown[]][] };
type Result = { data: unknown; error: { code?: string; message: string } | null };

function fakeClient(result: Result = { data: null, error: null }) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: '', args: [], filters: [] };
    const builder: Record<string, unknown> = {};
    for (const op of ['upsert', 'update'])
      builder[op] = (...args: unknown[]) => {
        call.op = op;
        call.args = args;
        calls.push(call);
        return builder;
      };
    builder.eq = (...args: unknown[]) => {
      call.filters.push(['eq', args]);
      return builder;
    };
    builder.then = (resolve: (r: Result) => void) => resolve(result);
    return builder;
  };
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, calls };
}

afterEach(() => vi.restoreAllMocks());

const meta = {
  syncStatus: 'pending' as const,
  rev: 3,
  attempts: 2,
  nextAttemptAt: 99,
  lastError: 'x',
  lastAttemptAt: null,
};
const workout: StoredWorkout = {
  everSynced: false,
  gymSnapshot: null,
  id: 'w1',
  gymId: 'g1',
  startedAt: '2026-10-10T10:00:00.000Z',
  endedAt: null,
  notes: null,
  ...meta,
};
const set: StoredSet = {
  id: 's1',
  workoutId: 'w1',
  exerciseId: 'e1',
  totalKg: 60,
  barKg: 20,
  perSideKg: 20,
  inputMode: 'per_side',
  reps: 8,
  source: 'tap',
  rawTranscript: null,
  loggedAt: '2026-10-10T10:05:00.000Z',
  ...meta,
};

describe('upsertWorkouts', () => {
  it('sends snake_case rows owned by the user, with no sync bookkeeping', async () => {
    const { client, calls } = fakeClient();
    const r = await createSupabaseLogRemote(client).upsertWorkouts('u1', [workout]);
    expect(r.status).toBe('ok');
    expect(calls[0]).toMatchObject({ table: 'workouts', op: 'upsert' });
    expect(calls[0]?.args[0]).toEqual([
      {
        id: 'w1',
        user_id: 'u1',
        gym_id: 'g1',
        started_at: '2026-10-10T10:00:00.000Z',
        ended_at: null,
        notes: null,
      },
    ]);
    expect(calls[0]?.args[1]).toEqual({ onConflict: 'id' });
  });

  it('sends an ended workout with its end time', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseLogRemote(client).upsertWorkouts('u1', [
      { ...workout, endedAt: '2026-10-10T11:00:00.000Z' },
    ]);
    expect((calls[0]?.args[0] as { ended_at: string }[])[0]?.ended_at).toBe(
      '2026-10-10T11:00:00.000Z',
    );
  });
});

describe('upsertSets', () => {
  it('sends snake_case rows owned by the user, as one statement for the whole batch', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseLogRemote(client).upsertSets('u1', [set, { ...set, id: 's2' }]);
    expect(calls).toHaveLength(1);
    const rows = calls[0]?.args[0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: 's1',
      user_id: 'u1',
      workout_id: 'w1',
      exercise_id: 'e1',
      total_kg: 60,
      bar_kg: 20,
      per_side_kg: 20,
      input_mode: 'per_side',
      reps: 8,
      source: 'tap',
      raw_transcript: null,
      logged_at: '2026-10-10T10:05:00.000Z',
    });
    expect(Object.keys(rows[0] ?? {})).not.toContain('syncStatus');
  });

  it('never sends the soft-delete column, so an upsert cannot undelete a set', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseLogRemote(client).upsertSets('u1', [set]);
    expect(Object.keys((calls[0]?.args[0] as object[])[0] ?? {})).not.toContain('deleted_at');
  });
});

describe('softDeleteSet', () => {
  it('stamps deleted_at on that one set', async () => {
    const { client, calls } = fakeClient();
    const r = await createSupabaseLogRemote(client).softDeleteSet('s1', '2026-10-10T12:00:00.000Z');
    expect(r.status).toBe('ok');
    expect(calls[0]).toMatchObject({
      table: 'sets',
      op: 'update',
      args: [{ deleted_at: '2026-10-10T12:00:00.000Z' }],
    });
    expect(calls[0]?.filters).toContainEqual(['eq', ['id', 's1']]);
  });
});

describe('failures', () => {
  it.each(['upsertWorkouts', 'upsertSets', 'softDeleteSet'] as const)(
    '%s reports a network failure as offline',
    async (method) => {
      const { client } = fakeClient({
        data: null,
        error: { message: 'TypeError: Failed to fetch' },
      });
      const remote = createSupabaseLogRemote(client);
      const r =
        method === 'upsertWorkouts'
          ? await remote.upsertWorkouts('u1', [workout])
          : method === 'upsertSets'
            ? await remote.upsertSets('u1', [set])
            : await remote.softDeleteSet('s1', 'now');
      expect(r).toEqual({ status: 'error', reason: 'offline' });
    },
  );

  it('reports a constraint refusal as rejected, without passing on the server text', async () => {
    const { client } = fakeClient({
      data: null,
      error: { code: '23503', message: 'insert on table violates foreign key' },
    });
    const r = await createSupabaseLogRemote(client).upsertSets('u1', [set]);
    expect(r).toEqual({ status: 'error', reason: 'rejected' });
    expect(JSON.stringify(r)).not.toMatch(/foreign key/);
  });
});

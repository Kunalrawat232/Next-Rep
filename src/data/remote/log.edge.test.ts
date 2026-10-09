import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoredSet, StoredWorkout } from '../local';
import { createSupabaseLogRemote } from './log';

type Result = { data: unknown; error: { code?: string; message: string } | null };

function fakeClient(result: Result | (() => Promise<Result>) = { data: null, error: null }) {
  const sent: { table: string; op: string; args: unknown[]; eq: unknown[][] }[] = [];
  const from = (table: string) => {
    const call = { table, op: '', args: [] as unknown[], eq: [] as unknown[][] };
    const builder: Record<string, unknown> = {};
    for (const op of ['upsert', 'update'])
      builder[op] = (...args: unknown[]) => {
        call.op = op;
        call.args = args;
        sent.push(call);
        return builder;
      };
    builder.eq = (...args: unknown[]) => {
      call.eq.push(args);
      return builder;
    };
    builder.then = (resolve: (r: Result) => void, reject: (e: unknown) => void) =>
      typeof result === 'function' ? result().then(resolve, reject) : resolve(result);
    return builder;
  };
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, sent };
}

afterEach(() => vi.unstubAllGlobals());

const meta = {
  syncStatus: 'pending' as const,
  rev: 1,
  attempts: 0,
  nextAttemptAt: 0,
  lastError: null,
  lastAttemptAt: null,
};
const workout: StoredWorkout = {
  everSynced: false,
  gymSnapshot: null,
  id: 'w1',
  gymId: null,
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
  source: 'voice',
  rawTranscript: null,
  loggedAt: '2026-10-10T10:05:00.000Z',
  ...meta,
};

describe('what is sent', () => {
  it('sends only the known columns, even if the stored row carries extra or spoofed fields', async () => {
    const { client, sent } = fakeClient();
    const sneaky = {
      ...set,
      user_id: 'someone-else',
      userId: 'someone-else',
      deletedAt: null,
      deleted_at: null,
      isAdmin: true,
    } as unknown as StoredSet;
    await createSupabaseLogRemote(client).upsertSets('me', [sneaky]);
    const row = (sent[0]?.args[0] as Record<string, unknown>[])[0]!;
    expect(row.user_id).toBe('me');
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

  it('sends a workout with the signed-in user id, not any user id found on the row', async () => {
    const { client, sent } = fakeClient();
    await createSupabaseLogRemote(client).upsertWorkouts('me', [
      { ...workout, user_id: 'attacker' } as unknown as StoredWorkout,
    ]);
    expect((sent[0]?.args[0] as { user_id: string }[])[0]?.user_id).toBe('me');
  });

  it.each([
    ['Hinglish in Devanagari', 'बेंच प्रेस साठ किलो'],
    ['500 characters', 'z'.repeat(500)],
    ['emoji', '💪🔥'],
    ['quotes and SQL', `"; DROP TABLE sets; --'`],
    ['an empty string', ''],
  ])('passes a transcript with %s through unchanged', async (_l, text) => {
    const { client, sent } = fakeClient();
    await createSupabaseLogRemote(client).upsertSets('u', [{ ...set, rawTranscript: text }]);
    expect((sent[0]?.args[0] as { raw_transcript: string }[])[0]?.raw_transcript).toBe(text);
  });

  it('keeps boundary numbers exactly: zero kilos, null bar, 500 kg, 100 reps', async () => {
    const { client, sent } = fakeClient();
    await createSupabaseLogRemote(client).upsertSets('u', [
      { ...set, totalKg: 0, barKg: null, perSideKg: null, inputMode: 'total', reps: 100 },
      { ...set, id: 's2', totalKg: 500, barKg: null, perSideKg: null, inputMode: 'total', reps: 1 },
    ]);
    const rows = sent[0]?.args[0] as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ total_kg: 0, bar_kg: null, per_side_kg: null, reps: 100 });
    expect(rows[1]).toMatchObject({ total_kg: 500, reps: 1 });
  });

  it('keeps a thousand rows in one request in their original order', async () => {
    const { client, sent } = fakeClient();
    const rows = Array.from({ length: 1000 }, (_, i) => ({ ...set, id: `s${i}` }));
    await createSupabaseLogRemote(client).upsertSets('u', rows);
    expect(sent).toHaveLength(1);
    expect((sent[0]?.args[0] as { id: string }[]).map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  it('soft-deleting an id with odd characters filters by exactly that id and nothing else', async () => {
    const { client, sent } = fakeClient();
    const id = `x' or 1=1 --`;
    await createSupabaseLogRemote(client).softDeleteSet(id, '2026-10-10T12:00:00.000Z');
    expect(sent[0]?.eq).toEqual([['id', id]]);
    expect(Object.keys(sent[0]?.args[0] as object)).toEqual(['deleted_at']);
  });

  it('upserts with a conflict target on the id only', async () => {
    const { client, sent } = fakeClient();
    const remote = createSupabaseLogRemote(client);
    await remote.upsertWorkouts('u', [workout]);
    await remote.upsertSets('u', [set]);
    expect(sent.map((c) => c.args[1])).toEqual([{ onConflict: 'id' }, { onConflict: 'id' }]);
  });
});

describe('error mapping', () => {
  it.each([
    ['23505', 'conflict'],
    ['23503', 'rejected'],
    ['22P02', 'rejected'],
    ['42501', 'unknown'],
    ['PGRST301', 'unknown'],
    ['', 'unknown'],
  ])('a server error with code %s becomes %s', async (code, reason) => {
    const { client } = fakeClient({ data: null, error: { code, message: 'whatever' } });
    expect(await createSupabaseLogRemote(client).upsertSets('u', [set])).toEqual({
      status: 'error',
      reason,
    });
  });

  it.each([
    ['Chrome', 'TypeError: Failed to fetch'],
    ['Firefox', 'NetworkError when attempting to fetch resource.'],
    ['Safari', 'Load failed'],
    ['a timeout from the platform', 'Network request failed'],
  ])(
    'a request that never reached the server (%s) is offline, not a refusal',
    async (_l, message) => {
      const { client } = fakeClient({ data: null, error: { message } });
      expect(await createSupabaseLogRemote(client).softDeleteSet('s1', 'now')).toEqual({
        status: 'error',
        reason: 'offline',
      });
    },
  );

  it('a server refusal is not mistaken for being offline just because navigator.onLine is false', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const { client } = fakeClient({
      data: null,
      error: { code: '23503', message: 'insert violates foreign key' },
    });
    expect(await createSupabaseLogRemote(client).upsertSets('u', [set])).toEqual({
      status: 'error',
      reason: 'rejected',
    });
  });

  it('navigator.onLine false with a message-only error is offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const { client } = fakeClient({ data: null, error: { message: 'anything' } });
    expect(await createSupabaseLogRemote(client).upsertWorkouts('u', [workout])).toEqual({
      status: 'error',
      reason: 'offline',
    });
  });

  it('the server text never leaks into the result', async () => {
    const { client } = fakeClient({
      data: null,
      error: {
        code: '42501',
        message: 'new row violates row-level security policy for table "sets"',
      },
    });
    const r = await createSupabaseLogRemote(client).upsertSets('u', [set]);
    expect(JSON.stringify(r)).not.toMatch(/row-level|sets|policy/);
  });

  it('an error object with no message and no code is a refusal, not a crash', async () => {
    const { client } = fakeClient({ data: null, error: {} as { message: string } });
    await expect(createSupabaseLogRemote(client).upsertSets('u', [set])).resolves.toMatchObject({
      status: 'error',
    });
  });

  it('a client that rejects outright rejects the call, so the worker is the one that must catch it', async () => {
    const { client } = fakeClient(() => Promise.reject(new Error('socket closed')));
    await expect(createSupabaseLogRemote(client).upsertSets('u', [set])).rejects.toThrow(
      'socket closed',
    );
  });
});

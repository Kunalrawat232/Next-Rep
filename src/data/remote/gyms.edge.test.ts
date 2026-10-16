import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseGymService } from './gyms';

type Call = { table: string; op: string; args: unknown[]; filters: [string, unknown[]][] };
type Result = { data: unknown; error: { code?: string; message: string } | null };
type Script = Record<string, Result | (() => never)>;

/** Same idea as the fake in gyms.test.ts, plus the ability to make a statement throw instead of answer. */
function fakeClient(script: Script = {}) {
  const calls: Call[] = [];
  const from = (table: string) => {
    let current: Call | null = null;
    const builder: Record<string, unknown> = {};
    const start =
      (op: string) =>
      (...args: unknown[]) => {
        current = { table, op, args, filters: [] };
        calls.push(current);
        return builder;
      };
    for (const op of ['select', 'upsert', 'update', 'delete']) builder[op] = start(op);
    for (const filter of ['eq', 'neq', 'in', 'not', 'order', 'limit'])
      builder[filter] = (...args: unknown[]) => {
        current?.filters.push([filter, args]);
        return builder;
      };
    builder.then = (resolve: (r: Result) => void, reject: (e: unknown) => void) => {
      const entry = script[`${table}:${current?.op}`];
      if (typeof entry === 'function') {
        try {
          entry();
        } catch (e) {
          reject(e);
        }
        return;
      }
      resolve(entry ?? { data: [], error: null });
    };
    return builder;
  };
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, calls };
}

const boom = () => {
  throw new TypeError('Failed to fetch');
};
const fail = (message: string, code?: string): Result => ({ data: null, error: { code, message } });

const input = {
  barbellKg: 15,
  bars: [{ name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' as const }],
};

const row = {
  id: 'g1',
  default_bar_kg: 15,
  gym_bars: [],
};

afterEach(() => vi.restoreAllMocks());

describe('get: unreadable data', () => {
  const getWith = async (data: unknown) =>
    createSupabaseGymService(fakeClient({ 'gyms:select': { data, error: null } }).client).get();

  it.each<[string, unknown]>([
    ['null data without an error', null],
    ['an object instead of an array', { id: 'g1' }],
    ['a string', 'oops'],
    ['a row without an id', [{ ...row, id: undefined }]],
    ['gym_bars missing', [{ ...row, gym_bars: undefined }]],
    ['gym_bars null', [{ ...row, gym_bars: null }]],
    [
      'an unknown bar kind',
      [{ ...row, gym_bars: [{ id: 'b', name: 'x', weight_kg: 1, kind: 'olympic' }] }],
    ],
    [
      'non-numeric bar weight',
      [{ ...row, gym_bars: [{ id: 'b', name: 'x', weight_kg: 'heavy', kind: 'other' }] }],
    ],
    ['one good row and one bad row', [row, { ...row, id: 'g2', default_bar_kg: 'x' }]],
  ])('reports %s as an error, not as a partial gym', async (_label, data) => {
    expect(await getWith(data)).toEqual({ status: 'error', reason: 'unknown' });
  });

  it('returns null for no rows', async () => {
    expect(await getWith([])).toEqual({ status: 'ok', value: null });
  });

  it('keeps unicode and markup in bar names untouched', async () => {
    const r = await getWith([
      {
        ...row,
        gym_bars: [{ id: 'b', name: 'बार <b>x</b>', weight_kg: 5, kind: 'other' }],
      },
    ]);
    expect(r.status === 'ok' && r.value?.bars[0]?.name).toBe('बार <b>x</b>');
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['an empty string', ''],
    ['spaces', '   '],
    ['Infinity', 'Infinity'],
    ['boolean true', true],
  ])('a bar weight of %s is an error, never a number', async (_l, bad) => {
    const r = await getWith([
      { ...row, gym_bars: [{ id: 'b', name: 'x', weight_kg: bad, kind: 'other' }] },
    ]);
    expect(r).toEqual({ status: 'error', reason: 'unknown' });
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['an empty string', ''],
  ])('a barbell weight of %s is an error, never 0 kg', async (_l, bad) => {
    const r = await getWith([{ ...row, default_bar_kg: bad }]);
    expect(r).toEqual({ status: 'error', reason: 'unknown' });
  });
});

describe('error classification', () => {
  it.each<[string, string]>([
    ['Failed to fetch', 'offline'],
    ['TypeError: NetworkError when attempting to fetch resource.', 'offline'],
    ['Network request failed', 'offline'],
    ['FETCH ERROR', 'offline'],
    ['new row violates row-level security policy', 'unknown'],
    ['duplicate key value violates unique constraint', 'unknown'],
    ['', 'unknown'],
  ])('maps "%s" to %s', async (message, reason) => {
    const { client } = fakeClient({ 'gyms:select': fail(message) });
    expect(await createSupabaseGymService(client).get()).toEqual({ status: 'error', reason });
  });

  it('reports a server refusal as it is even when the browser says it is offline (a real answer proves the network works)', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const svc = createSupabaseGymService(
      fakeClient({ 'gyms:upsert': fail('boom', '23505') }).client,
    );
    expect(await svc.save('u1', 'gym-1', input)).toEqual({
      status: 'error',
      reason: 'conflict',
    });
  });

  it('does not treat a missing navigator as offline (Node runs)', async () => {
    vi.stubGlobal('navigator', undefined);
    try {
      const svc = createSupabaseGymService(fakeClient({ 'gyms:select': fail('x') }).client);
      expect(await svc.get()).toEqual({ status: 'error', reason: 'unknown' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('a client that throws instead of returning an error', () => {
  it('lets the rejection reach the caller (the UI wraps every call in try/catch)', async () => {
    const svc = createSupabaseGymService(fakeClient({ 'gyms:select': boom }).client);
    await expect(svc.get()).rejects.toThrow('Failed to fetch');
  });
});

describe('save', () => {
  const ops = (calls: Call[]) => calls.map((c) => `${c.table}:${c.op}`);

  it('reports a failure while writing the bars, after the gym row was written', async () => {
    const { client, calls } = fakeClient({ 'gym_bars:upsert': fail('x', '23505') });
    const r = await createSupabaseGymService(client).save('u1', 'gym-1', input);
    expect(r).toEqual({ status: 'error', reason: 'conflict' });
    expect(ops(calls)).toEqual(['gyms:upsert', 'gym_bars:select', 'gym_bars:upsert']);
  });

  it('retrying after the bars failed reuses the gym id, so it cannot make a second gym', async () => {
    const first = fakeClient({ 'gym_bars:upsert': fail('timeout') });
    await createSupabaseGymService(first.client).save('u1', 'gym-1', input);
    const retry = fakeClient();
    await createSupabaseGymService(retry.client).save('u1', 'gym-1', input);
    const idOf = (calls: Call[]) => (calls[0]?.args[0] as { id: string }).id;
    expect(idOf(retry.calls)).toBe(idOf(first.calls));
  });

  it('gives every bar without an id its own id, and keeps ids it was given', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseGymService(client).save('u1', 'gym-1', {
      ...input,
      bars: [
        { id: 'mine', name: 'A', weightKg: 1, kind: 'other' },
        { name: 'B', weightKg: 2, kind: 'other' },
        { name: 'C', weightKg: 3, kind: 'other' },
      ],
    });
    const upsert = calls.find((c) => c.table === 'gym_bars' && c.op === 'upsert');
    const ids = (upsert?.args[0] as { id: string }[]).map((r) => r.id);
    expect(ids[0]).toBe('mine');
    expect(new Set(ids).size).toBe(3);
  });

  it('uses the gym id it is given, and the bars point at that same id', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseGymService(client).save('u1', 'gym-7', input);
    const upsert = calls.find((c) => c.table === 'gym_bars' && c.op === 'upsert');
    expect((calls[0]?.args[0] as { id: string }).id).toBe('gym-7');
    expect((upsert?.args[0] as { gym_id: string }[])[0]?.gym_id).toBe('gym-7');
  });

  it('writes 100 bars in one statement', async () => {
    const { client, calls } = fakeClient();
    const bars = Array.from({ length: 100 }, (_, i) => ({
      name: `B${i}`,
      weightKg: i,
      kind: 'other' as const,
    }));
    await createSupabaseGymService(client).save('u1', 'gym-1', { ...input, bars });
    const upserts = calls.filter((c) => c.table === 'gym_bars' && c.op === 'upsert');
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.args[0]).toHaveLength(100);
  });

  it('never sends the user id from anywhere but its argument, and never sends stray fields', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseGymService(client).save('u1', 'gym-1', {
      ...input,
      extra: 'x',
    } as unknown as typeof input);
    expect(calls[0]?.args[0]).toEqual({ id: 'gym-1', user_id: 'u1', default_bar_kg: 15 });
  });

  it.each<[string, Script, string[]]>([
    ['the gym write fails', { 'gyms:upsert': fail('x') }, ['gyms:upsert']],
    ['the bar lookup fails', { 'gym_bars:select': fail('x') }, ['gyms:upsert', 'gym_bars:select']],
    [
      'the bar delete fails',
      { 'gym_bars:select': { data: [{ id: 'gone' }], error: null }, 'gym_bars:delete': fail('x') },
      ['gyms:upsert', 'gym_bars:select', 'gym_bars:delete'],
    ],
    [
      'the bar upsert fails',
      { 'gym_bars:upsert': fail('x') },
      ['gyms:upsert', 'gym_bars:select', 'gym_bars:upsert'],
    ],
  ])('stops, reports an error and does no later step when %s', async (_label, script, expected) => {
    const { client, calls } = fakeClient(script);
    const r = await createSupabaseGymService(client).save('u1', 'g1', input);
    expect(r.status).toBe('error');
    expect(ops(calls)).toEqual(expected);
  });

  it('treats a null bar list from the lookup as empty', async () => {
    const { client, calls } = fakeClient({ 'gym_bars:select': { data: null, error: null } });
    const r = await createSupabaseGymService(client).save('u1', 'g1', input);
    expect(r.status).toBe('ok');
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
  });

  it('only touches bars of the gym being saved', async () => {
    const { client, calls } = fakeClient({
      'gym_bars:select': { data: [{ id: 'gone' }], error: null },
    });
    await createSupabaseGymService(client).save('u1', 'g1', { ...input, bars: [] });
    expect(calls.find((c) => c.op === 'select')?.filters).toContainEqual(['eq', ['gym_id', 'g1']]);
    expect(calls.find((c) => c.op === 'delete')?.filters).toContainEqual(['eq', ['gym_id', 'g1']]);
  });

  it('keeps a bar whose form id is listed twice from being deleted, and sends it twice (caller must dedupe)', async () => {
    const { client, calls } = fakeClient({
      'gym_bars:select': { data: [{ id: 'k' }], error: null },
    });
    await createSupabaseGymService(client).save('u1', 'g1', {
      ...input,
      bars: [
        { id: 'k', name: 'A', weightKg: 1, kind: 'other' },
        { id: 'k', name: 'B', weightKg: 2, kind: 'other' },
      ],
    });
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
  });

  it('reports a second gym for the same user (unique violation) as a conflict and writes no bars', async () => {
    const { client, calls } = fakeClient({ 'gyms:upsert': fail('dup', '23505') });
    const r = await createSupabaseGymService(client).save('u1', 'gym-second', input);
    expect(r).toEqual({ status: 'error', reason: 'conflict' });
    expect(calls.some((c) => c.table === 'gym_bars')).toBe(false);
  });
});

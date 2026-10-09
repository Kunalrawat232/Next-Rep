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
    for (const filter of ['eq', 'neq', 'in', 'not', 'order'])
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
  name: 'Home gym',
  barbellKg: 15,
  bars: [{ name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' as const }],
};

const row = {
  id: 'g1',
  name: 'Home gym',
  default_bar_kg: 15,
  is_default: true,
  created_at: '2026-10-01T10:00:00Z',
  gym_bars: [],
};

afterEach(() => vi.restoreAllMocks());

describe('list: unreadable data', () => {
  const listWith = async (data: unknown) =>
    createSupabaseGymService(fakeClient({ 'gyms:select': { data, error: null } }).client).list();

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
    ['is_default as text', [{ ...row, is_default: 'true' }]],
    [
      'non-numeric bar weight',
      [{ ...row, gym_bars: [{ id: 'b', name: 'x', weight_kg: 'heavy', kind: 'other' }] }],
    ],
    ['one good row and one bad row', [row, { ...row, id: 'g2', default_bar_kg: 'x' }]],
  ])('reports %s as an error, not as a partial list', async (_label, data) => {
    expect(await listWith(data)).toEqual({ status: 'error', reason: 'unknown' });
  });

  it('returns an empty list for no rows', async () => {
    expect(await listWith([])).toEqual({ status: 'ok', value: [] });
  });

  it('keeps unicode and markup in names untouched', async () => {
    const r = await listWith([{ ...row, name: 'जिम <b>x</b>' }]);
    expect(r.status === 'ok' && r.value[0]?.name).toBe('जिम <b>x</b>');
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['an empty string', ''],
    ['spaces', '   '],
    ['Infinity', 'Infinity'],
    ['boolean true', true],
  ])('a bar weight of %s is coerced to a number instead of failing', async (_l, bad) => {
    const r = await listWith([
      { ...row, gym_bars: [{ id: 'b', name: 'x', weight_kg: bad, kind: 'other' }] },
    ]);
    expect(r).toEqual({ status: 'error', reason: 'unknown' });
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['an empty string', ''],
  ])('a barbell weight of %s silently becomes 0 kg', async (_l, bad) => {
    const r = await listWith([{ ...row, default_bar_kg: bad }]);
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
    expect(await createSupabaseGymService(client).list()).toEqual({ status: 'error', reason });
  });

  it('says offline for any failed step when the browser reports offline, even with a database message', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const svc = createSupabaseGymService(
      fakeClient({ 'gyms:upsert': fail('boom', '23505') }).client,
    );
    expect(await svc.create('u1', 'gym-1', input, true)).toEqual({
      status: 'error',
      reason: 'offline',
    });
  });

  it('does not treat a missing navigator as offline (Node runs)', async () => {
    vi.stubGlobal('navigator', undefined);
    try {
      const svc = createSupabaseGymService(fakeClient({ 'gyms:select': fail('x') }).client);
      expect(await svc.list()).toEqual({ status: 'error', reason: 'unknown' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('a client that throws instead of returning an error', () => {
  it('lets the rejection reach the caller (the UI wraps every call in try/catch)', async () => {
    const svc = createSupabaseGymService(fakeClient({ 'gyms:select': boom }).client);
    await expect(svc.list()).rejects.toThrow('Failed to fetch');
  });
});

describe('create', () => {
  it('reports a failure while writing the bars, after the gym row was written', async () => {
    const { client, calls } = fakeClient({ 'gym_bars:upsert': fail('x', '23505') });
    const r = await createSupabaseGymService(client).create('u1', 'gym-1', input, true);
    expect(r).toEqual({ status: 'error', reason: 'conflict' });
    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual(['gyms:upsert', 'gym_bars:upsert']);
  });

  it('retrying after the bars failed reuses the gym id, so it cannot make a second gym', async () => {
    const first = fakeClient({ 'gym_bars:upsert': fail('timeout') });
    await createSupabaseGymService(first.client).create('u1', 'gym-1', input, true);
    const retry = fakeClient();
    await createSupabaseGymService(retry.client).create('u1', 'gym-1', input, true);
    const idOf = (calls: Call[]) => (calls[0]?.args[0] as { id: string }).id;
    expect(idOf(retry.calls)).toBe(idOf(first.calls));
  });

  it('gives every bar without an id its own id, and keeps ids it was given', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseGymService(client).create(
      'u1',
      'gym-1',
      {
        ...input,
        bars: [
          { id: 'mine', name: 'A', weightKg: 1, kind: 'other' },
          { name: 'B', weightKg: 2, kind: 'other' },
          { name: 'C', weightKg: 3, kind: 'other' },
        ],
      },
      false,
    );
    const ids = (calls[1]?.args[0] as { id: string }[]).map((r) => r.id);
    expect(ids[0]).toBe('mine');
    expect(new Set(ids).size).toBe(3);
  });

  it('uses the gym id it is given, and the bars point at that same id', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseGymService(client).create('u1', 'gym-7', input, true);
    expect((calls[0]?.args[0] as { id: string }).id).toBe('gym-7');
    expect((calls[1]?.args[0] as { gym_id: string }[])[0]?.gym_id).toBe('gym-7');
  });

  it('writes 100 bars in one statement', async () => {
    const { client, calls } = fakeClient();
    const bars = Array.from({ length: 100 }, (_, i) => ({
      name: `B${i}`,
      weightKg: i,
      kind: 'other' as const,
    }));
    await createSupabaseGymService(client).create('u1', 'gym-1', { ...input, bars }, false);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.args[0]).toHaveLength(100);
  });

  it('never sends the user id from anywhere but its argument, and never sends stray fields', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseGymService(client).create(
      'u1',
      'gym-1',
      { ...input, extra: 'x' } as unknown as typeof input,
      true,
    );
    expect(Object.keys(calls[0]?.args[0] as object).sort()).toEqual(
      ['default_bar_kg', 'id', 'is_default', 'name', 'user_id'].sort(),
    );
  });
});

describe('update', () => {
  it.each<[string, Script, string[]]>([
    ['the bar lookup fails', { 'gym_bars:select': fail('x') }, ['gyms:update', 'gym_bars:select']],
    [
      'the bar delete fails',
      { 'gym_bars:select': { data: [{ id: 'gone' }], error: null }, 'gym_bars:delete': fail('x') },
      ['gyms:update', 'gym_bars:select', 'gym_bars:delete'],
    ],
    [
      'the bar upsert fails',
      { 'gym_bars:upsert': fail('x') },
      ['gyms:update', 'gym_bars:select', 'gym_bars:upsert'],
    ],
  ])('stops, reports an error and does no later step when %s', async (_label, script, ops) => {
    const { client, calls } = fakeClient(script);
    const r = await createSupabaseGymService(client).update('u1', 'g1', input);
    expect(r.status).toBe('error');
    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual(ops);
  });

  it('treats a null bar list from the lookup as empty', async () => {
    const { client, calls } = fakeClient({ 'gym_bars:select': { data: null, error: null } });
    const r = await createSupabaseGymService(client).update('u1', 'g1', input);
    expect(r.status).toBe('ok');
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
  });

  it('only touches bars of the gym being edited', async () => {
    const { client, calls } = fakeClient({
      'gym_bars:select': { data: [{ id: 'gone' }], error: null },
    });
    await createSupabaseGymService(client).update('u1', 'g1', { ...input, bars: [] });
    expect(calls.find((c) => c.op === 'select')?.filters).toContainEqual(['eq', ['gym_id', 'g1']]);
    expect(calls.find((c) => c.op === 'delete')?.filters).toContainEqual(['eq', ['gym_id', 'g1']]);
  });

  it('keeps a bar whose form id is listed twice from being deleted, and sends it twice (caller must dedupe)', async () => {
    const { client, calls } = fakeClient({
      'gym_bars:select': { data: [{ id: 'k' }], error: null },
    });
    await createSupabaseGymService(client).update('u1', 'g1', {
      ...input,
      bars: [
        { id: 'k', name: 'A', weightKg: 1, kind: 'other' },
        { id: 'k', name: 'B', weightKg: 2, kind: 'other' },
      ],
    });
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
  });

  it('does not rewrite the default flag when editing', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseGymService(client).update('u1', 'g1', input);
    expect(Object.keys(calls[0]?.args[0] as object).sort()).toEqual(['default_bar_kg', 'name']);
  });
});

describe('remove and setDefault', () => {
  it('reports a failed delete, offline and unknown', async () => {
    const off = fakeClient({ 'gyms:delete': fail('Failed to fetch') });
    expect(await createSupabaseGymService(off.client).remove('g1')).toEqual({
      status: 'error',
      reason: 'offline',
    });
    const other = fakeClient({ 'gyms:delete': fail('rls', '42501') });
    expect(await createSupabaseGymService(other.client).remove('g1')).toEqual({
      status: 'error',
      reason: 'unknown',
    });
  });

  it('reports an error when the second statement of setDefault fails, after the old default was cleared', async () => {
    let n = 0;
    const { client, calls } = fakeClient();
    const from = client.from.bind(client);
    const wrapped = {
      from: (table: string) => {
        const b = from(table) as unknown as Record<string, unknown>;
        const update = b.update as (...a: unknown[]) => unknown;
        b.update = (...a: unknown[]) => {
          n += 1;
          const r = update(...a);
          if (n === 2) (b as { then: unknown }).then = (res: (v: Result) => void) => res(fail('x'));
          return r;
        };
        return b;
      },
    } as unknown as Pick<SupabaseClient, 'from'>;
    const r = await createSupabaseGymService(wrapped).setDefault('g2');
    expect(r).toEqual({ status: 'error', reason: 'unknown' });
    expect(calls).toHaveLength(2);
  });
});

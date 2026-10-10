import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseGymService } from './gyms';

type Call = { table: string; op: string; args: unknown[]; filters: [string, unknown[]][] };
type Result = { data: unknown; error: { code?: string; message: string } | null };

/** A stand-in for the supabase-js query builder that records what was asked and returns scripted results. */
function fakeClient(results: Record<string, Result> = {}) {
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
    builder.then = (resolve: (r: Result) => void) => {
      const key = `${table}:${current?.op}`;
      resolve(results[key] ?? { data: [], error: null });
    };
    return builder;
  };
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, calls };
}

const input = {
  name: 'Home gym',
  barbellKg: 15,
  bars: [{ name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' as const }],
};

afterEach(() => vi.restoreAllMocks());

describe('list', () => {
  const row = {
    id: 'g1',
    name: 'Home gym',
    default_bar_kg: '15.00',
    is_default: true,
    created_at: '2026-10-01T10:00:00Z',
    gym_bars: [{ id: 'b1', name: 'EZ bar', weight_kg: '7.50', kind: 'ez_bar' }],
  };

  it('turns rows into gyms, reading numeric columns whether they arrive as text or numbers', async () => {
    const { client } = fakeClient({ 'gyms:select': { data: [row], error: null } });
    const r = await createSupabaseGymService(client).list();
    expect(r).toEqual({
      status: 'ok',
      value: [
        {
          id: 'g1',
          name: 'Home gym',
          barbellKg: 15,
          isDefault: true,
          createdAt: '2026-10-01T10:00:00Z',
          bars: [{ id: 'b1', name: 'EZ bar', weightKg: 7.5, kind: 'ez_bar' }],
        },
      ],
    });
    const { client: c2 } = fakeClient({
      'gyms:select': { data: [{ ...row, default_bar_kg: 20, gym_bars: [] }], error: null },
    });
    const r2 = await createSupabaseGymService(c2).list();
    expect(r2.status === 'ok' && r2.value[0]?.barbellKg).toBe(20);
  });

  it('orders gyms oldest first and their bars by name, so both lists are stable', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseGymService(client).list();
    expect(calls[0]?.filters).toContainEqual(['order', ['created_at', { ascending: true }]]);
    expect(calls[0]?.filters).toContainEqual([
      'order',
      ['name', { referencedTable: 'gym_bars', ascending: true }],
    ]);
  });

  it('reports an unreadable row as an error instead of guessing', async () => {
    const { client } = fakeClient({
      'gyms:select': { data: [{ ...row, default_bar_kg: 'lots' }], error: null },
    });
    expect(await createSupabaseGymService(client).list()).toEqual({
      status: 'error',
      reason: 'unknown',
    });
  });

  it('reports a network failure as offline and anything else as unknown', async () => {
    const offline = fakeClient({
      'gyms:select': { data: null, error: { message: 'TypeError: Failed to fetch' } },
    });
    expect(await createSupabaseGymService(offline.client).list()).toEqual({
      status: 'error',
      reason: 'offline',
    });
    const other = fakeClient({
      'gyms:select': {
        data: null,
        error: { code: '42501', message: 'permission denied for table gyms' },
      },
    });
    expect(await createSupabaseGymService(other.client).list()).toEqual({
      status: 'error',
      reason: 'unknown',
    });
  });

  it('treats a browser that says it is offline as offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { client } = fakeClient({ 'gyms:select': { data: null, error: { message: 'x' } } });
    expect(await createSupabaseGymService(client).list()).toEqual({
      status: 'error',
      reason: 'offline',
    });
  });
});

describe('create', () => {
  it('upserts the gym with a fixed id, then its bars, owned by the user', async () => {
    const { client, calls } = fakeClient();
    const r = await createSupabaseGymService(client).create('u1', 'gym-1', input, true);
    expect(r.status).toBe('ok');
    const [gymCall, barsCall] = calls;
    const gymRow = (gymCall?.args[0] ?? {}) as Record<string, unknown>;
    expect(gymCall).toMatchObject({ table: 'gyms', op: 'upsert' });
    expect(gymRow).toMatchObject({
      user_id: 'u1',
      name: 'Home gym',
      default_bar_kg: 15,
      is_default: true,
    });
    expect(gymRow.id).toBe('gym-1');
    expect(gymCall?.args[1]).toEqual({ onConflict: 'id' });
    const barRows = barsCall?.args[0] as Record<string, unknown>[];
    expect(barRows).toHaveLength(1);
    expect(barRows[0]).toMatchObject({
      user_id: 'u1',
      gym_id: gymRow.id,
      name: 'EZ bar',
      weight_kg: 7.5,
      kind: 'ez_bar',
    });
  });

  it('does not touch gym_bars when there are none, and marks a non-first gym as not default', async () => {
    const { client, calls } = fakeClient();
    await createSupabaseGymService(client).create('u1', 'gym-1', { ...input, bars: [] }, false);
    expect(calls.map((c) => c.table)).toEqual(['gyms']);
    expect((calls[0]?.args[0] as Record<string, unknown>).is_default).toBe(false);
  });

  it('stops and reports the failure if the gym row fails, without writing bars', async () => {
    const { client, calls } = fakeClient({
      'gyms:upsert': { data: null, error: { code: '23505', message: 'dup' } },
    });
    const r = await createSupabaseGymService(client).create('u1', 'gym-1', input, true);
    expect(r).toEqual({ status: 'error', reason: 'conflict' });
    expect(calls.map((c) => c.table)).toEqual(['gyms']);
  });
});

describe('update', () => {
  it('removes bars that are gone, then upserts the rest, keeping ids of existing bars', async () => {
    const { client, calls } = fakeClient({
      'gym_bars:select': { data: [{ id: 'keep' }, { id: 'gone' }], error: null },
    });
    const r = await createSupabaseGymService(client).update('u1', 'g1', {
      ...input,
      bars: [
        { id: 'keep', name: 'EZ bar', weightKg: 8, kind: 'ez_bar' },
        { name: 'Trap bar', weightKg: 25, kind: 'other' },
      ],
    });
    expect(r.status).toBe('ok');
    const ops = calls.map((c) => `${c.table}:${c.op}`);
    expect(ops).toEqual(['gyms:update', 'gym_bars:select', 'gym_bars:delete', 'gym_bars:upsert']);
    const del = calls[2]!;
    expect(del.filters).toContainEqual(['eq', ['gym_id', 'g1']]);
    expect(del.filters).toContainEqual(['in', ['id', ['gone']]]);
    const rows = calls[3]!.args[0] as Record<string, unknown>[];
    expect(rows[0]?.id).toBe('keep');
    expect(typeof rows[1]?.id).toBe('string');
    expect(rows[1]?.id).not.toBe('keep');
  });

  it('deletes nothing when no bar was removed', async () => {
    const { client, calls } = fakeClient({
      'gym_bars:select': { data: [{ id: 'keep' }], error: null },
    });
    await createSupabaseGymService(client).update('u1', 'g1', {
      ...input,
      bars: [{ id: 'keep', name: 'EZ bar', weightKg: 8, kind: 'ez_bar' }],
    });
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
  });

  it('deletes every bar when the form has none', async () => {
    const { client, calls } = fakeClient({
      'gym_bars:select': { data: [{ id: 'a' }, { id: 'b' }], error: null },
    });
    await createSupabaseGymService(client).update('u1', 'g1', { ...input, bars: [] });
    expect(calls.find((c) => c.op === 'delete')?.filters).toContainEqual([
      'in',
      ['id', ['a', 'b']],
    ]);
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
  });

  it('stops at the first failing step', async () => {
    const { client, calls } = fakeClient({
      'gyms:update': { data: null, error: { code: '42501', message: 'x' } },
    });
    const r = await createSupabaseGymService(client).update('u1', 'g1', input);
    expect(r).toEqual({ status: 'error', reason: 'unknown' });
    expect(calls).toHaveLength(1);
  });
});

describe('remove', () => {
  it('deletes the gym by id', async () => {
    const { client, calls } = fakeClient();
    const r = await createSupabaseGymService(client).remove('g1');
    expect(r.status).toBe('ok');
    expect(calls[0]).toMatchObject({ table: 'gyms', op: 'delete' });
    expect(calls[0]?.filters).toContainEqual(['eq', ['id', 'g1']]);
  });
});

describe('setDefault', () => {
  it('clears the old default first, then sets the new one', async () => {
    const { client, calls } = fakeClient();
    const r = await createSupabaseGymService(client).setDefault('g2');
    expect(r.status).toBe('ok');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.args[0]).toEqual({ is_default: false });
    expect(calls[0]?.filters).toContainEqual(['eq', ['is_default', true]]);
    expect(calls[0]?.filters).toContainEqual(['neq', ['id', 'g2']]);
    expect(calls[1]?.args[0]).toEqual({ is_default: true });
    expect(calls[1]?.filters).toContainEqual(['eq', ['id', 'g2']]);
  });

  it('does not set the new default if clearing the old one failed', async () => {
    const { client, calls } = fakeClient({
      'gyms:update': { data: null, error: { code: '42501', message: 'x' } },
    });
    const r = await createSupabaseGymService(client).setDefault('g2');
    expect(r.status).toBe('error');
    expect(calls).toHaveLength(1);
  });
});

describe('retrying create', () => {
  it('sends the same gym and bar ids on a retry, so it finishes the job instead of duplicating', async () => {
    const withIds = { ...input, bars: [{ id: 'bar-1', ...input.bars[0]! }] };
    const first = fakeClient({
      'gym_bars:upsert': { data: null, error: { message: 'Failed to fetch' } },
    });
    const failed = await createSupabaseGymService(first.client).create(
      'u1',
      'gym-1',
      withIds,
      true,
    );
    expect(failed).toEqual({ status: 'error', reason: 'offline' });
    const second = fakeClient();
    await createSupabaseGymService(second.client).create('u1', 'gym-1', withIds, true);
    const ids = (calls: Call[]) => [
      (calls[0]?.args[0] as { id: string }).id,
      (calls[1]?.args[0] as { id: string }[])[0]?.id,
    ];
    expect(ids(first.calls)).toEqual(['gym-1', 'bar-1']);
    expect(ids(second.calls)).toEqual(['gym-1', 'bar-1']);
  });
});

describe('failure reasons', () => {
  it('calls a unique violation a conflict, and a server error with "network" in it unknown', async () => {
    const conflict = fakeClient({
      'gyms:select': { data: null, error: { code: '23505', message: 'dup' } },
    });
    expect(await createSupabaseGymService(conflict.client).list()).toEqual({
      status: 'error',
      reason: 'conflict',
    });
    const server = fakeClient({
      'gyms:select': { data: null, error: { code: 'XX000', message: 'network config invalid' } },
    });
    expect(await createSupabaseGymService(server.client).list()).toEqual({
      status: 'error',
      reason: 'unknown',
    });
  });
});

describe('update failures', () => {
  it.each([
    ['gym_bars:select', 'select'],
    ['gym_bars:delete', 'delete'],
    ['gym_bars:upsert', 'upsert'],
  ])('reports an error from the %s step', async (key) => {
    const { client } = fakeClient({
      'gym_bars:select': { data: [{ id: 'gone' }], error: null },
      [key]: {
        data: key === 'gym_bars:select' ? null : [],
        error: { code: '42501', message: 'x' },
      },
    });
    const r = await createSupabaseGymService(client).update('u1', 'g1', {
      ...input,
      bars: [{ name: 'New', weightKg: 5, kind: 'other' }],
    });
    expect(r).toEqual({ status: 'error', reason: 'unknown' });
  });
});

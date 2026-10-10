import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseGymService } from './gyms';

type Result = { data: unknown; error: { code?: string; message: string } | null };

/** Scripted answers per "table:op", consumed in order; the last one repeats. Records every call. */
function fakeClient(script: Record<string, Result[]> = {}) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const from = (table: string) => {
    let op = '';
    const builder: Record<string, unknown> = {};
    for (const name of ['select', 'upsert', 'update', 'delete'])
      builder[name] = (...args: unknown[]) => {
        op = name;
        calls.push({ table, op, args });
        return builder;
      };
    for (const name of ['eq', 'neq', 'in', 'not', 'order']) builder[name] = () => builder;
    builder.then = (resolve: (r: Result) => void) => {
      const queue = script[`${table}:${op}`] ?? [];
      resolve((queue.length > 1 ? queue.shift() : queue[0]) ?? { data: [], error: null });
    };
    return builder;
  };
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, calls };
}

const goodRow = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  name: 'Home',
  default_bar_kg: '20.00',
  is_default: true,
  created_at: '2026-10-01T10:00:00+00:00',
  gym_bars: [],
  ...over,
});
const offline = { data: null, error: { message: 'Failed to fetch' } };
const input = { name: 'Home', barbellKg: 20, bars: [] as never[] };

describe('list(): server rows are untrusted', () => {
  const bad: [string, unknown][] = [
    ['bar weight text with a unit', goodRow({ default_bar_kg: '20kg' })],
    ['negative-looking text', goodRow({ default_bar_kg: '-5' })],
    ['exponent text', goodRow({ default_bar_kg: '2e1' })],
    ['empty text', goodRow({ default_bar_kg: '' })],
    ['null bar weight', goodRow({ default_bar_kg: null })],
    ['boolean bar weight', goodRow({ default_bar_kg: true })],
    ['is_default as text', goodRow({ is_default: 'true' })],
    [
      'bar kind that is not known',
      goodRow({ gym_bars: [{ id: 'b', name: 'x', weight_kg: 5, kind: 'trap' }] }),
    ],
    [
      'missing gym_bars',
      Object.fromEntries(Object.entries(goodRow()).filter(([key]) => key !== 'gym_bars')),
    ],
  ];
  it.each(bad)('%s makes the whole list unknown, never a crash or a raw error', async (_l, row) => {
    const { client } = fakeClient({ 'gyms:select': [{ data: [row], error: null }] });
    expect(await createSupabaseGymService(client).list()).toEqual({
      status: 'error',
      reason: 'unknown',
    });
  });

  it('data: null with no error is an unknown failure, not an empty list', async () => {
    const { client } = fakeClient({ 'gyms:select': [{ data: null, error: null }] });
    expect(await createSupabaseGymService(client).list()).toEqual({
      status: 'error',
      reason: 'unknown',
    });
  });

  it('no gyms at all is an empty list', async () => {
    const { client } = fakeClient({ 'gyms:select': [{ data: [], error: null }] });
    expect(await createSupabaseGymService(client).list()).toEqual({ status: 'ok', value: [] });
  });

  it('a gym with no bars keeps its barbell and an empty bar list', async () => {
    const { client } = fakeClient({ 'gyms:select': [{ data: [goodRow()], error: null }] });
    const r = await createSupabaseGymService(client).list();
    expect(r).toMatchObject({ status: 'ok', value: [{ barbellKg: 20, bars: [] }] });
  });

  it('numeric text with 2 decimals and plain numbers read the same', async () => {
    const { client } = fakeClient({
      'gyms:select': [
        {
          data: [goodRow({ default_bar_kg: '15.50' }), goodRow({ id: 'g2', default_bar_kg: 15.5 })],
          error: null,
        },
      ],
    });
    const r = await createSupabaseGymService(client).list();
    expect(r.status === 'ok' && r.value.map((g) => g.barbellKg)).toEqual([15.5, 15.5]);
  });
});

describe('write failures are classified, and partial writes stop at the first failure', () => {
  it('create: if the gym row fails, no bars are sent', async () => {
    const { client, calls } = fakeClient({ 'gyms:upsert': [offline] });
    const r = await createSupabaseGymService(client).create(
      'u',
      'g',
      { ...input, bars: [{ name: 'EZ', weightKg: 7.5, kind: 'ez_bar' }] },
      false,
    );
    expect(r).toEqual({ status: 'error', reason: 'offline' });
    expect(calls.some((c) => c.table === 'gym_bars')).toBe(false);
  });

  it('create: a duplicate gym name is a conflict', async () => {
    const { client } = fakeClient({
      'gyms:upsert': [{ data: null, error: { code: '23505', message: 'dup' } }],
    });
    expect(await createSupabaseGymService(client).create('u', 'g', input, true)).toEqual({
      status: 'error',
      reason: 'conflict',
    });
  });

  it('update: a failing bar delete stops before any bar is upserted', async () => {
    const { client, calls } = fakeClient({
      'gym_bars:select': [{ data: [{ id: 'old' }], error: null }],
      'gym_bars:delete': [{ data: null, error: { code: '42501', message: 'rls' } }],
    });
    const r = await createSupabaseGymService(client).update('u', 'g', {
      ...input,
      bars: [{ id: 'new', name: 'EZ', weightKg: 7.5, kind: 'ez_bar' }],
    });
    expect(r).toEqual({ status: 'error', reason: 'unknown' });
    expect(calls.some((c) => c.table === 'gym_bars' && c.op === 'upsert')).toBe(false);
  });

  it('update: a bar without an id is created with a fresh id, and a bar with its id is kept', async () => {
    const { client, calls } = fakeClient({
      'gym_bars:select': [{ data: [{ id: 'keep' }, { id: 'drop' }], error: null }],
    });
    await createSupabaseGymService(client).update('u', 'g', {
      ...input,
      bars: [
        { id: 'keep', name: 'EZ', weightKg: 7.5, kind: 'ez_bar' },
        { name: 'Smith', weightKg: 15, kind: 'smith' },
      ],
    });
    const upsert = calls.find((c) => c.table === 'gym_bars' && c.op === 'upsert');
    const rows = upsert?.args[0] as { id: string }[];
    expect(rows[0]?.id).toBe('keep');
    expect(rows[1]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls.find((c) => c.op === 'delete')).toBeDefined();
  });

  it('update: when every bar is removed, the delete covers them and no empty upsert is sent', async () => {
    const { client, calls } = fakeClient({
      'gym_bars:select': [{ data: [{ id: 'a' }], error: null }],
    });
    await createSupabaseGymService(client).update('u', 'g', input);
    expect(calls.some((c) => c.table === 'gym_bars' && c.op === 'upsert')).toBe(false);
    expect(calls.some((c) => c.table === 'gym_bars' && c.op === 'delete')).toBe(true);
  });

  it('setDefault: the old default is cleared first, and a failure there never sets the new one', async () => {
    const { client, calls } = fakeClient({ 'gyms:update': [offline] });
    const r = await createSupabaseGymService(client).setDefault('g2');
    expect(r).toEqual({ status: 'error', reason: 'offline' });
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(1);
  });

  it('remove: a foreign-key refusal (gym still used) is a rejection', async () => {
    const { client } = fakeClient({
      'gyms:delete': [{ data: null, error: { code: '23503', message: 'fk' } }],
    });
    expect(await createSupabaseGymService(client).remove('g')).toEqual({
      status: 'error',
      reason: 'rejected',
    });
  });

  it('create with the same id twice upserts by id both times (retry-safe)', async () => {
    const { client, calls } = fakeClient();
    const svc = createSupabaseGymService(client);
    await svc.create('u', 'same-id', input, false);
    await svc.create('u', 'same-id', input, false);
    const gymUpserts = calls.filter((c) => c.table === 'gyms');
    expect(gymUpserts).toHaveLength(2);
    for (const call of gymUpserts) {
      expect(call.args[1]).toEqual({ onConflict: 'id' });
      expect((call.args[0] as { id: string }).id).toBe('same-id');
    }
  });

  it('create: a bar failure after the gym row was written is reported (the gym stays; retry is safe)', async () => {
    const { client } = fakeClient({
      'gym_bars:upsert': [{ data: null, error: { code: '23514', message: 'check' } }],
    });
    const r = await createSupabaseGymService(client).create(
      'u',
      'g',
      { ...input, bars: [{ name: 'EZ', weightKg: 7.5, kind: 'ez_bar' }] },
      false,
    );
    expect(r).toEqual({ status: 'error', reason: 'rejected' });
  });
});

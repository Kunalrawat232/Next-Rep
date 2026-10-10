import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseProfileService } from './profiles';

type Answer = { data?: unknown; error: { code?: string; message: string } | null };

function client(answer: Answer) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'upsert'])
    builder[op] = (...args: unknown[]) => {
      calls.push([op, args]);
      return builder;
    };
  builder.maybeSingle = () => Promise.resolve(answer);
  builder.then = (resolve: (a: Answer) => void) => resolve(answer);
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, calls, from };
}

describe('getUnit', () => {
  it.each(['kg', 'lb'] as const)('reads %s from the profile', async (unit) => {
    const c = client({ data: { default_unit: unit }, error: null });
    expect(await createSupabaseProfileService(c.client).getUnit('u1')).toEqual({
      status: 'ok',
      value: unit,
    });
    expect(c.from).toHaveBeenCalledWith('profiles');
    expect(c.calls).toContainEqual(['eq', ['id', 'u1']]);
  });

  it.each([null, { default_unit: null }, { default_unit: 'stone' }, { default_unit: 5 }, {}])(
    'treats a missing row or a bad value (%j) as no saved unit',
    async (data) => {
      const c = client({ data, error: null });
      expect(await createSupabaseProfileService(c.client).getUnit('u1')).toEqual({
        status: 'ok',
        value: null,
      });
    },
  );

  it('classifies a failure like the other services', async () => {
    const c = client({ error: { message: 'Failed to fetch' } });
    expect(await createSupabaseProfileService(c.client).getUnit('u1')).toEqual({
      status: 'error',
      reason: 'offline',
    });
  });
});

describe('setUnit', () => {
  it('saves with an upsert on the id, so a profile that is not there yet is created', async () => {
    const c = client({ error: null });
    expect(await createSupabaseProfileService(c.client).setUnit('u1', 'lb')).toEqual({
      status: 'ok',
      value: undefined,
    });
    expect(c.calls).toContainEqual([
      'upsert',
      [{ id: 'u1', default_unit: 'lb' }, { onConflict: 'id' }],
    ]);
    expect(c.calls.some(([op]) => op === 'eq')).toBe(false);
  });

  it('reports a refusal', async () => {
    const c = client({ error: { code: '42501', message: 'rls' } });
    expect(await createSupabaseProfileService(c.client).setUnit('u1', 'kg')).toMatchObject({
      status: 'error',
    });
  });
});

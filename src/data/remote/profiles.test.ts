import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { ensureProfile } from './profiles';

const clientWith = (result: { error: { code?: string; message: string } | null }) => {
  const upsert = vi.fn().mockResolvedValue(result);
  const from = vi.fn(() => ({ upsert }));
  return { client: { from } as unknown as Pick<SupabaseClient, 'from'>, from, upsert };
};

describe('ensureProfile', () => {
  it('inserts the profile row if missing and never overwrites an existing one', async () => {
    const { client, from, upsert } = clientWith({ error: null });
    await ensureProfile(client, 'user-1');
    expect(from).toHaveBeenCalledWith('profiles');
    expect(upsert).toHaveBeenCalledWith(
      { id: 'user-1' },
      { onConflict: 'id', ignoreDuplicates: true },
    );
  });

  it('throws a short error with only the code, not the server message', async () => {
    const { client } = clientWith({
      error: {
        code: '42501',
        message: 'new row violates row-level security policy for table "profiles"',
      },
    });
    const failure = ensureProfile(client, 'user-1');
    await expect(failure).rejects.toThrow('42501');
    await expect(failure).rejects.not.toThrow(/row-level/);
  });

  it('handles an error without a code', async () => {
    const { client } = clientWith({ error: { message: 'x' } });
    await expect(ensureProfile(client, 'user-1')).rejects.toThrow('unknown');
  });
});

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { ensureProfile } from './profiles';

type Result = { error: { code?: string; message: string } | null };
const clientWith = (upsert: ReturnType<typeof vi.fn>) =>
  ({ from: vi.fn(() => ({ upsert })) }) as unknown as Pick<SupabaseClient, 'from'>;

describe('ensureProfile edge cases', () => {
  it.each<{ name: string; result: Result; message: RegExp }>([
    {
      name: 'a PostgREST code',
      result: { error: { code: 'PGRST301', message: 'JWT expired' } },
      message: /PGRST301/,
    },
    {
      name: 'an empty-string code',
      result: { error: { code: '', message: 'x' } },
      message: /Could not create profile/,
    },
    {
      name: 'a code that is only whitespace',
      result: { error: { code: ' ', message: 'x' } },
      message: /Could not create profile/,
    },
  ])('reports $name without the server message', async ({ result, message }) => {
    const client = clientWith(vi.fn().mockResolvedValue(result));
    const failure = ensureProfile(client, 'u1');
    await expect(failure).rejects.toThrow(message);
    await expect(failure).rejects.not.toThrow(/JWT expired/);
  });

  it('does not put the user id in the error', async () => {
    const client = clientWith(
      vi.fn().mockResolvedValue({ error: { code: '42501', message: 'x' } }),
    );
    await expect(ensureProfile(client, 'secret-user-id')).rejects.not.toThrow(/secret-user-id/);
  });

  it('rejects, rather than swallowing, when the request itself rejects (offline)', async () => {
    const client = clientWith(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(ensureProfile(client, 'u1')).rejects.toThrow();
  });

  it('sends the id as given, even for odd ids, and never anything else', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    for (const id of ['', ' ', "x'; drop table profiles;--"]) {
      await ensureProfile(clientWith(upsert), id);
      expect(upsert).toHaveBeenLastCalledWith({ id }, { onConflict: 'id', ignoreDuplicates: true });
    }
  });

  it('is safe to call twice at the same time', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    await expect(
      Promise.all([
        ensureProfile(clientWith(upsert), 'u1'),
        ensureProfile(clientWith(upsert), 'u1'),
      ]),
    ).resolves.toEqual([undefined, undefined]);
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});

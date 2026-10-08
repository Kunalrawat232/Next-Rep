import type { SupabaseClient } from '@supabase/supabase-js';

/** Creates the user's profile row on first sign-in and leaves an existing one untouched. */
export async function ensureProfile(
  client: Pick<SupabaseClient, 'from'>,
  userId: string,
): Promise<void> {
  const { error } = await client
    .from('profiles')
    .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error(`Could not create profile (${error.code ?? 'unknown'})`);
}

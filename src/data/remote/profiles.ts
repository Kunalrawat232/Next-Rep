import type { SupabaseClient } from '@supabase/supabase-js';
import { UnitSchema } from '../../domain/schemas';
import type { ProfileService } from '../../features/settings/types';
import { failure } from './failure';

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

/**
 * Reads and saves the weight unit. Saving is an upsert, not an update: on a first sign-in the
 * profile row may not exist yet, and an update that matches no row would report success and lose
 * the choice.
 */
export function createSupabaseProfileService(client: Pick<SupabaseClient, 'from'>): ProfileService {
  return {
    async getUnit(userId) {
      const { data, error } = await client
        .from('profiles')
        .select('default_unit')
        .eq('id', userId)
        .maybeSingle();
      if (error) return failure(error);
      const parsed = UnitSchema.safeParse(
        (data as { default_unit?: unknown } | null)?.default_unit,
      );
      return { status: 'ok', value: parsed.success ? parsed.data : null };
    },

    async setUnit(userId, unit) {
      const { error } = await client
        .from('profiles')
        .upsert({ id: userId, default_unit: unit }, { onConflict: 'id' });
      return error ? failure(error) : { status: 'ok', value: undefined };
    },
  };
}

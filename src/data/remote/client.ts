import { createClient } from '@supabase/supabase-js';
import type { SupabaseEnv } from './env';

/** A fixed key, so the app can read the stored session itself (see storedSession.ts). */
export const AUTH_STORAGE_KEY = 'next-rep-auth';

/** One browser client. The session is kept in local storage and refreshed automatically. */
export function createSupabase(env: SupabaseEnv) {
  return createClient(env.url, env.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: AUTH_STORAGE_KEY,
    },
  });
}

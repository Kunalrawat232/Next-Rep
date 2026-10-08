import { z } from 'zod';
import type { AuthUser } from '../../features/auth/types';

const StoredSession = z.object({
  user: z.object({ id: z.string().min(1), email: z.string().nullish() }),
});

/**
 * Who is signed in, read straight from the session Supabase keeps in storage. No network, no waiting:
 * with an expired access token, the library's own getSession() spends about 25 s retrying a refresh
 * before giving up, which would leave an offline user staring at a spinner. The server still checks
 * the real token on every request (RLS), so this is only used to decide what to show.
 */
export function readStoredUser(storage: Pick<Storage, 'getItem'>, key: string): AuthUser | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = StoredSession.safeParse(JSON.parse(raw));
    return parsed.success
      ? { id: parsed.data.user.id, email: parsed.data.user.email ?? null }
      : null;
  } catch {
    return null;
  }
}

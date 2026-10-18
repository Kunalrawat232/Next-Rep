import type { SupabaseClient } from '@supabase/supabase-js';
import { CoachResponseSchema, type CoachRequest } from '../../domain/coach';
import type { CoachAnswer, CoachService } from '../../features/coach/coachService';

type Client = { auth: Pick<SupabaseClient['auth'], 'getSession'> };

/** The function allows the model 20 s; this is the app's own limit for the whole round trip. */
export const COACH_TIMEOUT_MS = 25_000;

type Options = { fetch?: typeof fetch; url?: string; timeoutMs?: number; online?: () => boolean };

/**
 * Calls `/api/coach` with the user's access token. It never throws: every problem is one of the answers the
 * screen knows how to word, so a failure never reaches the user as a raw error.
 */
export function createFetchCoachService(client: Client, options: Options = {}): CoachService {
  const send = options.fetch ?? ((...args) => fetch(...args));
  const url = options.url ?? '/api/coach';
  const timeoutMs = options.timeoutMs ?? COACH_TIMEOUT_MS;
  const online = options.online ?? (() => navigator.onLine !== false);
  return {
    async ask(request: CoachRequest): Promise<CoachAnswer> {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        // getSession can hang offline, so it is raced against the same limit.
        const session = await Promise.race([
          client.auth.getSession(),
          new Promise<null>((resolve) => signal.addEventListener('abort', () => resolve(null))),
        ]);
        // No answer from getSession at all is a slow or missing connection; an answer with no session is a signed-out user.
        if (session === null) return { status: online() ? 'unavailable' : 'offline' };
        const token = session.data.session?.access_token;
        if (!token) return { status: online() ? 'signed_out' : 'offline' };
        const response = await send(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(request),
          signal,
        });
        if (response.status === 401) return { status: 'signed_out' };
        if (response.status === 429) return { status: 'limited' };
        if (!response.ok) return { status: 'unavailable' };
        const body = CoachResponseSchema.safeParse(await response.json());
        if (!body.success) return { status: 'unavailable' };
        return body.data.status === 'ok'
          ? { status: 'ok', text: body.data.text }
          : { status: body.data.status };
      } catch {
        return { status: online() ? 'unavailable' : 'offline' };
      }
    },
  };
}

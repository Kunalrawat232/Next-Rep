import type { SupabaseClient } from '@supabase/supabase-js';
import { ParseResponseSchema, type ParseRequest } from '../../domain/parser';
import type { ParseService } from '../../features/voice/parseService';

type Client = { auth: Pick<SupabaseClient['auth'], 'getSession'> };

/** The function itself times out at about 8 s; this is the app's own limit for the whole round trip. */
export const PARSE_TIMEOUT_MS = 10_000;

type Options = { fetch?: typeof fetch; url?: string; timeoutMs?: number };

/** Calls `/api/parse` with the user's access token. Any trouble means "no answer", so logging is never held up. */
export function createFetchParseService(client: Client, options: Options = {}): ParseService {
  const send = options.fetch ?? ((...args) => fetch(...args));
  const url = options.url ?? '/api/parse';
  const timeoutMs = options.timeoutMs ?? PARSE_TIMEOUT_MS;
  return {
    async parse(request: ParseRequest) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        // getSession can hang offline, so it is raced against the same limit.
        const session = await Promise.race([
          client.auth.getSession(),
          new Promise<null>((resolve) => signal.addEventListener('abort', () => resolve(null))),
        ]);
        const token = session?.data.session?.access_token;
        if (!token) return null;
        const response = await send(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(request),
          signal,
        });
        if (!response.ok) return null;
        const body = ParseResponseSchema.safeParse(await response.json());
        return body.success && body.data.status === 'ok' ? body.data.result : null;
      } catch {
        return null;
      }
    },
  };
}

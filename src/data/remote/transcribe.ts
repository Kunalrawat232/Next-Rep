import type { SupabaseClient } from '@supabase/supabase-js';
import { TranscribeResponseSchema } from '../../domain/parser/transcribe';
import type { TranscribeService } from '../../features/voice';

type Client = { auth: Pick<SupabaseClient['auth'], 'getSession'> };

/** The function itself gives the speech service 10 s; this is the app's own limit for the whole round trip. */
export const TRANSCRIBE_TIMEOUT_MS = 12_000;

type Options = { fetch?: typeof fetch; url?: string; timeoutMs?: number };

/** Calls `/api/transcribe` with the user's access token. Any trouble means "no words", so logging is never held up. */
export function createFetchTranscribeService(
  client: Client,
  options: Options = {},
): TranscribeService {
  const send = options.fetch ?? ((...args) => fetch(...args));
  const url = options.url ?? '/api/transcribe';
  const timeoutMs = options.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS;
  return {
    async transcribe(audio: Blob) {
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
          headers: { 'Content-Type': audio.type, Authorization: `Bearer ${token}` },
          body: audio,
          signal,
        });
        if (!response.ok) return null;
        const body = TranscribeResponseSchema.safeParse(await response.json());
        return body.success && body.data.status === 'ok' ? body.data.text : null;
      } catch {
        return null;
      }
    },
  };
}

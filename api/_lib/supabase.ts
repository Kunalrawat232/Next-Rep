// The Supabase calls the functions make on behalf of the signed-in user: check the token, and count a request
// against that user's limit. Shared by /api/parse and /api/coach.
import { createClient } from '@supabase/supabase-js';

function supabaseFor(token: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('supabase not configured');
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** True when the token is a valid, signed-in user's access token. */
export async function verifyToken(token: string): Promise<boolean> {
  const { data, error } = await supabaseFor(token).auth.getClaims(token);
  return !error && data?.claims.role === 'authenticated' && Boolean(data.claims.sub);
}

/**
 * Counts a request of one endpoint (its `scope`) in the window of this many seconds for the token's user; null
 * when it cannot be counted. Each endpoint has its own counters.
 */
export async function consumeLimit(
  token: string,
  scope: string,
  windowSeconds: number,
): Promise<number | null> {
  const { data, error } = await supabaseFor(token).rpc('consume_rate_limit', {
    p_scope: scope,
    p_window_seconds: windowSeconds,
  });
  return error || typeof data !== 'number' ? null : data;
}

/**
 * Counts one model call against the project's day (the ceiling is set in the database, in
 * `consume_daily_ceiling`) and says whether it is still allowed; null when it cannot be counted. Shared by /api/parse, /api/coach and /api/transcribe, because they share one free quota.
 */
export async function consumeModelCall(token: string): Promise<boolean | null> {
  const { data, error } = await supabaseFor(token).rpc('consume_daily_ceiling', {
    p_scope: 'gemini',
  });
  return error || typeof data !== 'boolean' ? null : data;
}

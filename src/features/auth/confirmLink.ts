// The link in the confirmation email opens /sign-in?token_hash=…&type=email (see
// supabase/templates/confirm-signup.html). The page exchanges that one-time code for a session, so no
// login tokens are ever put in a URL. Supabase's own error keys (`error`, `error_code`, in the query or
// the hash) and the tokens of its older link style are also read and removed, in case one arrives.

/** Supabase's token hashes are hex, sometimes with a prefix such as `pkce_`. */
const TOKEN_HASH = /^[\w-]{8,256}$/;

const QUERY_KEYS = ['token_hash', 'type', 'error', 'error_code', 'error_description'];
const HASH_KEYS = [
  'access_token',
  'refresh_token',
  'expires_at',
  'expires_in',
  'token_type',
  'provider_token',
  'provider_refresh_token',
  'type',
  'error',
  'error_code',
  'error_description',
];

export type ConfirmLink = {
  /** The one-time code to verify, when the URL holds a well-formed one. */
  tokenHash: string | null;
  /** Supabase sent the browser back with an error (an old or used link). */
  failed: boolean;
  /** The URL without the link's keys, or null when there is nothing to remove. */
  clean: { search: string; hash: string } | null;
};

function params(text: string, prefix: string): URLSearchParams {
  return new URLSearchParams(text.startsWith(prefix) ? text.slice(prefix.length) : text);
}

/** Reads a confirmation link from a location's `search` and `hash`. */
export function readConfirmLink(search: string, hash: string): ConfirmLink {
  const query = params(search, '?');
  const fragment = params(hash, '#');
  const queryTouched = QUERY_KEYS.some((key) => query.has(key));
  const hashTouched = HASH_KEYS.some((key) => fragment.has(key));
  if (!queryTouched && !hashTouched) return { tokenHash: null, failed: false, clean: null };

  const failed = ['error', 'error_code'].some((key) => query.has(key) || fragment.has(key));
  const code = query.get('token_hash');
  const tokenHash = !failed && code !== null && TOKEN_HASH.test(code) ? code : null;

  for (const key of QUERY_KEYS) query.delete(key);
  const rest = query.toString();
  return {
    tokenHash,
    failed,
    clean: { search: rest ? `?${rest}` : '', hash: hashTouched ? '' : hash },
  };
}

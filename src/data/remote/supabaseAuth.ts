import {
  AuthSessionMissingError,
  isAuthRetryableFetchError,
  type AuthError,
  type SupabaseClient,
} from '@supabase/supabase-js';
import type { AuthFailure, AuthResult, AuthService, AuthUser } from '../../features/auth/types';

export type AuthApi = Pick<
  SupabaseClient['auth'],
  'onAuthStateChange' | 'signInWithPassword' | 'signUp' | 'signOut'
>;

// A Map, so a hostile error code such as "constructor" cannot match an inherited property.
const failureByCode = new Map<string, AuthFailure>([
  ['invalid_credentials', 'invalid_credentials'],
  ['email_not_confirmed', 'email_not_confirmed'],
  ['weak_password', 'weak_password'],
  ['user_already_exists', 'email_taken'],
  ['email_exists', 'email_taken'],
  ['signup_disabled', 'signup_disabled'],
  ['over_request_rate_limit', 'rate_limited'],
  ['over_email_send_rate_limit', 'rate_limited'],
]);

function failureOf(error: AuthError): AuthFailure {
  if (isAuthRetryableFetchError(error)) return 'network';
  const byCode = error.code === undefined ? undefined : failureByCode.get(error.code);
  if (byCode) return byCode;
  return error.status === 429 ? 'rate_limited' : 'unknown';
}

const toUser = (user: { id: string; email?: string }): AuthUser => ({
  id: user.id,
  email: user.email ?? null,
});
const failure = (reason: AuthFailure): AuthResult => ({ status: 'error', reason });

/** Only the error's name is logged: its message could contain what the user typed. */
function unexpected(error: unknown): AuthResult {
  console.warn(
    'An auth request failed unexpectedly:',
    error instanceof Error ? error.name : typeof error,
  );
  return failure('unknown');
}

/** `readStored` reads the locally stored user; it is what keeps an offline user signed in. */
export function createSupabaseAuthService(
  auth: AuthApi,
  readStored: () => AuthUser | null = () => null,
): AuthService {
  return {
    async getUser() {
      return readStored();
    },

    onChange(listener) {
      const { data } = auth.onAuthStateChange((event, session) => {
        const user = session?.user;
        if (user) listener(toUser(user));
        else if (event === 'SIGNED_OUT' || readStored() === null) listener(null);
        // Otherwise no session came back only because a token refresh could not reach the server
        // (offline with an old session). The stored session is still there, so the user stays signed in.
      });
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password) {
      try {
        const { data, error } = await auth.signInWithPassword({ email, password });
        if (error) return failure(failureOf(error));
        return data.session ? { status: 'signed_in' } : failure('unknown');
      } catch (error) {
        return unexpected(error);
      }
    },

    async signUp(email, password) {
      try {
        const { data, error } = await auth.signUp({ email, password });
        if (error) return failure(failureOf(error));
        // No session means the email must be confirmed first. With "Confirm email" on, the server also
        // answers this way for an address that is already registered, so the form reveals nothing.
        // With it off, the server returns user_already_exists, which is shown (see ADR-007).
        return data.session ? { status: 'signed_in' } : { status: 'confirm_email' };
      } catch (error) {
        return unexpected(error);
      }
    },

    async signOut() {
      const { error } = await auth.signOut({ scope: 'local' });
      // Offline, the library clears the local session and then reports that it could not tell the
      // server (checked against the installed version), so that error still means "signed out here".
      if (error && !(error instanceof AuthSessionMissingError) && !isAuthRetryableFetchError(error))
        throw error;
    },
  };
}

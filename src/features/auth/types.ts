// What the UI needs from an auth backend. Supabase is hidden behind this (src/data/remote/supabaseAuth.ts),
// so features and their tests never touch supabase-js types.
export type AuthUser = { id: string; email: string | null };

export type AuthFailure =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'email_taken'
  | 'rate_limited'
  | 'signup_disabled'
  | 'network'
  | 'unknown';

export type AuthResult =
  { status: 'signed_in' } | { status: 'confirm_email' } | { status: 'error'; reason: AuthFailure };

export type AuthService = {
  /** The user from the locally stored session. Never waits for the network. */
  getUser(): Promise<AuthUser | null>;
  /** Calls the listener when the user signs in or out. Returns an unsubscribe function. */
  onChange(listener: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string): Promise<AuthResult>;
  /** Clears the local session, so it also works offline. */
  signOut(): Promise<void>;
};

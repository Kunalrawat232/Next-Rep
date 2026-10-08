import { z } from 'zod';

export type AuthMode = 'signIn' | 'signUp';
export type CredentialErrors = { email?: string; password?: string };
export type CredentialsResult =
  { ok: true; email: string; password: string } | { ok: false; errors: CredentialErrors };

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt ignores everything past 72 bytes

const byteLength = (text: string) => new TextEncoder().encode(text).length;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Checks the form before anything is sent. Signing in only needs a password; signing up enforces the length. */
export function validateCredentials(
  mode: AuthMode,
  rawEmail: string,
  password: string,
): CredentialsResult {
  const errors: CredentialErrors = {};
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) errors.email = 'Enter a valid email address.';

  if (mode === 'signIn') {
    if (password.length === 0) errors.password = 'Enter your password.';
  } else if (password.length < PASSWORD_MIN) {
    errors.password = `Password must be at least ${PASSWORD_MIN} characters.`;
  } else if (byteLength(password) > PASSWORD_MAX) {
    errors.password = `Password must be at most ${PASSWORD_MAX} bytes (emoji and accented letters count as more than one).`;
  }

  return email.success && !errors.password
    ? { ok: true, email: email.data, password }
    : { ok: false, errors };
}

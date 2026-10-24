import { PASSWORD_MIN } from './authSchema';
import type { AuthFailure } from './types';

const messages: Record<AuthFailure, string> = {
  invalid_credentials: 'Wrong email or password.',
  email_not_confirmed: 'Confirm your email first. Check your inbox.',
  weak_password: `That password is too weak. Use at least ${PASSWORD_MIN} characters.`,
  email_taken: 'An account with this email already exists. Try signing in.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  signup_disabled: 'Sign-ups are turned off right now.',
  link_invalid:
    'This link has expired or was already used. Sign in, or create the account again to get a new email.',
  network: "Can't reach the server. Check your connection and try again.",
  unknown: 'Something went wrong. Please try again.',
};

export const messageFor = (reason: AuthFailure): string => messages[reason];

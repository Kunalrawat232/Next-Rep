import { describe, expect, it } from 'vitest';
import { messageFor } from './authErrors';
import type { AuthFailure } from './types';

const all: AuthFailure[] = [
  'invalid_credentials',
  'email_not_confirmed',
  'weak_password',
  'email_taken',
  'rate_limited',
  'signup_disabled',
  'network',
  'unknown',
];

describe('messageFor', () => {
  it.each(all)('has a friendly, non-empty message for %s', (reason) => {
    const message = messageFor(reason);
    expect(message.length).toBeGreaterThan(10);
    expect(message).not.toMatch(/undefined|null|\[object/);
  });

  it('uses a different message for every failure', () => {
    expect(new Set(all.map(messageFor)).size).toBe(all.length);
  });

  it('does not reveal whether an account exists when credentials are wrong', () => {
    expect(messageFor('invalid_credentials')).toMatch(/email or password/i);
  });
});

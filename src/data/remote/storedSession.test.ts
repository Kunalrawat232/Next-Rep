import { describe, expect, it } from 'vitest';
import { readStoredUser } from './storedSession';

const storageWith = (value: string | null): Pick<Storage, 'getItem'> => ({ getItem: () => value });
const session = (user: unknown) => JSON.stringify({ access_token: 't', refresh_token: 'r', user });

describe('readStoredUser', () => {
  it('reads the user from a stored session without any network', () => {
    expect(readStoredUser(storageWith(session({ id: 'u1', email: 'a@b.co' })), 'k')).toEqual({
      id: 'u1',
      email: 'a@b.co',
    });
  });

  it('reads from the key it is given, and only that key', () => {
    const seen: string[] = [];
    readStoredUser({ getItem: (key) => (seen.push(key), null) }, 'next-rep-auth');
    expect(seen).toEqual(['next-rep-auth']);
  });

  it('uses a null email when the account has none', () => {
    expect(readStoredUser(storageWith(session({ id: 'u1' })), 'k')).toEqual({
      id: 'u1',
      email: null,
    });
  });

  it('still returns the user when the access token inside has expired', () => {
    const expired = JSON.stringify({
      access_token: 'x',
      expires_at: 1,
      user: { id: 'u1', email: 'a@b.co' },
    });
    expect(readStoredUser(storageWith(expired), 'k')).toEqual({ id: 'u1', email: 'a@b.co' });
  });

  it.each([
    { name: 'nothing stored', value: null },
    { name: 'an empty string', value: '' },
    { name: 'text that is not JSON', value: 'not json' },
    { name: 'JSON that is not an object', value: '42' },
    { name: 'a session with no user', value: JSON.stringify({ access_token: 't' }) },
    { name: 'a user with no id', value: session({ email: 'a@b.co' }) },
    { name: 'an empty user id', value: session({ id: '' }) },
    { name: 'a numeric user id', value: session({ id: 7 }) },
    { name: 'a user that is an array', value: session(['u1']) },
    { name: 'a numeric email', value: session({ id: 'u1', email: 5 }) },
  ])('is null for $name', ({ value }) => {
    expect(readStoredUser(storageWith(value), 'k')).toBeNull();
  });

  it('is null instead of throwing when storage itself throws (private mode, blocked storage)', () => {
    const blocked = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    expect(readStoredUser(blocked, 'k')).toBeNull();
  });
});

import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../features/auth/types';
import { createSupabaseAuthService, type AuthApi } from './supabaseAuth';

// Measured with the installed library: offline, with an access token that expired more than an
// hour ago, getSession() takes about 25 s and then reports no session, and INITIAL_SESSION fires with
// no session, even though the session is still in storage. These tests pin down how we cope.
const ada: AuthUser = { id: 'u1', email: 'ada@example.com' };
const sessionOf = (user: AuthUser) => ({ user: { id: user.id, email: user.email ?? undefined } });

function setup(stored: AuthUser | null) {
  let callback: (event: string, session: unknown) => unknown = () => undefined;
  const getSession = vi.fn(() => new Promise(() => undefined)); // would hang for 25 s offline
  const auth = {
    getSession,
    onAuthStateChange: vi.fn((cb) => {
      callback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signOut: vi.fn(),
  } as unknown as AuthApi;
  const heard: (AuthUser | null)[] = [];
  const service = createSupabaseAuthService(auth, () => stored);
  service.onChange((user) => heard.push(user));
  return {
    getSession,
    service,
    heard,
    fire: (event: string, session: unknown) => callback(event, session),
  };
}

describe('reading who is signed in', () => {
  it('answers from the stored session at once and never calls the slow network-bound getSession', async () => {
    const { getSession, service } = setup(ada);
    expect(await service.getUser()).toEqual(ada);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('is null when nothing is stored', async () => {
    expect(await setup(null).service.getUser()).toBeNull();
  });
});

describe('events while the session cannot be refreshed', () => {
  it('ignores an empty INITIAL_SESSION while a session is still stored', () => {
    const t = setup(ada);
    t.fire('INITIAL_SESSION', null);
    expect(t.heard).toEqual([]);
  });

  it('reports an empty INITIAL_SESSION when nothing is stored', () => {
    const t = setup(null);
    t.fire('INITIAL_SESSION', null);
    expect(t.heard).toEqual([null]);
  });

  it('always reports an explicit SIGNED_OUT, even if storage has not caught up', () => {
    const t = setup(ada);
    t.fire('SIGNED_OUT', null);
    expect(t.heard).toEqual([null]);
  });

  it.each(['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'INITIAL_SESSION'])(
    'reports the user for %s when a session comes back',
    (event) => {
      const t = setup(null);
      t.fire(event, sessionOf(ada));
      expect(t.heard).toEqual([ada]);
    },
  );

  it('treats a session object without a user like no session', () => {
    const withStored = setup(ada);
    withStored.fire('INITIAL_SESSION', { access_token: 't' });
    expect(withStored.heard).toEqual([]);
    const without = setup(null);
    without.fire('INITIAL_SESSION', { access_token: 't' });
    expect(without.heard).toEqual([null]);
  });
});

describe('signing out without a connection', () => {
  const outOf = (error: unknown) =>
    createSupabaseAuthService({
      signOut: vi.fn().mockResolvedValue({ error }),
    } as unknown as AuthApi);

  it('counts as signed out when only the server could not be told (the local session is already cleared)', async () => {
    await expect(
      outOf(new AuthRetryableFetchError('Failed to fetch', 0)).signOut(),
    ).resolves.toBeUndefined();
  });

  it('still reports real failures', async () => {
    await expect(outOf(new AuthApiError('x', 500, undefined)).signOut()).rejects.toThrow();
  });
});

import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuthFailure, AuthUser } from '../../features/auth/types';
import { createSupabaseAuthService, type AuthApi } from './supabaseAuth';

const user = { id: 'u1', email: 'a@b.co', identities: [{ id: 'i1' }] };
const api = (over: Record<string, unknown> = {}) =>
  ({
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    ...over,
  }) as unknown as AuthApi & Record<string, ReturnType<typeof vi.fn>>;
const failed = (error: unknown) => ({ data: { user: null, session: null }, error });

describe('signIn', () => {
  it('signs in and passes the credentials through unchanged', async () => {
    const auth = api({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { user, session: { user } }, error: null }),
    });
    expect(await createSupabaseAuthService(auth).signIn('a@b.co', 'pw')).toEqual({
      status: 'signed_in',
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw' });
  });

  it.each<{ error: unknown; reason: AuthFailure }>([
    { error: new AuthApiError('x', 400, 'invalid_credentials'), reason: 'invalid_credentials' },
    { error: new AuthApiError('x', 400, 'email_not_confirmed'), reason: 'email_not_confirmed' },
    { error: new AuthApiError('x', 429, 'over_request_rate_limit'), reason: 'rate_limited' },
    { error: new AuthApiError('x', 429, 'over_email_send_rate_limit'), reason: 'rate_limited' },
    { error: new AuthApiError('x', 429, undefined), reason: 'rate_limited' },
    { error: new AuthApiError('x', 400, 'validation_failed'), reason: 'unknown' },
    { error: new AuthApiError('x', 500, undefined), reason: 'unknown' },
    { error: new AuthRetryableFetchError('Failed to fetch', 0), reason: 'network' },
  ])('maps $reason', async ({ error, reason }) => {
    const auth = api({ signInWithPassword: vi.fn().mockResolvedValue(failed(error)) });
    expect(await createSupabaseAuthService(auth).signIn('a@b.co', 'pw')).toEqual({
      status: 'error',
      reason,
    });
  });

  it('treats a response with no session and no error as unknown instead of signed in', async () => {
    const auth = api({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { user: null, session: null }, error: null }),
    });
    expect(await createSupabaseAuthService(auth).signIn('a@b.co', 'pw')).toEqual({
      status: 'error',
      reason: 'unknown',
    });
  });

  it('turns an unexpected throw into unknown, without leaking its message', async () => {
    const auth = api({
      signInWithPassword: vi.fn().mockRejectedValue(new Error('boom secret-detail')),
    });
    const result = await createSupabaseAuthService(auth).signIn('a@b.co', 'pw');
    expect(result).toEqual({ status: 'error', reason: 'unknown' });
    expect(JSON.stringify(result)).not.toContain('secret-detail');
  });
});

describe('signUp', () => {
  it('is signed in right away when email confirmation is off (a session comes back)', async () => {
    const auth = api({
      signUp: vi.fn().mockResolvedValue({ data: { user, session: { user } }, error: null }),
    });
    expect(await createSupabaseAuthService(auth).signUp('a@b.co', 'password1')).toEqual({
      status: 'signed_in',
    });
    expect(auth.signUp).toHaveBeenCalledWith({ email: 'a@b.co', password: 'password1' });
  });

  it('asks the user to confirm their email when no session comes back', async () => {
    const auth = api({
      signUp: vi.fn().mockResolvedValue({ data: { user, session: null }, error: null }),
    });
    expect(await createSupabaseAuthService(auth).signUp('a@b.co', 'password1')).toEqual({
      status: 'confirm_email',
    });
  });

  it('gives the same answer for an already-registered email when the server hides it (no identities)', async () => {
    const hidden = { ...user, identities: [] };
    const auth = api({
      signUp: vi.fn().mockResolvedValue({ data: { user: hidden, session: null }, error: null }),
    });
    expect(await createSupabaseAuthService(auth).signUp('a@b.co', 'password1')).toEqual({
      status: 'confirm_email',
    });
  });

  it.each<{ error: unknown; reason: AuthFailure }>([
    { error: new AuthApiError('x', 422, 'user_already_exists'), reason: 'email_taken' },
    { error: new AuthApiError('x', 422, 'email_exists'), reason: 'email_taken' },
    { error: new AuthApiError('x', 422, 'weak_password'), reason: 'weak_password' },
    { error: new AuthApiError('x', 422, 'signup_disabled'), reason: 'signup_disabled' },
    { error: new AuthApiError('x', 429, 'over_email_send_rate_limit'), reason: 'rate_limited' },
    { error: new AuthRetryableFetchError('Failed to fetch', 0), reason: 'network' },
  ])('maps $reason', async ({ error, reason }) => {
    const auth = api({ signUp: vi.fn().mockResolvedValue(failed(error)) });
    expect(await createSupabaseAuthService(auth).signUp('a@b.co', 'password1')).toEqual({
      status: 'error',
      reason,
    });
  });
});

describe('getUser', () => {
  it('reads the user from the stored session, not from the network', async () => {
    const auth = api();
    const stored = { id: 'u1', email: 'a@b.co' };
    expect(await createSupabaseAuthService(auth, () => stored).getUser()).toEqual(stored);
  });

  it('is null when nothing is stored (and by default)', async () => {
    expect(await createSupabaseAuthService(api(), () => null).getUser()).toBeNull();
    expect(await createSupabaseAuthService(api()).getUser()).toBeNull();
  });
});

describe('onChange', () => {
  const setup = () => {
    const unsubscribe = vi.fn();
    let callback: (event: string, session: unknown) => unknown = () => undefined;
    const auth = api({
      onAuthStateChange: vi.fn((cb) => {
        callback = cb;
        return { data: { subscription: { unsubscribe } } };
      }),
    });
    const heard: (AuthUser | null)[] = [];
    const stop = createSupabaseAuthService(auth).onChange((u) => heard.push(u));
    return {
      heard,
      stop,
      unsubscribe,
      fire: (event: string, session: unknown) => callback(event, session),
    };
  };

  it('reports sign-ins and sign-outs as users', () => {
    const t = setup();
    t.fire('SIGNED_IN', { user });
    t.fire('TOKEN_REFRESHED', { user });
    t.fire('SIGNED_OUT', null);
    t.fire('INITIAL_SESSION', null);
    expect(t.heard).toEqual([
      { id: 'u1', email: 'a@b.co' },
      { id: 'u1', email: 'a@b.co' },
      null,
      null,
    ]);
  });

  it('keeps its callback synchronous (supabase-js warns against async callbacks)', () => {
    expect(setup().fire('SIGNED_OUT', null)).toBeUndefined();
  });

  it('unsubscribes from supabase', () => {
    const t = setup();
    t.stop();
    expect(t.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('signOut', () => {
  it('clears only the local session, so it works offline', async () => {
    const auth = api({ signOut: vi.fn().mockResolvedValue({ error: null }) });
    await createSupabaseAuthService(auth).signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('ignores a missing session (already signed out)', async () => {
    const auth = api({
      signOut: vi.fn().mockResolvedValue({ error: new AuthSessionMissingError() }),
    });
    await expect(createSupabaseAuthService(auth).signOut()).resolves.toBeUndefined();
  });

  it('throws other errors so the UI can tell the user', async () => {
    const auth = api({
      signOut: vi.fn().mockResolvedValue({ error: new AuthApiError('x', 500, undefined) }),
    });
    await expect(createSupabaseAuthService(auth).signOut()).rejects.toThrow();
  });
});

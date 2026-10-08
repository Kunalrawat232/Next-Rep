import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { AuthFailure, AuthUser } from '../../features/auth/types';
import { createSupabaseAuthService, type AuthApi } from './supabaseAuth';

const user = { id: 'u1', email: 'a@b.co' };
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

describe('error mapping edge cases', () => {
  it.each<{ name: string; error: unknown; reason: AuthFailure }>([
    {
      name: 'code "constructor"',
      error: new AuthApiError('x', 400, 'constructor'),
      reason: 'unknown',
    },
    { name: 'code "__proto__"', error: new AuthApiError('x', 400, '__proto__'), reason: 'unknown' },
    { name: 'code "toString"', error: new AuthApiError('x', 400, 'toString'), reason: 'unknown' },
    {
      name: 'code "hasOwnProperty"',
      error: new AuthApiError('x', 400, 'hasOwnProperty'),
      reason: 'unknown',
    },
    { name: 'empty code', error: new AuthApiError('x', 400, ''), reason: 'unknown' },
    {
      name: 'code in a different case',
      error: new AuthApiError('x', 400, 'INVALID_CREDENTIALS'),
      reason: 'unknown',
    },
    {
      name: 'code with trailing space',
      error: new AuthApiError('x', 400, 'invalid_credentials '),
      reason: 'unknown',
    },
    {
      name: 'known code on a 500 (the code wins over the status)',
      error: new AuthApiError('x', 500, 'invalid_credentials'),
      reason: 'invalid_credentials',
    },
    {
      name: 'status 0 with no code',
      error: new AuthApiError('x', 0, undefined),
      reason: 'unknown',
    },
    {
      name: 'known code with status 0',
      error: new AuthApiError('x', 0, 'weak_password'),
      reason: 'weak_password',
    },
    {
      name: '429 with an unrelated code is still rate limited',
      error: new AuthApiError('x', 429, 'validation_failed'),
      reason: 'rate_limited',
    },
    {
      name: '429 with a known non-rate code keeps the code',
      error: new AuthApiError('x', 429, 'invalid_credentials'),
      reason: 'invalid_credentials',
    },
    {
      name: 'retryable fetch error with a 502 status',
      error: new AuthRetryableFetchError('Bad gateway', 502),
      reason: 'network',
    },
    {
      name: 'retryable fetch error with a 504 status',
      error: new AuthRetryableFetchError('Gateway timeout', 504),
      reason: 'network',
    },
    {
      name: 'AuthUnknownError',
      error: new AuthUnknownError('weird', new Error('inner')),
      reason: 'unknown',
    },
  ])('signIn maps $name to $reason', async ({ error, reason }) => {
    const auth = api({ signInWithPassword: vi.fn().mockResolvedValue(failed(error)) });
    expect(await createSupabaseAuthService(auth).signIn('a@b.co', 'pw')).toEqual({
      status: 'error',
      reason,
    });
  });

  it('signUp maps the same hostile codes to unknown', async () => {
    for (const code of ['constructor', '__proto__', 'toString']) {
      const auth = api({
        signUp: vi.fn().mockResolvedValue(failed(new AuthApiError('x', 400, code))),
      });
      expect(await createSupabaseAuthService(auth).signUp('a@b.co', 'password1')).toEqual({
        status: 'error',
        reason: 'unknown',
      });
    }
  });

  it('never leaks a server message in the result', async () => {
    const auth = api({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue(
          failed(new AuthApiError('token=abc123 leaked', 400, 'invalid_credentials')),
        ),
    });
    const result = await createSupabaseAuthService(auth).signIn('a@b.co', 'pw');
    expect(JSON.stringify(result)).not.toContain('abc123');
  });
});

describe('signUp edge cases', () => {
  it('turns a throw into unknown', async () => {
    const auth = api({ signUp: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) });
    expect(await createSupabaseAuthService(auth).signUp('a@b.co', 'password1')).toEqual({
      status: 'error',
      reason: 'unknown',
    });
  });

  it('turns a synchronous throw into unknown', async () => {
    const auth = api({
      signUp: vi.fn(() => {
        throw new Error('sync');
      }),
    });
    expect(await createSupabaseAuthService(auth).signUp('a@b.co', 'password1')).toEqual({
      status: 'error',
      reason: 'unknown',
    });
  });

  it('turns a synchronous throw in signIn into unknown', async () => {
    const auth = api({
      signInWithPassword: vi.fn(() => {
        throw new Error('sync');
      }),
    });
    expect(await createSupabaseAuthService(auth).signIn('a@b.co', 'pw')).toEqual({
      status: 'error',
      reason: 'unknown',
    });
  });
});

describe('concurrency', () => {
  it('keeps concurrent sign-ins independent', async () => {
    const auth = api({
      signInWithPassword: vi.fn(async ({ email }: { email: string }) =>
        email === 'good@b.co'
          ? { data: { user, session: { user } }, error: null }
          : failed(new AuthApiError('x', 400, 'invalid_credentials')),
      ),
    });
    const service = createSupabaseAuthService(auth);
    const results = await Promise.all([
      service.signIn('good@b.co', 'pw'),
      service.signIn('bad@b.co', 'pw'),
      service.signIn('good@b.co', 'pw'),
    ]);
    expect(results).toEqual([
      { status: 'signed_in' },
      { status: 'error', reason: 'invalid_credentials' },
      { status: 'signed_in' },
    ]);
  });

  it('gives each onChange call its own subscription and unsubscribes only that one', () => {
    const unsubs = [vi.fn(), vi.fn()];
    let n = 0;
    const auth = api({
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: unsubs[n++] } } })),
    });
    const service = createSupabaseAuthService(auth);
    const stopA = service.onChange(() => undefined);
    service.onChange(() => undefined);
    stopA();
    expect(unsubs[0]).toHaveBeenCalledTimes(1);
    expect(unsubs[1]).not.toHaveBeenCalled();
  });
});

describe('getUser edge cases', () => {
  it('never calls the network-bound getSession, so a blocked or slow session lookup cannot hang or crash it', async () => {
    const auth = api({ getSession: vi.fn().mockRejectedValue(new Error('storage blocked')) });
    expect(await createSupabaseAuthService(auth, () => null).getUser()).toBeNull();
    expect(auth.getSession).not.toHaveBeenCalled();
  });
});

describe('onChange edge cases', () => {
  const setup = () => {
    let callback: (event: string, session: unknown) => unknown = () => undefined;
    const auth = api({
      onAuthStateChange: vi.fn((cb) => {
        callback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    });
    const heard: (AuthUser | null)[] = [];
    createSupabaseAuthService(auth).onChange((u) => heard.push(u));
    return { heard, fire: (event: string, session: unknown) => callback(event, session) };
  };

  it.each(['PASSWORD_RECOVERY', 'USER_UPDATED', 'MFA_CHALLENGE_VERIFIED', 'SOMETHING_NEW'])(
    'reports the session user for the %s event',
    (event) => {
      const t = setup();
      t.fire(event, { user });
      expect(t.heard).toEqual([{ id: 'u1', email: 'a@b.co' }]);
    },
  );

  it('treats an undefined session as signed out', () => {
    const t = setup();
    t.fire('SIGNED_OUT', undefined);
    expect(t.heard).toEqual([null]);
  });

  it('does not throw into supabase-js when an event carries a session without a user', () => {
    const t = setup();
    expect(() => t.fire('TOKEN_REFRESHED', { access_token: 't' })).not.toThrow();
  });

  it('maps a user without an email to a null email', () => {
    const t = setup();
    t.fire('SIGNED_IN', { user: { id: 'phone-user' } });
    expect(t.heard).toEqual([{ id: 'phone-user', email: null }]);
  });
});

describe('signOut edge cases', () => {
  it('propagates a rejected signOut so the UI can report it', async () => {
    const auth = api({ signOut: vi.fn().mockRejectedValue(new Error('network')) });
    await expect(createSupabaseAuthService(auth).signOut()).rejects.toThrow('network');
  });

  it('counts a retryable network error as signed out: offline, the local session is already cleared', async () => {
    const auth = api({
      signOut: vi.fn().mockResolvedValue({ error: new AuthRetryableFetchError('offline', 0) }),
    });
    await expect(createSupabaseAuthService(auth).signOut()).resolves.toBeUndefined();
  });

  it('does not swallow an error that merely looks like a missing session', async () => {
    const lookalike = Object.assign(new Error('Auth session missing!'), {
      name: 'AuthSessionMissingError',
    });
    const auth = api({ signOut: vi.fn().mockResolvedValue({ error: lookalike }) });
    await expect(createSupabaseAuthService(auth).signOut()).rejects.toThrow();
    // and the genuine class is still ignored
    const genuine = api({
      signOut: vi.fn().mockResolvedValue({ error: new AuthSessionMissingError() }),
    });
    await expect(createSupabaseAuthService(genuine).signOut()).resolves.toBeUndefined();
  });
});

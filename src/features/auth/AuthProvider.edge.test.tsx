import { act, render, screen } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeAuthService } from '../../test/fakeAuth';
import { AuthProvider, useAuth } from './AuthProvider';
import type { AuthService, AuthUser } from './types';

const ada: AuthUser = { id: 'u1', email: 'ada@example.com' };

function Probe() {
  const { state } = useAuth();
  return (
    <p data-testid="state">
      {state.status === 'signedIn' ? `in:${state.user.email}` : state.status}
    </p>
  );
}
const state = () => screen.getByTestId('state').textContent;

class Catcher extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p>boundary caught</p> : this.props.children;
  }
}

describe('AuthProvider: failing or odd services', () => {
  it('falls back to signed out when the stored-user lookup rejects', async () => {
    const fake = createFakeAuthService(ada);
    fake.service.getUser.mockRejectedValueOnce(new Error('storage blocked'));
    render(
      <AuthProvider service={fake.service}>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('signedOut')).toBeInTheDocument();
  });

  it('keeps a user who signed in while the lookup was failing', async () => {
    const fake = createFakeAuthService(null);
    let fail: (e: Error) => void = () => undefined;
    fake.service.getUser.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
    render(
      <AuthProvider service={fake.service}>
        <Probe />
      </AuthProvider>,
    );
    act(() => fake.emit(ada));
    await act(async () => fail(new Error('late failure')));
    expect(state()).toBe('in:ada@example.com');
  });

  it('trusts an event that fires synchronously during subscribe over a stale lookup', async () => {
    const service: AuthService = {
      getUser: vi.fn(async () => null),
      onChange: vi.fn((listener) => {
        listener(ada); // like supabase INITIAL_SESSION, delivered immediately
        return () => undefined;
      }),
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    };
    render(
      <AuthProvider service={service}>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => undefined);
    expect(state()).toBe('in:ada@example.com');
  });

  it('applies a lookup that resolves after unmount without warning or crashing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = createFakeAuthService(ada);
    let finish: (u: AuthUser | null) => void = () => undefined;
    fake.service.getUser.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const { unmount } = render(
      <AuthProvider service={fake.service}>
        <Probe />
      </AuthProvider>,
    );
    unmount();
    await act(async () => finish(ada));
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('ignores events delivered after unmount', async () => {
    const fake = createFakeAuthService(null);
    const { unmount } = render(
      <AuthProvider service={fake.service}>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('signedOut');
    unmount();
    expect(() => act(() => fake.emit(ada))).not.toThrow();
  });

  it('resubscribes cleanly when the service instance is swapped', async () => {
    const first = createFakeAuthService(null);
    const second = createFakeAuthService(ada);
    const { rerender } = render(
      <AuthProvider service={first.service}>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('signedOut');
    rerender(
      <AuthProvider service={second.service}>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('in:ada@example.com')).toBeInTheDocument();
    expect(first.counts().active).toBe(0);
    expect(second.counts().active).toBe(1);
  });

  it.each([
    { name: 'a token refresh with a new object for the same user', next: { ...ada } },
    { name: 'a user whose email changed', next: { ...ada, email: 'new@example.com' } },
  ])('does not re-run ensureProfile for $name', async ({ next }) => {
    const ensureProfile = vi.fn().mockResolvedValue(undefined);
    const fake = createFakeAuthService(ada);
    render(
      <AuthProvider service={fake.service} ensureProfile={ensureProfile}>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('in:ada@example.com');
    act(() => fake.emit(next));
    expect(ensureProfile).toHaveBeenCalledTimes(1);
  });

  it('runs ensureProfile again for the same user after sign-out and sign-in (retry path)', async () => {
    const ensureProfile = vi.fn().mockResolvedValue(undefined);
    const fake = createFakeAuthService(ada);
    render(
      <AuthProvider service={fake.service} ensureProfile={ensureProfile}>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('in:ada@example.com');
    act(() => fake.emit(null));
    act(() => fake.emit(ada));
    expect(ensureProfile).toHaveBeenCalledTimes(2);
  });

  it('calls ensureProfile once per user even if the parent passes a new inline function each render', async () => {
    const calls: string[] = [];
    const fake = createFakeAuthService(ada);
    const tree = () => (
      <AuthProvider
        service={fake.service}
        ensureProfile={async (id) => {
          calls.push(id);
        }}
      >
        <Probe />
      </AuthProvider>
    );
    const { rerender } = render(tree());
    await screen.findByText('in:ada@example.com');
    rerender(tree());
    rerender(tree());
    expect(calls).toEqual(['u1']);
  });
});

describe('AuthProvider: misbehaving ensureProfile must not take the app down', () => {
  it.each([
    {
      name: 'throws synchronously',
      ensureProfile: () => {
        throw new Error('sync boom');
      },
    },
    { name: 'returns undefined instead of a promise', ensureProfile: () => undefined },
  ])('keeps the user signed in when ensureProfile $name', async ({ ensureProfile }) => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fake = createFakeAuthService(ada);
    render(
      <Catcher>
        <AuthProvider
          service={fake.service}
          ensureProfile={ensureProfile as unknown as (id: string) => Promise<void>}
        >
          <Probe />
        </AuthProvider>
      </Catcher>,
    );
    await act(async () => undefined);
    expect(screen.queryByText('boundary caught')).not.toBeInTheDocument();
    expect(state()).toBe('in:ada@example.com');
    quiet.mockRestore();
    vi.restoreAllMocks();
  });
});

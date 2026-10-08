import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeAuthService } from '../../test/fakeAuth';
import { AuthProvider, useAuth } from './AuthProvider';
import type { AuthUser } from './types';

const ada: AuthUser = { id: 'u1', email: 'ada@example.com' };
const bob: AuthUser = { id: 'u2', email: 'bob@example.com' };

function Probe() {
  const { state } = useAuth();
  return (
    <p data-testid="state">
      {state.status === 'signedIn' ? `in:${state.user.email}` : state.status}
    </p>
  );
}
const state = () => screen.getByTestId('state').textContent;

describe('AuthProvider', () => {
  it('is loading first, then signed out when there is no stored user', async () => {
    const fake = createFakeAuthService(null);
    render(
      <AuthProvider service={fake.service}>
        <Probe />
      </AuthProvider>,
    );
    expect(state()).toBe('loading');
    expect(await screen.findByText('signedOut')).toBeInTheDocument();
  });

  it('is signed in when a stored user exists', async () => {
    const fake = createFakeAuthService(ada);
    render(
      <AuthProvider service={fake.service}>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('in:ada@example.com')).toBeInTheDocument();
  });

  it('follows sign-ins and sign-outs', async () => {
    const fake = createFakeAuthService(null);
    render(
      <AuthProvider service={fake.service}>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('signedOut');
    act(() => fake.emit(ada));
    expect(state()).toBe('in:ada@example.com');
    act(() => fake.emit(null));
    expect(state()).toBe('signedOut');
  });

  it('is not overwritten by a slow initial lookup that finishes after a newer event', async () => {
    const fake = createFakeAuthService(null);
    let finish: (user: AuthUser | null) => void = () => undefined;
    fake.service.getUser.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(
      <AuthProvider service={fake.service}>
        <Probe />
      </AuthProvider>,
    );
    act(() => fake.emit(ada));
    await act(async () => finish(null));
    expect(state()).toBe('in:ada@example.com');
  });

  it('unsubscribes when it unmounts', async () => {
    const fake = createFakeAuthService(null);
    const { unmount } = render(
      <AuthProvider service={fake.service}>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('signedOut');
    expect(fake.counts().active).toBe(1);
    unmount();
    expect(fake.counts().active).toBe(0);
  });

  it('keeps exactly one subscription under React StrictMode', async () => {
    const fake = createFakeAuthService(null);
    render(
      <StrictMode>
        <AuthProvider service={fake.service}>
          <Probe />
        </AuthProvider>
      </StrictMode>,
    );
    await screen.findByText('signedOut');
    expect(fake.counts().active).toBe(1);
  });

  it('throws a helpful error when useAuth is used outside the provider', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/AuthProvider/);
    quiet.mockRestore();
  });
});

describe('profile creation', () => {
  it('runs once per signed-in user, not on every render', async () => {
    const ensureProfile = vi.fn().mockResolvedValue(undefined);
    const fake = createFakeAuthService(ada);
    const { rerender } = render(
      <AuthProvider service={fake.service} ensureProfile={ensureProfile}>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('in:ada@example.com');
    rerender(
      <AuthProvider service={fake.service} ensureProfile={ensureProfile}>
        <Probe />
      </AuthProvider>,
    );
    expect(ensureProfile).toHaveBeenCalledTimes(1);
    expect(ensureProfile).toHaveBeenCalledWith('u1');
  });

  it('runs again for a different user and not at all when signed out', async () => {
    const ensureProfile = vi.fn().mockResolvedValue(undefined);
    const fake = createFakeAuthService(null);
    render(
      <AuthProvider service={fake.service} ensureProfile={ensureProfile}>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText('signedOut');
    expect(ensureProfile).not.toHaveBeenCalled();
    act(() => fake.emit(ada));
    act(() => fake.emit(null));
    act(() => fake.emit(bob));
    expect(ensureProfile.mock.calls.map((c) => c[0])).toEqual(['u1', 'u2']);
  });

  it('does not block or sign the user out when it fails, and warns without personal data', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ensureProfile = vi.fn().mockRejectedValue(new Error('Could not create profile (42501)'));
    const fake = createFakeAuthService(ada);
    render(
      <AuthProvider service={fake.service} ensureProfile={ensureProfile}>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('in:ada@example.com')).toBeInTheDocument();
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(JSON.stringify(warn.mock.calls)).not.toContain('ada@example.com');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('u1');
    warn.mockRestore();
  });
});

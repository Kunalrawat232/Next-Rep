import { act, render, screen } from '@testing-library/react';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../features/auth/AuthProvider';
import { ExerciseServiceProvider } from '../features/exercises';
import { GymServiceProvider } from '../features/gyms';
import { SyncProvider } from '../features/sync';
import { createFakeExerciseService } from '../test/fakeExercises';
import { createFakeGymService, sampleGym } from '../test/fakeGyms';
import { createFakeAuthService } from '../test/fakeAuth';
import { createFakeRemoteLog } from '../test/fakeRemoteLog';
import { tapTogether } from '../test/doubleTap';
import { appRoutes } from './routes';
import { UnitsForTest } from '../test/UnitsForTest';

const ada = { id: 'u1', email: 'ada@example.com' };

function renderAt(path: string, fake = createFakeAuthService()) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <AuthProvider service={fake.service}>
      <UnitsForTest gate={false}>
        <GymServiceProvider service={createFakeGymService(sampleGym()).service}>
          <ExerciseServiceProvider service={createFakeExerciseService().service}>
            <SyncProvider
              remote={createFakeRemoteLog().remote}
              dexieDeps={{ indexedDB, IDBKeyRange }}
            >
              <RouterProvider router={router} />
            </SyncProvider>
          </ExerciseServiceProvider>
        </GymServiceProvider>
      </UnitsForTest>
    </AuthProvider>,
  );
  return { fake, router };
}

describe('ProtectedRoute transitions', () => {
  it('kicks a user to the sign-in page when the session ends elsewhere while on a protected page', async () => {
    const { fake, router } = renderAt('/settings', createFakeAuthService(ada));
    await screen.findByText('ada@example.com');
    act(() => fake.emit(null));
    expect(await screen.findByRole('heading', { name: 'Sign in', level: 2 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(screen.queryByText(/ada@example.com/)).not.toBeInTheDocument();
  });

  it('brings the user back to the protected page after signing in again (signed in, out, in)', async () => {
    const { fake, router } = renderAt('/settings', createFakeAuthService(ada));
    await screen.findByText('ada@example.com');
    act(() => fake.emit(null));
    await screen.findByRole('heading', { name: 'Sign in', level: 2 });
    act(() => fake.emit({ id: 'u2', email: 'bob@example.com' }));
    expect(await screen.findByText('bob@example.com')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/settings');
  });

  it('never shows protected content to a signed-out visitor, not even for one render', async () => {
    const seen: string[] = [];
    const fake = createFakeAuthService(null);
    const observer = new MutationObserver(() => seen.push(document.body.textContent ?? ''));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    renderAt('/', fake);
    await screen.findByRole('heading', { name: 'Sign in', level: 2 });
    observer.disconnect();
    expect(seen.some((text) => /signed in as/i.test(text))).toBe(false);
  });

  it('shows loading again, never protected content, if the lookup is slow and a deep link is opened', async () => {
    const fake = createFakeAuthService(ada);
    fake.service.getUser.mockReturnValueOnce(new Promise(() => undefined));
    renderAt('/some/unknown/deep/link', fake);
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
  });

  it('redirects a signed-in user away from /sign-in', async () => {
    const { router } = renderAt('/sign-in', createFakeAuthService(ada));
    await screen.findByRole('heading', { name: 'Ready to lift?', level: 1 });
    expect(router.state.location.pathname).toBe('/');
  });

  it('shows the generic label when the account has no email', async () => {
    renderAt('/settings', createFakeAuthService({ id: 'u9', email: null }));
    expect(await screen.findByText('Your account')).toBeInTheDocument();
  });

  it('clears an earlier sign-out failure message after a successful retry', async () => {
    const fake = createFakeAuthService(ada);
    fake.service.signOut.mockRejectedValueOnce(new Error('offline'));
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    renderAt('/settings', fake);
    await user.click(await screen.findByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't sign you out/i);
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('heading', { name: 'Sign in', level: 2 })).toBeInTheDocument();
  });

  it('survives rapid repeated sign-out taps without an unhandled error', async () => {
    const fake = createFakeAuthService(ada);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderAt('/settings', fake);
    const button = await screen.findByRole('button', { name: /sign out/i });
    tapTogether(button, 3);
    expect(await screen.findByRole('heading', { name: 'Sign in', level: 2 })).toBeInTheDocument();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

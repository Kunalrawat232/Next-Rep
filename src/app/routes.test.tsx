import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../features/auth/AuthProvider';
import { createFakeAuthService } from '../test/fakeAuth';
import { appRoutes } from './routes';

function renderAt(path: string, fake = createFakeAuthService()) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <AuthProvider service={fake.service}>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return { fake, router, user: userEvent.setup() };
}

describe('app routes', () => {
  it('sends a signed-out visitor from / to the sign-in page', async () => {
    const { router } = renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Sign in', level: 2 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('shows a loading status, not the sign-in page, while the stored user is being read', () => {
    const fake = createFakeAuthService();
    fake.service.getUser.mockReturnValueOnce(new Promise(() => undefined));
    renderAt('/', fake);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('shows the home page to a signed-in user, with who they are signed in as', async () => {
    renderAt('/', createFakeAuthService({ id: 'u1', email: 'ada@example.com' }));
    expect(
      await screen.findByRole('heading', { name: 'Ready to lift?', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/signed in as ada@example\.com/i)).toBeInTheDocument();
  });

  it('wraps the home page in the app shell', async () => {
    renderAt('/', createFakeAuthService({ id: 'u1', email: 'a@b.co' }));
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('offers Start workout, disabled until the workout feature exists', async () => {
    renderAt('/', createFakeAuthService({ id: 'u1', email: 'a@b.co' }));
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeDisabled();
  });

  it('sends unknown paths to the home page', async () => {
    const { router } = renderAt(
      '/no-such-page',
      createFakeAuthService({ id: 'u1', email: 'a@b.co' }),
    );
    expect(await screen.findByText(/signed in as/i)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('signs out and returns to the sign-in page', async () => {
    const { fake, user } = renderAt('/', createFakeAuthService({ id: 'u1', email: 'a@b.co' }));
    await user.click(await screen.findByRole('button', { name: /sign out/i }));
    expect(fake.service.signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { name: 'Sign in', level: 2 })).toBeInTheDocument();
  });

  it('tells the user when sign-out fails, and keeps them signed in', async () => {
    const fake = createFakeAuthService({ id: 'u1', email: 'a@b.co' });
    fake.service.signOut.mockRejectedValueOnce(new Error('boom'));
    const { user } = renderAt('/', fake);
    await user.click(await screen.findByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not sign out/i);
    expect(screen.getByText(/signed in as a@b\.co/i)).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { tapTogether } from '../../test/doubleTap';
import { createFakeAuthService } from '../../test/fakeAuth';
import { AuthProvider } from './AuthProvider';
import { messageFor } from './authErrors';
import { SignInPage } from './SignInPage';
import type { AuthResult, AuthUser } from './types';

const CODE = 'b1946ac92492d2347c6235b4d2611184c0ab5d1f8f2e6a9c1d3e5f7a';
const LINK = `/sign-in?token_hash=${CODE}&type=email`;
const ada: AuthUser = { id: 'ada', email: 'ada@example.com' };

function renderAt(entry: string, fake = createFakeAuthService()) {
  const router = createMemoryRouter(
    [
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/', element: <p>home page</p> },
    ],
    { initialEntries: [entry] },
  );
  render(
    <AuthProvider service={fake.service}>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return { router, fake, user: userEvent.setup() };
}

const confirmButton = () => screen.findByRole('button', { name: 'Confirm email' });

describe('SignInPage with a confirmation-email link', () => {
  it('waits for a tap: the code is not spent on page load, and leaves the address', async () => {
    const { router, fake } = renderAt(LINK);
    expect(await confirmButton()).toBeEnabled();
    expect(
      screen.getByRole('heading', { name: 'Confirm your email', level: 2 }),
    ).toBeInTheDocument();
    expect(fake.service.verifyEmail).not.toHaveBeenCalled();
    expect(router.state.location.search).toBe('');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('verifies on tap, names the account and leads to the app', async () => {
    const { fake, user } = renderAt(LINK);
    await user.click(await confirmButton());
    expect(fake.service.verifyEmail).toHaveBeenCalledExactlyOnceWith(CODE);
    expect(
      await screen.findByText("Your email is verified. You're signed in as new@example.com."),
    ).toHaveAttribute('role', 'status');
    expect(screen.getByRole('heading', { name: 'Email verified', level: 2 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start logging' }));
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });

  it('spends the code once on a double tap', async () => {
    const { fake } = renderAt(LINK);
    tapTogether(await confirmButton());
    await screen.findByRole('heading', { name: 'Email verified', level: 2 });
    expect(fake.service.verifyEmail).toHaveBeenCalledTimes(1);
  });

  it('warns a signed-in visitor that confirming switches accounts, and does not redirect', async () => {
    const { fake } = renderAt(LINK, createFakeAuthService(ada));
    expect(
      await screen.findByText(
        "You're signed in as ada@example.com. Confirming signs you in to the account this link was sent to instead.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('home page')).not.toBeInTheDocument();
    expect(fake.service.verifyEmail).not.toHaveBeenCalled();
  });

  it('shows that the link is being checked', async () => {
    const fake = createFakeAuthService();
    let finish: (result: AuthResult) => void = () => undefined;
    fake.service.verifyEmail.mockImplementation(
      () => new Promise<AuthResult>((resolve) => (finish = resolve)),
    );
    const { user } = renderAt(LINK, fake);
    await user.click(await confirmButton());
    expect(screen.getByText('Checking your link…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirming…' })).toBeDisabled();
    finish({ status: 'error', reason: 'link_invalid' });
    expect(await screen.findByRole('alert')).toHaveTextContent(messageFor('link_invalid'));
    expect(screen.getByRole('heading', { name: 'Sign in', level: 2 })).toBeInTheDocument();
  });

  it('keeps a signed-in visitor on the page to see a failed link', async () => {
    const fake = createFakeAuthService(ada);
    fake.service.verifyEmail.mockResolvedValue({ status: 'error', reason: 'link_invalid' });
    const { user } = renderAt(LINK, fake);
    await user.click(await confirmButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(messageFor('link_invalid'));
    expect(screen.queryByText('home page')).not.toBeInTheDocument();
  });

  it('shows a network problem as such', async () => {
    const fake = createFakeAuthService();
    fake.service.verifyEmail.mockResolvedValue({ status: 'error', reason: 'network' });
    const { user } = renderAt(LINK, fake);
    await user.click(await confirmButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(messageFor('network'));
  });

  it('copes with a service that throws', async () => {
    const fake = createFakeAuthService();
    fake.service.verifyEmail.mockRejectedValue(new Error('boom'));
    const { user } = renderAt(LINK, fake);
    await user.click(await confirmButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(messageFor('unknown'));
  });

  it('reads an error Supabase sent back without calling the service', async () => {
    const { fake, router } = renderAt('/sign-in#error=access_denied&error_code=otp_expired');
    expect(await screen.findByRole('alert')).toHaveTextContent(messageFor('link_invalid'));
    expect(fake.service.verifyEmail).not.toHaveBeenCalled();
    expect(router.state.location.hash).toBe('');
  });

  it('removes old-style login tokens without using them', async () => {
    const { fake, router } = renderAt('/sign-in#access_token=t&refresh_token=r&type=signup');
    await screen.findByRole('heading', { name: 'Sign in', level: 2 });
    expect(router.state.location.hash).toBe('');
    expect(fake.service.verifyEmail).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does nothing extra on a plain visit', async () => {
    const { fake, router } = renderAt('/sign-in');
    await screen.findByRole('heading', { name: 'Sign in', level: 2 });
    expect(fake.service.verifyEmail).not.toHaveBeenCalled();
    expect(router.state.historyAction).toBe('POP');
  });

  it('still sends a signed-in visitor on a plain visit to the app', async () => {
    renderAt('/sign-in', createFakeAuthService(ada));
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });
});

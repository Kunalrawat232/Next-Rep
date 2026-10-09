import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createFakeAuthService } from '../../test/fakeAuth';
import { AuthProvider } from './AuthProvider';
import { messageFor } from './authErrors';
import { SignInPage } from './SignInPage';
import type { AuthFailure, AuthResult } from './types';
import { tapTogether } from '../../test/doubleTap';

type Entry = string | { pathname: string; state: unknown };

function renderPage(fake = createFakeAuthService(), entries: Entry[] = ['/sign-in']) {
  const router = createMemoryRouter(
    [
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/', element: <p>home page</p> },
      { path: '/gyms', element: <p>gyms page</p> },
    ],
    { initialEntries: entries },
  );
  render(
    <AuthProvider service={fake.service}>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return { fake, user: userEvent.setup() };
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  password: string,
  button: RegExp,
) {
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: button }));
}

describe('SignInPage layout and accessibility', () => {
  it('shows the product name, a sign-in heading and labelled fields with browser hints', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Next Rep', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sign in', level: 2 })).toBeInTheDocument();
    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Password');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
  });
});

describe('signing in', () => {
  it('validates first: shows field errors and never calls the service', async () => {
    const { fake, user } = renderPage();
    await user.click(await screen.findByRole('button', { name: /^sign in$/i }));
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
    expect(fake.service.signIn).not.toHaveBeenCalled();
  });

  it('sends the cleaned-up email and the exact password, then goes home', async () => {
    const { fake, user } = renderPage();
    await fillAndSubmit(user, '  Ada@Example.COM ', 'my pass 1', /^sign in$/i);
    expect(fake.service.signIn).toHaveBeenCalledWith('ada@example.com', 'my pass 1');
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });

  it('returns to the page the user was sent away from', async () => {
    const { user } = renderPage(createFakeAuthService(), [
      { pathname: '/sign-in', state: { from: { pathname: '/gyms' } } },
    ]);
    await fillAndSubmit(user, 'a@b.co', 'password1', /^sign in$/i);
    expect(await screen.findByText('gyms page')).toBeInTheDocument();
  });

  it('ignores a "from" that is not an in-app path', async () => {
    const { user } = renderPage(createFakeAuthService(), [
      { pathname: '/sign-in', state: { from: { pathname: 'https://evil.example' } } },
    ]);
    await fillAndSubmit(user, 'a@b.co', 'password1', /^sign in$/i);
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });

  it('disables the form while waiting and sends only one request on a double click', async () => {
    const fake = createFakeAuthService();
    let finish: (result: AuthResult) => void = () => undefined;
    fake.service.signIn.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const { user } = renderPage(fake);
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1');
    const button = screen.getByRole('button', { name: /^sign in$/i });
    tapTogether(button);
    expect(fake.service.signIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    await (async () => finish({ status: 'error', reason: 'invalid_credentials' }))();
    expect(await screen.findByRole('alert')).toHaveTextContent(messageFor('invalid_credentials'));
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled();
  });

  it.each<AuthFailure>([
    'invalid_credentials',
    'email_not_confirmed',
    'weak_password',
    'email_taken',
    'rate_limited',
    'signup_disabled',
    'network',
    'unknown',
  ])('shows the friendly message for %s and keeps the email', async (reason) => {
    const fake = createFakeAuthService();
    fake.service.signIn.mockResolvedValueOnce({ status: 'error', reason });
    const { user } = renderPage(fake);
    await fillAndSubmit(user, 'a@b.co', 'password1', /^sign in$/i);
    expect(await screen.findByRole('alert')).toHaveTextContent(messageFor(reason));
    expect(screen.getByLabelText('Email')).toHaveValue('a@b.co');
  });

  it('sends a signed-in visitor straight on', async () => {
    renderPage(createFakeAuthService({ id: 'u1', email: 'a@b.co' }));
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });
});

describe('creating an account', () => {
  const toSignUp = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(await screen.findByRole('button', { name: /create an account/i }));

  it('switches the screen to sign-up with new-password hints, and back', async () => {
    const { user } = renderPage();
    await toSignUp(user);
    expect(screen.getByRole('heading', { name: 'Create account', level: 2 })).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /already have an account/i }));
    expect(screen.getByRole('heading', { name: 'Sign in', level: 2 })).toBeInTheDocument();
  });

  it('clears an earlier error when switching modes', async () => {
    const fake = createFakeAuthService();
    fake.service.signIn.mockResolvedValueOnce({ status: 'error', reason: 'invalid_credentials' });
    const { user } = renderPage(fake);
    await fillAndSubmit(user, 'a@b.co', 'password1', /^sign in$/i);
    await screen.findByRole('alert');
    await toSignUp(user);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('requires 8 characters before calling the service', async () => {
    const { fake, user } = renderPage();
    await toSignUp(user);
    await fillAndSubmit(user, 'a@b.co', 'short', /^create account$/i);
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(fake.service.signUp).not.toHaveBeenCalled();
  });

  it('calls signUp, not signIn, and goes home when a session comes back', async () => {
    const { fake, user } = renderPage();
    await toSignUp(user);
    await fillAndSubmit(user, 'New@Example.com', 'password1', /^create account$/i);
    expect(fake.service.signUp).toHaveBeenCalledWith('new@example.com', 'password1');
    expect(fake.service.signIn).not.toHaveBeenCalled();
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });

  it('asks the user to check their email when confirmation is on', async () => {
    const fake = createFakeAuthService();
    fake.service.signUp.mockResolvedValueOnce({ status: 'confirm_email' });
    const { user } = renderPage(fake);
    await toSignUp(user);
    await fillAndSubmit(user, 'a@b.co', 'password1', /^create account$/i);
    const notice = await screen.findByRole('status');
    expect(within(notice).getByText(/check your email/i)).toBeInTheDocument();
    expect(screen.queryByText('home page')).not.toBeInTheDocument();
  });
});

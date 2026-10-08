import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { createFakeAuthService } from '../../test/fakeAuth';
import { AuthProvider } from './AuthProvider';
import { messageFor } from './authErrors';
import { SignInPage } from './SignInPage';
import type { AuthResult } from './types';

function renderPage(fake = createFakeAuthService(), state?: unknown) {
  const router = createMemoryRouter(
    [
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/', element: <p>home page</p> },
      { path: '/gyms', element: <p>gyms page</p> },
      { path: '/evil.com', element: <p>evil path page</p> },
      { path: '*', element: <p>fallback page</p> },
    ],
    { initialEntries: [{ pathname: '/sign-in', state }] },
  );
  const view = render(
    <AuthProvider service={fake.service}>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return { fake, router, view, user: userEvent.setup() };
}

const deferred = () => {
  let resolve: (r: AuthResult) => void = () => undefined;
  const promise = new Promise<AuthResult>((r) => (resolve = r));
  return { promise, resolve };
};

describe('SignInPage: where to go after signing in', () => {
  it.each([
    { name: 'protocol-relative', from: '//evil.com' },
    { name: 'protocol-relative with path', from: '//evil.com/gyms' },
    { name: 'javascript: URL', from: 'javascript:alert(1)' },
    { name: 'absolute https URL', from: 'https://evil.com' },
    { name: 'relative path', from: 'gyms' },
    { name: 'empty string', from: '' },
    { name: 'a number', from: 42 },
    { name: 'an array', from: ['/gyms'] },
    { name: 'a nested object', from: { pathname: '/gyms' } },
    { name: 'null', from: null },
  ])('falls back to home when pathname is $name', async ({ from }) => {
    const { user } = renderPage(createFakeAuthService(), { from: { pathname: from } });
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });

  it.each([
    { name: 'state is null', state: null },
    { name: 'state is a string', state: 'from=/gyms' },
    { name: 'state.from is a string', state: { from: '/gyms' } },
    { name: 'state.from is null', state: { from: null } },
  ])('falls back to home when $name', async ({ state }) => {
    const { user } = renderPage(createFakeAuthService(), state);
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });

  it.each([
    { name: 'a backslash after the slash', from: '/\\evil.com' },
    { name: 'a tab after the slash', from: '/\t/evil.com' },
  ])(
    'falls back to home instead of crashing the page when pathname has $name',
    async ({ from }) => {
      // Browsers read "/\evil.com" like "//evil.com". react-router refuses it with
      // "External navigation is not allowed", which would leave the user on an error screen
      // right after a successful sign-in.
      const { router, user } = renderPage(createFakeAuthService(), { from: { pathname: from } });
      await user.type(await screen.findByLabelText('Email'), 'a@b.co');
      await user.type(screen.getByLabelText('Password'), 'password1');
      await user.click(screen.getByRole('button', { name: /^sign in$/i }));
      expect(await screen.findByText('home page')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/');
    },
  );

  it('keeps an encoded double slash as a plain in-app path, never as another host', async () => {
    const { router, user } = renderPage(createFakeAuthService(), {
      from: { pathname: '/%2F%2Fevil.com' },
    });
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    await screen.findByText(/page/);
    expect(router.state.location.pathname.startsWith('//')).toBe(false);
  });

  it('keeps a legitimate nested in-app path', async () => {
    const { router, user } = renderPage(createFakeAuthService(), {
      from: { pathname: '/gyms/42/edit' },
    });
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    await screen.findByText(/page/);
    expect(router.state.location.pathname).toBe('/gyms/42/edit');
  });
});

describe('SignInPage: keyboard and focus', () => {
  it('submits with the Enter key from the password field', async () => {
    const { fake, user } = renderPage();
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1{Enter}');
    expect(fake.service.signIn).toHaveBeenCalledWith('a@b.co', 'password1');
  });

  it('submits with the Enter key from the email field', async () => {
    const { fake, user } = renderPage();
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.type(await screen.findByLabelText('Email'), 'a@b.co{Enter}');
    expect(fake.service.signIn).toHaveBeenCalledTimes(1);
  });

  it('does not send anything when Enter is pressed on an empty form, and shows the errors', async () => {
    const { fake, user } = renderPage();
    await user.type(await screen.findByLabelText('Email'), '{Enter}');
    expect(fake.service.signIn).not.toHaveBeenCalled();
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
  });

  it('marks invalid fields for assistive tech and links them to their message', async () => {
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: /^sign in$/i }));
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription(/valid email/i);
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/enter your password/i);
  });

  it('clears the invalid markers once the form is valid and submitted', async () => {
    const fake = createFakeAuthService();
    fake.service.signIn.mockResolvedValueOnce({ status: 'error', reason: 'unknown' });
    const { user } = renderPage(fake);
    await user.click(await screen.findByRole('button', { name: /^sign in$/i }));
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument();
  });

  it('moves focus to the first invalid field after a failed submit', async () => {
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: /^sign in$/i }));
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('puts focus somewhere useful, not on the disabled controls, after a service error', async () => {
    const fake = createFakeAuthService();
    fake.service.signIn.mockResolvedValueOnce({ status: 'error', reason: 'invalid_credentials' });
    const { user } = renderPage(fake);
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1{Enter}');
    await screen.findByRole('alert');
    expect(document.body).not.toHaveFocus();
  });
});

describe('SignInPage: while a request is pending', () => {
  it('disables the mode switch and both fields', async () => {
    const fake = createFakeAuthService();
    const d = deferred();
    fake.service.signIn.mockReturnValueOnce(d.promise);
    const { user } = renderPage(fake);
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1{Enter}');
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
    expect(screen.getByRole('button', { name: /create an account/i })).toBeDisabled();
    d.resolve({ status: 'error', reason: 'unknown' });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('ignores a second Enter submit while pending', async () => {
    const fake = createFakeAuthService();
    const d = deferred();
    fake.service.signIn.mockReturnValueOnce(d.promise);
    const { user } = renderPage(fake);
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1{Enter}{Enter}');
    expect(fake.service.signIn).toHaveBeenCalledTimes(1);
    d.resolve({ status: 'error', reason: 'unknown' });
    await screen.findByRole('alert');
  });

  it('does not crash or warn when the page unmounts while the request is pending', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = createFakeAuthService();
    const d = deferred();
    fake.service.signIn.mockReturnValueOnce(d.promise);
    const { user, view } = renderPage(fake);
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1{Enter}');
    view.unmount();
    d.resolve({ status: 'error', reason: 'network' });
    await Promise.resolve();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('re-enables the form and shows an error when the service REJECTS instead of returning an error', async () => {
    const fake = createFakeAuthService();
    fake.service.signIn.mockRejectedValueOnce(new Error('adapter bug'));
    const { user } = renderPage(fake);
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1{Enter}');
    await vi.waitFor(() => expect(screen.getByLabelText('Email')).toBeEnabled());
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled();
    expect(await screen.findByRole('alert')).toHaveTextContent(messageFor('unknown'));
  });

  it('does the same for sign-up', async () => {
    const fake = createFakeAuthService();
    fake.service.signUp.mockRejectedValueOnce(new Error('adapter bug'));
    const { user } = renderPage(fake);
    await user.click(await screen.findByRole('button', { name: /create an account/i }));
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1{Enter}');
    await vi.waitFor(() => expect(screen.getByLabelText('Email')).toBeEnabled());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('SignInPage: mode switching and stale messages', () => {
  it('drops the "check your email" notice and field errors when switching modes', async () => {
    const fake = createFakeAuthService();
    fake.service.signUp.mockResolvedValueOnce({ status: 'confirm_email' });
    const { user } = renderPage(fake);
    await user.click(await screen.findByRole('button', { name: /create an account/i }));
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1{Enter}');
    await screen.findByText(/check your email/i);
    await user.click(screen.getByRole('button', { name: /already have an account/i }));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('clears the confirm notice on the next submit', async () => {
    const fake = createFakeAuthService();
    fake.service.signUp
      .mockResolvedValueOnce({ status: 'confirm_email' })
      .mockResolvedValueOnce({ status: 'error', reason: 'email_taken' });
    const { user } = renderPage(fake);
    await user.click(await screen.findByRole('button', { name: /create an account/i }));
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1{Enter}');
    await screen.findByText(/check your email/i);
    await user.type(screen.getByLabelText('Password'), '{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(messageFor('email_taken'));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('keeps what the user typed when switching modes', async () => {
    const { user } = renderPage();
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'secret-1');
    await user.click(screen.getByRole('button', { name: /create an account/i }));
    expect(screen.getByLabelText('Email')).toHaveValue('a@b.co');
    expect(screen.getByLabelText('Password')).toHaveValue('secret-1');
  });

  it('clears the previous service error as soon as a new submit starts', async () => {
    const fake = createFakeAuthService();
    const d = deferred();
    fake.service.signIn
      .mockResolvedValueOnce({ status: 'error', reason: 'invalid_credentials' })
      .mockReturnValueOnce(d.promise);
    const { user } = renderPage(fake);
    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password1{Enter}');
    await screen.findByRole('alert');
    await user.type(screen.getByLabelText('Password'), '{Enter}');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    d.resolve({ status: 'error', reason: 'unknown' });
    await screen.findByRole('alert');
  });

  it('does not keep the password in the DOM as text, in either mode', async () => {
    const { user, view } = renderPage();
    await user.type(await screen.findByLabelText('Password'), 'hunter2-secret');
    await user.click(screen.getByRole('button', { name: /create an account/i }));
    expect(view.container.textContent).not.toContain('hunter2-secret');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });
});

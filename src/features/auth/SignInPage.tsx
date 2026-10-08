import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';
import { messageFor } from './authErrors';
import {
  PASSWORD_MIN,
  validateCredentials,
  type AuthMode,
  type CredentialErrors,
} from './authSchema';
import type { AuthFailure, AuthResult } from './types';

// A path inside this app: one slash, then plain path characters. No second slash or backslash, which
// browsers read as another host, and no control characters or spaces.
const SAFE_PATH = /^\/(?![/\\])[\w\-./~%]*$/;

/** Where to go after signing in: the page the user was sent away from, if it is a safe in-app path. */
function destination(state: unknown): string {
  const from = typeof state === 'object' && state !== null && 'from' in state ? state.from : null;
  const path =
    typeof from === 'object' && from !== null && 'pathname' in from ? from.pathname : null;
  return typeof path === 'string' && SAFE_PATH.test(path) && !path.startsWith('/sign-in')
    ? path
    : '/';
}

const inputClass =
  'min-h-12 w-full rounded-lg border border-ink-muted/40 bg-surface-raised px-3 text-ink disabled:opacity-60';

export function SignInPage() {
  const { state, service } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CredentialErrors>({});
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  if (state.status === 'signedIn') return <Navigate to={destination(location.state)} replace />;

  const signingUp = mode === 'signUp';

  function switchMode() {
    setMode(signingUp ? 'signIn' : 'signUp');
    setFieldErrors({});
    setFailure(null);
    setCheckEmail(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setFailure(null);
    setCheckEmail(false);

    const checked = validateCredentials(mode, email, password);
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      (checked.errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setFieldErrors({});
    setPending(true);
    let outcome: AuthResult;
    try {
      outcome = signingUp
        ? await service.signUp(checked.email, checked.password)
        : await service.signIn(checked.email, checked.password);
    } catch {
      outcome = { status: 'error', reason: 'unknown' }; // a service that rejects must not leave the form stuck
    }
    setPending(false);

    if (outcome.status === 'error') setFailure(outcome.reason);
    if (outcome.status === 'confirm_email') setCheckEmail(true);
    // 'signed_in' needs nothing here: the auth state changes and this page redirects.
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-4">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Next Rep</h1>
        <h2 className="mt-1 text-lg text-ink-muted">{signingUp ? 'Create account' : 'Sign in'}</h2>
      </div>

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            ref={emailRef}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            className={inputClass}
          />
          {fieldErrors.email && (
            <p id="email-error" className="text-sm text-red-400">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            ref={passwordRef}
            type="password"
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={
              fieldErrors.password ? 'password-error' : signingUp ? 'password-hint' : undefined
            }
            className={inputClass}
          />
          {signingUp && !fieldErrors.password && (
            <p id="password-hint" className="text-sm text-ink-muted">
              Use at least {PASSWORD_MIN} characters.
            </p>
          )}
          {fieldErrors.password && (
            <p id="password-error" className="text-sm text-red-400">
              {fieldErrors.password}
            </p>
          )}
        </div>

        {failure && (
          <p role="alert" className="rounded-lg bg-red-950 p-3 text-red-200">
            {messageFor(failure)}
          </p>
        )}
        {/* Always rendered: screen readers announce text added to a live region more reliably than a new one. */}
        <p role="status" className={checkEmail ? 'rounded-lg bg-surface-raised p-3' : undefined}>
          {checkEmail ? 'Check your email to confirm your account, then sign in.' : ''}
        </p>

        <button
          type="submit"
          disabled={pending}
          className="min-h-12 rounded-lg bg-accent px-4 font-semibold text-surface disabled:opacity-60"
        >
          {pending
            ? signingUp
              ? 'Creating account…'
              : 'Signing in…'
            : signingUp
              ? 'Create account'
              : 'Sign in'}
        </button>
      </form>

      <button
        type="button"
        onClick={switchMode}
        disabled={pending}
        className="min-h-12 text-ink-muted underline"
      >
        {signingUp ? 'I already have an account' : 'Create an account'}
      </button>
    </main>
  );
}

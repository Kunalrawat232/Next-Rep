import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Button, Logo, TextField } from '../../components';
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
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      <header className="flex flex-col items-center gap-4 px-4 pt-14 text-center lg:items-start lg:justify-center lg:border-r lg:border-line lg:bg-surface-200 lg:px-16 lg:pt-0 lg:text-left">
        <h1>
          <Logo width={230} />
        </h1>
        <p className="max-w-md text-body text-ink-muted">
          Say the set. See the progress. Voice-first workout logging.
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col justify-center gap-6 px-4 py-8 lg:max-w-sm lg:py-16">
        <h2 className="text-title font-semibold">{signingUp ? 'Create account' : 'Sign in'}</h2>

        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <TextField
            label="Email"
            ref={emailRef}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            error={fieldErrors.email}
          />
          <TextField
            label="Password"
            ref={passwordRef}
            type="password"
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
            hint={signingUp ? `Use at least ${PASSWORD_MIN} characters.` : undefined}
            error={fieldErrors.password}
          />

          {failure && (
            <p role="alert" className="rounded-md border border-danger bg-surface-200 p-4">
              {messageFor(failure)}
            </p>
          )}
          {/* Always rendered: screen readers announce text added to a live region more reliably than a new one. */}
          <p
            role="status"
            className={checkEmail ? 'rounded-md border border-line bg-surface-200 p-4' : undefined}
          >
            {checkEmail ? 'Check your email to confirm your account, then sign in.' : ''}
          </p>

          <Button type="submit" disabled={pending}>
            {pending
              ? signingUp
                ? 'Creating account…'
                : 'Signing in…'
              : signingUp
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>

        <Button variant="secondary" onClick={switchMode} disabled={pending}>
          {signingUp ? 'I already have an account' : 'Create an account'}
        </Button>
      </main>
    </div>
  );
}

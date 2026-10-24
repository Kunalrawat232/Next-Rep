import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Button, cardClasses, ErrorMessage, Logo, TextField } from '../../components';
import { useAuth } from './AuthProvider';
import { messageFor } from './authErrors';
import { readConfirmLink } from './confirmLink';
import {
  PASSWORD_MIN,
  validateCredentials,
  type AuthMode,
  type CredentialErrors,
} from './authSchema';
import type { AuthFailure, AuthResult } from './types';
import { usePending } from '../../lib/usePending';

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
  const navigate = useNavigate();
  // A confirmation-email link, read once on arrival: the URL is cleaned right after.
  const [link] = useState(() => readConfirmLink(location.search, location.hash));
  // 'ready': waiting for a tap. The code is never spent on page load, so a link someone else sent
  // cannot switch the visitor into their account without the visitor choosing to.
  const [verify, setVerify] = useState<'ready' | 'checking' | 'verified' | null>(
    link.tokenHash ? 'ready' : null,
  );
  // A link that failed keeps the page here, even for a signed-in user, so the message is seen.
  const [linkFailed, setLinkFailed] = useState(link.failed);
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CredentialErrors>({});
  const [failure, setFailure] = useState<AuthFailure | null>(link.failed ? 'link_invalid' : null);
  const [checkEmail, setCheckEmail] = useState(false);
  const { pending, begin, end } = usePending();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Take the link's code and Supabase's keys out of the address bar and the history entry.
  useEffect(() => {
    const { clean } = readConfirmLink(location.search, location.hash);
    if (clean)
      void navigate(
        { pathname: location.pathname, ...clean },
        { replace: true, state: location.state as unknown },
      );
  }, [location, navigate]);

  // While a link waits, is checked or has just signed the user in, or has failed, stay to say so.
  if (state.status === 'signedIn' && verify === null && !linkFailed)
    return <Navigate to={destination(location.state)} replace />;

  const signedInAs = state.status === 'signedIn' ? state.user.email : null;

  async function confirmEmail() {
    const code = link.tokenHash;
    if (!code || !begin()) return;
    setVerify('checking');
    let outcome: AuthResult;
    try {
      outcome = await service.verifyEmail(code);
    } catch {
      outcome = { status: 'error', reason: 'unknown' };
    }
    end();
    if (outcome.status === 'signed_in') {
      setVerify('verified');
      return;
    }
    // The code is one-time: whatever went wrong, it is not offered again.
    setVerify(null);
    setLinkFailed(true);
    setFailure(outcome.status === 'error' ? outcome.reason : 'unknown');
  }

  const signingUp = mode === 'signUp';

  function switchMode() {
    setMode(signingUp ? 'signIn' : 'signUp');
    setFieldErrors({});
    setFailure(null);
    setCheckEmail(false);
    setLinkFailed(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setFailure(null);
    setCheckEmail(false);
    setLinkFailed(false);

    const checked = validateCredentials(mode, email, password);
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      (checked.errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setFieldErrors({});
    if (!begin()) return;
    let outcome: AuthResult;
    try {
      outcome = signingUp
        ? await service.signUp(checked.email, checked.password)
        : await service.signIn(checked.email, checked.password);
    } catch {
      outcome = { status: 'error', reason: 'unknown' }; // a service that rejects must not leave the form stuck
    }
    end();

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
        {verify === 'verified' ? (
          <>
            <h2 className="text-title font-semibold">Email verified</h2>
            <p role="status" className={cardClasses('', 'success')}>
              {signedInAs
                ? `Your email is verified. You're signed in as ${signedInAs}.`
                : "Your email is verified. You're signed in."}
            </p>
            <Button onClick={() => void navigate('/', { replace: true })}>Start logging</Button>
          </>
        ) : verify === 'ready' || verify === 'checking' ? (
          <>
            <h2 className="text-title font-semibold">Confirm your email</h2>
            <p className="text-body text-ink-muted">
              {signedInAs
                ? `You're signed in as ${signedInAs}. Confirming signs you in to the account this link was sent to instead.`
                : 'Tap the button to finish creating your account.'}
            </p>
            <p role="status">{verify === 'checking' ? 'Checking your link…' : ''}</p>
            <Button onClick={() => void confirmEmail()} disabled={pending}>
              {verify === 'checking' ? 'Confirming…' : 'Confirm email'}
            </Button>
          </>
        ) : (
          <>
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

              {failure && <ErrorMessage>{messageFor(failure)}</ErrorMessage>}
              {/* Always rendered: screen readers announce text added to a live region more reliably than a new one. */}
              <p role="status" className={checkEmail ? cardClasses('') : undefined}>
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
          </>
        )}
      </main>
    </div>
  );
}

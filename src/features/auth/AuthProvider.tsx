import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthService, AuthUser } from './types';

export type AuthState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: AuthUser };

type AuthContextValue = { state: AuthState; service: AuthService };

const AuthContext = createContext<AuthContextValue | null>(null);
const toState = (user: AuthUser | null): AuthState =>
  user ? { status: 'signedIn', user } : { status: 'signedOut' };

type Props = {
  service: AuthService;
  /** Called once per signed-in user. A failure never blocks the app. */
  ensureProfile?: (userId: string) => Promise<void>;
  children: ReactNode;
};

export function AuthProvider({ service, ensureProfile, children }: Props) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    let heardEvent = false;
    // Kept synchronous: Supabase advises against awaiting other calls inside this listener.
    const stop = service.onChange((user) => {
      heardEvent = true;
      if (live) setState(toState(user));
    });
    // Reads the locally stored session, so it works offline. A newer event always wins over it.
    service
      .getUser()
      .catch(() => null)
      .then((user) => {
        if (live && !heardEvent) setState(toState(user));
      });
    return () => {
      live = false;
      stop();
    };
  }, [service]);

  // The latest function is kept in a ref, so a parent passing a new function each render
  // does not re-run profile creation. It runs once per signed-in user.
  const ensureProfileRef = useRef(ensureProfile);
  useEffect(() => {
    ensureProfileRef.current = ensureProfile;
  });
  const userId = state.status === 'signedIn' ? state.user.id : null;
  useEffect(() => {
    const run = ensureProfileRef.current;
    if (userId === null || !run) return;
    // Called at once, but a synchronous throw or a non-promise return are handled like a rejection,
    // so a profile problem can never take the app down.
    const warn = (error: unknown) =>
      console.warn(
        'Could not create the profile row; it is retried on the next app load.',
        error instanceof Error ? error.message : '',
      );
    try {
      Promise.resolve(run(userId)).catch(warn);
    } catch (error) {
      warn(error);
    }
  }, [userId]);

  const value = useMemo(() => ({ state, service }), [state, service]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}

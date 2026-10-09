import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  createLogStore,
  openLocalDb,
  type DexieDeps,
  type LocalDb,
  type LogStore,
} from '../../data/local';
import {
  createSyncScheduler,
  createSyncWorker,
  type SchedulerEnv,
  requestPersistentStorage,
  type RemoteLog,
  type SyncScheduler,
  type SyncStatus,
} from '../../data/sync';
import { useAuth } from '../auth';

type Controls = Pick<SyncScheduler, 'notify' | 'refresh' | 'retryFailed'> & {
  /** Asks the browser to keep this data, once. Call it when the first set is logged. */
  ensurePersistence(): void;
};

type Session = { store: LogStore; scheduler: SyncScheduler; controls: Controls };

const browserEnv = (): SchedulerEnv => ({
  addEventListener: (type, fn) =>
    (type === 'online' ? window : document).addEventListener(type, fn),
  removeEventListener: (type, fn) =>
    (type === 'online' ? window : document).removeEventListener(type, fn),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id),
  isVisible: () => document.visibilityState === 'visible',
});

const SyncContext = createContext<Session | null>(null);

type Props = {
  remote: RemoteLog;
  children: ReactNode;
  /** For tests, where IndexedDB is a fake. */
  dexieDeps?: DexieDeps;
};

/**
 * Gives the screens a local log store and a sync scheduler for the signed-in user, and keeps
 * unsynced sets flowing to the server. Signed out, there is none, and nothing is synced.
 */
export function SyncProvider({ remote, children, dexieDeps }: Props) {
  const { state } = useAuth();
  if (state.status !== 'signedIn') return <>{children}</>;
  // `key` gives every user a fresh session, so one user's sets never reach another's account.
  return (
    <SyncSession key={state.user.id} userId={state.user.id} remote={remote} dexieDeps={dexieDeps}>
      {children}
    </SyncSession>
  );
}

function SyncSession({ userId, remote, children, dexieDeps }: Props & { userId: string }) {
  const [session] = useState(() => {
    const db: LocalDb = openLocalDb(userId, dexieDeps);
    const store = createLogStore(db);
    const worker = createSyncWorker({ store, remote, userId });
    const scheduler = createSyncScheduler({ worker, store, env: browserEnv() });
    let persistAsked = false;
    const controls: Controls = {
      notify: scheduler.notify,
      refresh: scheduler.refresh,
      retryFailed: scheduler.retryFailed,
      // Asked for once, after the first set is logged: a prompt on every start would be noise.
      ensurePersistence: () => {
        if (persistAsked) return;
        persistAsked = true;
        void requestPersistentStorage().catch(() => undefined);
      },
    };
    return { db, store, worker, scheduler, controls };
  });

  const on = useRef(false);

  useEffect(() => {
    // StrictMode runs this cleanup and then the effect again on the same session. The database is
    // therefore closed in a later step, and only if nothing has switched the session back on, so a
    // real sign-out closes it and StrictMode's simulated one does not.
    on.current = true;
    session.worker.resume();
    void session.db
      .open()
      .then(() => {
        if (!on.current) return;
        session.scheduler.start();
        void session.scheduler.refresh();
      })
      .catch(() => undefined);
    return () => {
      on.current = false;
      session.scheduler.stop();
      // A push already on its way must not carry on under whoever signs in next.
      session.worker.pause();
      setTimeout(() => {
        if (!on.current) session.db.close();
      }, 0);
    };
  }, [session, on]);

  return <SyncContext.Provider value={session}>{children}</SyncContext.Provider>;
}

function useSession(): Session {
  const session = useContext(SyncContext);
  if (!session)
    throw new Error('Sync is only available to a signed-in user, inside <SyncProvider>');
  return session;
}

/** The on-device log of workouts and sets. */
export function useLogStore(): LogStore {
  return useSession().store;
}

/** Tells the scheduler a row was written locally, and how to retry failed ones. */
export function useSyncControls(): Controls {
  return useSession().controls;
}

/** Waiting and failed row counts, whether a sync is running, and whether the server is unreachable. */
export function useSyncStatus(): SyncStatus {
  const { scheduler } = useSession();
  return useSyncExternalStore(scheduler.subscribe, scheduler.status, scheduler.status);
}

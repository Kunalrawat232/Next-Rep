import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Unit } from '../../domain/schemas';
import { useAuth } from '../auth';
import { useProfileService } from './ProfileServiceContext';
import type { ProfileService } from './types';
import { DEFAULT_UNIT, isUnitPending, readUnit, setUnitPending, writeUnit } from './unitPreference';

type UnitValue = { unit: Unit; setUnit: (unit: Unit) => void };

const UnitContext = createContext<UnitValue | null>(null);

/**
 * The weight unit the signed-in user chose. It is kept on the device, so it applies at once and
 * offline, and saved to the profile. A choice that could not be saved yet is sent when the
 * connection returns; otherwise the profile's value is taken, so a new device starts with it.
 */
export function UnitProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const service = useProfileService();
  if (state.status !== 'signedIn')
    return <UnitContext.Provider value={SIGNED_OUT}>{children}</UnitContext.Provider>;
  // `key` gives every user a fresh session, so one user's choice never shows for another.
  return (
    <UnitSession key={state.user.id} userId={state.user.id} service={service}>
      {children}
    </UnitSession>
  );
}

/** A request that never answers must not hold up every later one. */
export const REQUEST_TIMEOUT_MS = 15_000;

function withTimeout<T>(request: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), REQUEST_TIMEOUT_MS);
    request.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('request failed'));
      },
    );
  });
}

const SIGNED_OUT: UnitValue = { unit: DEFAULT_UNIT, setUnit: () => undefined };

const browserStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const NO_STORAGE: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function UnitSession({
  userId,
  service,
  children,
}: {
  userId: string;
  service: ProfileService;
  children: ReactNode;
}) {
  const [storage] = useState(() => browserStorage() ?? NO_STORAGE);
  const [unit, setUnitState] = useState<Unit>(() => readUnit(storage, userId));
  const current = useRef(unit);
  /** Counts the user's choices, so an answer to an older request is recognised and dropped. */
  const version = useRef(0);
  /** Whether the latest choice has not reached the server. Also in memory, so blocked storage cannot lose it. */
  const dirty = useRef(isUnitPending(storage, userId));
  const working = useRef<Promise<void>>(Promise.resolve());
  const scheduled = useRef(false);

  const markSent = useCallback(() => {
    dirty.current = false;
    setUnitPending(storage, userId, false);
  }, [storage, userId]);

  /** One at a time, so a slow answer cannot overwrite a newer choice. */
  const reconcile = useCallback(() => {
    // A pass that has not started yet will see everything that changed, so a second one is not queued.
    if (scheduled.current) return;
    scheduled.current = true;
    working.current = working.current.then(async () => {
      scheduled.current = false;
      try {
        if (dirty.current) {
          const sent = version.current;
          const saved = await withTimeout(service.setUnit(userId, current.current));
          // A newer choice was made meanwhile: it queued its own pass, and this answer is about the old one.
          if (version.current !== sent) return;
          // A refusal will not change by asking again, so it is not kept waiting.
          if (saved.status === 'ok' || saved.reason === 'rejected') markSent();
          return;
        }
        const asked = version.current;
        const saved = await withTimeout(service.getUnit(userId));
        const stale = version.current !== asked || dirty.current;
        if (
          saved.status === 'ok' &&
          saved.value !== null &&
          !stale &&
          saved.value !== current.current
        ) {
          current.current = saved.value;
          writeUnit(storage, userId, saved.value);
          setUnitState(saved.value);
        }
      } catch {
        // offline, the server is down or it did not answer in time: the device's choice stands, and it is tried again later
      }
    });
  }, [markSent, service, storage, userId]);

  useEffect(() => {
    reconcile();
    window.addEventListener('online', reconcile);
    return () => window.removeEventListener('online', reconcile);
  }, [reconcile]);

  const setUnit = useCallback(
    (next: Unit) => {
      version.current += 1;
      dirty.current = true;
      current.current = next;
      writeUnit(storage, userId, next);
      setUnitPending(storage, userId, true);
      setUnitState(next);
      reconcile();
    },
    [reconcile, storage, userId],
  );

  const value = useMemo(() => ({ unit, setUnit }), [unit, setUnit]);
  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
}

export function useUnit(): UnitValue {
  const value = useContext(UnitContext);
  if (!value) throw new Error('useUnit must be used inside <UnitProvider>');
  return value;
}

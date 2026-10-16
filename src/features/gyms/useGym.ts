import { useCallback, useEffect, useState } from 'react';
import type { Gym } from '../../domain/gyms';
import type { GymFailure, GymService } from './types';

export type GymState =
  | { status: 'loading' }
  | { status: 'error'; reason: GymFailure }
  /** `gym` is null before the user has set one up. */
  | { status: 'ready'; gym: Gym | null };

/** Loads the user's gym once, and again when `reload` is called. */
export function useGym(service: GymService): { state: GymState; reload: () => void } {
  const [state, setState] = useState<GymState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    service
      .get()
      .then((result) => {
        if (!current) return;
        setState(
          result.status === 'ok'
            ? { status: 'ready', gym: result.value }
            : { status: 'error', reason: result.reason },
        );
      })
      .catch(() => {
        if (current) setState({ status: 'error', reason: 'unknown' });
      });
    return () => {
      current = false;
    };
  }, [service, attempt]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, reload };
}

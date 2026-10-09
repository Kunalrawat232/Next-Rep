import { useCallback, useEffect, useState } from 'react';
import type { Gym } from '../../domain/gyms';
import type { GymFailure, GymService } from './types';

export type GymsState =
  | { status: 'loading' }
  | { status: 'error'; reason: GymFailure }
  | { status: 'ready'; gyms: Gym[] };

/** Loads the user's gyms once, and again when `reload` is called. */
export function useGyms(service: GymService): { state: GymsState; reload: () => void } {
  const [state, setState] = useState<GymsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    service
      .list()
      .then((result) => {
        if (!current) return;
        setState(
          result.status === 'ok'
            ? { status: 'ready', gyms: result.value }
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

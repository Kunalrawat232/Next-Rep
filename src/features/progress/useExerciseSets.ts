import { useCallback, useEffect, useState } from 'react';
import { ignoreClosed, type StoredSet } from '../../data/local';
import { useLogStore, useSyncStatus } from '../sync';

export type SetsState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; sets: StoredSet[] };

/** The sets on this device: every exercise (`exerciseId` undefined), one, or none (null, nothing is read). Reads again as syncing moves. */
export function useExerciseSets(exerciseId?: string | null): {
  state: SetsState;
  retry: () => void;
} {
  const store = useLogStore();
  const { pending, failed, syncing } = useSyncStatus();
  const [attempt, setAttempt] = useState(0);
  // Tagged with what it is for, so another exercise in the address never shows the previous one's sets.
  const [loaded, setLoaded] = useState<{ for: string | null | undefined; state: SetsState } | null>(
    null,
  );

  useEffect(() => {
    if (exerciseId === null) return;
    let current = true;
    (exerciseId ? store.setsForExercises([exerciseId]) : store.allSets())
      .then((sets) => {
        if (current) setLoaded({ for: exerciseId, state: { status: 'ready', sets } });
      })
      .catch((error: unknown) => {
        try {
          ignoreClosed(error);
        } catch {
          if (current) setLoaded({ for: exerciseId, state: { status: 'error' } });
        }
      });
    return () => {
      current = false;
    };
  }, [store, exerciseId, attempt, pending, failed, syncing]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: SetsState =
    loaded && loaded.for === exerciseId ? loaded.state : { status: 'loading' };
  return { state, retry };
}

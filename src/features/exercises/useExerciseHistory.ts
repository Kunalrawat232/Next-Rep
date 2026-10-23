import { useEffect, useMemo, useState } from 'react';
import { ignoreClosed } from '../../data/local';
import type { Exercise } from '../../domain/exercises';
import { exercisesByRecency } from '../../domain/history';
import { useLogStore, useSyncStatus } from '../sync';

export type HistoryEntry = { exercise: Exercise; last: string };

/**
 * The exercises the person has logged a set for, most recently done first, found in `exercises`. Null until the
 * sets on this device have been read, so a screen can wait for it and fill in once. Reads again as syncing moves.
 */
export function useExerciseHistory(exercises: Exercise[]): HistoryEntry[] | null {
  const store = useLogStore();
  const { pending, failed, syncing, pulledVersion } = useSyncStatus();
  const [recent, setRecent] = useState<{ exerciseId: string; last: string }[] | null>(null);

  useEffect(() => {
    let current = true;
    store
      .allSets()
      .then((sets) => current && setRecent(exercisesByRecency(sets)))
      .catch((error: unknown) => {
        try {
          ignoreClosed(error);
        } catch {
          // History is a convenience: when the sets cannot be read it is simply not shown.
          if (current) setRecent([]);
        }
      });
    return () => {
      current = false;
    };
  }, [store, pending, failed, syncing, pulledVersion]);

  return useMemo(
    () =>
      recent &&
      recent.flatMap(({ exerciseId, last }) => {
        const exercise = exercises.find((e) => e.id === exerciseId);
        return exercise ? [{ exercise, last }] : [];
      }),
    [recent, exercises],
  );
}

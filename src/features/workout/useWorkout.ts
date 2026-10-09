import { useCallback, useEffect, useState } from 'react';
import { ignoreClosed, type StoredSet, type StoredWorkout } from '../../data/local';
import { useLogStore, useSyncStatus } from '../sync';

export type WorkoutState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'open'; workout: StoredWorkout; sets: StoredSet[] };

/** The open workout on this device, with its sets. `reload` reads it again after a change. */
export function useWorkout(): { state: WorkoutState; reload: () => Promise<void> } {
  const store = useLogStore();
  const [state, setState] = useState<WorkoutState>({ status: 'loading' });
  const { pending, failed, syncing, pulledVersion } = useSyncStatus();

  const load = useCallback(async (): Promise<WorkoutState> => {
    const workout = await store.activeWorkout();
    if (!workout) return { status: 'none' };
    return { status: 'open', workout, sets: await store.listSets(workout.id) };
  }, [store]);

  useEffect(() => {
    let current = true;
    load()
      .then((next) => {
        if (current) setState(next);
      })
      .catch(ignoreClosed);
    return () => {
      current = false;
    };
  }, [load, pending, failed, syncing, pulledVersion]); // read again as sets reach the server, so statuses on screen stay true

  const reload = useCallback(async () => setState(await load()), [load]);
  return { state, reload };
}

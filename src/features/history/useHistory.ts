import { useCallback, useEffect, useState } from 'react';
import { ignoreClosed, type StoredSet, type StoredWorkout } from '../../data/local';
import { useLogStore, useSyncStatus } from '../sync';

const PAGE_SIZE = 20;

export type HistoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; workouts: StoredWorkout[]; sets: StoredSet[]; hasMore: boolean };

/**
 * Finished workouts on this device, newest first, with their sets. It reads again as sets reach
 * the server so the sync notes stay true. A workout with no sets is left out, and does not use up
 * a place on the page.
 */
export function useHistory(): { state: HistoryState; showMore: () => void; retry: () => void } {
  const store = useLogStore();
  const { pending, failed, syncing, pulledVersion } = useSyncStatus();
  const [shown, setShown] = useState(PAGE_SIZE);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<HistoryState>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    (async () => {
      // Read more workouts until there is a full page of ones with sets (plus one, to know if more
      // follow), or there are no more.
      let limit = shown + 1;
      for (;;) {
        const rows = await store.endedWorkouts(limit);
        const sets = await store.listSetsFor(rows.map((w) => w.id));
        const withSets = new Set(sets.map((s) => s.workoutId));
        const visible = rows.filter((w) => withSets.has(w.id));
        if (visible.length <= shown && rows.length === limit) {
          limit *= 2;
          continue;
        }
        const page = visible.slice(0, shown);
        const onPage = new Set(page.map((w) => w.id));
        if (current)
          setState({
            status: 'ready',
            workouts: page,
            sets: sets.filter((s) => onPage.has(s.workoutId)),
            hasMore: visible.length > shown,
          });
        return;
      }
    })().catch((error: unknown) => {
      try {
        ignoreClosed(error);
      } catch {
        if (current) setState({ status: 'error' });
      }
    });
    return () => {
      current = false;
    };
  }, [store, shown, attempt, pending, failed, syncing, pulledVersion]);

  const showMore = useCallback(() => setShown((n) => n + PAGE_SIZE), []);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);
  return { state, showMore, retry };
}

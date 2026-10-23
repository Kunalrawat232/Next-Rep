import { useEffect, useState } from 'react';
import { ignoreClosed, type StoredSet, type StoredWorkout } from '../../data/local';
import type { Session } from '../../domain/progression';
import { groupByExercise } from '../../domain/history';
import { useLogStore, useSyncStatus } from '../sync';

/** Rows on the device are not trusted: a set without a real weight and rep count is left out. */
const isReadable = (s: StoredSet) =>
  Number.isFinite(s.totalKg) && s.totalKg >= 0 && Number.isInteger(s.reps) && s.reps > 0;

export type LastWorkout = { workout: StoredWorkout; sets: StoredSet[] };

export type HomeData =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      /** The most recent finished workout that has sets, or null before the first one. */
      last: LastWorkout | null;
      /** The exercise suggested: the first one done in that workout. */
      exerciseId: string | null;
      /** That exercise's finished sessions, oldest first. */
      sessions: Session[];
    };

/**
 * What Home shows, read from the log on the device: the last finished workout and the history of
 * its first exercise, for the suggestion. A workout still open does not count: it is not finished.
 * Reads again as sets reach the server and as history is pulled.
 */
export function useHomeData(): HomeData {
  const store = useLogStore();
  const { pending, failed, syncing, pulledVersion } = useSyncStatus();
  const [data, setData] = useState<HomeData>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    (async () => {
      // Finished workouts with no sets are skipped, so look further back until one has sets.
      let sets: StoredSet[] = [];
      let workout: StoredWorkout | undefined;
      for (const limit of [10, 50, 500]) {
        const recent = await store.endedWorkouts(limit);
        sets = (await store.listSetsFor(recent.map((w) => w.id))).filter(isReadable);
        workout = recent.find((w) => sets.some((s) => s.workoutId === w.id));
        if (workout || recent.length < limit) break;
      }
      if (!workout) {
        if (current) setData({ status: 'ready', last: null, exerciseId: null, sessions: [] });
        return;
      }
      const lastSets = sets.filter((s) => s.workoutId === workout.id);
      const exerciseId = groupByExercise(lastSets)[0]!.exerciseId;
      const all = (await store.setsForExercises([exerciseId])).filter(isReadable);
      const byWorkout = new Map<string, StoredSet[]>();
      for (const s of all) byWorkout.set(s.workoutId, [...(byWorkout.get(s.workoutId) ?? []), s]);
      const finished = await Promise.all(
        [...byWorkout.keys()].map(async (id) => ({ id, workout: await store.getWorkout(id) })),
      );
      const sessions = finished
        .filter((f) => f.workout?.endedAt != null)
        .map((f) => ({ startedAt: f.workout!.startedAt, sets: byWorkout.get(f.id)! }))
        .sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))
        .map(({ sets: sessionSets }) => ({ sets: sessionSets }));
      if (current)
        setData({ status: 'ready', last: { workout, sets: lastSets }, exerciseId, sessions });
    })().catch((error: unknown) => {
      try {
        ignoreClosed(error);
      } catch {
        if (current) setData({ status: 'error' });
      }
    });
    return () => {
      current = false;
    };
  }, [store, pending, failed, syncing, pulledVersion]);

  return data;
}

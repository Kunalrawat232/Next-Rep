import type { StoredSet, StoredWorkout } from '../../data/local';

export const countLabel = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

/** What to tell the user about a workout the server may not have in full yet, or null when it does. */
export function syncNote(workout: StoredWorkout, sets: StoredSet[]): string | null {
  const rows = [workout, ...sets];
  if (rows.some((row) => row.syncStatus === 'failed')) return 'Sync failed';
  return rows.every((row) => row.syncStatus === 'synced') ? null : 'Waiting to sync';
}

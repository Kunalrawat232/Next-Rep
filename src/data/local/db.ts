import Dexie, { type DexieOptions, type Table } from 'dexie';
import type { ChatMessage } from '../../domain/coach';
import type { GymCache, PendingDeletion, StoredSet, StoredWorkout } from './types';

/** Overrides for tests, where IndexedDB is a fake. */
export type DexieDeps = Pick<DexieOptions, 'indexedDB' | 'IDBKeyRange'>;

export class LocalDb extends Dexie {
  workouts!: Table<StoredWorkout, string>;
  sets!: Table<StoredSet, string>;
  deletions!: Table<PendingDeletion, string>;
  gymCache!: Table<GymCache, string>;
  coachMessages!: Table<ChatMessage, string>;

  constructor(name: string, deps: DexieDeps = {}) {
    super(name, deps);
    this.version(1).stores({
      workouts: 'id, syncStatus, startedAt',
      sets: 'id, workoutId, syncStatus, [exerciseId+loggedAt]',
      deletions: 'id',
    });
    // Version 2 adds the gym cache. Version 1 stays as it was, so data already on a device is kept.
    this.version(2).stores({ gymCache: 'id' });
    // Version 3 adds the chat with the AI coach, which stays on this device only.
    this.version(3).stores({ coachMessages: 'id, at' });
  }
}

/**
 * One database per signed-in user, so a shared phone never shows or uploads someone else's sets.
 * Signing out keeps unsynced data: those sets still belong to that user and sync after the next sign-in.
 */
export function openLocalDb(userId: string, deps: DexieDeps = {}): LocalDb {
  return new LocalDb(`next-rep-${userId}`, deps);
}

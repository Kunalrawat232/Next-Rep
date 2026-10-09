import type { StoredSet, StoredWorkout } from '../local';
import type { Result } from '../../lib/result';

/** What the sync worker needs from the server. Implemented for Supabase in src/data/remote/log.ts. */
export interface RemoteLog {
  /** Idempotent: sending a row again changes nothing. */
  upsertWorkouts(userId: string, rows: StoredWorkout[]): Promise<Result>;
  /** Idempotent. The workouts they belong to must already be on the server. */
  upsertSets(userId: string, rows: StoredSet[]): Promise<Result>;
  /** Marks a set deleted on the server. */
  softDeleteSet(id: string, at: string): Promise<Result>;
}

export type SyncOutcome = {
  pushedWorkouts: number;
  pushedSets: number;
  /** Sets removed on this device that were then deleted on the server. */
  deletedSets: number;
  /** Rows the server or the row itself refused in this run. */
  refused: number;
  /** The run stopped early because the network is down. */
  offline: boolean;
};

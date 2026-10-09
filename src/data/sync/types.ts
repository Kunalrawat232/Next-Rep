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
  /**
   * One page of this user's finished, not deleted workouts, in id order. Rows are untrusted:
   * the caller checks every one before it is stored.
   */
  fetchWorkouts(userId: string, page: Page): Promise<Result<unknown[]>>;
  /** One page of this user's sets that are not deleted, in id order. Untrusted, like workouts. */
  fetchSets(userId: string, page: Page): Promise<Result<unknown[]>>;
}

/**
 * Pages are read by id (`after` is the last id already read, null for the first page), so a row
 * deleted while a pull is under way cannot shift the rows after it. The last page is an empty one.
 */
export type Page = { after: string | null; size: number };

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

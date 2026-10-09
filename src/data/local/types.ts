import type { Gym } from '../../domain/gyms';
import type { LoggedSet, Workout } from '../../domain/schemas';

/** Where a row is in its trip to the server. `failed` rows wait for a manual retry. */
export type SyncStatus = 'pending' | 'synced' | 'failed';

export type SyncMeta = {
  syncStatus: SyncStatus;
  /** Bumped by every local write, so a push that raced with an edit cannot mark the newer row as synced. */
  rev: number;
  /** Refusals caused by the row itself. Being offline or a server outage does not count. */
  attempts: number;
  /** Epoch ms before which the worker leaves the row alone. */
  nextAttemptAt: number;
  lastError: string | null;
  /** When a push of this row last started. Set means it may have reached the server, even if no answer came back. */
  lastAttemptAt: number | null;
};

/** The gym a workout was started at, kept on the workout so its bar weights are known offline and after a reload. */
export type GymSnapshot = Pick<Gym, 'name' | 'barbellKg' | 'bars'>;

/** The last gym list the server gave, kept so a new workout can start without a connection. */
export type GymCache = { id: 'list'; gyms: Gym[]; savedAt: number };

export type StoredWorkout = Workout &
  SyncMeta & {
    /** Local only: never sent to the server. */
    gymSnapshot: GymSnapshot | null;
    /** The server has had this workout at some point, so its sets may go, whatever happens to later edits. */
    everSynced: boolean;
  };
export type StoredSet = LoggedSet & SyncMeta;

export type RowKind = 'workout' | 'set';
export type PushedRow = { id: string; rev: number };

/** A set that was removed on this device after it may have reached the server, so it must be deleted there too. */
export type PendingDeletion = {
  id: string;
  at: string;
  attempts: number;
  nextAttemptAt: number;
  /** The server kept refusing the delete. Waits for a manual retry, like a failed row. */
  failed: boolean;
};

export type NewWorkout = {
  id: string;
  gymId: string | null;
  startedAt: string;
  gymSnapshot?: GymSnapshot | null;
};

/** The rows the sync worker works through. */
export interface Outbox {
  /** Pending workouts whose wait is over. Rows that no longer pass validation are marked failed, not returned. */
  dueWorkouts(now: number): Promise<StoredWorkout[]>;
  /** Pending sets whose wait is over and whose workout has reached the server. Invalid rows are marked failed. */
  dueSets(now: number): Promise<StoredSet[]>;
  /** Records that a push of these rows is starting. */
  markAttempted(kind: RowKind, rows: PushedRow[], at: number): Promise<void>;
  /**
   * Marks rows synced if they did not change meanwhile. A set removed locally while it was on its way
   * is queued for deletion in the same transaction. Returns the ids that no longer exist locally.
   */
  markSynced(kind: RowKind, rows: PushedRow[], at?: string): Promise<string[]>;
  /** Not the row's fault (offline, or trouble on the server): try again later without counting it. */
  defer(kind: RowKind, rows: PushedRow[], until: number): Promise<void>;
  /** The server refused this row: count it, back off, and give up after too many. */
  recordFailure(kind: RowKind, row: PushedRow, error: string, now: number): Promise<void>;
  /** A workout whose gym no longer exists is sent again without it, so its sets are not stranded. */
  dropGym(row: PushedRow): Promise<void>;
  /** Remembers that a set must still be deleted on the server. Survives a reload. Keeps an existing entry as it is. */
  queueDeletion(id: string, at: string): Promise<void>;
  dueDeletions(now: number): Promise<PendingDeletion[]>;
  /** The server has deleted it (or it never existed), so forget it. */
  clearDeletion(id: string): Promise<void>;
  /** The server could not be asked (offline, or trouble): wait, without counting it. */
  deferDeletion(id: string, until: number): Promise<void>;
  /** The server refused the delete: count it, back off, and give up after too many. */
  recordDeletionFailure(id: string, until: number): Promise<void>;
}

/** What the screens use to record a workout on this device. */
export interface LogStore {
  /** Starts a workout. Starting one that already exists changes nothing, so a retry cannot reopen an ended one. */
  startWorkout(input: NewWorkout): Promise<StoredWorkout>;
  endWorkout(id: string, endedAt: string): Promise<StoredWorkout>;
  /** The most recently started workout that has not been ended. */
  activeWorkout(): Promise<StoredWorkout | undefined>;
  /** Stores a set, after checking it against the shared schema. Logging an id that exists changes nothing. */
  logSet(input: LoggedSet): Promise<StoredSet>;
  listSets(workoutId: string): Promise<StoredSet[]>;
  getWorkout(id: string): Promise<StoredWorkout | undefined>;
  /** Ended workouts, newest start first, at most `limit`. */
  endedWorkouts(limit: number): Promise<StoredWorkout[]>;
  /** Every set of these exercises in any workout, oldest first. */
  setsForExercises(exerciseIds: string[]): Promise<StoredSet[]>;
  /** Every set on this device, oldest first. */
  allSets(): Promise<StoredSet[]>;
  /** The sets of several workouts at once, oldest first. */
  listSetsFor(workoutIds: string[]): Promise<StoredSet[]>;
  /** The newest set of this exercise, in any workout. */
  lastSetFor(exerciseId: string): Promise<StoredSet | undefined>;
  /**
   * Removes a set that has not been confirmed by the server. If a push may have reached it, a delete
   * on the server is queued too. A synced set must be deleted online instead.
   */
  removeUnsyncedSet(id: string): Promise<'removed' | 'synced' | 'missing'>;
  counts(): Promise<{ pending: number; failed: number }>;
  /** Puts failed rows and deletions back in the queue. Returns how many. */
  retryFailed(): Promise<number>;
  /** Forgets a set the server has deleted. Only for synced sets; unsynced ones go through removeUnsyncedSet. */
  removeSyncedSet(id: string): Promise<boolean>;
  /** Updates the gym kept on a workout (local only, nothing to sync) after the gym was edited online. */
  refreshGymSnapshot(workoutId: string, snapshot: GymSnapshot): Promise<void>;
  /** Keeps the gym list for offline use. */
  saveGyms(gyms: Gym[]): Promise<void>;
  /** The last saved gym list, or null if there is none. */
  cachedGyms(): Promise<Gym[] | null>;
  /** Deletes everything the server already has, and keeps what is still unsynced. Returns how much remains. */
  purgeSynced(): Promise<{ remaining: number }>;
  outbox: Outbox;
}

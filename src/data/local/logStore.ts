import { SetSchema, WorkoutSchema, type LoggedSet } from '../../domain/schemas';
import type { LocalDb } from './db';
import { readGymList, readGymSnapshot } from './gymShape';
import type {
  LogStore,
  NewWorkout,
  Outbox,
  PendingDeletion,
  PushedRow,
  RowKind,
  StoredSet,
  StoredWorkout,
  SyncMeta,
} from './types';

/** After this many refusals of the row itself, a row (or a delete) is marked failed and waits for a manual retry. */
export const MAX_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

export const backoffMs = (attempts: number): number =>
  Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_MAX_MS);

const fresh = (): SyncMeta => ({
  syncStatus: 'pending',
  rev: 1,
  attempts: 0,
  nextAttemptAt: 0,
  lastError: null,
  lastAttemptAt: null,
});

const META_KEYS: readonly string[] = [
  'syncStatus',
  'rev',
  'attempts',
  'nextAttemptAt',
  'lastError',
  'lastAttemptAt',
  'everSynced',
  'gymSnapshot',
];

/** The row as the shared schemas know it, without the bookkeeping. */
const plain = (row: object): unknown =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !META_KEYS.includes(key)));

/** Canonical form (UTC, milliseconds), so stored times sort as plain strings. */
const canonical = (timestamp: string): string => new Date(timestamp).toISOString();

const compareText = (a: string | undefined, b: string | undefined): number => {
  const x = a ?? '';
  const y = b ?? '';
  return x < y ? -1 : x > y ? 1 : 0;
};

/** A wait that is longer than the longest backoff means the clock was wrong when it was set, so it is over. */
const isDue = (row: SyncMeta, now: number): boolean =>
  row.nextAttemptAt <= now || row.nextAttemptAt - now > BACKOFF_MAX_MS;

export function createLogStore(db: LocalDb, clock: () => number = Date.now): LogStore {
  const table = (kind: RowKind) => (kind === 'workout' ? db.workouts : db.sets);

  /** Marks a row failed because it is no longer valid data, so it is neither sent nor retried. */
  async function failInvalid(kind: RowKind, id: string, reason: string) {
    await table(kind).update(id, { syncStatus: 'failed', lastError: reason });
  }

  /** The row, if it is still the revision a push started with and has not been confirmed since. */
  async function unchanged(kind: RowKind, { id, rev }: PushedRow) {
    const row = await table(kind).get(id);
    return row && row.rev === rev && row.syncStatus !== 'synced' ? row : undefined;
  }

  const outbox: Outbox = {
    async dueWorkouts(now) {
      const rows = await db.workouts.where('syncStatus').equals('pending').toArray();
      const due: StoredWorkout[] = [];
      for (const row of rows.filter((r) => isDue(r, now))) {
        // Rows come back from IndexedDB, which the user or an extension can edit: check before sending.
        if (WorkoutSchema.safeParse(plain(row)).success) due.push(row);
        else await failInvalid('workout', row.id, 'invalid row');
      }
      return due.sort((a, b) => compareText(a.startedAt, b.startedAt));
    },

    async dueSets(now) {
      const rows = await db.sets.where('syncStatus').equals('pending').toArray();
      const candidates = rows.filter((r) => isDue(r, now));
      const workouts = await db.workouts.bulkGet([...new Set(candidates.map((r) => r.workoutId))]);
      const onServer = new Set(workouts.flatMap((w) => (w?.everSynced ? [w.id] : [])));
      const due: StoredSet[] = [];
      for (const row of candidates) {
        if (!onServer.has(row.workoutId)) continue;
        if (SetSchema.safeParse(plain(row)).success) due.push(row);
        else await failInvalid('set', row.id, 'invalid row');
      }
      return due.sort((a, b) => compareText(a.loggedAt, b.loggedAt));
    },

    async markAttempted(kind, rows, at) {
      await db.transaction('rw', table(kind), async () => {
        for (const { id } of rows) await table(kind).update(id, { lastAttemptAt: at });
      });
    },

    async markSynced(kind, pushed, at = new Date(clock()).toISOString()) {
      const gone: string[] = [];
      await db.transaction('rw', table(kind), db.deletions, async () => {
        for (const { id, rev } of pushed) {
          const row = await table(kind).get(id);
          if (!row) {
            gone.push(id);
            // Removed here while it was on its way, and now it is on the server: delete it there too.
            if (kind === 'set' && !(await db.deletions.get(id)))
              await db.deletions.put({ id, at, attempts: 0, nextAttemptAt: 0, failed: false });
            continue;
          }
          const confirmed = { attempts: 0, nextAttemptAt: 0, lastError: null };
          if (kind === 'workout') await db.workouts.update(id, { everSynced: true });
          // A newer revision stays pending and goes out on the next run.
          if (row.rev === rev) await table(kind).update(id, { ...confirmed, syncStatus: 'synced' });
        }
      });
      return gone;
    },

    async defer(kind, rows, until) {
      await db.transaction('rw', table(kind), async () => {
        for (const row of rows)
          if (await unchanged(kind, row))
            await table(kind).update(row.id, { nextAttemptAt: until });
      });
    },

    async recordFailure(kind, pushed, error, now) {
      await db.transaction('rw', table(kind), async () => {
        const row = await unchanged(kind, pushed);
        if (!row) return;
        const attempts = row.attempts + 1;
        await table(kind).update(row.id, {
          attempts,
          lastError: error,
          syncStatus: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          nextAttemptAt: now + backoffMs(attempts),
        });
      });
    },

    async dropGym(pushed) {
      await db.transaction('rw', db.workouts, async () => {
        const row = await unchanged('workout', pushed);
        if (!row) return;
        await db.workouts.update(row.id, {
          gymId: null,
          rev: row.rev + 1,
          attempts: 0,
          nextAttemptAt: 0,
          lastError: 'gym no longer exists',
        });
      });
    },

    async queueDeletion(id, at) {
      await db.transaction('rw', db.deletions, async () => {
        if (!(await db.deletions.get(id)))
          await db.deletions.put({ id, at, attempts: 0, nextAttemptAt: 0, failed: false });
      });
    },

    async dueDeletions(now) {
      const rows = await db.deletions.toArray();
      return rows.filter(
        (d) => !d.failed && (d.nextAttemptAt <= now || d.nextAttemptAt - now > BACKOFF_MAX_MS),
      );
    },

    async clearDeletion(id) {
      await db.deletions.delete(id);
    },

    async deferDeletion(id, until) {
      await db.deletions.update(id, { nextAttemptAt: until });
    },

    async recordDeletionFailure(id, now) {
      await db.transaction('rw', db.deletions, async () => {
        const row = await db.deletions.get(id);
        if (!row) return;
        const attempts = row.attempts + 1;
        await db.deletions.update(id, {
          attempts,
          failed: attempts >= MAX_ATTEMPTS,
          nextAttemptAt: now + backoffMs(attempts),
        });
      });
    },
  };

  return {
    outbox,

    async startWorkout(input: NewWorkout) {
      // Validated as given (a time without a zone is refused), then stored in canonical form.
      const checked = WorkoutSchema.parse({ ...input, endedAt: null, notes: null });
      const parsed = { ...checked, startedAt: canonical(checked.startedAt) };
      return db.transaction('rw', db.workouts, async () => {
        const existing = await db.workouts.get(parsed.id);
        if (existing) return existing; // a retried start must not reopen or reset a workout
        const row: StoredWorkout = {
          ...parsed,
          ...fresh(),
          everSynced: false,
          gymSnapshot: input.gymSnapshot ?? null,
        };
        await db.workouts.put(row);
        return row;
      });
    },

    async endWorkout(id, endedAt) {
      return db.transaction('rw', db.workouts, async () => {
        const row = await db.workouts.get(id);
        if (!row) throw new Error('Workout not found');
        const checked = WorkoutSchema.parse({ ...(plain(row) as object), endedAt });
        const parsed = { ...checked, endedAt: canonical(endedAt) };
        // Ending is part of creating the workout, so it also works offline; it goes out as another upsert.
        const next: StoredWorkout = {
          ...parsed,
          ...fresh(),
          rev: row.rev + 1,
          everSynced: row.everSynced,
          gymSnapshot: row.gymSnapshot ?? null,
        };
        await db.workouts.put(next);
        return next;
      });
    },

    async getWorkout(id) {
      const row = await db.workouts.get(id);
      return row && { ...row, gymSnapshot: readGymSnapshot(row.gymSnapshot) };
    },

    async endedWorkouts(limit) {
      const count = Math.floor(limit);
      if (!Number.isFinite(count) || count <= 0) return [];
      const rows = await db.workouts
        .orderBy('startedAt')
        .reverse()
        .filter((w) => w.endedAt !== null)
        .limit(count)
        .toArray();
      return rows.map((row) => ({ ...row, gymSnapshot: readGymSnapshot(row.gymSnapshot) }));
    },

    async listSetsFor(workoutIds) {
      const rows = await db.sets.where('workoutId').anyOf(workoutIds).toArray();
      return rows.sort((a, b) => compareText(a.loggedAt, b.loggedAt));
    },

    async activeWorkout() {
      const open = await db.workouts.filter((w) => w.endedAt === null).toArray();
      const newest = open.sort((a, b) => compareText(b.startedAt, a.startedAt))[0];
      return newest && { ...newest, gymSnapshot: readGymSnapshot(newest.gymSnapshot) };
    },

    async logSet(input: LoggedSet) {
      const checked = SetSchema.parse(input);
      const parsed = { ...checked, loggedAt: canonical(checked.loggedAt) };
      return db.transaction('rw', db.workouts, db.sets, async () => {
        if (!(await db.workouts.get(parsed.workoutId))) throw new Error('Workout not found');
        const existing = await db.sets.get(parsed.id);
        if (existing) return existing; // a retried log must not turn a sent set back into an unsent one
        const row: StoredSet = { ...parsed, ...fresh() };
        await db.sets.put(row);
        return row;
      });
    },

    async listSets(workoutId) {
      const rows = await db.sets.where('workoutId').equals(workoutId).toArray();
      return rows.sort((a, b) => compareText(a.loggedAt, b.loggedAt));
    },

    async lastSetFor(exerciseId) {
      return db.sets
        .where('[exerciseId+loggedAt]')
        .between([exerciseId, ''], [exerciseId, '￿'])
        .last();
    },

    async removeUnsyncedSet(id) {
      return db.transaction('rw', db.sets, db.deletions, async () => {
        const row = await db.sets.get(id);
        if (!row) return 'missing';
        if (row.syncStatus === 'synced') return 'synced';
        await db.sets.delete(id);
        // A push may have reached the server even if no answer came back: delete it there as well.
        if (row.lastAttemptAt !== null && !(await db.deletions.get(id)))
          await db.deletions.put({
            id,
            at: new Date(clock()).toISOString(),
            attempts: 0,
            nextAttemptAt: 0,
            failed: false,
          });
        return 'removed';
      });
    },

    async removeSyncedSet(id) {
      return db.transaction('rw', db.sets, async () => {
        const row = await db.sets.get(id);
        if (!row || row.syncStatus !== 'synced') return false;
        await db.sets.delete(id);
        return true;
      });
    },

    async refreshGymSnapshot(workoutId, snapshot) {
      await db.workouts.update(workoutId, { gymSnapshot: snapshot });
    },

    async saveGyms(gyms) {
      await db.gymCache.put({ id: 'list', gyms, savedAt: clock() });
    },

    async cachedGyms() {
      return readGymList((await db.gymCache.get('list'))?.gyms);
    },

    async counts() {
      const [pendingSets, failedSets, pendingWorkouts, failedWorkouts, deletions] =
        await Promise.all([
          db.sets.where('syncStatus').equals('pending').count(),
          db.sets.where('syncStatus').equals('failed').count(),
          db.workouts.where('syncStatus').equals('pending').count(),
          db.workouts.where('syncStatus').equals('failed').count(),
          db.deletions.toArray(),
        ]);
      const failedDeletions = deletions.filter((d) => d.failed).length;
      return {
        pending: pendingSets + pendingWorkouts + (deletions.length - failedDeletions),
        failed: failedSets + failedWorkouts + failedDeletions,
      };
    },

    async retryFailed() {
      return db.transaction('rw', db.workouts, db.sets, db.deletions, async () => {
        const patch = {
          syncStatus: 'pending' as const,
          attempts: 0,
          nextAttemptAt: 0,
          lastError: null,
        };
        const a = await db.workouts.where('syncStatus').equals('failed').modify(patch);
        const b = await db.sets.where('syncStatus').equals('failed').modify(patch);
        const c = await db.deletions
          .filter((d) => d.failed)
          .modify({ failed: false, attempts: 0, nextAttemptAt: 0 });
        return a + b + c;
      });
    },

    async purgeSynced() {
      return db.transaction('rw', db.workouts, db.sets, db.deletions, db.gymCache, async () => {
        await db.gymCache.clear(); // gym names are the user's data too; they are fetched again at the next sign-in
        await db.sets.where('syncStatus').equals('synced').delete();
        const remainingSets = await db.sets.toArray();
        const keep = new Set(remainingSets.map((s) => s.workoutId));
        await db.workouts.filter((w) => w.syncStatus === 'synced' && !keep.has(w.id)).delete();
        const [workouts, deletions] = await Promise.all([
          db.workouts.count(),
          db.deletions.count(),
        ]);
        return { remaining: workouts + remainingSets.length + deletions };
      });
    },
  };
}

export type { PendingDeletion };

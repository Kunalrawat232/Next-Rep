import { SetSchema, WorkoutSchema, type LoggedSet } from '../../domain/schemas';
import type { LocalDb } from './db';
import { CoachTurnSchema, type ChatMessage } from '../../domain/coach';
import { readCachedGym, readGymSnapshot } from './gymShape';
import type {
  LogStore,
  MergeOutcome,
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

/** How many messages of the chat with the coach stay on the device. */
const COACH_MESSAGES_KEPT = 50;

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

    async setsForExercises(exerciseIds) {
      const parts = await Promise.all(
        [...new Set(exerciseIds)].map((id) =>
          db.sets.where('[exerciseId+loggedAt]').between([id, ''], [id, '\uffff']).toArray(),
        ),
      );
      return parts.flat().sort((a, b) => compareText(a.loggedAt, b.loggedAt));
    },

    async allSets() {
      const rows = await db.sets.toArray();
      return rows.sort((a, b) => compareText(a.loggedAt, b.loggedAt));
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

    async mergePulled(pulled) {
      const gyms = new Map(pulled.gym ? [[pulled.gym.id, pulled.gym]] : []);
      return db.transaction('rw', db.workouts, db.sets, db.deletions, async () => {
        const outcome: MergeOutcome = {
          addedWorkouts: 0,
          updatedWorkouts: 0,
          addedSets: 0,
          removedWorkouts: 0,
          removedSets: 0,
          skippedSets: 0,
          removalsSkipped: false,
        };
        const snapshotOf = (gymId: string | null) => {
          const gym = gymId === null ? undefined : gyms.get(gymId);
          return gym ? { barbellKg: gym.barbellKg, bars: gym.bars } : null;
        };
        const confirmed = (): SyncMeta & { everSynced: boolean } => ({
          ...fresh(),
          syncStatus: 'synced',
          everSynced: true,
        });

        for (const incoming of pulled.workouts) {
          // Stored in the same canonical form as local rows, so times sort as plain strings.
          const checked = WorkoutSchema.parse(incoming);
          const parsed = {
            ...checked,
            startedAt: canonical(checked.startedAt),
            endedAt: checked.endedAt === null ? null : canonical(checked.endedAt),
          };
          const local = await db.workouts.get(parsed.id);
          if (!local) {
            const gym = parsed.gymId === null ? undefined : gyms.get(parsed.gymId);
            await db.workouts.put({
              ...parsed,
              ...confirmed(),
              gymSnapshot: gym ? { barbellKg: gym.barbellKg, bars: gym.bars } : null,
            });
            outcome.addedWorkouts += 1;
          } else if (
            local.syncStatus === 'synced' &&
            (local.gymId !== parsed.gymId ||
              local.startedAt !== parsed.startedAt ||
              local.endedAt !== parsed.endedAt ||
              local.notes !== parsed.notes)
          ) {
            // The bars shown must follow the gym the workout now belongs to.
            const gymSnapshot =
              local.gymId === parsed.gymId ? local.gymSnapshot : snapshotOf(parsed.gymId);
            await db.workouts.put({ ...local, ...parsed, gymSnapshot });
            outcome.updatedWorkouts += 1;
          }
        }

        for (const incoming of pulled.sets) {
          const checked = SetSchema.parse(incoming);
          if (await db.sets.get(checked.id)) continue;
          // A set removed on this device whose delete has not reached the server yet stays removed.
          if (await db.deletions.get(checked.id)) continue;
          if (!(await db.workouts.get(checked.workoutId))) {
            outcome.skippedSets += 1;
            continue;
          }
          await db.sets.put({ ...checked, loggedAt: canonical(checked.loggedAt), ...confirmed() });
          outcome.addedSets += 1;
        }

        // The server answered in full, so a synced row it no longer has was deleted elsewhere. Unless
        // it is missing everything, or most of it: that looks like a bad answer, not a real change.
        const synced = await db.sets.where('syncStatus').equals('synced').toArray();
        const missing = synced.filter((set) => !pulled.serverSetIds.has(set.id));
        const looksWrong =
          missing.length > 0 &&
          (pulled.serverSetIds.size === 0 ||
            (missing.length >= 10 && missing.length * 2 > synced.length));
        if (looksWrong) {
          outcome.removalsSkipped = true;
          return outcome;
        }
        for (const set of missing) {
          await db.sets.delete(set.id);
          outcome.removedSets += 1;
        }
        const stillUsed = new Set((await db.sets.toArray()).map((s) => s.workoutId));
        // Only finished workouts were asked for, so an open one is never taken for deleted.
        const gone = await db.workouts
          .filter(
            (w) =>
              w.syncStatus === 'synced' &&
              w.endedAt !== null &&
              !pulled.serverWorkoutIds.has(w.id) &&
              !stillUsed.has(w.id),
          )
          .toArray();
        for (const workout of gone) {
          await db.workouts.delete(workout.id);
          outcome.removedWorkouts += 1;
        }
        return outcome;
      });
    },

    async refreshGymSnapshot(workoutId, snapshot) {
      await db.workouts.update(workoutId, { gymSnapshot: snapshot });
    },

    async saveGym(gym) {
      await db.gymCache.put({ id: 'gym', gym, savedAt: clock() });
    },

    async coachMessages() {
      const rows = await db.coachMessages.orderBy('at').toArray();
      // Rows on the device are not trusted: a damaged one is left out, never shown.
      return rows.flatMap((row) => {
        const turn = CoachTurnSchema.safeParse({ role: row.role, text: row.text });
        return turn.success && typeof row.id === 'string' && Number.isFinite(row.at)
          ? [{ ...turn.data, id: row.id, at: row.at }]
          : [];
      });
    },

    async addCoachMessage(message) {
      const stored: ChatMessage = {
        role: message.role,
        text: message.text,
        id: crypto.randomUUID(),
        // Two messages in the same millisecond keep their order: the second is placed after the newest.
        at: Math.max(clock(), ((await db.coachMessages.orderBy('at').last())?.at ?? 0) + 1),
      };
      await db.transaction('rw', db.coachMessages, async () => {
        await db.coachMessages.put(stored);
        const surplus = (await db.coachMessages.count()) - COACH_MESSAGES_KEPT;
        if (surplus > 0) {
          const oldest = await db.coachMessages.orderBy('at').limit(surplus).primaryKeys();
          await db.coachMessages.bulkDelete(oldest);
        }
      });
      return stored;
    },

    async clearCoachMessages() {
      await db.coachMessages.clear();
    },

    async cachedGym() {
      const row = await db.gymCache.get('gym');
      if (!row) return null;
      const gym = readCachedGym(row.gym);
      return gym === undefined ? null : { gym };
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
      return db.transaction(
        'rw',
        db.workouts,
        db.sets,
        db.deletions,
        db.gymCache,
        db.coachMessages,
        async () => {
          await db.gymCache.clear(); // the gym is the user's data too; it is fetched again at the next sign-in
          await db.coachMessages.clear(); // so is the chat with the coach
          await db.sets.where('syncStatus').equals('synced').delete();
          const remainingSets = await db.sets.toArray();
          const keep = new Set(remainingSets.map((s) => s.workoutId));
          await db.workouts.filter((w) => w.syncStatus === 'synced' && !keep.has(w.id)).delete();
          const [workouts, deletions] = await Promise.all([
            db.workouts.count(),
            db.deletions.count(),
          ]);
          return { remaining: workouts + remainingSets.length + deletions };
        },
      );
    },
  };
}

export type { PendingDeletion };

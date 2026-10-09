import {
  type LogStore,
  type PushedRow,
  type RowKind,
  type StoredSet,
  type StoredWorkout,
} from '../local';
import type { Result } from '../../lib/result';
import type { RemoteLog, SyncOutcome } from './types';

/** How long rows wait after the network was found down, unless a new run is forced. */
const OFFLINE_WAIT_MS = 5_000;
/** How long rows wait after the server had trouble (an outage, an expired session, a rate limit). */
const SERVER_WAIT_MS = 30_000;
const DEFAULT_BATCH = 50;

export type SyncWorkerDeps = {
  store: LogStore;
  remote: RemoteLog;
  userId: string;
  now?: () => number;
  /** Rows per request. Anything below 1 means the default. */
  batchSize?: number;
};

export type SyncWorker = {
  /**
   * Pushes whatever is due: workouts first, then the sets whose workout is on the server, then owed
   * deletes. Only one pass runs at a time; a caller that arrives meanwhile gets that pass's result.
   * `ignoreWait` also sends rows that are still waiting; asking for it during an ordinary pass makes
   * a forced pass follow it.
   */
  run(options?: { ignoreWait?: boolean }): Promise<SyncOutcome>;
  /** Stops all work at the next step, as when the user signs out, until `resume`. */
  pause(): void;
  resume(): void;
};

const empty = (): SyncOutcome => ({
  pushedWorkouts: 0,
  pushedSets: 0,
  deletedSets: 0,
  refused: 0,
  offline: false,
});

const merge = (a: SyncOutcome, b: SyncOutcome): SyncOutcome => ({
  pushedWorkouts: a.pushedWorkouts + b.pushedWorkouts,
  pushedSets: a.pushedSets + b.pushedSets,
  deletedSets: a.deletedSets + b.deletedSets,
  refused: a.refused + b.refused,
  offline: a.offline || b.offline,
});

const chunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

const pushed = (rows: { id: string; rev: number }[]): PushedRow[] =>
  rows.map(({ id, rev }) => ({ id, rev }));

export function createSyncWorker({
  store,
  remote,
  userId,
  now = Date.now,
  batchSize,
}: SyncWorkerDeps): SyncWorker {
  const batch = Math.max(1, Math.floor(batchSize ?? DEFAULT_BATCH) || DEFAULT_BATCH);
  let inFlight: Promise<SyncOutcome> | null = null;
  let running = { forced: false };
  let forceAfter = false;
  let active = true;
  let again = false;

  // A call that throws instead of answering counts as trouble on the server, never as a crash.
  const call = async (send: () => Promise<Result>): Promise<Result> => {
    try {
      return await send();
    } catch {
      return { status: 'error', reason: 'unknown' };
    }
  };

  /**
   * Sends one group of rows. Returns false when the pass should stop: the network is down, the server
   * is in trouble, or the worker was paused. Only a refusal of the data itself counts against a row.
   */
  async function push<T extends StoredWorkout | StoredSet>(
    kind: RowKind,
    rows: T[],
    send: (rows: T[]) => Promise<Result>,
    outcome: SyncOutcome,
  ): Promise<boolean> {
    if (!active) return false;
    await store.outbox.markAttempted(kind, pushed(rows), now());
    const result = await call(() => send(rows));
    if (!active) return false; // signed out meanwhile: leave the rows for the next session
    if (result.status === 'ok') {
      const gone = await store.outbox.markSynced(kind, pushed(rows), new Date(now()).toISOString());
      void gone; // removed rows already have their delete queued, inside markSynced
      if (kind === 'workout') outcome.pushedWorkouts += rows.length;
      else outcome.pushedSets += rows.length;
      return true;
    }
    if (result.reason === 'offline') {
      await store.outbox.defer(kind, pushed(rows), now() + OFFLINE_WAIT_MS);
      outcome.offline = true;
      return false;
    }
    if (result.reason === 'unknown') {
      // Not about these rows: do not count it against them, and do not hammer a struggling server.
      await store.outbox.defer(kind, pushed(rows), now() + SERVER_WAIT_MS);
      return false;
    }
    // 'rejected' or 'conflict': the server refused this data.
    if (rows.length > 1) {
      // One bad row must not hold back the others: send them one at a time to find it.
      for (const row of rows) if (!(await push(kind, [row], send, outcome))) return false;
      return true;
    }
    const row = rows[0]!;
    if (
      kind === 'workout' &&
      (row as StoredWorkout).gymId !== null &&
      result.reason === 'rejected'
    ) {
      // Most likely the gym was deleted on another device. Send the workout without it, so its sets are not stranded.
      await store.outbox.dropGym({ id: row.id, rev: row.rev });
      again = true;
      return true;
    }
    await store.outbox.recordFailure(kind, { id: row.id, rev: row.rev }, result.reason, now());
    outcome.refused += 1;
    return true;
  }

  async function deleteOwed(at: () => number, outcome: SyncOutcome): Promise<void> {
    for (const deletion of await store.outbox.dueDeletions(at())) {
      if (!active) return;
      const result = await call(() => remote.softDeleteSet(deletion.id, deletion.at));
      if (!active) return;
      if (result.status === 'ok') {
        await store.outbox.clearDeletion(deletion.id);
        outcome.deletedSets += 1;
      } else if (result.reason === 'offline') {
        await store.outbox.deferDeletion(deletion.id, now() + OFFLINE_WAIT_MS);
        outcome.offline = true;
        return;
      } else if (result.reason === 'unknown') {
        await store.outbox.deferDeletion(deletion.id, now() + SERVER_WAIT_MS);
        return;
      } else {
        await store.outbox.recordDeletionFailure(deletion.id, now());
        outcome.refused += 1;
      }
    }
  }

  async function pass(ignoreWait: boolean): Promise<SyncOutcome> {
    const outcome = empty();
    const at = () => (ignoreWait ? Number.MAX_SAFE_INTEGER : now());

    for (const group of chunks(await store.outbox.dueWorkouts(at()), batch)) {
      if (!(await push('workout', group, (rows) => remote.upsertWorkouts(userId, rows), outcome)))
        return outcome;
    }
    // Read after the workouts went, so sets of a workout that just arrived are included.
    for (const group of chunks(await store.outbox.dueSets(at()), batch)) {
      if (!(await push('set', group, (rows) => remote.upsertSets(userId, rows), outcome)))
        return outcome;
    }
    // Deletes go last: a set removed in flight has just been sent, so it exists on the server now.
    await deleteOwed(at, outcome);
    return outcome;
  }

  async function start(forced: boolean): Promise<SyncOutcome> {
    try {
      let outcome = empty();
      let ignoreWait = forced;
      for (let round = 0; round < 4 && active; round++) {
        again = false;
        outcome = merge(outcome, await pass(ignoreWait));
        if (!again && !forceAfter) break;
        // A forced request arrived during an ordinary pass, or a workout lost its gym: go round once more.
        ignoreWait = ignoreWait || forceAfter;
        forceAfter = false;
      }
      return outcome;
    } finally {
      inFlight = null;
      running = { forced: false };
    }
  }

  return {
    run(options = {}) {
      if (!active) return Promise.resolve(empty());
      if (inFlight) {
        if (options.ignoreWait && !running.forced) forceAfter = true;
        return inFlight;
      }
      running = { forced: options.ignoreWait ?? false };
      inFlight = start(running.forced);
      return inFlight;
    },
    pause() {
      active = false;
    },
    resume() {
      active = true;
    },
  };
}

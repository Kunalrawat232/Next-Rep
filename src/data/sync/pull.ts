import type { LogStore, MergeOutcome } from '../local';
import { SetSchema, WorkoutSchema, type LoggedSet, type Workout } from '../../domain/schemas';
import type { Failure, Result } from '../../lib/result';
import type { RemoteLog } from './types';

export const PULL_PAGE_SIZE = 500;
/** A safety stop: more pages than any real history means the server is not answering as it should. */
const MAX_PAGES = 1_000;

export type PullOutcome =
  | ({ status: 'done'; refused: number; changed: boolean } & MergeOutcome)
  | { status: 'offline' | 'failed' | 'stopped' };

export type PullDeps = {
  store: LogStore;
  remote: RemoteLog;
  userId: string;
  /** Asked between pages: false when the user signed out, so nothing more is read or stored. */
  isActive?: () => boolean;
  pageSize?: number;
};

const idOf = (row: unknown): string | null => {
  const id = (row as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id : null;
};

type Paged = { rows: unknown[] } | { failure: Failure | 'stopped' };

/**
 * Reads page after page by id until an empty one. Stopping on an empty page, not a short one, means
 * a server that caps its answers below the page size is still read to the end.
 */
async function readAll(
  read: (after: string | null) => Promise<Result<unknown[]>>,
  isActive: () => boolean,
): Promise<Paged> {
  const rows: unknown[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (!isActive()) return { failure: 'stopped' };
    // A call that throws instead of answering counts as trouble on the server, never as a crash.
    const result = await read(after).catch((): Result<unknown[]> => ({
      status: 'error',
      reason: 'unknown',
    }));
    if (result.status === 'error') return { failure: result.reason };
    if (result.value.length === 0) return { rows };
    rows.push(...result.value);
    const last = idOf(result.value[result.value.length - 1]);
    // Without an id to continue from, the rest cannot be read: that is trouble, not the end.
    if (last === null || last === after) return { failure: 'unknown' };
    after = last;
  }
  return { failure: 'unknown' };
}

/** A time the schemas accept can still be one `Date` cannot read (such as 24:00); such a row is refused, not allowed to stop the pull. */
const readable = (...times: (string | null)[]) =>
  times.every((t) => t === null || !Number.isNaN(Date.parse(t)));

/**
 * Reads the user's whole history from the server and merges it into the device. Everything is read
 * first and stored in one step, so a pull that fails half way changes nothing. Rows are read by id,
 * so one deleted meanwhile cannot make the pull skip another. Rows are untrusted:
 * each is checked against the shared schemas, and a row that fails is skipped (it still counts as
 * on the server, so its local copy is not taken for deleted).
 */
export async function pullHistory({
  store,
  remote,
  userId,
  isActive = () => true,
  pageSize = PULL_PAGE_SIZE,
}: PullDeps): Promise<PullOutcome> {
  const size = Math.max(1, Math.floor(pageSize) || PULL_PAGE_SIZE);
  const workouts = await readAll(
    (after) => remote.fetchWorkouts(userId, { after, size }),
    isActive,
  );
  if ('failure' in workouts) return fail(workouts.failure);
  const sets = await readAll((after) => remote.fetchSets(userId, { after, size }), isActive);
  if ('failure' in sets) return fail(sets.failure);
  if (!isActive()) return { status: 'stopped' };

  let refused = 0;
  const validWorkouts: Workout[] = [];
  for (const row of workouts.rows) {
    const parsed = WorkoutSchema.safeParse(row);
    if (parsed.success && readable(parsed.data.startedAt, parsed.data.endedAt))
      validWorkouts.push(parsed.data);
    else refused += 1;
  }
  const validSets: LoggedSet[] = [];
  for (const row of sets.rows) {
    const parsed = SetSchema.safeParse(row);
    if (parsed.success && readable(parsed.data.loggedAt)) validSets.push(parsed.data);
    else refused += 1;
  }
  const ids = (rows: unknown[]) =>
    new Set(rows.map(idOf).filter((id): id is string => id !== null));

  const cached = await store.cachedGym().catch(() => null);
  const merged = await store.mergePulled({
    workouts: validWorkouts,
    sets: validSets,
    serverWorkoutIds: ids(workouts.rows),
    serverSetIds: ids(sets.rows),
    gym: cached?.gym ?? null,
  });
  const changed =
    merged.addedWorkouts +
      merged.updatedWorkouts +
      merged.addedSets +
      merged.removedWorkouts +
      merged.removedSets >
    0;
  return { status: 'done', refused, changed, ...merged };
}

function fail(reason: Failure | 'stopped'): PullOutcome {
  if (reason === 'stopped') return { status: 'stopped' };
  return { status: reason === 'offline' ? 'offline' : 'failed' };
}

import { vi } from 'vitest';
import type { StoredSet, StoredWorkout } from '../data/local';
import type { RemoteLog } from '../data/sync/types';
import type { Failure, Result } from '../lib/result';

type Method = keyof RemoteLog;

/**
 * A stand-in server that behaves like the database: upserts by id, and refuses a set whose workout
 * is not there yet. Tests can make calls fail, poison rows, go offline, or hold a call open.
 */
export function createFakeRemoteLog() {
  const workouts = new Map<string, StoredWorkout>();
  const sets = new Map<string, StoredSet & { deletedAt?: string }>();
  const calls: { method: Method; ids: string[]; userId?: string }[] = [];
  const failures: Partial<Record<Method, Failure[]>> = {};
  const poisoned = new Set<string>();
  const goneGyms = new Set<string>();
  const holds: Partial<Record<Method, Promise<void>>> = {};
  let offline = false;

  const next = (method: Method): Result | null => {
    if (offline) return { status: 'error', reason: 'offline' };
    const reason = failures[method]?.shift();
    return reason ? { status: 'error', reason } : null;
  };

  const ok: Result = { status: 'ok', value: undefined };

  const remote = {
    upsertWorkouts: vi.fn<RemoteLog['upsertWorkouts']>(async (userId, rows) => {
      calls.push({ method: 'upsertWorkouts', ids: rows.map((r) => r.id), userId });
      await holds.upsertWorkouts;
      const failed = next('upsertWorkouts');
      if (failed) return failed;
      // Like the foreign key to gyms: a workout that names a gym that is gone is refused.
      if (rows.some((r) => r.gymId !== null && goneGyms.has(r.gymId)))
        return { status: 'error', reason: 'rejected' };
      for (const row of rows) workouts.set(row.id, { ...row });
      return ok;
    }),
    upsertSets: vi.fn<RemoteLog['upsertSets']>(async (userId, rows) => {
      calls.push({ method: 'upsertSets', ids: rows.map((r) => r.id), userId });
      await holds.upsertSets;
      const failed = next('upsertSets');
      if (failed) return failed;
      // All or nothing, like one SQL statement.
      if (rows.some((r) => poisoned.has(r.id))) return { status: 'error', reason: 'rejected' };
      if (rows.some((r) => !workouts.has(r.workoutId)))
        return { status: 'error', reason: 'rejected' };
      for (const row of rows) sets.set(row.id, { ...row, deletedAt: sets.get(row.id)?.deletedAt });
      return ok;
    }),
    softDeleteSet: vi.fn<RemoteLog['softDeleteSet']>(async (id, at) => {
      calls.push({ method: 'softDeleteSet', ids: [id] });
      const failed = next('softDeleteSet');
      if (failed) return failed;
      const row = sets.get(id);
      if (row) sets.set(id, { ...row, deletedAt: at });
      return ok;
    }),
  } satisfies RemoteLog;

  return {
    remote,
    workouts,
    sets,
    calls,
    callsTo: (method: Method) => calls.filter((c) => c.method === method),
    failNext: (method: Method, reason: Failure = 'unknown', times = 1) => {
      failures[method] = [...(failures[method] ?? []), ...Array<Failure>(times).fill(reason)];
    },
    poison: (id: string) => void poisoned.add(id),
    /** Makes the server refuse any workout that names this gym, as if the gym had been deleted. */
    removeGym: (id: string) => void goneGyms.add(id),
    setOffline: (value: boolean) => void (offline = value),
    /** Holds the next calls to a method open until the returned function is called. */
    hold: (method: Method) => {
      let release: () => void = () => undefined;
      holds[method] = new Promise<void>((resolve) => {
        release = () => {
          delete holds[method];
          resolve();
        };
      });
      return release;
    },
  };
}

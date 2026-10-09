import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoredSet, StoredWorkout } from '../local';
import type { RemoteLog } from '../sync/types';
import { failure } from './failure';

type Client = Pick<SupabaseClient, 'from'>;

const ok = { status: 'ok', value: undefined } as const;

const workoutRow = (userId: string, w: StoredWorkout) => ({
  id: w.id,
  user_id: userId,
  gym_id: w.gymId,
  started_at: w.startedAt,
  ended_at: w.endedAt,
  notes: w.notes,
});

// deleted_at is left out on purpose: a re-sent set must never undelete one that was removed online.
const setRow = (userId: string, s: StoredSet) => ({
  id: s.id,
  user_id: userId,
  workout_id: s.workoutId,
  exercise_id: s.exerciseId,
  total_kg: s.totalKg,
  bar_kg: s.barKg,
  per_side_kg: s.perSideKg,
  input_mode: s.inputMode,
  reps: s.reps,
  source: s.source,
  raw_transcript: s.rawTranscript,
  logged_at: s.loggedAt,
});

// numeric columns can arrive as numbers or as strings, depending on the client: both are read as numbers.
// A string that is not a plain decimal is passed on as it is, so the schema refuses it.
const num = (value: unknown): unknown =>
  value === null || value === undefined
    ? null
    : typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)
      ? Number(value)
      : value;

const workoutFromRow = (r: Record<string, unknown>) => ({
  id: r.id,
  gymId: r.gym_id ?? null,
  startedAt: r.started_at,
  endedAt: r.ended_at ?? null,
  notes: r.notes ?? null,
});

const setFromRow = (r: Record<string, unknown>) => ({
  id: r.id,
  workoutId: r.workout_id,
  exerciseId: r.exercise_id,
  totalKg: num(r.total_kg),
  barKg: num(r.bar_kg),
  perSideKg: num(r.per_side_kg),
  inputMode: r.input_mode,
  reps: r.reps,
  source: r.source,
  // What was said is not read back: nothing on the device needs it, and it stays on the server.
  rawTranscript: null,
  loggedAt: r.logged_at,
});

export function createSupabaseLogRemote(client: Client): RemoteLog {
  return {
    async upsertWorkouts(userId, rows) {
      const { error } = await client.from('workouts').upsert(
        rows.map((row) => workoutRow(userId, row)),
        { onConflict: 'id' },
      );
      return error ? failure(error) : ok;
    },

    async upsertSets(userId, rows) {
      const { error } = await client.from('sets').upsert(
        rows.map((row) => setRow(userId, row)),
        { onConflict: 'id' },
      );
      return error ? failure(error) : ok;
    },

    async softDeleteSet(id, at) {
      const { error } = await client.from('sets').update({ deleted_at: at }).eq('id', id);
      return error ? failure(error) : ok;
    },

    async fetchWorkouts(userId, { after, size }) {
      // RLS already limits rows to the signed-in user; the filter says so again.
      let query = client
        .from('workouts')
        .select('id, gym_id, started_at, ended_at, notes')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .not('ended_at', 'is', null);
      if (after !== null) query = query.gt('id', after);
      const { data, error } = await query.order('id').limit(size);
      return error ? failure(error) : { status: 'ok', value: (data ?? []).map(workoutFromRow) };
    },

    async fetchSets(userId, { after, size }) {
      let query = client
        .from('sets')
        .select(
          'id, workout_id, exercise_id, total_kg, bar_kg, per_side_kg, input_mode, reps, source, logged_at',
        )
        .eq('user_id', userId)
        .is('deleted_at', null);
      if (after !== null) query = query.gt('id', after);
      const { data, error } = await query.order('id').limit(size);
      return error ? failure(error) : { status: 'ok', value: (data ?? []).map(setFromRow) };
    },
  };
}

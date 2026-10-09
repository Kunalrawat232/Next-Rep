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
  };
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parseExercises } from '../../domain/exercises/catalog';
import type { ExerciseService } from '../../features/exercises/types';
import { MUSCLES } from '../../domain/exercises/muscles';
import { BODY_PARTS, EQUIPMENT_TYPES } from '../../domain/schemas';
import { failure } from './failure';

type Client = Pick<SupabaseClient, 'from'>;

const RowSchema = z.object({
  id: z.string(),
  name: z.string(),
  equipment_type: z.enum(EQUIPMENT_TYPES),
  body_part: z.enum(BODY_PARTS),
  muscle: z.enum(MUSCLES).nullable(),
  aliases: z.array(z.string()),
});

export function createSupabaseExerciseService(client: Client): ExerciseService {
  return {
    async listCustom() {
      const { data, error } = await client
        .from('exercises')
        .select('id, name, equipment_type, body_part, muscle, aliases')
        .not('user_id', 'is', null)
        .order('name', { ascending: true });
      if (error) return failure(error);
      const parsed = z.array(RowSchema).safeParse(data);
      if (!parsed.success) return { status: 'error', reason: 'unknown' };
      const rows = parsed.data.map((row) => ({
        id: row.id,
        name: row.name,
        equipmentType: row.equipment_type,
        bodyPart: row.body_part,
        muscle: row.muscle,
        aliases: row.aliases,
      }));
      try {
        return { status: 'ok', value: parseExercises(rows, 'custom') };
      } catch {
        // A row the app's own rules refuse (a name too long, a repeated alias) is a bad answer, not a crash.
        return { status: 'error', reason: 'unknown' };
      }
    },

    async create(userId, exerciseId, input) {
      const { error } = await client.from('exercises').upsert(
        {
          id: exerciseId,
          user_id: userId,
          name: input.name,
          equipment_type: input.equipmentType,
          body_part: input.bodyPart,
          aliases: input.aliases,
        },
        { onConflict: 'id' },
      );
      return error ? failure(error) : { status: 'ok', value: undefined };
    },
  };
}

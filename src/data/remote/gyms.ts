import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Gym, GymInput } from '../../domain/gyms';
import type { GymResult, GymService } from '../../features/gyms/types';
import { failure } from './failure';

type Client = Pick<SupabaseClient, 'from'>;

// Postgres returns `numeric` as text through PostgREST in some setups and as a number in others.
// Not z.coerce: that would turn null, '' or true into a weight.
const Kg = z.union([
  z.number(),
  z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .transform(Number),
]);

const GymRowSchema = z.object({
  id: z.string(),
  default_bar_kg: Kg,
  gym_bars: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      weight_kg: Kg,
      kind: z.enum(['ez_bar', 'smith', 'other']),
    }),
  ),
});

const ok = <T>(value: T): GymResult<T> => ({ status: 'ok', value });

function gymRow(userId: string, id: string, input: GymInput) {
  // The name column keeps its default ('My gym'): there is one gym, so it has no name of its own.
  return { id, user_id: userId, default_bar_kg: input.barbellKg };
}

function barRows(userId: string, gymId: string, bars: GymInput['bars']) {
  return bars.map((bar) => ({
    id: bar.id ?? crypto.randomUUID(),
    user_id: userId,
    gym_id: gymId,
    name: bar.name,
    weight_kg: bar.weightKg,
    kind: bar.kind,
  }));
}

export function createSupabaseGymService(client: Client): GymService {
  return {
    async get() {
      const { data, error } = await client
        .from('gyms')
        .select('id, default_bar_kg, gym_bars(id, name, weight_kg, kind)')
        .order('name', { referencedTable: 'gym_bars', ascending: true })
        .limit(1);
      if (error) return failure(error);
      const parsed = z.array(GymRowSchema).safeParse(data);
      if (!parsed.success) return { status: 'error', reason: 'unknown' };
      const row = parsed.data[0];
      if (!row) return ok(null);
      const gym: Gym = {
        id: row.id,
        barbellKg: row.default_bar_kg,
        bars: row.gym_bars.map((bar) => ({
          id: bar.id,
          name: bar.name,
          weightKg: bar.weight_kg,
          kind: bar.kind,
        })),
      };
      return ok(gym);
    },

    async save(userId, gymId, input) {
      const gym = await client
        .from('gyms')
        .upsert(gymRow(userId, gymId, input), { onConflict: 'id' });
      if (gym.error) return failure(gym.error);

      const existing = await client.from('gym_bars').select('id').eq('gym_id', gymId);
      if (existing.error) return failure(existing.error);
      const kept = new Set(input.bars.flatMap((bar) => (bar.id ? [bar.id] : [])));
      const gone = ((existing.data ?? []) as { id: string }[])
        .map((row) => row.id)
        .filter((id) => !kept.has(id));
      // Removed bars go first, so a bar that takes over a name or kind does not collide with its predecessor.
      if (gone.length > 0) {
        const removed = await client.from('gym_bars').delete().eq('gym_id', gymId).in('id', gone);
        if (removed.error) return failure(removed.error);
      }
      if (input.bars.length > 0) {
        const bars = await client
          .from('gym_bars')
          .upsert(barRows(userId, gymId, input.bars), { onConflict: 'id' });
        if (bars.error) return failure(bars.error);
      }
      return ok(undefined);
    },
  };
}

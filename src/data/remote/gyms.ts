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
  name: z.string(),
  default_bar_kg: Kg,
  is_default: z.boolean(),
  created_at: z.string(),
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
  return { id, user_id: userId, name: input.name, default_bar_kg: input.barbellKg };
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
    async list() {
      const { data, error } = await client
        .from('gyms')
        .select(
          'id, name, default_bar_kg, is_default, created_at, gym_bars(id, name, weight_kg, kind)',
        )
        .order('created_at', { ascending: true })
        .order('name', { referencedTable: 'gym_bars', ascending: true });
      if (error) return failure(error);
      const parsed = z.array(GymRowSchema).safeParse(data);
      if (!parsed.success) return { status: 'error', reason: 'unknown' };
      const gyms: Gym[] = parsed.data.map((row) => ({
        id: row.id,
        name: row.name,
        barbellKg: row.default_bar_kg,
        isDefault: row.is_default,
        createdAt: row.created_at,
        bars: row.gym_bars.map((bar) => ({
          id: bar.id,
          name: bar.name,
          weightKg: bar.weight_kg,
          kind: bar.kind,
        })),
      }));
      return ok(gyms);
    },

    async create(userId, id, input, makeDefault) {
      const gym = await client
        .from('gyms')
        .upsert({ ...gymRow(userId, id, input), is_default: makeDefault }, { onConflict: 'id' });
      if (gym.error) return failure(gym.error);
      if (input.bars.length > 0) {
        const bars = await client
          .from('gym_bars')
          .upsert(barRows(userId, id, input.bars), { onConflict: 'id' });
        if (bars.error) return failure(bars.error);
      }
      return ok(undefined);
    },

    async update(userId, gymId, input) {
      const gym = await client
        .from('gyms')
        .update({ name: input.name, default_bar_kg: input.barbellKg })
        .eq('id', gymId);
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

    async remove(gymId) {
      const { error } = await client.from('gyms').delete().eq('id', gymId);
      return error ? failure(error) : ok(undefined);
    },

    async setDefault(gymId) {
      // Two statements, not one: the one-default rule is checked row by row, so swapping in a single
      // update fails for some row orders (see ADR-009).
      const cleared = await client
        .from('gyms')
        .update({ is_default: false })
        .eq('is_default', true)
        .neq('id', gymId);
      if (cleared.error) return failure(cleared.error);
      const set = await client.from('gyms').update({ is_default: true }).eq('id', gymId);
      return set.error ? failure(set.error) : ok(undefined);
    },
  };
}

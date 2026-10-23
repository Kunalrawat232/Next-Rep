import { z } from 'zod';
import type { Gym } from '../../domain/gyms';
import { BAR_KG_RANGE } from '../../domain/schemas';
import type { GymSnapshot } from './types';

const finite = z.number().min(BAR_KG_RANGE.min).max(BAR_KG_RANGE.max);
const BarShape = z.object({
  id: z.string(),
  name: z.string(),
  weightKg: finite,
  kind: z.enum(['ez_bar', 'smith', 'other']),
});
// Copies saved before the name and the default flag were removed still parse: extra fields are dropped.
const SnapshotShape = z.object({ barbellKg: finite, bars: z.array(BarShape) });
const GymShape = SnapshotShape.extend({ id: z.string() });

/** What was saved on the device is read back with a check: a damaged copy is treated as missing, never trusted. */
export function readGymSnapshot(value: unknown): GymSnapshot | null {
  const parsed = SnapshotShape.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** `undefined` for a damaged copy; `null` is a valid copy that says there is no gym. */
export function readCachedGym(value: unknown): Gym | null | undefined {
  if (value === null) return null;
  const parsed = GymShape.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

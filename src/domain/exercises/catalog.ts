import { z } from 'zod';
import { BODY_PARTS, EQUIPMENT_TYPES } from '../schemas';
import { nameKey } from '../text';
import type { Exercise, ExerciseTier } from '.';
import { MUSCLES } from './muscles';

const ExerciseRowSchema = z.object({
  id: z.uuid(),
  name: z
    .string()
    .refine((name) => nameKey(name) !== '', 'Name is blank')
    .pipe(z.string().min(1).max(80)),
  equipmentType: z.enum(EQUIPMENT_TYPES),
  bodyPart: z.enum(BODY_PARTS),
  muscle: z.enum(MUSCLES).nullable(),
  aliases: z
    .array(
      z
        .string()
        .refine((alias) => nameKey(alias) !== '', 'Alias is blank')
        .pipe(z.string().min(1).max(60)),
    )
    .max(20)
    .refine((aliases) => new Set(aliases.map(nameKey)).size === aliases.length, 'Aliases repeat'),
});

/** The list as a whole: one id, and one name, per exercise. */
const ExerciseListSchema = z.array(ExerciseRowSchema).superRefine((rows, ctx) => {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const key = nameKey(row.name);
    if (ids.has(row.id) || names.has(key))
      ctx.addIssue({ code: 'custom', message: `Duplicate exercise: ${row.name}`, path: [index] });
    ids.add(row.id);
    names.add(key);
  }
});

/** Checks a list of exercises read from JSON or the database, and marks where it came from. */
export function parseExercises(raw: unknown, tier: ExerciseTier): Exercise[] {
  return ExerciseListSchema.parse(raw).map((row) => ({ ...row, tier }));
}

// Shared domain types and Zod schemas for sets and workouts.
// They mirror the database constraints in supabase/migrations/0001_init.sql.
import { z } from 'zod';
import { roundKg } from './weight';

export const EQUIPMENT_TYPES = [
  'barbell',
  'ez_bar',
  'smith',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
] as const;
export const BODY_PARTS = ['upper', 'lower', 'core'] as const;
export const UNITS = ['kg', 'lb'] as const;
export const INPUT_MODES = ['total', 'per_side', 'tap'] as const;
export const SET_SOURCES = ['voice', 'tap', 'gemini'] as const;

export const EquipmentTypeSchema = z.enum(EQUIPMENT_TYPES);
export const BodyPartSchema = z.enum(BODY_PARTS);
export const UnitSchema = z.enum(UNITS);
export const InputModeSchema = z.enum(INPUT_MODES);
export const SetSourceSchema = z.enum(SET_SOURCES);

export type EquipmentType = z.infer<typeof EquipmentTypeSchema>;
export type Unit = z.infer<typeof UnitSchema>;
export type InputMode = z.infer<typeof InputModeSchema>;

/** Equipment whose logged weight includes a bar that comes from the gym profile (ADR-002). */
export const BAR_EQUIPMENT = [
  'barbell',
  'ez_bar',
  'smith',
] as const satisfies readonly EquipmentType[];

export function usesBar(equipment: EquipmentType): boolean {
  return (BAR_EQUIPMENT as readonly EquipmentType[]).includes(equipment);
}

export const REPS_RANGE = { min: 1, max: 100 } as const;
export const TOTAL_KG_RANGE = { min: 0, max: 500 } as const;
export const BAR_KG_RANGE = { min: 0, max: 100 } as const;
export const PER_SIDE_KG_RANGE = { min: 0, max: 250 } as const;

const timestamp = z.iso.datetime({ offset: true });

export const SetSchema = z
  .object({
    id: z.uuid(), // client-generated for idempotent upserts
    workoutId: z.uuid(),
    exerciseId: z.uuid(),
    totalKg: z.number().min(TOTAL_KG_RANGE.min).max(TOTAL_KG_RANGE.max),
    barKg: z.number().min(BAR_KG_RANGE.min).max(BAR_KG_RANGE.max).nullable(),
    perSideKg: z.number().min(PER_SIDE_KG_RANGE.min).max(PER_SIDE_KG_RANGE.max).nullable(),
    inputMode: InputModeSchema,
    reps: z.number().int().min(REPS_RANGE.min).max(REPS_RANGE.max),
    source: SetSourceSchema,
    rawTranscript: z.string().max(500).nullable(),
    loggedAt: timestamp, // device time
  })
  .refine((s) => s.inputMode !== 'per_side' || (s.barKg !== null && s.perSideKg !== null), {
    message: 'per_side input needs both barKg and perSideKg',
    path: ['perSideKg'],
  })
  .refine(
    // Plain arithmetic, not totalFromPerSide: it throws on negative input, and a schema must
    // report bad data as a failed parse instead of throwing.
    (s) =>
      s.barKg === null ||
      s.perSideKg === null ||
      roundKg(s.totalKg) === roundKg(s.barKg + 2 * s.perSideKg),
    { message: 'totalKg must equal barKg + 2 × perSideKg', path: ['totalKg'] },
  );
export type LoggedSet = z.infer<typeof SetSchema>;

export const WorkoutSchema = z
  .object({
    id: z.uuid(), // client-generated
    gymId: z.uuid().nullable(),
    startedAt: timestamp,
    endedAt: timestamp.nullable(),
    notes: z.string().max(1000).nullable(),
  })
  .refine((w) => w.endedAt === null || Date.parse(w.endedAt) >= Date.parse(w.startedAt), {
    message: 'endedAt must not be before startedAt',
    path: ['endedAt'],
  });
export type Workout = z.infer<typeof WorkoutSchema>;

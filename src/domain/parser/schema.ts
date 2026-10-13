// ParseResult: the single shape produced by the local parser and by the Gemini fallback.
// Defined once here and shared by the client, /api/parse and tests (see docs/architecture/api-contracts.md).
import { z } from 'zod';
import { UnitSchema } from '../schemas.js';

export const INTENTS = [
  'log_set',
  'repeat_last',
  'undo_last',
  'edit_last',
  'rest_timer',
  'unknown',
] as const;
export const WEIGHT_MODES = ['total', 'per_side', 'unspecified'] as const;

export const ParseResultSchema = z.object({
  intent: z.enum(INTENTS),
  exerciseId: z.uuid().optional(), // matched canonical exercise
  exerciseMatchScore: z.number().min(0).max(1).optional(),
  weight: z
    .object({
      value: z.number().nonnegative(),
      unit: UnitSchema,
      mode: z.enum(WEIGHT_MODES),
    })
    .optional(),
  reps: z.number().int().positive().optional(), // range checks belong to the validators
  restSeconds: z.number().int().positive().optional(),
  confidence: z.number().min(0).max(1),
  issues: z.array(z.string()), // machine-readable reasons, e.g. 'NO_REPS'
  rawTranscript: z.string(),
  source: z.enum(['parser', 'gemini']),
});
export type ParseResult = z.infer<typeof ParseResultSchema>;

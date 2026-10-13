// The shapes of the Gemini fallback: what the app sends to /api/parse and what Gemini may answer.
// Shared by the client, the function and the tests. Gemini's answer is untrusted: it is only ever
// read through GeminiOutputSchema, mapped by fromGemini and then validated like any other set.
import { z } from 'zod';
import { UnitSchema } from '../schemas';
import { INTENTS, WEIGHT_MODES } from './schema';

/** Longest transcript the function accepts: the same limit the parser has (PARSER_CONFIG.maxChars). */
export const GEMINI_MAX_TRANSCRIPT = 300;
const NAME_MAX = 80;

const NameSchema = z.string().trim().min(1).max(NAME_MAX);

/** What the app sends. No user id, email or exercise ids: only what Gemini needs to fill a gap. */
export const ParseRequestSchema = z.strictObject({
  transcript: z.string().trim().min(1).max(GEMINI_MAX_TRANSCRIPT),
  context: z.strictObject({
    unit: UnitSchema,
    currentExercise: NameSchema.optional(),
    lastSet: z
      .strictObject({
        exercise: NameSchema,
        weight: z.number().nonnegative().max(100_000),
        unit: UnitSchema,
        reps: z.number().int().positive().max(1000),
      })
      .optional(),
  }),
});
export type ParseRequest = z.infer<typeof ParseRequestSchema>;

/** What Gemini is asked to produce. Its own confidence is read but never trusted. */
export const GeminiOutputSchema = z.object({
  intent: z.enum(INTENTS),
  exerciseName: NameSchema.nullable(),
  weight: z
    .object({
      value: z.number().nonnegative().max(100_000),
      unit: UnitSchema,
      mode: z.enum(WEIGHT_MODES),
    })
    .nullable(),
  reps: z.number().int().positive().max(1000).nullable(),
  restSeconds: z.number().int().positive().max(100_000).nullable(),
  confidence: z.number().min(0).max(1),
  issues: z.array(z.string().max(40)).max(10),
});
export type GeminiOutput = z.infer<typeof GeminiOutputSchema>;

/** What the function answers: Gemini's output, or that no answer is available (never an error the user sees). */
export const ParseResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), result: GeminiOutputSchema }),
  z.object({ status: z.literal('unavailable') }),
]);
export type ParseResponse = z.infer<typeof ParseResponseSchema>;

export const GEMINI_UNKNOWN: GeminiOutput = {
  intent: 'unknown',
  exerciseName: null,
  weight: null,
  reps: null,
  restSeconds: null,
  confidence: 0,
  issues: ['NOT_A_COMMAND'],
};

/** Reads Gemini's text as an output: code fences stripped, JSON parsed, shape checked. Anything else is "unknown". */
export function readGeminiText(text: string): GeminiOutput {
  const body = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const parsed = GeminiOutputSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : GEMINI_UNKNOWN;
  } catch {
    return GEMINI_UNKNOWN;
  }
}

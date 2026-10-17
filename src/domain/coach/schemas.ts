// The shapes of the AI coach: what the app sends to /api/coach and what comes back. Shared by the client, the
// function and the tests. Relative imports carry `.js`: the function runs as native ES modules (see CLAUDE.md).
import { z } from 'zod';
import { UnitSchema } from '../schemas.js';

/** The longest question the function accepts. */
export const COACH_QUESTION_MAX = 500;
/** How many earlier turns of the chat go along with a question. */
export const COACH_HISTORY_MAX = 8;
/** The longest reply the app keeps or shows. */
export const COACH_REPLY_MAX = 2000;

const Name = z.string().trim().min(1).max(40);

/**
 * What the coach is told about the user's training. It holds no email, name, account id or exercise id: only
 * exercise names, numbers in the user's unit and how long ago. Small on purpose (it is sent to Google's free
 * tier, whose prompts may be used to improve its products).
 */
export const CoachContextSchema = z.strictObject({
  unit: UnitSchema,
  /** The last few finished workouts, newest first. */
  sessions: z
    .array(
      z.strictObject({
        daysAgo: z.number().int().min(0).max(3650),
        exercises: z
          .array(
            z.strictObject({
              name: Name,
              sets: z.number().int().positive().max(200),
              topWeight: z.number().nonnegative().max(2000),
              topReps: z.number().int().positive().max(1000),
            }),
          )
          .max(8),
      }),
    )
    .max(3),
  /** What Next Rep's own rules suggest for the next session. The coach must use these numbers, not invent. */
  suggestion: z
    .strictObject({
      exercise: Name,
      weight: z.number().nonnegative().max(2000),
      reps: z.number().int().positive().max(1000),
    })
    .optional(),
});
export type CoachContext = z.infer<typeof CoachContextSchema>;

export const CoachTurnSchema = z.strictObject({
  role: z.enum(['user', 'coach']),
  text: z.string().trim().min(1).max(COACH_REPLY_MAX),
});
export type CoachTurn = z.infer<typeof CoachTurnSchema>;

export const CoachRequestSchema = z.strictObject({
  history: z.array(CoachTurnSchema).max(COACH_HISTORY_MAX),
  question: z.string().trim().min(1).max(COACH_QUESTION_MAX),
  context: CoachContextSchema.optional(),
});
export type CoachRequest = z.infer<typeof CoachRequestSchema>;

/** What the function answers. `limited` means this user asked too much for now. */
export const CoachResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), text: z.string().min(1).max(COACH_REPLY_MAX) }),
  z.object({ status: z.literal('limited') }),
  z.object({ status: z.literal('unavailable') }),
]);
export type CoachResponse = z.infer<typeof CoachResponseSchema>;

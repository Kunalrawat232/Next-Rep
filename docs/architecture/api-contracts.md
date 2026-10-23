# API contracts

Status: built (2026-10-13), verified once against the live Gemini API on a preview deploy. `api/parse.ts` wires the real clients into the handler in `api/_lib/parse.ts` (tests in `api/_lib/parse.test.ts` use fakes). The shapes live in `src/domain/parser/gemini.ts`; the app maps Gemini's answer to a `ParseResult` with `fromGemini`.

## `POST /api/parse` (Gemini fallback)

Vercel serverless function in `api/parse.ts`. See [ADR-003](decisions/003-gemini-as-fallback-only.md) and [Gemini prompts](../ai/gemini-prompts.md).

**Only called when** the local parser's confidence is below the threshold (config, start at 0.8) AND the device is online.

### Request

```ts
{
  transcript: string;                 // length-limited
  context: {
    currentExercise?: string;
    lastSet?: { /* exercise, weight, reps */ };
    unit: 'kg' | 'lb';
  };
}
```

Send **no personal data** (no email, name or user id).

### Auth

The function requires the user's Supabase access token (`Authorization: Bearer ...`) and verifies it, so the endpoint cannot be abused anonymously. Verification uses the project's JWKS (`https://<project>.supabase.co/auth/v1/.well-known/jwks.json`) with `supabase.auth.getClaims()`, which works for asymmetric and legacy keys alike (`jose` is not used). No JWT shared secret is needed in env.

### Response

`{ status: 'ok', result }`, where `result` is Gemini's output as the schema `GeminiOutputSchema` allows it (`intent`, `exerciseName`, `weight`, `reps`, `restSeconds`, `confidence`, `issues`; anything that does not fit becomes `intent: 'unknown'`), or `{ status: 'unavailable' }`. The function does not know the user's exercise ids: the app matches `exerciseName` against its own list with the parser's matcher and builds the `ParseResult` (`source: 'gemini'`), and Gemini's `confidence` can only lower the app's own score. HTTP codes: 200 ok, 400 invalid request, 401 no or bad token, 413 body over 2000 characters, 429 rate limited, 503 Gemini or Supabase unavailable; the app treats every non-200 as "no answer".

- Strip code fences, parse JSON, validate with Zod. Invalid output is treated as `unknown`.
- Timeout about 8 s. On HTTP 429 or any error return `{ status: 'unavailable' }` and the UI falls back to manual confirmation. Logging is never blocked.
- Per-user rate limit through `consume_rate_limit` (scope `parse`): 10 per minute and 60 per hour (the per-user windows go up to one hour). Over the limit answers 429 and the app keeps tap logging.
- **Daily ceiling (both endpoints):** `consume_daily_ceiling` counts every model call of the whole project per UTC day: 1000 a day, fixed in the database function (migration 0005), plus 100 an hour per account. Over it, `/api/parse` answers 429 and `/api/coach` answers `limited`. This is the one human-readable source of the ceiling numbers.
- Never log full transcripts together with user identifiers.

### Env vars (server only, never prefixed with `VITE_`)

`GEMINI_API_KEY`, `GEMINI_MODEL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

## `POST /api/coach` (the AI coach)

Vercel function in `api/coach.ts`; the handler and its tests are in `api/_lib/coach.ts`. See [ADR-017](decisions/017-ai-coach.md).

- **Auth:** `Authorization: Bearer <access token>`, checked with `getClaims`, like `/api/parse`.
- **Request** (`CoachRequestSchema`, strict, no extra fields): `question` (1 to 500 characters), `history` (at most 8 turns, each `{role: 'user' | 'coach', text}` of up to 2000 characters), and an optional `context` (`CoachContextSchema`: the unit, up to 3 recent workouts as exercise names with sets, top weight and reps, and the rule-based suggestion). No ids or account details.
- **Response:** `{status: 'ok', text}` (at most 2000 characters), `{status: 'off_topic'}` (HTTP 200: the question is not about gym training or diet; the app shows its own fixed refusal), `{status: 'limited'}` (HTTP 429) or `{status: 'unavailable'}` (503). Also 401 (no or bad token), 400 (invalid request) and 413 (body over 24,000 characters).
- **Limits:** 5 a minute and 20 an hour per user through `consume_rate_limit`, counted separately from `/api/parse` (scope `coach`), plus the daily ceiling above, shared with `/api/parse` (answers `limited` when it is used up). Timeouts: Gemini 12 s then the second provider 8 s when both are set up, 20 s for Gemini alone; the app waits 25 s. The reply is capped at 1200 tokens (`api/coach.ts`), 1500 for the second provider (`api/_lib/fallbackProvider.ts`).
- **Env:** `GEMINI_API_KEY`, `COACH_MODEL` (optional, else `GEMINI_MODEL`), `SUPABASE_URL`, `SUPABASE_ANON_KEY`; optional second provider `FALLBACK_API_KEY`, `FALLBACK_BASE_URL` (https), `FALLBACK_MODEL` (all three or none, see [ADR-018](decisions/018-coach-second-provider.md)): asked once when Gemini fails, cannot be read, or its day of calls is used up.
- **Never logged:** questions and replies (only the kind of failure).

## `ParseResult` schema

```ts
type ParseResult = {
  intent: 'log_set' | 'repeat_last' | 'undo_last' | 'edit_last' | 'rest_timer' | 'unknown';
  exerciseId?: string; // matched canonical exercise
  exerciseMatchScore?: number;
  weight?: { value: number; unit: 'kg' | 'lb'; mode: 'total' | 'per_side' | 'unspecified' };
  reps?: number;
  restSeconds?: number;
  confidence: number; // 0..1, computed from match scores + completeness
  issues: string[]; // machine-readable reasons, e.g. 'NO_REPS', 'AMBIGUOUS_WEIGHT_MODE'
  rawTranscript: string;
  source: 'parser' | 'gemini';
};
```

Defined once as a Zod schema in `src/domain/parser/` and shared by the client parser, the API and tests.

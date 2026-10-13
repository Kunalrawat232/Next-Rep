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
- Per-user rate limit through `consume_rate_limit`: 10 per minute and 60 per hour (the database function allows windows up to one hour, so there is no daily window). Over the limit answers 429 and the app keeps tap logging.
- Never log full transcripts together with user identifiers.

### Env vars (server only, never prefixed with `VITE_`)

`GEMINI_API_KEY`, `GEMINI_MODEL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

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

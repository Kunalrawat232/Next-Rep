# API contracts

Status: planned (Phase 3), not built yet. `api/parse.ts` is a stub that answers 501; `src/domain/parser/` holds only the `ParseResult` schema; there are no `/api/parse` tests. Everything below is the intended contract.

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

The function requires the user's Supabase access token (`Authorization: Bearer ...`) and verifies it, so the endpoint cannot be abused anonymously. Verification uses the project's JWKS (`https://<project>.supabase.co/auth/v1/.well-known/jwks.json`) with `jose`, the method the Supabase docs recommend for asymmetric signing keys, or `supabase.auth.getClaims()`. No JWT shared secret is needed in env.

### Response

A `ParseResult` (below), or `{ status: 'unavailable' }`.

- Strip code fences, parse JSON, validate with Zod. Invalid output is treated as `unknown`.
- Timeout about 8 s. On HTTP 429 or any error return `{ status: 'unavailable' }` and the UI falls back to manual confirmation. Logging is never blocked.
- Per-user rate limit (a few calls per minute) backed by the `api_rate_limits` table.
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

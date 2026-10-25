# API contracts

Status: `/api/parse` is built and was verified once against the live Gemini API on a preview deploy. `/api/parse` wires the real clients into the handler in `api/_lib/parse.ts` (tests in `api/_lib/parse.test.ts` use fakes). The shapes live in `src/domain/parser/gemini.ts`; the app maps Gemini's answer to a `ParseResult` with `fromGemini`. `/api/coach` and `/api/transcribe` are built and tested with fakes; `/api/transcribe` was checked on an iPhone 15 in Safari and Chrome against the deployed site.

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
- **Daily ceiling (all three model endpoints):** `consume_daily_ceiling` counts every model call of the whole project per UTC day: 1000 a day, fixed in the database function (migration 0005), plus 100 an hour per account. Over it, `/api/parse` answers 429, `/api/coach` answers `limited` and `/api/transcribe` answers 429 (`unavailable`). This is the one human-readable source of the ceiling numbers.
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

## `POST /api/transcribe` (cloud speech-to-text)

Vercel function in `api/transcribe.ts`; the handler and its tests are in `api/_lib/transcribe.ts`, the Groq provider in `api/_lib/transcribeProvider.ts`. The shared schema and helpers are in `src/domain/parser/transcribe.ts`. See [ADR-019](decisions/019-cloud-speech-to-text.md). Used only where the browser's own recogniser fails (the client side is in `src/features/voice/useVoiceInput.ts`).

- **Request:** the raw audio bytes as the body (not JSON, not multipart). `Content-Type` is `audio/webm`, `audio/mp4`, `audio/ogg` or `audio/wav`, codec parameters allowed (for example `audio/webm;codecs=opus`). `Authorization: Bearer <access token>`. The app records at most 8 s (`MAX_RECORDING_MS`).
- **Checks, in this order:**
  1. Token missing or not valid (`getClaims`): 401 `{status: 'unauthorized'}`; a failure of the check itself: 503.
  2. Content type not in the list: 400 `{status: 'invalid'}`.
  3. Size: a declared `content-length` over 1,000,000 bytes is refused before the body is read (413); a body under 1000 bytes is 400; over the maximum is 413. All `{status: 'invalid'}`.
  4. Per-user limits through `consume_rate_limit`, scope `transcribe`: 10 a minute and 60 an hour. Over either: 429 `{status: 'unavailable'}`.
  5. Project-wide daily ceiling through `consume_daily_ceiling`, scope `gemini` (shared with `/api/parse` and `/api/coach`, so voice counts toward the same 1000 a day and 100 an hour per account; no schema change). Over it: 429 `{status: 'unavailable'}`.
  6. The speech service (Groq). Nothing is sent before the checks above pass.
- **Response:** 200 `{status: 'ok', text}`. `text` is cleaned (control characters removed, spaces collapsed, at most 300 characters) and may be `''` when nothing was said. Any failure of the speech service, or missing configuration, is 503 `{status: 'unavailable'}`. The service gets 10 s. Every answer carries `Cache-Control: no-store`.
- **Provider:** Groq Whisper, `whisper-large-v3-turbo` by default, at `${FALLBACK_BASE_URL}/audio/transcriptions`. Sent: language `en`, temperature 0, `verbose_json`, and a fixed vocabulary prompt of gym words with no example sentence and no digits. If every returned segment has `no_speech_prob` above 0.6 the text is dropped (`''`).
- **Env (server only):** `FALLBACK_API_KEY`, `FALLBACK_BASE_URL` (https only; the same key and address as the coach's second provider), `TRANSCRIBE_MODEL` (optional), `SUPABASE_URL`, `SUPABASE_ANON_KEY`. `FALLBACK_MODEL` is not needed. With the key or address missing, the endpoint answers 503 and the app uses only the browser's recogniser.
- **Never logged:** the audio and the words. The log keeps only the kind of failure. The service's own error text is not logged either, because it can repeat what was said.

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

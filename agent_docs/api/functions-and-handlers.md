# Vercel functions and handlers

There is no custom backend: the browser talks to Supabase directly with RLS as the boundary (see [supabase-client-and-errors.md](supabase-client-and-errors.md)). Only **three** Vercel functions exist, all behind the user's access token.

| File                | Function                                                                          | Handler and tests                                                               |
| ------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `api/parse.ts`      | `POST /api/parse`: Gemini reads a spoken phrase the local parser was unsure about | `api/_lib/parse.ts` `handleParse`, prompt in `api/_lib/prompt.ts`               |
| `api/coach.ts`      | `POST /api/coach`: the AI coach                                                   | `api/_lib/coach.ts` `handleCoach`, see [coach.md](coach.md)                     |
| `api/transcribe.ts` | `POST /api/transcribe`: cloud speech-to-text (raw audio in, words out)            | `api/_lib/transcribe.ts` `handleTranscribe`, see [transcribe.md](transcribe.md) |

## The pattern

- `api/<name>.ts` only **wires** the real services (Supabase, Gemini, the optional second provider) into a handler in `api/_lib/`. The handler takes **injected dependencies** (`verify`, `consume`, `ceiling`, `ask`, `fallback` for the coach, `transcribe` for voice), so its tests (`api/_lib/*.test.ts`) use fakes and never touch the network.
- Shared Supabase helpers are in `api/_lib/supabase.ts`: `verifyToken` (checks the token with `getClaims`), `consumeLimit(token, scope, windowSeconds)` (the per-user rate limit, scope `parse`, `coach` or `transcribe`) and `consumeModelCall(token)` (the project's daily ceiling of model calls). The database side is in [rate-limits-and-ceiling.md](../database/rate-limits-and-ceiling.md).
- **Order of checks** (parse and coach): bearer token present and valid, then body size (a declared `content-length` over 4 times the limit is refused before reading, then the text length), JSON, the strict Zod request schema, then the per-user limits, then (coach only) the off-topic prefilter, then the daily ceiling, then the model. Transcribe has its own order (token, content type, size, limits, ceiling, speech service) and reads raw audio, not JSON; see [transcribe.md](transcribe.md).
- **Answers** are small JSON with `Cache-Control: no-store`: 401 `{status:'unauthorized'}`, 400 or 413 `{status:'invalid'}`, and then:
  - parse: 200 `{status:'ok', result}`, 429 or 503 `{status:'unavailable'}`.
  - coach: 200 `{status:'ok', text}` or `{status:'off_topic'}`, 429 `{status:'limited'}`, 503 `{status:'unavailable'}`.
  - transcribe: 200 `{status:'ok', text}` (text may be empty), 429 or 503 `{status:'unavailable'}`.
- **Never log** the question, the transcript or the reply. Logs carry only the step that failed, the kind of error and an HTTP status.
- **Limits:** per-user limits are `LIMITS` in `api/_lib/parse.ts` and `COACH_LIMITS` in `api/_lib/coach.ts`; the numbers, and the daily ceiling both functions count against, are in [rate-limits-and-ceiling.md](../database/rate-limits-and-ceiling.md). Parse gives Gemini 8 s (`GEMINI_TIMEOUT_MS`).
- **Parse request:** `transcript` up to 300 characters and a `context` of `{unit, currentExercise?, lastSet?}` (`src/domain/parser/gemini.ts`). Gemini answers in JSON mode (temperature 0, up to 300 output tokens); the answer is checked against `GeminiOutputSchema` and, on the client, mapped with `fromGemini` and then goes through the same `validateSet` as any phrase. The client (`src/data/remote/parse.ts`, 10 s) shows what it read on the confirm card, and never stores anything without the user's Log set.

## Rules that bite

- **`api/` runs as native ES modules on Vercel.** Every relative import in the function and in the `src/` files it reaches needs a `.js` extension (`src/domain/coach/schemas.ts` and `clean.ts` follow this; `api/_lib/imports.test.ts` checks it). The editor and Vite do not complain; the deployed function crashes.
- A new endpoint: add `api/<name>.ts` (compiled by `tsconfig.api.json`), verify the token, validate input and output with Zod, rate-limit through `consume_rate_limit`, return the same error shapes, document it in `docs/architecture/api-contracts.md`.
- **Dev server:** `npm run dev` serves `/api/parse`, `/api/coach` and `/api/transcribe` itself through `vite.devApi.ts` (dev only; never in a build or the tests). It reads only these settings from `.env.local`: `GEMINI_API_KEY`, `GEMINI_MODEL`, `COACH_MODEL`, `FALLBACK_API_KEY`, `FALLBACK_BASE_URL`, `FALLBACK_MODEL`, `TRANSCRIBE_MODEL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (the browser's `VITE_` Supabase values stand in when the server-only ones are missing), warns about missing ones by name only, and needs a restart after a change. Without it the dev server answers `/api/*` with the app's own page. Test: `tests/design/devApi.test.ts`.
- `npm run check:coach` (the developer runs it; it loads `.env.local`) prints PASS or FAIL for the Gemini model, the second provider if set, sign-in and the rate limit, never a key or a reply.
- Agents must not run commands that load `.env.local` (the list is in [CLAUDE.md](../../CLAUDE.md) section 5).

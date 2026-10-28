# Security checklist

Status: `[x]` = in place, `[ ]` = to do (with when it is due, where planned). The AI coach, its second provider (Groq) and the project-wide daily ceiling were reviewed in the security audit (see the [AI QA report](../qa/ai-qa-report.md)); its fixes are in [ADR-017](../architecture/decisions/017-ai-coach.md).

- [x] `.env` and `.env.*` (except `.env.example`) in `.gitignore` **before the first commit**.
- [x] Gitleaks runs as a pre-commit hook (`.githooks/pre-commit`, enabled by the npm `prepare` script) and in CI (`.github/workflows/ci.yml`, full-history scan). The hook was verified to block a fake token.
- [x] `.claude/settings.json` denies the AI assistant reading `.env`, `.env.local`, `.env.*.local`, `.env.development`, `.env.production`, `.env.test` and every `.env.*` file at the root (`Read(./.env.*)`). The working-tree version of that file also covers `.env.example`, so the assistant cannot read it either; whether to narrow the rule is open. _(The [guardrails](../ai/guardrails.md) and the [threat model](threat-model.md) link here for this list.)_
- [x] Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are exposed to the client (the anon key is designed to be public; RLS is what protects data). The service role key is **never** used in the client and is not needed at all for the MVP. _(Enforced in `src/data/remote/env.ts`, which rejects secret and service_role keys; the built bundle was checked for the project host and key.)_
- [x] RLS enabled on every table (every table in the migrations, including `api_daily_totals`), with tests proving isolation. _(Update: `workouts` and `sets` isolation, including changing a row's owner, pointing a set at another user's workout and the `anon` role, is covered in `tests/db/log.test.ts` and `tests/integration/log.test.ts`.)_ _(All tables are covered by `npm run test:db` in PGlite. On the hosted project, `npm run test:integration` proved the `profiles` rules: own row only, other users hidden, cross-user insert refused with 42501, cross-user update changes nothing, signed-out closed. Hosted tests for later tables were added with each feature; they are run by the developer, not in CI.)_
- [x] `/api/parse` verifies the Supabase JWT, validates input with Zod, limits transcript length, rate-limits per user, counts against the daily ceiling, and never logs transcripts (only the error name). _(Done: covered by `api/_lib/parse.test.ts`; checked once against the live API.)_
- [x] `/api/coach` verifies the Supabase JWT, validates the question and the summary with a strict Zod schema, caps lengths, rate-limits per user, counts against the daily ceiling, never logs questions or replies (`api/_lib/coach.ts` logs only the failing step, the error kind and the status), and the screen shows replies as text only. _(Done: covered by `api/_lib/coach.test.ts`, `coachScope.test.ts`, `fallbackProvider.test.ts` and `src/features/coach`; `npm run check:coach` passed for Gemini and Groq.)_
- [x] All user input validated client-side AND enforced by DB constraints (shared Zod schemas, check constraints in the migrations, `tests/db`).
- [x] No `dangerouslySetInnerHTML`; React escaping only. _(Enforced by review and the coding standards.)_
- [ ] Dependencies kept minimal and pinned; run `npm audit` before submission and document known issues. _(Clean at scaffold: 0 vulnerabilities. Re-run before submission, see the [roadmap](../plans/roadmap.md).)_
- [x] Documented AI-related risks: wrong transcription, hallucinated Gemini output, prompt injection via transcript (mitigated by JSON schema + validators + user confirmation; the parser's injection word list, which turns such text into `unknown` and keeps it from Gemini, is best effort and not a security boundary), free-tier data usage. _(See [threat model](threat-model.md).)_

## Added with the auth work

- [x] The browser key is allowlisted (publishable or anon only); a Vite plugin refuses to run when a secret-looking `VITE_` variable or a bad key is present, and CI fails if a secret-looking key is in `dist/`.
- [x] Security headers in `vercel.json` (frame-ancestors, nosniff, referrer and permissions policy).
- [ ] Full Content Security Policy: not added. The live headers carry only `frame-ancestors 'none'` in the policy, so a fuller one has to be tested on the live address first.
- [x] "Confirm email" switched on in the Supabase dashboard (so sign-up no longer reveals registered addresses, ADR-007), with custom SMTP through Brevo; see the [roadmap](../plans/roadmap.md).
- [x] The Supabase security advisor was read and each notice answered. Fixed: `rls_auto_enable()` was callable by `anon` and `authenticated` (migration 0006). Left on purpose: the three rate-limit and ceiling functions are callable by signed-in users because they count the caller's own requests; the two counter tables have RLS and no policy because only those functions write them.

## Added with cloud speech-to-text (ADR-019)

- [x] `/api/transcribe` verifies the Supabase JWT, refuses a body outside the size limits before reading it (declared length), accepts only the audio types audio/webm, audio/mp4, audio/ogg and audio/wav, applies the per-person limits (`transcribe`) and the daily ceiling, and times out (limits in [API contracts](../architecture/api-contracts.md)). _(Done: covered by `api/_lib/transcribe.test.ts` and `transcribeProvider.test.ts`.)_
- [x] Audio is never stored or logged; the logs keep only the failing step and the error kind, and the service's own error text is not logged (it could repeat what was said). The reply is cleaned (no control characters, length-capped) and the words are shown in the confirm card before anything is saved. _(Done in code and tests, and checked on an iPhone 15 in Safari and Chrome.)_
- [x] The workout screen says the voice is sent to a speech service whenever cloud mode is on. _(Covered by `src/features/workout/voiceCloud.test.tsx`.)_
- [x] The speech service's key is server only (`FALLBACK_API_KEY`, never `VITE_`-prefixed), and the address must be https. _(Done: `api/_lib/transcribeProvider.ts`.)_
- [x] Real iPhone run of the deployed function (Safari and Chrome on an iPhone 15) with the Groq settings in Vercel, checking the notice, the words and that nothing is saved before Log set. _(Done on an iPhone 15 in Safari and Chrome; see the [deployment guide](../delivery/deployment.md).)_

## Supabase-specific traps to check in every schema or policy change

- RLS enabled on every table in an exposed schema; policies use `to authenticated` **and** an ownership predicate (authentication alone is not authorisation).
- `UPDATE` policies have both `USING` and `WITH CHECK`, and an `UPDATE` also needs a `SELECT` policy.
- Never base authorisation on `user_metadata` claims (user-editable).
- Never put the `service_role` key in a client; avoid `SECURITY DEFINER` functions in exposed schemas; views use `security_invoker = true`.
- Run Supabase advisors (`supabase db advisors`) after schema changes.

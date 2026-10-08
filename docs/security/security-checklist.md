# Security checklist

Status as of 2026-10-08 (end of Phase 0 scaffold). `[x]` = in place, `[ ]` = to do (with the phase that delivers it).

- [x] `.env` and `.env.*` (except `.env.example`) in `.gitignore` **before the first commit**.
- [x] Gitleaks runs as a pre-commit hook (`.githooks/pre-commit`, enabled by the npm `prepare` script) and in CI (`.github/workflows/ci.yml`, full-history scan). The hook was verified to block a fake token.
- [x] `.claude/settings.json` denies reading `.env*` files (local env files; `.env.example` stays readable).
- [x] Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are exposed to the client (the anon key is designed to be public; RLS is what protects data). The service role key is **never** used in the client and is not needed at all for the MVP. _(Enforced in `src/data/remote/env.ts`, which rejects secret and service_role keys; the built bundle was checked for the project host and key.)_
- [ ] RLS enabled on every table, with tests proving isolation. _(All tables are covered by `npm run test:db` in PGlite. On the hosted project, `npm run test:integration` proved the `profiles` rules on 2026-10-08: own row only, other users hidden, cross-user insert refused with 42501, cross-user update changes nothing, signed-out closed. Hosted tests for `gyms`, `workouts` and `sets` come with each feature.)_
- [ ] `/api/parse` verifies the Supabase JWT, validates input with Zod, limits transcript length, rate-limits per user, and never logs full transcripts with user identifiers. _(Phase 3.)_
- [ ] All user input validated client-side AND enforced by DB constraints. _(Phase 1 onward.)_
- [ ] No `dangerouslySetInnerHTML`; React escaping only. _(Enforced by review; consider a lint rule.)_
- [ ] Dependencies kept minimal and pinned; run `npm audit` before submission and document known issues. _(Clean at scaffold: 0 vulnerabilities. Re-run in Phase 5.)_
- [ ] Documented AI-related risks: wrong transcription, hallucinated Gemini output, prompt injection via transcript (mitigated by JSON schema + validators + user confirmation), free-tier data usage. _(See [threat model](threat-model.md).)_

## Added with the auth work (2026-10-08)

- [x] The browser key is allowlisted (publishable or anon only); a Vite plugin refuses to run when a secret-looking `VITE_` variable or a bad key is present, and CI fails if a secret-looking key is in `dist/`.
- [x] Security headers in `vercel.json` (frame-ancestors, nosniff, referrer and permissions policy).
- [ ] Full Content Security Policy: test it on a real Vercel preview first. _(Phase 5.)_
- [ ] Switch "Confirm email" on at code freeze so sign-up no longer reveals registered addresses (ADR-007). _(25 Oct.)_

## Supabase-specific traps to check in every schema or policy change

- RLS enabled on every table in an exposed schema; policies use `to authenticated` **and** an ownership predicate (authentication alone is not authorisation).
- `UPDATE` policies have both `USING` and `WITH CHECK`, and an `UPDATE` also needs a `SELECT` policy.
- Never base authorisation on `user_metadata` claims (user-editable).
- Never put the `service_role` key in a client; avoid `SECURITY DEFINER` functions in exposed schemas; views use `security_invoker = true`.
- Run Supabase advisors (`supabase db advisors`) after schema changes.

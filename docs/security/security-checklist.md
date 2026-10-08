# Security checklist

Status as of 2026-10-08 (end of Phase 0 scaffold). `[x]` = in place, `[ ]` = to do (with the phase that delivers it).

- [x] `.env` and `.env.*` (except `.env.example`) in `.gitignore` **before the first commit**.
- [x] Gitleaks runs as a pre-commit hook (`.githooks/pre-commit`, enabled by the npm `prepare` script) and in CI (`.github/workflows/ci.yml`, full-history scan). The hook was verified to block a fake token.
- [x] `.claude/settings.json` denies reading `.env*` files (local env files; `.env.example` stays readable).
- [ ] Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are exposed to the client (the anon key is designed to be public; RLS is what protects data). The service role key is **never** used in the client and is not needed at all for the MVP. _(Phase 1: client wiring.)_
- [ ] RLS enabled on every table, with tests proving isolation. _(Migration written and verified locally in Phase 0 by `npm run test:db` (38 tests in PGlite, which stands in for Supabase); the isolation suite against the hosted project is Phase 1.)_
- [ ] `/api/parse` verifies the Supabase JWT, validates input with Zod, limits transcript length, rate-limits per user, and never logs full transcripts with user identifiers. _(Phase 3.)_
- [ ] All user input validated client-side AND enforced by DB constraints. _(Phase 1 onward.)_
- [ ] No `dangerouslySetInnerHTML`; React escaping only. _(Enforced by review; consider a lint rule.)_
- [ ] Dependencies kept minimal and pinned; run `npm audit` before submission and document known issues. _(Clean at scaffold: 0 vulnerabilities. Re-run in Phase 5.)_
- [ ] Documented AI-related risks: wrong transcription, hallucinated Gemini output, prompt injection via transcript (mitigated by JSON schema + validators + user confirmation), free-tier data usage. _(See [threat model](threat-model.md).)_

## Supabase-specific traps to check in every schema or policy change

- RLS enabled on every table in an exposed schema; policies use `to authenticated` **and** an ownership predicate (authentication alone is not authorisation).
- `UPDATE` policies have both `USING` and `WITH CHECK`, and an `UPDATE` also needs a `SELECT` policy.
- Never base authorisation on `user_metadata` claims (user-editable).
- Never put the `service_role` key in a client; avoid `SECURITY DEFINER` functions in exposed schemas; views use `security_invoker = true`.
- Run Supabase advisors (`supabase db advisors`) after schema changes.

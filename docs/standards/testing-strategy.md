# Testing strategy

Status: the parser tests exist; planned (Phase 3), not built yet: the `/api/parse` tests with mocked Gemini and `SetConfirmCard` (tap logging uses `BreakdownCard`, which is tested). Everything else below exists.

| Level                 | Tool                     | What                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (highest)        | Vitest                   | Weight maths, validators, progression rules, sync queue logic, the parser (table-driven fixtures)                                                                                                                                                    |
| Component             | Vitest + Testing Library | `BreakdownCard`, `AmbiguityPrompt`, `SyncBadge` (`SetConfirmCard` is planned with voice)                                                                                                                                                             |
| Integration           | Vitest                   | RLS isolation on the hosted project (user A cannot read or write user B's rows), in `tests/integration/`; `/api/parse` with mocked Gemini (valid JSON, invalid JSON, 429, timeout) is planned                                                        |
| Database schema + RLS | Vitest + PGlite          | `tests/db/schema.test.ts` (`npm run test:db`): the migration and seed run in Postgres-in-WASM with stand-ins for Supabase's `auth` schema and roles; two-user isolation, composite foreign keys, constraints, rate-limit function, seed id squatting |
| E2E smoke             | Playwright               | Sign in (test account), start workout, tap-log a set, offline log then sync (Playwright offline mode), view history                                                                                                                                  |

## Conventions

- Unit tests live next to the code as `*.test.ts(x)` under `src/`. E2E tests live in `tests/e2e/`. Fixtures will live in `tests/fixtures/` (the folder does not exist yet).
- **File suffixes:** `.test` = main cases; `.edge` = boundary and negative cases; `.qa` = tests added by a QA-agent pass (new files only, never edit existing tests); `.property` = seeded random-case tests; other tags (`.pull`, `.units`, `.guard`, `.offline`, `.error`, `.convergence`) name the topic.
- **Where each suite runs:** `tests/design` runs in `npm test`; `tests/db` (PGlite) runs via `npm run test:db`, in CI; `tests/integration` and `tests/e2e` are run by the developer only, never in CI. CI runs lint, typecheck, `npm test`, `test:db`, `seed:check`, build, a bundle secret grep and gitleaks.
- The parser is tested through `tests/fixtures/voice-phrases.json` (307 phrases in 12 groups, written by a separate agent from the spec before the parser existed; stage 1 is English and Hinglish markers, stage 2 is Hindi number words and is not built yet), plus edge, number and seeded random tests in `src/domain/parser/`. When a fixture and the parser disagree, ask the developer; never edit a fixture to make a test pass.
- `npm run test:integration` runs `tests/integration/` against the hosted project as the two test users (profile, gym, exercise and log access rules). It and the sign-in E2E need `.env.local`, skip themselves without it and are run by the developer, not by Claude Code or CI.
- `npm run test:db` is the fast local check of the schema. It does not replace the RLS integration suite below, because PGlite only imitates Supabase.
- The RLS integration suite runs against the hosted free Supabase project with two dedicated test users (credentials from env, never committed). It is developer-run only: no CI step runs it.
- E2E uses email + password sign-in with a dedicated test account.
- Tests must be able to fail: check that a new test fails before the fix or feature exists.

## AI-assisted QA

Reviewers (code-reviewer, security-auditor) change nothing; the qa-tester agent may only add new test files. Use the `qa-tester` agent and the `parser-test-cases` skill to generate edge cases and negative tests. **Every AI-generated test is reviewed by the developer before merging.** Record what the AI got wrong in the ai-log, and count generated / kept / rejected in [`docs/qa/ai-qa-report.md`](../qa/ai-qa-report.md).

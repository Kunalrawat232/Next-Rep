# Testing strategy

| Level                 | Tool                     | What                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (highest)        | Vitest                   | Parser (table-driven fixtures), weight maths, validators, progression rules, sync queue logic                                                                                                                                                        |
| Component             | Vitest + Testing Library | `SetConfirmCard`, `AmbiguityPrompt`, `SyncBadge`                                                                                                                                                                                                     |
| Integration           | Vitest                   | RLS isolation (user A cannot read or write user B's rows); `/api/parse` with mocked Gemini (valid JSON, invalid JSON, 429, timeout)                                                                                                                  |
| Database schema + RLS | Vitest + PGlite          | `tests/db/schema.test.ts` (`npm run test:db`): the migration and seed run in Postgres-in-WASM with stand-ins for Supabase's `auth` schema and roles; two-user isolation, composite foreign keys, constraints, rate-limit function, seed id squatting |
| E2E smoke             | Playwright               | Sign in (test account), start workout, tap-log a set, offline log then sync (Playwright offline mode), view history                                                                                                                                  |

## Conventions

- Unit tests live next to the code as `*.test.ts(x)` under `src/`. E2E tests live in `tests/e2e/`. Fixtures live in `tests/fixtures/`.
- The parser is tested through `tests/fixtures/voice-phrases.json`, aiming for 150+ phrases including Hinglish, noisy and adversarial cases.
- `npm run test:db` is the fast local check of the schema. It does not replace the RLS integration suite below, because PGlite only imitates Supabase.
- The RLS integration suite runs against the hosted free Supabase project with two dedicated test users (credentials from env, never committed). It is skipped in CI unless the secrets are set.
- E2E uses email + password sign-in with a dedicated test account.
- Tests must be able to fail: check that a new test fails before the fix or feature exists.

## AI-assisted QA

Use the `qa-tester` agent and the `parser-test-cases` skill to generate edge cases and negative tests. **Every AI-generated test is reviewed by the developer before merging.** Record what the AI got wrong in the ai-log, and count generated / kept / rejected in [`docs/qa/ai-qa-report.md`](../qa/ai-qa-report.md).

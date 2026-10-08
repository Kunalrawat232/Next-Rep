# Test plan

Strategy and conventions: [testing strategy](../standards/testing-strategy.md). This plan lists what must be covered.

## Scope by area

| Area         | Cases                                                                                                                                                          | Level                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Weight maths | total from per-side, bar overrides, kg/lb conversion, rounding to 2 dp, dumbbell and bodyweight semantics                                                      | Unit                                         |
| Validators   | `total < bar`, ±40% jump, confusables 13/30…19/90, ranges (reps 1–100, weight 0–500, per-side 0–250), plate-achievability soft warning                         | Unit (table-driven)                          |
| Parser       | Number words and digits, units, rep markers, per-side markers, Hinglish and Hindi numbers 1–20, alias fuzzy matching, default to current exercise, all intents | Unit via `voice-phrases.json` (150+ phrases) |
| Progression  | +2.5/+5 kg, same weight on missed reps, ~10% less after two misses, plate rounding, reason text                                                                | Unit                                         |
| Sync queue   | enqueue, retry, idempotent upsert, workout before sets, failed state, offline → online                                                                         | Unit (`fake-indexeddb`) + E2E                |
| RLS          | user A cannot select/insert/update/delete user B's rows on every table; global exercises readable by all                                                       | Integration (hosted project, two users)      |
| `/api/parse` | valid JSON, invalid JSON, 429, timeout, no token, bad token, oversized transcript, rate limit, prompt-injection transcript                                     | Integration (mocked Gemini)                  |
| Components   | `SetConfirmCard`, `AmbiguityPrompt`, `SyncBadge`                                                                                                               | Component                                    |
| Core journey | sign in, start workout, tap-log a set, offline log then sync, view history                                                                                     | Playwright smoke                             |

## Failure scenarios (each becomes a test)

Offline mid-workout; sync interrupted mid-batch; duplicate upload on retry; Gemini unavailable; microphone permission denied; Web Speech unsupported (Firefox); misheard number; ambiguous total vs per side; Supabase project paused; browser evicts local storage.

## Exit criteria for submission

All must-have journeys pass; unit, component and integration suites green in CI; E2E smoke green; `npm audit` reviewed; RLS isolation test passing; no secrets in the history (gitleaks clean).

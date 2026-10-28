# Test harness and conventions

## Kinds of test

| Kind                    | Command                    | Where                                                         | Notes                                                                                                                                                                                                                                                                                     |
| ----------------------- | -------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and component      | `npm test`                 | `src/**/*.test.{ts,tsx}`, `api/**/*.test.ts`, `tests/design/` | Vitest, jsdom, `globals: true`, setup `src/test/setup.ts` (jest-dom, a global fake IndexedDB, a 3 s async-wait timeout). Current counts are in [testing strategy](../../docs/standards/testing-strategy.md). Node-only tests (`tests/design/*`) start with `// @vitest-environment node`. |
| Database schema and RLS | `npm run test:db`          | `tests/db/*.test.ts`                                          | PGlite loads the real migrations; 121 tests in 7 files at the last run. No hosted project needed.                                                                                                                                                                                         |
| Hosted project          | `npm run test:integration` | `tests/integration/*.test.ts`                                 | The developer runs it: it loads `.env.local` and needs two test users. 26 tests in 4 files, passed.                                                                                                                                                                                       |
| End to end              | `npm run test:e2e`         | `tests/e2e/*.spec.ts`                                         | Playwright (Pixel 7). The developer runs it; 5 tests in 4 files passed. Specs: `smoke`, `auth`, `workout` (log online, log offline, sync, end), `exerciseDemo`.                                                                                                                           |

**Agents never run the commands that load `.env.local`** (the list is in [CLAUDE.md](../../CLAUDE.md) section 5); the developer runs them. Before finishing a task run `npm run lint`, `npm run typecheck` and `npm test` (plus `npm run test:db` after touching SQL). There is no Stop hook, so do this yourself; an unhandled error fails the run. The counts in the first table are from the last recorded run and have not been re-checked against the current tree: re-run `npx vitest run --reporter=dot` (and the other commands) before quoting them.

## File conventions

- Test files sit beside the code. Suffixes: `.test` main cases; `.edge` boundary and negative cases; `.qa` added by a QA-agent pass (**new files only; never edit or overwrite an existing test**, and check `git diff --stat` for unexpected deletions after an agent runs); `.property` seeded random-case tests; other tags (`.pull`, `.units`, `.guard`, `.offline`, `.error`, `.convergence`) name the topic.
- Domain tests are table-driven. There is a seeded randomised test of the sync invariants (`src/data/sync/invariants.test.ts`, 150 seeds) and one comparing the personal-record rules to a plain check.
- After writing logic, deliberately break it and confirm a test goes red (mutation check).
- Avoid `Date.now()` in domain helpers (pass `now`), and build test dates in local time so tests do not depend on the machine's time zone.

## The whole-app harness

`renderApp(path, options)` in `src/test/appHarness.tsx` renders the real routes, providers and `SyncProvider` on a fake IndexedDB, with fakes for the services. Options: `userId`, `gym`, `gymsFail`, `customExercises`, `savedUnit`, `unit`, `server`, `parse`, `coach`, `transcribe`. It returns `{router, user, server, profile, gyms, exercises, auth, userId, db, store}` (`db` and `store` are a second handle on the same on-device database). Exported constants: `HOME_GYM`, `BENCH`, `EZ_CURL`, `SMITH_SQUAT`, `DUMBBELL_CURL`, `PUSH_UP`.

Helpers: `src/test/localDb.ts` (`freshLocal()`, `reopenLocal()`, `aWorkout()`, `aSet()`, `uuid()`), `src/test/doubleTap.ts` (`tapTogether(button, times)`), fakes `fakeAuth`, `fakeGyms`, `fakeExercises`, `fakeProfile`, `fakeRemoteLog` (can fail, poison rows, go offline, hold calls, seed server rows and delete them "elsewhere"), and `UnitsForTest.tsx`.

## Recipes and traps

- **Seed a past workout in a whole-app test:** make a first `renderApp` with `server: offlineServer()`, use `store.startWorkout`, `store.logSet`, `store.endWorkout`, then `unmount()` and render again with the same `userId`. **Seed rows with an unreachable server** (`offlineServer()`), or the sync worker and the first pull change them mid-test (a "synced" row the server does not list is deleted by the pull).
- **A workout needs a set to reach the server.** An empty workout is never sent or kept (see [empty-workouts.md](../local-data/empty-workouts.md)); tests that expect a workout on the server must log a set in it.
- **Test double taps with `tapTogether()`,** not `user.dblClick`: a click leaves a tick between the two taps and hides the bug (and flaked on slow CI). Guard real one-shot actions with `usePending()`.
- **Do not assert right after an async render.** Under load the page can re-render once; use `waitFor` (re-checks until steady) for things that can change, and wait for the condition instead of a fixed time. A text query that needs a moment uses `findBy...`.
- **Fakes of Dexie internals:** the harness opens its own copy of the database, so to fail a Dexie call in a whole-app test patch the shared table methods (see `src/features/coach/coachPage.test.tsx`), not the harness `db`.
- **Stale hook state:** results are tagged with their inputs; a `current` flag alone is not enough when the address changes. Tests that change the route check this.
- **`npm run test:integration` deletes every workout, set, exercise and gym of test users A and B** (in `beforeAll` and `afterAll`), and `test:e2e` adds a workout to user A. Never seed demo data into those accounts and then run them: re-seed afterwards, or give the demo its own account.
- Tests for `api/` use fakes for every dependency and never touch the network; `api/_lib/imports.test.ts` guards the `.js` import rule.

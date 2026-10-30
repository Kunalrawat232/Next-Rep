# AI log

Running log of how AI was used, what it produced, which problems the checks caught and how each result was validated. An entry is appended after each completed task. "How validated" lists the checks that were actually run and who ran them (automated tests, browser checks, commands the developer ran); anything not run is said so. A line that says "not yet run" was true when it was written: the section "Open checks" below says what is still open today.

## Entry format

```md
## <task name>

- Tool: Claude Code / Claude chat / Claude Design / Gemini
- Asked: <one line>
- AI produced: <one line>
- Problems found: <what the checks caught, if anything>
- How validated: <tests, manual check, review: what was run, and by whom>
- Lesson: <optional; promoted to lessons.md if reusable>
```

## Entries

## Phase 0 planning

- Tool: Claude Code (plan mode, then the advisor/stronger-model review)
- Asked: read the project brief and plan Phase 0.
- AI produced: a 15-step plan, a summary of the product, and four clarifying questions (branching, auth method, rate-limit storage, open-question defaults).
- Problems found: the advisor review tightened the first plan before anything was built: a dangling "branching per the answer below" reference, a final check that contradicted files the plan itself required, "new" docs that were only referenced and not listed, a JWT secret in `.env.example` although the docs recommend JWKS, and a git hooks path that would not survive a fresh clone.
- How validated: a second, stronger model reviewed the plan before work began; the developer answered the four open questions and approved the plan.
- Lesson: have a second model review the plan before executing; it found concrete gaps early, when they cost nothing.

## Tooling, dependencies and scaffold

- Tool: Claude Code
- Asked: install tooling, propose and pin dependencies, scaffold the app with CI and hooks.
- AI produced: exact-pinned `package.json`, Vite/React/TS/Tailwind/Vitest/Playwright/PWA setup, gitleaks pre-commit hook, GitHub Actions workflow, Claude Code hooks (lint/typecheck after edits, tests when a turn ends).
- Problems found: (1) the newest TypeScript (7.0.2) conflicts with `typescript-eslint`'s peer range, so it was pinned to 6.0.3; (2) `npm audit` reported 11 issues from the dev-only `@vercel/node` and offered a nonsensical downgrade, so the package was removed; (3) slash commands run only when the developer types them, so the flow became: developer runs the command, AI re-checks the installed list; (4) the ESLint config applied Node globals only to TS files, fixed when the first script ran.
- How validated: lint, typecheck, tests, build and a Playwright smoke test pass; a fake token was blocked by the pre-commit hook; a deliberate lint error was reported back by the edit hook.
- Lesson: check peer ranges and audit sources yourself; see `docs/learning/lessons.md`.

## Context files and documentation

- Tool: Claude Code
- Asked: turn the project brief into permanent context files, ADRs, agents and skills, with real content.
- AI produced: `CLAUDE.md` (60 lines), README, about 40 docs, six ADRs, five subagents, two skills.
- Problems found: an internal link check found two links to a document created later (resolved by step 11); the filename of the brief appears once in `.prettierignore` and is removed when the brief is retired.
- How validated: an internal link and reference check after generation; the documentation was then audited against the code by three read-only agents (`docs/qa/doc-audit-report.md`: 33 findings, addressed after review).
- Lesson: run a link and reference check after generating many docs.

## Database schema, seed and domain schemas

- Tool: Claude Code with the Supabase skills; PGlite (Postgres in WASM, later committed as `tests/db/schema.test.ts`) for local verification; an automated commit security review.
- Asked: write the migration with RLS, a 50-60 exercise seed, and Zod domain schemas.
- AI produced: `0001_init.sql`, a seed generated from one JSON source, composite foreign keys, an exercise-visibility trigger, a rate-limit function, `ParseResult`/`Set`/`Workout` schemas and `totalFromPerSide` with tests.
- Problems found: (1) the design went beyond the brief, so it was flagged for review; (2) a verification test showed the database correctly rejects editing a set's total alone, which became a documented rule; (3) the automated security review caught **seed id squatting**: seed ids are public and clients may choose exercise ids, so a user could pre-create a row with a seed id and hide the global exercise. The seed now resets `user_id` on conflict, with a regression check; (4) the Hinglish aliases ("dand", "baithak") were marked for human verification.
- How validated: `npm run test:db` passes (38 tests: two-user isolation, constraints, rate limiter, squatting); sabotaging a policy or a check constraint makes the matching tests fail; a deliberate break of `totalFromPerSide` makes 6 tests fail.
- Lesson: foreign keys bypass RLS; test cross-tenant references explicitly, and treat public ids as attacker-controlled.

## Distributing and retiring the project brief

- Tool: Claude Code
- Asked: prove every section and rule of the temporary project brief now lives in a permanent file, then retire the brief.
- AI produced: a coverage table (about 45 rows, one per section and rule group, with file and heading) backed by 108 automated checks that each assert a rule's text exists in its target file, plus a check that every file the brief lists exists.
- Problems found: 107 of 108 checks passed first time (the one miss was a regex-order false alarm). The check surfaced five real gaps in the docs: the data model named the rate-limit column `count` (the migration uses `request_count`), a stale test count, missing pause markers in the Phase 0 table, an implicit dependency-approval rule, and VS Code and the GitHub account missing from the tooling doc. The assert-after-edit habit came from this task: scripted replacements had silently done nothing after Prettier re-wrapped tables.
- Developer decisions: approved the coverage table; asked for the database checks to be kept in the repo, so they became `tests/db/schema.test.ts` with PGlite as an exact-pinned dev dependency; retirement was staged and committed on the developer's say-so.
- How validated: a deliberate sabotage of one RLS policy and of one check constraint makes the matching database tests fail; a search for the brief's filename returns no hits in the working tree after retirement; the brief stays in Git history.
- Lesson: after any scripted edit, assert it landed (re-grep); see `docs/learning/lessons.md`.

## Evaluating graphify (installed, run in full, removed)

- Tool: Claude Code, with the third-party `graphify` knowledge-graph tool and 3 general-purpose subagents
- Asked: install graphify for Claude Code, then run the full pass (code plus docs) on the project.
- AI produced: a vetting of the package before installing (PyPI page links to the same GitHub repo, licence, release history, dependencies), a read of the skill's own instructions for risky commands, a project-scoped install, and a full run: 46 code files parsed locally and 53 docs read by three subagents, giving a 428-node, 566-edge graph in 45 named communities, with an HTML view and a report.
- Problems found: the trial showed the tool was a poor fit for this stage: its install rewrote tracked files (a hard-coded absolute path in `.claude/settings.json`, a new `.claude/CLAUDE.md`), JSON config was modelled as code so the top "god nodes" were `compilerOptions` and `scripts`, SQL was not parsed, its own check said the 25k-word corpus fits in one context window, its hooks inject "MANDATORY" instructions from a third party, and its output could end up in the submission ZIP.
- Decision: evaluated with backups and diffs at each step, then removed completely (package, hooks, skill, `CLAUDE.md` section, output, cache); `CLAUDE.md` restored byte for byte. Revisit at the start of Phase 3, when `parser`, `sync` and `api` give the graph real cross-module relationships.
- How validated: the benchmark measured about 8.5x fewer tokens per query, but on a corpus of only about 28k tokens; after removal a search finds no mention of the tool in the working tree and `.claude/settings.json` has no diff against the committed version.
- Lesson: vet a tool and run a small trial before letting it edit shared instruction files and hooks; see `docs/learning/lessons.md`.

## Phase 1 task 1, weight helpers and plausibility validators

- Tool: Claude Code with the `new-feature` flow, `code-reviewer` and `qa-tester` subagents
- Asked: implement the pure weight helpers and the `validateSet` plausibility rules from the weight rules, tests first.
- AI produced: `toKg`, `perSideFromTotal`, `weightBreakdown` and the validator with a config file; 121 tests including a 3,000-candidate property test that every resolved weight is storable; then 123 more edge-case tests from `qa-tester`.
- Problems found: (1) `qa-tester` read the spec and found four behaviours the first implementation lacked: the below-bar question skipped the "Did you mean 60?" option, the plate warning was skipped for inexact breakdowns, an unrounded bar weight could break the database check, and a warning was lost when a result became a question; (2) `code-reviewer` found a latent bug in earlier code: `SetSchema.safeParse` threw a `RangeError` for a negative bar weight because a refine called a helper that throws; (3) the reviewer had no shell, so each claim was reproduced with a probe before any fix; (4) `validateSet` grew to about 170 lines and was split into small helpers.
- How validated: 255 tests pass; 9 deliberate breakages each make tests fail; the 6 deliberately failing QA tests all pass after the fixes.
- Lesson: a passing first run is not evidence; a reviewer that cannot run code needs its claims reproduced; a schema refine must never call a function that throws.

## Checking the hosted Supabase connection

- Tool: Claude Code
- Asked: confirm that the Supabase project, migration, seed and auth are set up and reachable.
- AI produced: `scripts/check-supabase.mjs` (`npm run check:supabase`), a read-mostly check that prints only PASS/FAIL, and a network diagnosis when the first run failed.
- Problems found: (1) the script loads `.env.local`, so the developer ran it and pasted the output, which set the pattern for secret-loading scripts: safe output, run by the developer; (2) the first run failed with only `fetch failed`, so the script now reports the underlying cause code; (3) the AI traced the failure with non-secret tests (raw TCP connected, `--resolve` skipped DNS and got HTTP 401, IPv4 lookups took 0.08 s, IPv6 lookups timed out at 5 s on the home router) to a slow router DNS, not a Supabase or key problem, and gave the developer reversible `nmcli` commands rather than changing network settings itself; (4) a `0` seed count came from the seed not being run, found by asking for two simple checks instead of guessing.
- How validated: after switching to public DNS all 16 checks passed, including 56 seed rows, sign-in for both test users and the rate-limit function. The Supabase Advisors page reported no issues.
- Lesson: when a call fails with no HTTP status, separate DNS, TCP and the application layer before blaming keys; design secret-loading scripts so their output is safe to paste and let the developer run them.

## Email and password sign-in

- Tool: Claude Code with the `new-feature` flow, `code-reviewer`, `security-auditor` and `qa-tester` subagents, and throwaway probes against the installed Supabase library
- Asked: build sign-in and sign-up with Supabase Auth, a protected home page and sign-out, tests first, working offline for a signed-in user.
- AI produced: an `AuthService` interface with a Supabase adapter, an env parser, a provider, a sign-in page, routes and a bootstrap, with unit tests, an integration test and an E2E test for the developer to run, and docs (ADR-007).
- Problems found: (1) a reviewer's open question about offline use led to a probe showing 25 s of loading and then "signed out" with an expired token and no network, so the user is now read from the stored session; (2) the env guard was a blocklist running only in the browser, so a padded secret key would have passed; it is now an allowlist plus a build guard and a CI bundle check; (3) `main.tsx` built the client during render, creating two clients under StrictMode; (4) `qa-tester` wrote 170 tests, 17 failing on purpose, exposing 7 bug groups; (5) the security auditor's claim that offline sign-out keeps the session was tested and disproved (it is cleared); each reviewer claim was reproduced before acting.
- Developer decisions: fix every finding; accept that duplicate sign-ups reveal an existing account while "Confirm email" is off, and switch it on at code freeze (done, see below).
- How validated: 578 unit tests pass; 8 deliberate breakages each turn tests red; the env-free build and Playwright smoke test pass (the CI path); a build with a planted secret variable or padded secret key is refused without printing the value. `npm run test:integration` passed 6 of 6 against the hosted project (run by the developer).
- Lesson: see the two new rows in `docs/learning/lessons.md` (measure offline behaviour; allowlist what reaches the browser).

## Applying the Claude Design handoff

- Tool: Claude Design (screens and tokens, made by the developer), then Claude Code to apply them
- Asked: use the designs for the real app: tokens, font, logo, icons, responsive shell, sign-in and home.
- AI produced: CSS tokens, `Logo`, `Button`, `TextField`, `AppShell`, restyled sign-in and home, PWA icons and manifest, a contrast and token test, docs and ADR-008.
- Problems found: (1) the design's sign-in is magic-link only, so a password field and a create-account toggle were added in the design's style; (2) the design loads Google Fonts, replaced by a self-hosted font so it works offline; (3) the design shows an ambiguity prompt for 45 kg after 60 kg, noted for Phase 3; (4) a screenshot showed the wrong font, traced by reading the network response to a blocked font file in the test setup; (5) the token test moved to `tests/design` because it needs Node file access.
- How validated: the handed-off colours pass the 4.5:1 contrast rule in both themes; 6 deliberate breakages (low contrast, a submit-by-default button, a missing `aria-invalid`, a missing disabled state, a missing maskable icon) each turn tests red; screenshots at 390 and 1440 px are saved beside the handoff.
- Lesson: check an AI-made design with tests (contrast, token parity) before building on it.

## Gym setup

- Tool: Claude Code with the `new-feature` flow, the advisor tool (a stronger reviewer model) before coding, and mutation checks
- Asked: build gym setup (list, create, edit, delete, default gym, bar weights) from the new designs.
- AI produced: migration 0002 (`gym_bars.kind`), gym domain rules, a Supabase gym service, the list and form screens, a shared `Chip`, tests at every layer, an integration test for the developer to run, and ADR-009.
- Problems found: (1) the advisor showed that nothing linked an exercise's equipment to a gym bar, so migration 0002 was added after asking the developer; (2) a probe in PGlite showed the planned one-statement default-gym swap fails for some row orders, so it became two steps; (3) a compile check touched a config that loads `.env.local`, which was disclosed straight away with the output unread, and the rule became: check what a command loads before running it; (4) the advisor is now consulted before the data shape is fixed, not after.
- Review results: `code-reviewer`, `security-auditor` and `qa-tester` (193 new tests, 17 failing on purpose) found 2 high issues (a retry of create made a second gym; the UI ignored the oldest-gym default rule), a half-typed bar silently dropped on save, Enter in the add-bar fields saving the whole gym, double-click races, a thousands separator saved as 1 kg, look-alike names and a timestamp sort bug, and weak isolation tests. All were fixed except the non-atomic update, which is documented in ADR-009.
- Developer decisions: kg only for now; no limit on the number of gyms; block deleting a gym that has workouts once workouts exist.
- How validated: 951 unit tests and 61 database tests pass; 5 of 7 deliberate breakages turned tests red (the other 2 are equivalent or shadowed); screenshots at 390 and 1440 px checked. Migration 0002 was found applied on the hosted project.
- Lesson: consult the advisor before fixing the data shape, not after; check what a command loads before running it, even to "just compile".

## Exercise library and muscle search

- Tool: Claude Code with the advisor tool, a downloaded third-party dataset, `code-reviewer` and `qa-tester`
- Asked: build the exercise picker and custom exercises, matching body part in search, and use an open exercise dataset.
- AI produced: migration 0003 (`exercises.muscle`), an import script and a filtered library of about 835 exercises on top of the 56 curated ones, search and ranking, the picker and custom-exercise screens, tests at every layer, ADR-010 and a third-party notice.
- Problems found: (1) the advisor noted the data only had upper, lower and core, so "match body part" could not mean chest or legs; the developer chose a new column; (2) the dataset's licence file was read directly: the data is MIT but its images and GIFs are a third party's, so only text is used; (3) the dataset's equipment does not map cleanly to our weight rules, so only 7 of 20+ types are imported, each filtered, mapped and deduplicated against the curated list; (4) search speed was measured on the real data (0.03 ms per search), and the real cost is drawing rows, so results show 40 at a time; (5) the advisor noticed that `npm run build` loads `.env.local`, so builds now use an env-free copy; (6) two clear buttons in the search box were spotted in a screenshot.
- Review results: `code-reviewer` and `qa-tester` (223 new tests, 20 failing on purpose) found that imported exercises outranked curated ones for voice words such as "bench", "squat" and "curl" (now ranked by source first), that assisted machines, planks and sprints slipped through the importer (filters tightened, 23 more rows removed), that a retry wiped the user's search, that the custom form skipped duplicate checks when its list had not loaded, and several Unicode and accent cases. All fixed; `seed:check` is now in CI.
- Developer decisions: search matches body part and muscle (a new column); the Recent section stays hidden until workouts exist; no edit or delete of custom exercises yet; no push of the gym branch yet.
- How validated: 1298 unit tests and 72 database tests pass; 7 of 8 deliberate breakages turned tests red (the eighth is a shadowed guard); the seed check confirms 892 exercises (56 curated, 836 imported); screenshots at 390 and 1440 px checked. Migration 0003 and the 892-row seed were found applied on the hosted project.
- Lesson: read a dataset's licence file, not its summary, and separate its data from its media before importing.

## Local-first logging and the sync worker

- Tool: Claude Code with the advisor tool, a randomised invariant test, mutation checks, `code-reviewer`, `security-auditor` and `qa-tester`
- Asked: build the on-device log (IndexedDB) and a sync worker that pushes workouts and sets to Supabase, working offline, before any workout screen exists.
- AI produced: a Dexie store and outbox, a push worker, a scheduler, a Supabase remote, a provider with hooks, an ADR, tests at every layer, a hosted integration test and database tests for the upsert statements.
- Problems found: (1) the first randomised test (150 seeds) found a real race: a set removed while its push was in flight could stay on the server if the follow-up delete failed, so removals became a durable queue; (2) the reviewers found that a server outage longer than about four minutes would mark every unsynced set as failed, and that one refused batch caused one request per row; the fix tells failures apart by cause, so only a refusal of the row itself counts; (3) a StrictMode problem that would have left the local database closed for a whole development session was caught when the reviewer judged my test too weak, so it now logs a set and checks that it arrives; (4) one mutation was written wrongly and changed nothing, so it was redone and caught.
- Developer decisions: local-first now, split into two tasks (data layer and sync first, screens second); the rest of the plan as proposed.
- How validated: 1760 unit tests and 93 database tests pass; 8 of 8 deliberate breakages of the sync logic turn tests red; the randomised test converges on 150 seeds without any manual retry.
- Lesson: a randomised test with a model of "what should be on the server" finds races that example tests do not; and a test that only checks the initial state cannot catch a broken session.

## Workout screens (tap logging)

- Tool: Claude Code with the advisor tool, whole-app tests on a fake server and fake IndexedDB, mutation checks, `code-reviewer`, `security-auditor` and `qa-tester`
- Asked: build start workout, choose exercise, log a set by tapping with the bar and per-side breakdown, undo, end workout, an offline banner and a sync badge, on top of the local-first log.
- AI produced: the workout pages and components, a gym cache and per-workout gym snapshot for offline starts, a `source` field so the validator does not second-guess tapped numbers, pure workout helpers (steps, conversion, breakdown), and tests from the pure helpers up to whole journeys.
- Problems found: (1) a tapped number would have been offered "Did you mean 60?", which only makes sense for speech, so the validator was given the source of the number; (2) starting a workout offline needed the gym list, so it is saved on the device and each workout keeps a snapshot; (3) existing route and shell tests needed updating because Home now needs the sync provider; (4) scheduler tests that waited a fixed 20 ms were flaky under load, now 80 ms; (5) work still running when the local database closed raised an unhandled error, now ignored only for that one error; (6) one mutation survived until a test for a tapped 16 after a 60 was added.
- Review results: `code-reviewer`, `security-auditor` and `qa-tester` (157 new tests) found that Undo could act on a stale sync status, that Start workout could be double-tapped into two workouts, that sign-out cleared the device before the user confirmed, that saved gym data and the `?exercise=` address value were trusted unchecked, that switching total and per side lost precision, that the plate warning was lost on a tapped big jump, and that a gym edited mid-workout stayed frozen. All fixed.
- Developer decisions: store the real input mode with source `tap`; "Did you mean" for voice only; missing bar blocks logging with a link to set it; undo of a saved set needs internet; steppers 2.5 kg total, 1.25 kg per side, 1 rep; voice, rest timer and workout names out of v1.
- How validated: 2064 unit tests and 93 database tests pass; 7 of 7 deliberate breakages turn tests red.
- Lesson: when a rule exists because of speech, give the validator the source of the input instead of special-casing the screen.

## History

- Tool: Claude Code with the advisor tool, whole-app tests on a fake server and fake IndexedDB, mutation checks, `code-reviewer` and `qa-tester`
- Asked: a History list of past workouts and a workout detail screen, working offline.
- AI produced: pure day-label, duration and grouping helpers, three new log-store reads, the list and detail screens with an in-progress card and a waiting-to-sync mark, routes and navigation, and tests from the helpers up to whole screens.
- Problems found: (1) the plan said volume would be kg x reps, but ADR-002 requires dumbbells to be treated explicitly (x2), so volume was left out of the task rather than deviating from the docs; (2) a test that watches the page text caught a built-in exercise briefly named "Custom exercise" while names loaded; (3) seeded rows in whole-app tests need an unreachable server, or the sync worker changes their status mid-test.
- Review results: `code-reviewer` and `qa-tester` (the latter stopped early on a usage limit, so its partial tests were triaged) found that a page of workouts with no sets hid older history and the Show more button, that a read error left the screen loading forever, that failed syncs were reported as waiting, that the detail page could show the previous workout after the address changed, and that grouping sets copied arrays quadratically. All fixed.
- Developer decisions: History shows finished workouts with the open one pinned, and no sync-down of older workouts yet.
- How validated: 2192 unit tests and 93 database tests pass; 7 of 8 deliberate breakages turn tests red (the survivor is a loading guard that finishes first in tests).
- Lesson: when the plan and an ADR disagree, drop the feature from the task rather than choosing quietly.

## Progress charts and personal records

- Tool: Claude Code with the advisor tool, a randomised model test, mutation checks, and `code-reviewer` and `qa-tester`
- Asked: a Progress tab with a chart per exercise, personal records, and PR badges on sets.
- AI produced: a pure records module (PR rules, top set per session, current bests), per-exercise log-store reads, a themed chart with a table that carries the same numbers, the list and exercise screens (loaded on demand), PR badges and a "New personal record" note, and tests from the rules up to whole screens.
- Problems found: (1) the advisor had the PR rules written down before coding (a rep PR needs an earlier set at that weight, one kind per set, 0 kg never a weight PR, compare in hundredths, ties by id) and the work done in one pass, avoiding the quadratic mistake History's QA had just caught; (2) the chart library was confirmed to render in the test environment before building on it, and the table, not the drawing, is what tests assert on; (3) "Sign out anyway" bypassed the double-tap guard added the same day, caught in review; (4) one mutation survived (the guard that drops stale PR marks); the review showed it hid a real flicker, so the guard was replaced by keeping the last marks; (5) the QA agent overwrote an older sync test file while reporting its files as new; the diff size exposed it and the file was restored.
- Review results: `code-reviewer` and `qa-tester` (50 new tests) found that PR badges blinked off on every log or undo, that a bodyweight exercise showed "Heaviest 0 kg" and a weight PR, that the table could lose a badge when two top sets tied, that a failed read of the marks was an unhandled error, that an invalid address still read every set, that two sessions on one day shared a chart label, and that one test asserted nothing. All fixed. A known limit (records only see sets on this device) is written into the weight rules.
- Developer decisions: charts and PRs first, pulling history from the server afterwards.
- How validated: 2285 unit tests and 93 database tests pass, with a randomised test comparing the PR rules against a plain check of every earlier set on 150 histories; 7 of 8 deliberate breakages turn tests red.
- Lesson: write the rule's edge cases down before the code, and test them against a deliberately slow, obvious version.

## Pulling history from the server

- Tool: Claude Code with the advisor tool, a two-device convergence test, mutation checks, `code-reviewer` and `security-auditor`
- Asked: bring a user's workouts and sets back from Supabase to a fresh or signed-out device, so History, Progress and records are not empty.
- AI produced: a read-only pull (`src/data/sync/pull.ts`), paged server reads with the same failure handling as the pushes, one transactional merge into the device log, scheduler integration with a `pulling` status, loading notes on History and Progress, ADR-012, and tests from the merge rules up to a random two-device scenario.
- Problems found: (1) the advisor warned that the server writes times as `+00:00` while the device uses `Z`, so the merge goes through the same canonical form as local writes and a test mixes both; (2) a pull must not run next to a push, so it runs inside the scheduler's lock; (3) rows that fail validation still count as on the server, so a damaged row cannot delete the local copy; (4) only finished workouts are pulled, so another device's open workout cannot replace the one in progress; (5) whole-app test setup phases now use an unreachable server, so rows are not marked synced that the server never had.
- Review results: `code-reviewer` and `security-auditor` found that sign-out's purge could be undone by a pull still in flight, that offset paging let a delete on another device make a valid row look deleted, that a capped or empty answer could empty the device, that an online delete could be undone by an earlier read, that one unreadable time would stall every pull, that offline users saw a loading note flicker, that a changed gym kept the old name, and that spoken transcripts were pulled needlessly. All fixed: paging by id ending on an empty page, a mass-removal guard, purge and online delete inside the scheduler's lock, no transcript.
- Developer decisions: pull on every app start, with all history and no date window; the QA agent on hold until the whole UI is built, so no `qa-tester` run for this task.
- How validated: unit tests and 97 database tests pass; 90 random two-device scenarios converge (same sets and the same personal records); 17 of 19 deliberate breakages of the pull turn tests red (the two survivors overlap with each other).
- Lesson: when two devices share a server, test them against each other, and write the rule for what "deleted elsewhere" means before writing the code that deletes.

## Double-tap guards

- Tool: Claude Code with the advisor tool, a CI-like run (the tests pinned to two CPU cores) and a mutation check
- Asked: fix the flaky "Sign out anyway tapped twice" test that failed on CI, and the double-tap bug behind it.
- AI produced: one small hook (`usePending`) that decides from a ref, a test helper that taps in the same instant (`tapTogether`), and the hook applied to every save, delete, sign-in and undo.
- Problems found: (1) the flaky test was a symptom: `user.dblClick` leaves a tick between the clicks, so on a slow machine the first action finished before the second tap; (2) switching to same-instant taps showed that two taps on Log set, sign-in, the gym form's save, default and delete, and the custom exercise save really ran twice, because a `useState` guard still holds the old value until the next render; (3) a first patch of Log set and Undo was widened by the developer's direction into one hook that fixes the whole class; (4) the CI failure of the Progress PR was a different race, a test tapping a disabled Undo button.
- Developer decisions: fix this before finishing the UI, and voice after that.
- How validated: the full suite passes repeatedly on two cores; removing the guard turns 7 tests red.
- Lesson: when a test flakes under load, ask what real timing it is hiding, and make the test strict enough to show the bug.

## Settings screen

- Tool: Claude Code with the advisor tool, a pre-paint script test, mutation checks, `code-reviewer` and `security-auditor`
- Asked: the Settings screen: weight unit, default gym, light-mode switch, account and sign-out, built from the design handoff.
- AI produced: a profile service for the unit (read, and save by upsert), a unit preference kept on the device and sent to the server when online, a theme helper with a script that runs before the first paint, one shared sign-out panel used by Home and Settings, a switch component, the Settings page and its tests.
- Problems found: (1) the advisor pointed out that saving the unit with an update would silently do nothing when the profile row did not exist yet, so it is an upsert, and a missing row reads as kg; (2) two quick calls both pushed the same unsent choice, so passes are now queued once; (3) the sign-out logic became one shared panel instead of a copy; (4) the colour test moved to the node-side design tests because `?raw` CSS imports come back empty in the test environment; (5) the code-reviewer found two real races in the unit save (a second tap reverted to the old value, and a late server answer could undo a fresh choice), both fixed with a choice counter, an in-memory unsent flag, a refusal that stops retrying, and a timeout; (6) the switch's touch target grew from 32 px to 48 px, and animations respect reduced motion.
- Developer decisions: units must apply everywhere including typing weights (the next task), reps are already stored per set, and forgot password is out of scope (requirements list it as won't have).
- How validated: 2517 unit tests pass three times in a row on two cores; 8 of 9 and then 5 of 5 deliberate breakages turn tests red (one survivor is an equality check whose removal changes nothing).
- Lesson: when a write can match zero rows, an update reports success; use an upsert or check the row count.

## kg and lb everywhere

- Tool: Claude Code with the advisor tool, property tests, a sweep test over every screen, mutation checks and `code-reviewer`
- Asked: when the user picks lb, every weight on every screen is lb, including typing weights and bars; kg otherwise.
- AI produced: a pure units module (conversion, formatting, steps, plate sizes, a field that remembers its stored value), unit-aware workout and gym helpers and validator messages, and the unit used by the workout, history, progress, gym and settings screens.
- Problems found: (1) the advisor spotted that converting kg to lb and back is not exact (60 kg shows as 132.3 lb, which is 60.01 kg), so the design remembers the stored value while the text is unchanged; (2) the same trap in a second form: a weight typed per side in lb is added up in lb first; (3) domain functions have no default unit, so the compiler lists every caller; (4) a sweep test renders every screen in lb and asserts no "kg" appears; (5) one gym test used a 20 kg bar, which survives the round trip, until a 15 kg bar made the mutation visible.
- Review results: `code-reviewer` found that the false-record trap survived for a last set entered per side (fixed: an untouched weight is the stored total), that typing the bar's own displayed weight could read "below the bar", that the lb limits rounded above the real limits (now rounded down), that a unit change arriving from another device mid-form would reset the form (adopted only at app start), and that two decimals typed per side lost precision; the dead `formatKg` was removed.
- Developer decisions: lb applies everywhere, including entry, not only display.
- How validated: 2703 unit tests pass three times in a row on two cores; every lb value to 0.1 and every kg value to 0.01 round-trips; 15 of 15 deliberate breakages turn tests red. For the voice task: the plate warning follows the display unit, and a spoken "60 kilo" for an lb user will need it to follow the spoken unit.
- Lesson: a conversion that rounds is not reversible; keep the original wherever a value goes out and comes back.

## Shared UI components

- Tool: Claude Code with the advisor tool, a temporary before-and-after snapshot of the rendered HTML, a guard test and `code-reviewer`
- Asked: stop copying the same UI patterns into every screen.
- AI produced: eight small components (`Card`, `ErrorMessage`, `RetryMessage`, `LoadingMessage`, `EmptyState`, `NotFound`, `PageHeader`, `Section`), 12 screens converted to use them, tests for the components, and a guard test that fails if the copied classes come back.
- Problems found: (1) there are no screenshot tests, so the advisor's approach was to record the rendered HTML of 32 screen states first, refactor, and compare: the result was identical except the order of attributes on three card sections; (2) the plain and boxed retry messages look different, so both forms stay (merging them would be a design change); (3) overriding Tailwind classes through a prop is unreliable, so each component fixes its box and callers add only layout; (4) `aria-label` on wrapper boxes would have turned them into regions, so it was avoided; (5) the comparison sorts class names; (6) the guard asserts it found more than 30 files, so it proves it read them.
- Review results: `code-reviewer` found six loading messages with custom text that were missed and a guard that only matched "Loading…" (converted; the guard now matches any hand-written one), three card boxes with a different border colour (Card gained warning, success and accent tones), a leftover temporary exclusion in the guard, and that the design system doc did not list the components (added).
- Developer decisions: do this cleanup before the Home screen and the rest timer, which would otherwise add more copies.
- How validated: 2730 unit tests pass three times in a row on two cores; the guard fails when a copy is added back; the rendered HTML of 32 screen states is identical before and after (apart from attribute order on three sections).
- Lesson: before a refactor that must change nothing, record what it must not change.

## Progression suggestion and the new Home screen

- Tool: Claude Code with property tests, mutation checks and `code-reviewer`
- Asked: suggest what to lift next (ADR-005) and rebuild Home from the design: ready to lift, sync pill, gym line, today's suggestion, last workout and a first-time state.
- AI produced: a pure `suggest` function with 40 table tests and 4000 seeded random cases, a Home hook reading the on-device log, the new Home screen, and updated sign-out tests (the account card moved to Settings).
- Developer decisions: the suggestion shows on Home only; the log screen still prefills from the last set.
- How validated: run by the developer: all 4 e2e specs pass against the hosted project (sign-in through Settings sign-out, and a workout logged online and offline). The first workout-spec runs failed twice on timing in the spec itself (an instant `isVisible()` check, and leaving the gym form before the save finished); the app was right both times.
- Lesson: when no target reps are stored, derive them from the last sets and say so in the rules.

## Rest timer

- Tool: Claude Code with mutation checks and `code-reviewer`
- Asked: a rest timer on the workout screen: tap presets (60, 90, 120, 180 s) and a custom length, a countdown that stays right after a reload, "Rest over" with vibration.
- AI produced: a pure `domain/rest` module (start, remaining, extend, format, custom-length check) with table and seeded property tests, a `useRestTimer` hook that keeps only the end time on the device, the `RestTimer` pill and panel, and 25 screen tests on a faked clock.
- Developer decisions: the custom length is 30 to 900 seconds (the plan said 10 to 900).
- Review results: `code-reviewer` found that a corrupt stored end time would show a huge countdown or an old "Rest over" (now dropped), that focus was lost when the panel closed (now returns to the pill, and Escape closes it), that +30 s on a rest already over added time to the past (now counts from now), and `aria-controls` pointing at a panel that was not there. Two open tabs do not follow each other, and the clock is the device clock: both are documented.
- Problems found: (1) one deliberate breakage survived the first tests, the check that stops a buzz while the page is hidden, so a test was added; (2) a lint rule rejects reading the clock while rendering, so the start time is read once in a lazy state initialiser; (3) the sync badge is also a status region, so the "Rest over" announcement is found among several.
- How validated: unit tests pass; the timer on a real phone is still open (vibration support differs, and iOS Safari has none).
- Lesson: store when something ends, not how long is left, and a reload, a locked screen and a background tab stop being special cases.

## QA pass over the whole UI

- Tool: three `qa-tester` agents in parallel, split by area (newest screens and domain, history/progress/settings/units, data and sync), each told to add new files only and to mark a test that exposes a real bug as an expected failure with a `BUG:` note
- Asked: find what the tests so far do not cover, now that the UI is complete.
- AI produced: 26 new `*.qa.test.*` files (the agents first reported 614 tests in 27 files) and 22 reported bugs; none were in the highest severity class.
- Problems found: Home crashed on a damaged set row and missed the last real workout behind ten empty ones; a corrupt custom exercise row made loading throw; half-cent rounding was wrong; the rest timer misbehaved after a clock change, with NaN, and for focus and double taps. All fixed and the tests turned into normal ones. The developer then asked for all open items to be fixed: records now compare weights as shown, in the unit shown; a row-level-security refusal is now a refusal of the row, while a plain permission denied or an expired session stays "tried again later"; a failing local read shows a message with Try again on the workout screens.
- Developer decisions: fix all the open items before the freeze; two stay as designed: the non-atomic gym edit (ADR-009) and the "Today" label after midnight.
- How validated: all 22 bugs fixed and 0 expected-failure tests left; the last full run was 139 test files and about 3530 tests, all passing.
- Lesson: ask the tester to keep a real bug as an expected failure; the suite stays green, the list of bugs stays visible, and fixing one turns into a loud "unexpectedly passed".

## Voice parser (English)

- Tool: Claude Code, with the `parser-specialist` agent for the phrases and the `code-reviewer` agent for the review.
- Asked: a pure parser that turns a transcript into a `ParseResult`, with 150+ phrases written by an agent that had not seen the parser.
- AI produced: `src/domain/parser/` (tokenizer, number reader, exercise matcher, quantity and command readers, confidence), 307 fixture phrases in `tests/fixtures/voice-phrases.json` (281 in stage 1, 26 Hindi-number rows for stage 2), and edge, number and seeded random tests.
- Review: the `code-reviewer` agent found one high bug (a trailing "rest" turned a set into a rest timer at full confidence), a silently logged unknown exercise, prototype-key lookups ("constructor"), imported exercises making curated aliases ambiguous, and an asymmetric fuzzy limit; all were fixed with tests. Left as designed: the no-marker `AMBIGUOUS_WEIGHT_MODE` flag, the "1 minute 30" rest, and "8 x 60" ordering.
- Problems found: 10 of 282 stage 1 phrases failed the first time, and each pointed at a rule the spec had left open ("two twenty five" as 225, a bare exercise name, "rest" with no duration, "same old story", a greeting before the command, a number that was only an HTML tag). Each was decided and written into `docs/domain/voice-grammar.md` rather than editing the fixtures. A floating-point detail (`1 - 0.8` is 0.19999999999999996) was found when "squad" did not match "squat" and the edit limit was rounded.
- How validated: 282 of 282 stage 1 phrases and 366 parser tests pass (26 stage 2 rows listed as skipped); 18 of 18 deliberate breakages across two rounds turned tests red (one survived the first time and led to a stronger test); the slowest input (25 unknown long words against 1000 exercises) takes about 100 ms.
- Lesson: let a separate agent write the expected answers from the spec; the failures then show where the spec is silent, and the developer decides instead of the parser's author quietly bending the test.

## Voice screens (mic, confirm card, commands)

- Tool: Claude Code.
- Asked: the mic on the workout page: tap, speak, see what was heard with the weight breakdown, confirm, log; plus rest, repeat and undo by voice, and the offline and error states.
- AI produced: a `useSpeech` hook over the browser's SpeechRecognition (injectable for tests), a pure `draftFromParse` / `repeatDraft`, a `VoiceLogger` and `VoiceConfirmCard` on the workout page, and tests that drive the whole page with a fake microphone.
- Decisions: nothing is stored until the user taps Log set. A spoken set goes through `validateSet` like a tapped one. The validator reads a bar weight with no "per side" or "total" word as a total, so the planned separate prompt became a Total / Per side toggle on the card. The mic is disabled offline, because Chrome sends the audio to Google. "Edit last set" says it is not available, since the app has no way to edit a set and building one would change the data layer.
- Problems found: the first version dropped the result because clearing the transcript re-ran the effect and cancelled the lookup; the lint rule on refs required the mounted flag to be declared before use; one old test expected the "coming soon" button, and one offline test read the mic button before the exercise list had loaded.
- How validated: 3979 tests passing at the last full run. Real-phone accuracy and the permission prompt were later checked on an iPhone 15 (see the cloud speech entry); en-IN with Hinglish is still open.
- Lesson: an effect that clears its own trigger re-runs its cleanup; keep a mounted flag for late answers instead of a per-run flag.

## Gemini fallback (`/api/parse`)

- Tool: Claude Code.
- Asked: when the local parser is unsure and the phone is online, ask Gemini (free tier only), check its answer like any other, and show it for confirmation.
- AI produced: a handler with injected dependencies (`api/_lib/parse.ts`: token check with `getClaims`, Zod request, per-minute and per-hour limits through the existing `consume_rate_limit`, Gemini in JSON mode with a schema, 8 s timeout, every failure becomes `unavailable`), the prompt, shared schemas, `fromGemini` (maps the exercise name with the parser's own matcher and scores it with the parser's own rules; Gemini's confidence can only lower the score), a `ParseService`, and the mic integration (Checking state, "Read by AI" note, source `gemini`).
- Decisions: the function never sees exercise ids; the app matches names. A name we do not have is never replaced by the current exercise. Model `gemini-3.5-flash-lite` (free tier, cheap model for one-sentence extraction), set by the `GEMINI_MODEL` variable. The limit is per hour, because the database function allows windows up to one hour. `getClaims` instead of `jose`.
- Problems found: the first deploy failed on the output folder (now set in `vercel.json`), and the deployed function crashed on startup because Vercel runs it as native ES modules, which need `.js` on every relative import (a test now follows the imports). The `bootstrap` test learned the new service; commits now wait for a green run.
- How validated: 4039 tests passing with Gemini faked; a deliberate break (using Gemini's confidence alone) turned 3 tests red. Verified live on a preview deployment: 401 without a token and with a bad token, 405 for GET. A real call with the signed-in token returned the expected reading for "bench press sixty five kilos for eight". The rate limit under load is still open.
- Lesson: pass the network clients into the handler so every failure path can be tested without a key.

## Exercise demonstrations (hotlinked GIFs)

- Tool: Claude Code.
- Asked: show an animated demonstration on an exercise page, from the open exercises dataset, without downloading or bundling the media, and everything free.
- AI produced: a matcher (`demoMatch.ts`) and a script that prints a report and writes a reviewable map; the one-place provider config (`demoMedia.ts`); an `ExerciseDemo` component (skeleton, lazy load, placeholder, "reduce motion" still, offline, no layout shift); a new exercise page (`/exercises/:exerciseId`) with equipment and primary and secondary muscles; credits in Settings, the README and the notices; ADR-013; and tests, including one that the offline cache config and the repository contain no pictures.
- Findings before building: ADR-010 had decided not to use the media (the dataset README says to obtain your own licence); there was no exercise page to extend; and the 836 imported exercises could be matched exactly by the id the import derived from the dataset id, so only the 56 hand-made ones needed name matching (14 matched by name, 27 by a reviewed override, 1 declined, 1 left ambiguous, 12 left without a demo). The developer accepted the non-commercial licence risk, which ADR-013 records.
- Problems found: two names that normalise to nothing matched each other (fixed with a test); the first idea of "same GIF means same exercise" did not hold because the catalogue has the same exercise twice (curated and imported).
- How validated: 4086 tests passing at the last full run; one Playwright spec for the page (needs the hosted test user). A licence from Gym visual would be needed for commercial use.
- Lesson: when a brief and the project's own decision records disagree, say so first and record the new decision in an ADR.

## Photo crossfade (tried on a branch, kept)

- Tool: Claude Code.
- Asked: the Gym visual GIFs were choppy and blurry; the developer wanted smooth up-and-down motion. Do the cheap fix on the main branch, and try a second source on a branch that can be thrown away.
- Findings: the GIFs hold 12 frames at about 10 fps at 180x180, so the roughness is in the file, and we were stretching them. free-exercise-db (Unlicense) has two 750x500 photos per exercise; crossfading start and end gives a smooth movement between two poses. Real smooth video has no free source we found.
- AI produced: on `feat/home`, the animation at its own size; on `feat/exercise-photos`, a second matching script and map (136 exercises, 53 of the 56 popular ones, 32 by a reviewed override list), a crossfade component (CSS only, still under "reduce motion"), the photos-first fallback logic, credits for the second dataset, and ADR-014.
- Decision by the developer: looked at both and kept the crossfade.
- How validated: full test run green on both branches. A phone check and a licence check of the images in free-exercise-db are still open.
- Lesson: when the quality limit is in the source file, say so before building anything.

## One gym per user

- Tool: Claude Code, with two general-purpose agents for the mechanical test rewrites (remote service tests; domain and device-store tests) while the screens and feature tests were done directly.
- Asked: remove the idea of several gyms, because people have one.
- Plan (approved before coding): enforce one gym in the database, drop the list, chooser, default flag, delete and the gym name; the first workout creates the gym with a standard barbell; the old `/gyms` addresses redirect.
- AI produced: migration 0004 (keeps the default or oldest gym of a user who has several, drops `is_default`, adds a unique index, defaults the name), a `GymService` of `get` and `save`, one `GymPage`, a `useMyGym` hook, a one-row device cache that may say "no gym yet", the first-workout set-up, new tests for all of it (including a PGlite test of the migration on data with several gyms), and ADR-015.
- Checked first: the hosted project had one user with one gym, so the migration deleted nothing there; it was applied through the Supabase plugin and the result read back.
- Problems found: the mechanical rewrite left about 20 test files with real behaviour to change (start-workout, Settings, Home, route and lb tests), handled directly; a retry test was reordered so the failure is armed before the save; an old `name` field in the local snapshot shape is now dropped on read.
- How validated: 4000 unit tests and 107 database tests passing; typecheck and lint clean. The e2e spec (edited for the new first-workout flow) and the hosted integration test (rewritten for one gym) need the hosted test user.
- Lesson: when a concept is removed, enforce the new rule in the database and delete the old one outright; a hidden list would leave two models in the code.

## Glass surfaces and one liquid glass lens (branch `feat/liquid-glass`)

- Tool: Claude Code, with a headless Chromium (Playwright) on a throwaway page to see the library work before using it.
- Asked: use liquidGL across the whole design system, CSS glass first, then liquidGL on two or three fitting surfaces, on a new branch that can be reverted; and replace the microphone icon on the workout button with something about exercise.
- Findings from the test page: the library works and can refract a fixed colour layer; a snapshot of the real page would go stale in a single-page app; over the near-black palette the effect is subtle on the bar; its tint multiplies the colour, so an accent-tinted button turned black. So the lens is used on one surface first (the floating Workout button, as a clear glass bubble with an accent icon).
- AI produced: glass tokens for both themes with a contrast test, `glass-flat` and `glass` classes, the ambient layer, glass on `Card`, `Button`, `Chip`, the bars and the dialog panel, a dumbbell icon, `liquidGlass.ts` (one config, capability checks, load on demand, never throws), a Settings switch, a hand-written type declaration, notices and ADR-016.
- How validated: full unit run green; a contrast test for text on glass in both themes (a first version failed for warning text in the light theme, so the light fill was made more opaque). Real phone browser, battery and frame rate are still open.
- Lesson: look at the effect with the real palette before building on it; a library demo on a colourful background says little about a dark app.

## The AI coach

- Tool: Claude Code.
- Asked: a text-only AI coach where users ask training questions, on free AI tiers; plan first, then build with the defaults (a Coach tab, the Gemini free tier, chat kept on the device, a visible switch for sharing recent workouts).
- Research before planning: free tiers differ and change (Gemini per project, Groq per model with a daily token cap, OpenRouter very small without credits, Cloudflare a shared daily pool, Chrome's built-in model desktop only). Gemini was chosen because the key and the pattern already exist.
- AI produced: shared request and response schemas; `buildCoachContext` (a small anonymous summary of recent training); `/api/coach` (handler with injected dependencies, shared Supabase helpers, a safety prompt, limits, a timeout, no logging of text); `CoachService` and a fetch implementation; the chat kept on the device (Dexie version 3) and wiped at sign-out; the Coach screen (ideas, a switch, safe text rendering, thinking and error states, offline); a Coach tab; ADR-017, the API contract, the prompt notes and three threat-model rows.
- Decisions kept in the code, not the prompt alone: the coach cannot write anything; the suggested weight comes from Next Rep's rules and is given to the coach as a fact; replies are never shown as markup.
- How validated: new tests for the summary builder, the schemas, the handler (auth, limits, injection, every failure), the client service, the device chat store and the screen all pass. Real answers for quality and safety are for the developer to read.
- Lesson: when an AI feature is added to a data app, make it read-only and hand it the numbers instead of letting it produce them.

## Keeping the coach to the gym and diet

- Tool: Claude Code.
- Asked: the coach must not answer things like the weather or a maths equation; for anything outside gym and diet it should say it cannot answer.
- Decision: do not rely on the prompt alone. Three layers: the prompt (a strict scope, now including diet and nutrition for fitness); a structured answer, `{onTopic, reply}`, where the server uses `onTopic` only to refuse and the refusal text is ours (a model cannot add a partial answer, and an unreadable answer shows nothing); and a short exact filter for plain cases (sums, "solve … =", the weather, prices, code and poem requests) that skips the model. The filter is tested against gym phrases that look similar ("5x5", "hot weather training", "solve a plateau") so it never catches a real question.
- Also changed: diet and nutrition questions are allowed (no crash diets, no drugs, medical conditions go to a doctor or dietitian); the screen says it only answers gym and diet questions and has a diet starter idea.
- How validated: new tests for the filter (14 turned away, 16 let through), the handler (off topic from the model, unreadable output, fenced JSON, limits still counted) and the screen all pass. Trying real off-topic and tricky questions against the live model is the real test of the prompt.
- Lesson: let code own the refusal; a model can only be asked nicely.

## Review fixes for the coach

- Tool: Claude Code, with the read-only `security-auditor` and `code-reviewer` agents.
- Found by the reviewers: Clear during a question brought the old chat back; a gym request ("write me a training program") was refused by our own prefilter; a failed save of the reply left the question stuck; the browser could forge earlier turns; nothing checked the reply's form; the training summary started on.
- AI produced: Clear is disabled while a question is out and is guarded and reports a failure; the question is taken back out when anything fails; the server cleans every turn and refuses links, code and tags in a reply; the prefilter no longer catches "program"; the summary starts off. 16 new tests.
- How validated: the whole suite passes (4250).
- Lesson: an agent review of your own feature finds bugs that your own tests were written around.

## Rate-limit scopes and a daily ceiling

- Tool: Claude Code, from the security audit and the code review.
- Found: `/api/parse` and `/api/coach` shared one counter per window, and in the first minute of each hour the 60 s and 3600 s windows used the same row, so one request counted twice. Anyone could also open many accounts and use up the free Gemini quota.
- AI produced: migration 0005 (counters per scope and window, the old one-argument function kept for an older deployment, a daily ceiling table and function with a per-account hourly cap), the two endpoints counting under their own scope and checking the ceiling just before the model call, and the names of the person's own exercises left out of the summary. PGlite tests for the database part and fake-based tests for the endpoints.
- How validated: `npm run test:db` and the api and coach tests pass.
- Lesson: a shared counter needs the endpoint in its key, and a global limit needs a per-account cap or one account can switch it off for everyone.

## The workout screen, as a user

- Tool: Claude Code, with Chrome driving the app at phone size.
- Found by walking the journey: a dead, dimmed "Tap instead" that looked like a button; the round Workout button sitting on top of "Log set"; two equal blue buttons; the exercise name twice; "End workout" wrapping; and a rest timer that never started by itself.
- AI produced: "Pick an exercise" as a real link, a chevron on the exercise name, a secondary "Tap instead", "Sets so far" as the list heading, no wrapping on "End workout", the round button hidden on workout screens, and a rest that starts after each set (tap and voice) with a remembered length and an off switch. 5 new tests; the older tests that expected the old labels were updated.
- How validated: the whole suite passes (4267). In Chrome the round button is gone, and the chevron and the "End workout" fix show; the "Pick an exercise" label was confirmed after a dev-server restart.
- Lesson: a button that cannot be used yet should say what to do first, not just look disabled.

## Progress graphs and a month of sample history

- Tool: Claude Code, with Chrome to look at the result.
- Asked: graphs in the Progress section, and a month of sample data that shows steady progress, based on the plan the developer gave.
- AI produced: `src/domain/progress` (workouts per week, best set per week, trend and its text), a "Workouts per week" bar chart, a trend line and "+X Kg since" text on every exercise row, and a Weight / Reps toggle on the exercise chart; in the test account only, 26 sample workouts (387 sets) over several weeks in the same weekly split, with weights that rise in plate-sized steps to the weights in the plan and a few missed sessions. The week the developer entered was left as it is.
- Found while checking: an exercise trained on two days with different weights (cable lateral raise, 10 Kg then 5 Kg) drew a zigzag and a false fall, so charts and trends now use the best set of each week.
- How validated: the whole suite passes (4287); in Chrome the weekly bars climb from 4 to 6 workouts, the exercise lines rise, and the Reps toggle works.
- Lesson: a trend between two single sessions says more about which day came last than about progress; compare like with like (the best of each week).

## A review for over-engineering (Ponytail)

- Tool: the Ponytail plugin's review rules (its `ponytail-review` instructions were followed by a read-only agent), then Claude Code applied the fixes.
- Found: copy-pasted limit blocks, a one-line wrapper with one caller, the same "take the question back" code twice, four near-identical localStorage helpers, two parameters nobody passes, an export used in one place, a 14-line inline icon, and a misplaced doc comment.
- AI produced: a `counted()` helper and a loop in the coach function, `cleanText` with a default length, one `takeBack` in the chat hook, two small `readStored`/`writeStored` helpers for the rest timer, a constant eight weeks, a private `weeklyBests` (tested through `chartPoints`), a shared `ChevronDown`, and the comment moved. Kept on purpose: `extendRest`'s seconds parameter (its tests use it), the chat's sending flag, and the old one-argument rate-limit function (a deploy-order shim).
- How validated: the whole suite passes (4286). The cut is smaller than the 69 lines estimated, because the helpers replace code rather than only removing it.
- Lesson: a review that only lists what to delete is cheap; check that each cut still has its tests before applying it.

## A second provider for the coach

- Tool: Claude Code, with web search for the provider facts.
- Asked: a Grok fallback for when Gemini's limit is reached. Finding: no free xAI tier could be confirmed, and the project allows free tiers only, so Groq was chosen after comparing it with OpenRouter (see ADR-018).
- AI produced: `api/_lib/fallbackProvider.ts` (settings reader that refuses a non-https address, and an OpenAI-style request over plain `fetch`), the handler asking the second provider once (Gemini fails, cannot be read, or its day is used up), timeouts that fit the app's 25 s wait, the three settings in `.env.example`, the dev server and `check:coach`, a new coach notice (shown again once) and About page line. 26 new tests.
- How validated: the whole suite passes (4477). The developer ran `npm run check:coach` with a real key: all eight lines passed, including Gemini and `openai/gpt-oss-20b` on Groq answering in the agreed `{onTopic, reply}` form. The fallback was tried in the running app with a deliberately wrong Gemini key: the coach still answered (about 10 s, because Gemini fails first and the second model thinks before it answers). The three settings are in Vercel for Production and Preview.
- Lesson: a fallback that sends users' text to a second company is a privacy change first and a code change second: say it where the person reads it.

## An empty workout is never kept

- Tool: Claude Code, with a general-purpose agent to update the older sync tests.
- Asked: if a workout is empty, it must not be stored in the database or anywhere.
- Found: "Start workout" was sent to the server at once, and "End workout" kept an empty workout, so empty rows piled up (two in the test account).
- AI produced: the outbox does not send a workout with no sets until its first set; `counts()` does not count it as waiting; `finishWorkout` (used by End workout) deletes an empty never-synced workout; the pull skips empty server workouts; the End workout question says "will not be saved" when there are no sets; 18 new tests. The one-time cleanup removed the two empty workouts from the test account. A workout already on the server whose sets were all undone is still saved when ended, as requested.
- Cost: about 60 older tests assumed an empty workout is sent; they were updated so each still proves what it was written for.
- How validated: see the test run in the commit; the database was checked for empty workouts after the cleanup.
- Lesson: a rule about what is stored belongs in the layer that stores it, and it shows up as old tests that quietly encoded the opposite.

## The workout screen waited for the server while offline

- Tool: Claude Code.
- Asked: find out why the e2e test "logs a set online, another offline" failed (the "You are offline" banner never appeared within 5 seconds).
- Found: the workout screen shows one loader until the exercise list is ready, and the list waited up to 8 seconds for the user's custom exercises from the server. Offline, that meant a loader for up to 8 seconds after every set. A real offline-logging fault, found through the e2e test.
- AI produced: `useExercises` does not wait for the server when `navigator.onLine` is false (the built-in exercises ship with the app); 2 new tests (offline is ready at once; online still waits). The first fails without the fix.
- How validated: the full suite (4501 tests), typecheck and lint pass. The e2e test itself is run by the developer against the hosted project.
- Lesson: a loader that waits for the network is an offline bug; the unit tests used fakes that answer at once, so only a browser set offline showed it.

## Documentation audit and fixes

- Tool: Claude Code, with four read-only reviewers (one per document group) and then five documentation editors working on separate files.
- Asked: find every place where the docs repeat themselves, contradict each other, are wrong against the code, or describe an old state; then fix all of it.
- Found: about 125 problems. The biggest groups: statuses frozen early that still called voice, `/api/parse`, the coach and deployment "planned" (about 17 docs, including the README); an ADR file (009) emptied by an earlier commit and linked from about 17 docs; ADRs not yet marked as amended by later ones; facts that no longer matched the code (a token cap of 700 instead of 1200, "the only SECURITY DEFINER function", "seven tables"); a prompt copy that did not match the real prompt; the Geist font licence missing from the notices; and numbers repeated in 4 or more places.
- AI produced: every finding was fixed or answered. ADR-009 was restored from history and marked as superseded in part by ADR-015; statuses were refreshed; the prompt copies were replaced by short descriptions that point to the code as the one source; the rate limits, the list of commands agents must not run and several detail lists now live in one place and are linked from the others; the Geist notice was added to `THIRD_PARTY_NOTICES.md` and to the About page (with a test); the agent definitions and the `new-feature` skill were brought in line with `CLAUDE.md`; 9 lessons were added to `docs/learning/lessons.md`.
- How validated: Prettier is clean, no unexpected deletions, every relative link resolves, every file path written in backticks exists, a search for the old status phrases finds only one historical line in ADR-008, and the coach summary switch was confirmed to start off in the code. A second read-only pass is the way to double-check the roughly 50 edited files.
- Lesson: a status written as a date goes stale in days; the docs that stayed right were the ones that named a file or a command instead of a state.

## Email confirmation at sign-up, with custom SMTP

- Tool: Claude Code, with Claude in Chrome for the Supabase and Brevo dashboards.
- Asked: switch on Supabase "Confirm email" before the feature freeze, so sign-up stops revealing which addresses are registered (ADR-007).
- Found: Supabase's built-in mail sends only to members of the Supabase organisation, about 2 an hour, so judges could not have confirmed an account. The app needed no code change: a sign-up without a session already shows "Check your email to confirm your account, then sign in.", and the link confirms the account on Supabase's side.
- AI produced: custom SMTP on Brevo's free plan (300 a day; sender is a verified personal Gmail address, as there is no domain of our own), the Supabase email limit raised to 100 an hour, the Site URL set to the latest Vercel preview, and "Confirm email" switched on. The developer generated the Brevo SMTP key and pasted it into Supabase, and created the two demo accounts (auto-confirmed), so no secret or password passed through the AI. Docs updated: README, roadmap, security checklist, deployment guide, ADR-007, ADR-017, threat model, AGENT_CONTEXT.md, the rate-limit agent doc.
- How validated: a read-only query showed the demo accounts and test users A and B as confirmed; the developer signed up on the preview, received the confirmation email and signed in. A second sign-up with the same address, delivery to other inboxes and the spam folder are still open.
- Lesson: check what the free built-in mail service will actually deliver before turning on a setting that depends on it.

## "Email verified" message after the confirmation link

- Tool: Claude Code, with Claude in Chrome for the Supabase dashboard, and the `security-auditor` agent.
- Asked: when someone clicks the link in the confirmation email, show a message on the site saying the email is verified; also keep a copy of the email template in the repo.
- First version: sign-up sent `emailRedirectTo: <origin>/sign-in` and the page read Supabase's tokens from the URL hash, with `https://*-next-rep3.vercel.app/**` added to the redirect allowlist for previews.
- Problems found: the security audit rated the wildcard high (any Vercel user can create a project whose name ends in `-next-rep3`, so an auth email could send a victim's session to it), and low: tokens stayed in the browser's history. The wildcard was removed from the dashboard straight away (back to only `http://localhost:5173`).
- AI produced (final): the email links to `{{ .SiteURL }}/sign-in?token_hash={{ .TokenHash }}&type=email`; `readConfirmLink` reads and validates the code and removes it from the address; the page shows "Confirm your email" and `AuthService.verifyEmail` (supabase `verifyOtp`) spends the code only when that button is tapped, which signs the user in; the page then says "Your email is verified. You're signed in as <email>." with a "Start logging" button, or the new `link_invalid` message. A second audit found that spending the code on page load allowed login CSRF and that a signed-in visitor never saw a failed link's message; both were fixed (tap to confirm, a warning naming the current account, the page stays for a failed link). No login tokens are ever in a URL and no redirect allowlist entry is needed. Template copy: `supabase/templates/confirm-signup.html`.
- How validated: unit tests for the parser, the service mapping (`otp_expired` and other 4xx to `link_invalid`), and the page (nothing spent on load, verified screen naming the account, a double tap spends the code once, the switch-account warning, checking state, invalid link also for a signed-in visitor, network, throwing service, old-style tokens removed unused, plain visit untouched); lint and typecheck clean; the full suite passes (4530; one unrelated rest-timer test failed once under load and passed 5 of 5 runs alone and on the rerun). The real email flow was checked after the deploy and the new template was saved in the dashboard.

## Production deploy and the public address

- Tool: Claude Code, with the Vercel command line.
- Asked: deploy the app to production, and give it an address anyone can open without a Vercel login.
- Found: the first attempts hit network and login-refresh issues, and the command sandbox could not read its own placeholder files in the project folder. The fix was to deploy a clean export of the committed code (no placeholder files, no `.env.local`) after the developer logged in again. The production build was checked from outside without a login: pages, manifest, icons and security headers load, and both functions answer 401 without a sign-in. The automatic project address was not suitable as a link and the team address was behind Vercel's login, so `nextrep-gym.vercel.app` was added as a domain of the project, and it follows every production deploy.
- AI produced: the clean-export deploy, the public checks, the domain, and the documentation update (README live link, deployment guide, roadmap, checklists).
- How validated: the same checks on the new address; the two production builds were compared and differ only in the deployment id embedded in the bundle, and neither contains a secret key.
- Lesson: the address you give people has to be tested without your own login; a protected alias and a public one can sit side by side on the same project.

## Sample data for the judges' demo accounts

- Tool: Claude Code, with the Supabase connector (SQL).
- Asked: give the two pre-confirmed demo accounts a training history, so judges do not open an empty app.
- Found: the demo accounts were confirmed but empty; the sample history (invented data) lived only in test user A, whose data the integration tests wipe.
- AI produced: one guarded query that copies the gym, the 32 workouts and the 474 sets of test user A into each demo account with new ids. It refuses to run if the source is not test user A, if a target is not a demo account, or if a target already has data, and it checks the copied counts against the source before it finishes.
- How validated: a read-back query shows 1 gym, 32 workouts and 474 sets in each demo account, from the first to the last training day, the same as the source.
- Lesson: keep the data that judges see in accounts that no test touches.

## Housekeeping before the submission: advisor fix, Groq terms, licence, stray users

- Tool: Claude Code, with the Supabase connector (SQL, migration, advisors) and web search and fetch for Groq's documents.
- Asked: close the open small items: a licence file if the rules ask for one, the security advisor's `rls_auto_enable()` warning, Groq's data policy, and two stray test users.
- Licence: the organisers' rules only say to respect third-party licences and terms; they do not ask for a licence on our own code, and `package.json` is marked private. No `LICENSE` file was added; choosing an open-source licence for work made for a company hackathon is left to the developer and the company.
- Advisor fix: migration `0006_revoke_rls_auto_enable.sql` takes the right to call Supabase's own `rls_auto_enable()` helper away from `public`, `anon` and `authenticated`. Before applying it, a read-only query showed the function is owned by `postgres`, runs as its owner and is used by one event trigger; after applying it, the same query showed `anon` and `authenticated` cannot call it, the owner can, and the event trigger is still active, and both of its warnings were gone from the advisor. The migration only acts if the function exists, so the local database tests are unaffected; 4 new tests (121 database tests now) cover both cases. The notices that remain are intended and are written down in the security checklist.
- Groq terms: from Groq's own data page and Services Agreement: Groq may not use inputs or outputs for training (section 4.2), keeps nothing by default for inference, may log temporarily for up to 30 days for reliability and abuse checks, and offers Zero Data Retention. Recorded in ADR-018 with the links. The in-app notice and the README still say that free-tier prompts may be used to improve products, which is accurate for Google and cautious for Groq. The Data Processing Addendum and the acceptable-use terms remain to be read.
- Stray users: two accounts made while testing sign-up were deleted by id and email after a check that they owned no workouts, gyms or sets; the query refused to finish unless exactly two accounts matched.
- Lesson: read what a function or account owns before revoking or deleting, and check afterwards with the same query.

## Cloud speech-to-text for iPhone voice

- Tool: Claude Code, with the developer's own tests on an iPhone 15.
- Asked: make voice logging work on iPhone (Safari and Chrome).
- Found: Chrome and Safari on iPhone share WebKit's speech recognition, which ends with no words and no error, so the app needs a second way to hear the person. The developer chose Groq Whisper, and the cloud path only where the browser's recogniser fails.
- AI produced: `POST /api/transcribe` (`api/transcribe.ts`, `api/_lib/transcribe.ts`, `transcribeProvider.ts` for Groq Whisper, with the shared contract in `src/domain/parser/transcribe.ts`); the client `useVoiceInput.ts` with a recorder (`recorder.ts`) and silence detection (`silence.ts`), switched on by the browser's failure and remembered on the device; `createFetchTranscribeService` in `src/data/remote/transcribe.ts`; the cloud notice on the workout screen; the function's dev-server support in `vite.devApi.ts`; ADR-019; and the docs updated to match. The daily ceiling is shared with Gemini, so no database migration was needed.
- How validated: unit tests with fakes for the handler (token, content type, size, limits, ceiling, failures), the provider (silence filter, error handling), the client service, the recorder, the silence detector and the hook; a whole-app test (switch after a deaf recogniser, record, transcribe, confirm card, Log set). Unit tests went from 4530 in 184 files to 4587 in 191 files. The developer then tested it on an iPhone 15 in Safari and Chrome against the deployed site, and it worked.
- Still open: Whisper accuracy beyond that phone, and the cost of voice on the shared daily allowance in real use.
- Lesson: when one phone's browsers share an engine, a fix for that engine's limit belongs in one shared place, and it is confirmed on the failing device before it is written up as fixed.

## Ask for the missing number

- Tool: Claude Code.
- Asked: when the person says "bench press 45 kilo" with no reps, the app only said it did not understand. The developer asked for a better way than saying the whole set again.
- Found: the parser already knows exactly what is missing (`NO_REPS` or `NO_WEIGHT`) and keeps the exercise and the other number; the screen threw that away. Such a phrase also scored under the Gemini threshold, so it cost a free-tier call to be refused again.
- AI produced: a `partial` draft in `src/features/voice/voiceDraft.ts` (only when the exercise is matched and nothing else is in doubt; `withReps` and `withWeight` build the full set), `MissingNumberCard` (quick rep buttons, typed number, "same as last time"), and the wiring in `VoiceLogger`, which skips Gemini for a partial draft. The answer goes through the same validators and confirm card, and nothing is stored until Log set. The developer chose the tap version first and left answering by voice for later.
- How validated: unit tests for the draft (reps missing, weight missing, both missing, unknown exercise, other doubt, bodyweight, unit conversion), the card, and whole-app tests (tap, typed, invalid numbers, same as last time, cancel, new phrase replaces the question, no Gemini call). Unit tests went from 4587 in 191 files to 4606 in 193 files.
- Still open: the card on a real phone; answering by voice (not built).
- Lesson: when a refusal says "try again", check whether the parser already knows what to ask for.

## Pre-submission QA pass and two parser fixes

- Tool: Claude Code, with the `qa-tester` agent for the tests and the `parser-specialist` agent for the fixes.
- Asked: with the UI finished, run the QA pass that had been on hold: edge cases, negative tests and failure scenarios for the voice parser and the missing-number question, the weight maths, sync and the API handlers.
- AI produced: 108 tests in three new files (`voiceDraft.missing.qa.test.ts`, `parser.speech.qa.test.ts`, `transcribe.boundary.qa.test.ts`). Sync, records, units and the parse and coach handlers were already covered, so no duplicates were added. Two tests exposed real parser bugs and were kept as skipped tests with a note: a repeated reps marker (`bench press 8 reps 8 reps`) was read as a weight of 8 at full confidence, and the Hindi word "sau" (100) was dropped silently, so "do sau kilo" became 2 kilo at full confidence. The fixes are small: a count of numbers that could not be placed in `quantities.ts`, one new word list in `vocabulary.ts`, and one line in `parse.ts`. Both phrases now take the existing "extra number" path (lower confidence), so they are confirmed or sent to the fallback. Six phrase fixtures were added (307 to 313) and the grammar doc was updated.
- Problems found: one Hindi fixture value from the agent was wrong ("ek sau bees kilo" reads as 20 kilo, because "bees" is read as the weight and "sau" only adds the doubt), so the fixture was corrected after checking the parser's rule. The repeated-marker case ends at confidence 0.35 with no weight and goes to the fallback. Only "sau" is flagged; "hazaar" and the other unbuilt Hindi tens are not. Also noted and left as is: a minus sign is dropped ("-60 kilo" reads 60), and a per-side word said in the first phrase is lost when the missing weight is asked.
- How validated: the two skipped tests were un-skipped and pass; the whole unit suite (4720 tests in 196 files), the typecheck and the lint are clean; the QA agent confirmed both bugs failed before the fix.
- Still open: the new fixtures on a real phone with real speech.
- Lesson: an unbuilt number word must lower confidence, not vanish; a parser that drops a word it does not know can turn 200 into 2 and still look sure.
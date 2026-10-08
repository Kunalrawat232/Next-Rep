# AI log

Running log of how AI was used, what went wrong and how it was validated. Append an entry after each completed task. The developer fills "How validated".

## Entry format

```md
## 2026-10-08: <task name>

- Tool: Claude Code / Claude chat / Claude Design / Gemini
- Asked: <one line>
- AI produced: <one line>
- Problems found: <what was wrong or missing, if anything>
- How validated: <tests, manual check, review> (developer fills)
- Lesson: <optional; promote to lessons.md if reusable>
```

## Entries

## 2026-10-08: Phase 0 planning

- Tool: Claude Code (plan mode, then the advisor/stronger-model review)
- Asked: read the project brief and plan Phase 0.
- AI produced: a 15-step plan, a summary of the product, and four clarifying questions (branching, auth method, rate-limit storage, open-question defaults).
- Problems found: the advisor review caught gaps in the first plan: a dangling "branching per the answer below" reference with no question; a final check ("no mention of the brief's filename") that contradicted files the plan itself required; the "new" docs were only referenced, not listed, so some could be dropped; a JWT secret listed in `.env.example` by default although the docs recommend JWKS; and a git hooks path that would not survive a fresh clone.
- How validated: _(developer to fill)_
- Lesson: have a second model review the plan before executing; it found concrete gaps the author missed.

## 2026-10-08: Tooling, dependencies and scaffold

- Tool: Claude Code
- Asked: install tooling, propose and pin dependencies, scaffold the app with CI and hooks.
- AI produced: exact-pinned `package.json`, Vite/React/TS/Tailwind/Vitest/Playwright/PWA setup, gitleaks pre-commit hook, GitHub Actions workflow, Claude Code hooks (lint/typecheck after edits, tests when a turn ends).
- Problems found: (1) the newest TypeScript (7.0.2) conflicts with `typescript-eslint`'s peer range, so it was pinned to 6.0.3; (2) `npm audit` reported 11 issues from the dev-only `@vercel/node` and offered a nonsensical downgrade as the fix, so the package was removed; (3) plugin install commands pasted into chat do nothing, because slash commands run only when the developer types them, so the AI had to wait for confirmation and re-check the installed list; (4) the ESLint config applied Node globals only to TS files, which broke the first script.
- How validated: _(developer to fill)_ Evidence in the repo: lint/typecheck/tests/build and a Playwright smoke test pass; a fake token was blocked by the pre-commit hook; a deliberate lint error was reported back by the edit hook.
- Lesson: check peer ranges and audit sources yourself; see `docs/learning/lessons.md`.

## 2026-10-08: Context files and documentation

- Tool: Claude Code
- Asked: turn the project brief into permanent context files, ADRs, agents and skills, with real content.
- AI produced: `CLAUDE.md` (60 lines), README, about 40 docs, six ADRs, five subagents, two skills.
- Problems found: an internal link check found two links to a document created later (resolved by step 11); the filename of the brief appears once in `.prettierignore` and has to be removed when the brief is retired.
- How validated: _(developer to fill)_
- Lesson: run a link and reference check after generating many docs.

## 2026-10-08: Database schema, seed and domain schemas

- Tool: Claude Code with the Supabase skills; PGlite (Postgres in WASM, later committed as `tests/db/schema.test.ts`) for local verification; an automated commit security review.
- Asked: write the migration with RLS, a 50-60 exercise seed, and Zod domain schemas.
- AI produced: `0001_init.sql`, a seed generated from one JSON source, composite foreign keys, an exercise-visibility trigger, a rate-limit function, `ParseResult`/`Set`/`Workout` schemas and `totalFromPerSide` with tests.
- Problems found: (1) the design went beyond the brief and was flagged for review (composite keys, trigger, one `SECURITY DEFINER` function); (2) a verification test of mine assumed a set's total could be edited alone, and the database correctly rejected it, which became a documented rule; (3) the automated security review flagged **seed id squatting**: seed ids are public and clients may choose exercise ids, so a user could pre-create a row with a seed id and hide the global exercise. The seed now resets `user_id` on conflict, with a regression check; (4) the AI asserted the Hinglish aliases ("dand", "baithak") are right, but could not verify them.
- How validated: _(developer to fill)_ `npm run test:db` passes (38 tests: two-user isolation, constraints, rate limiter, squatting); sabotaging a policy or a check constraint makes the matching tests fail. A deliberate break of `totalFromPerSide` makes 6 tests fail. Not yet run against a hosted Supabase project.
- Lesson: foreign keys bypass RLS; test cross-tenant references explicitly, and treat public ids as attacker-controlled.

## 2026-10-08: Deployment guide and git history

- Tool: Claude Code
- Asked: write the manual deployment steps, then clean up the git history.
- AI produced: a deployment guide checked against the current Supabase, Vercel and Google docs, a `vercel.json` SPA rewrite, and a squash of 15 commits into 4.
- Problems found: the AI committed after every small sub-step (16 commits) without asking, treating "commit after each working step" in the brief as standing permission; the developer pushed back that nothing is deployed and the history was noisy. Also, Gemini free-tier details were not on the pages fetched, so the guide says to confirm them in AI Studio instead of stating them.
- How validated: _(developer to fill)_ The squashed tree is byte-identical to the original (same tree hash); the intermediate scaffold commit passes lint, typecheck and tests on its own.
- Lesson: one commit per finished task, ask before anything else; see `docs/learning/lessons.md`.

## 2026-10-08: Distributing and retiring the project brief

- Tool: Claude Code
- Asked: prove every section and rule of the temporary project brief now lives in a permanent file, then retire the brief.
- AI produced: a coverage table (about 45 rows, one per section and rule group, with file and heading) backed by 108 automated checks that each assert a rule's text exists in its target file, plus a check that every file the brief lists exists.
- Problems found: 107 of 108 checks passed first time (the one miss was a regex-order false alarm). The check found five real defects in my own docs: the data model still named the rate-limit column `count` (the migration uses `request_count`), the security checklist quoted a stale test count, the Phase 0 table lacked the brief's pause markers, the dependency-approval rule was only implicit, and VS Code and the GitHub account were missing from the tooling doc. Three of those slipped through because scripted text replacements silently did nothing after Prettier re-wrapped the Markdown tables.
- Decisions by the developer: approved the coverage table; asked for the database checks to be kept in the repo, so they became `tests/db/schema.test.ts` with PGlite as an exact-pinned dev dependency; the retirement is staged but not committed until the developer says so.
- How validated: _(developer to fill)_ A deliberate sabotage of one RLS policy and of one check constraint makes the matching database tests fail; a search for the brief's filename returns no hits in the working tree after retirement; the brief stays in Git history.
- Lesson: after any scripted edit, assert it landed (re-grep); see `docs/learning/lessons.md`.

## 2026-10-08: Evaluating graphify (installed, run in full, removed)

- Tool: Claude Code, with the third-party `graphify` knowledge-graph tool and 3 general-purpose subagents
- Asked: install graphify for Claude Code, then run the full pass (code plus docs) on the project.
- AI produced: a vetting of the package before installing (PyPI page links to the same GitHub repo, licence, release history, dependencies), a read of the skill's own instructions for risky commands, a project-scoped install, and a full run: 46 code files parsed locally and 53 docs read by three subagents, giving a 428-node, 566-edge graph in 45 named communities, with an HTML view and a report.
- Problems found: (1) `graphify install --project` re-wrote tracked files after they had been cleaned up: hooks with a hard-coded absolute path in `.claude/settings.json`, a new `.claude/CLAUDE.md` and a stray backup file, so each step needed a backup and a diff; (2) JSON config files were modelled as code, so the top "god nodes" were `compilerOptions` and `scripts`; (3) SQL was not parsed because the parser is an optional extra; (4) the tool's own check said the 25k-word corpus fits in one context window and may not need a graph; (5) its hooks inject "MANDATORY" instructions into every search and read, which steers the assistant from a third party; (6) the graph and skill would sit in the project folder and could end up in the submission ZIP.
- Decision: removed completely (package, hooks, skill, `CLAUDE.md` section, output, cache), and `CLAUDE.md` restored byte-for-byte to its pre-install state. Revisit at the start of Phase 3 (16 Oct 2026), when `parser`, `sync` and `api` give the graph real cross-module relationships.
- How validated: _(developer to fill)_ Evidence: the benchmark measured about 8.5x fewer tokens per query but on a corpus of only about 28k tokens; after removal a search finds no mention of the tool in the working tree and `.claude/settings.json` has no diff against the committed version.
- Lesson: vet a tool and run it on a small trial before letting it edit shared instruction files and hooks; see `docs/learning/lessons.md`.

## 2026-10-08: Phase 1 task 1, weight helpers and plausibility validators

- Tool: Claude Code with the `new-feature` flow, `code-reviewer` and `qa-tester` subagents
- Asked: implement the pure weight helpers and the `validateSet` plausibility rules from the weight rules, tests first.
- AI produced: `toKg`, `perSideFromTotal`, `weightBreakdown` and the validator with a config file; 121 tests including a 3,000-candidate property test that every resolved weight is storable; then 123 more edge-case tests from `qa-tester`.
- Problems found: (1) the first implementation passed all its own tests but was missing four behaviours that `qa-tester` found by reading the spec: the below-bar question skipped the "Did you mean 60?" option, the plate warning was skipped for totals whose breakdown is not exact, an unrounded bar weight could break the database check, and a warning was lost when a result became a question; (2) `code-reviewer` found a bug in earlier AI-written code: `SetSchema.safeParse` threw a `RangeError` for a negative bar weight because a refine called a helper that throws; (3) the reviewer had no shell, so its claims were unverified and each was reproduced with a probe before any fix; (4) a regex-based mutation check silently failed to match after Prettier re-wrapped a line, the same class of mistake as before; (5) `validateSet` grew to about 170 lines and was split into small helpers.
- How validated: _(developer to fill)_ Evidence: 255 tests pass; 9 deliberate breakages each make tests fail; the 6 deliberately failing QA tests all pass after the fixes.
- Lesson: a passing first run is not evidence; a reviewer that cannot run code needs its claims reproduced; a schema refine must never call a function that throws.

## 2026-10-08: Checking the hosted Supabase connection

- Tool: Claude Code
- Asked: confirm that the Supabase project, migration, seed and auth are set up and reachable.
- AI produced: `scripts/check-supabase.mjs` (`npm run check:supabase`), a read-mostly check that prints only PASS/FAIL, and a network diagnosis when the first run failed.
- Problems found: (1) the `!` commands the developer typed arrived as plain text and did not run, twice; (2) the AI offered to run the script itself and the developer rejected it, because it loads `.env.local`, so the developer ran it and pasted the output; (3) the first run failed with only `fetch failed`, so the script now reports the underlying cause code; (4) the AI traced the failure with non-secret tests (raw TCP connected, `--resolve` skipped DNS and got HTTP 401, IPv4 lookups took 0.08 s, IPv6 lookups timed out at 5 s on the home router) to a slow router DNS, not a Supabase or key problem, and gave the developer reversible `nmcli` commands rather than changing network settings itself; (5) earlier, the `0` seed count came from the seed not being run, caught by asking for two simple checks instead of guessing.
- How validated: _(developer to fill)_ Evidence: after switching to public DNS all 16 checks passed, including 56 seed rows, sign-in for both test users and the rate-limit function. The Supabase Advisors page reported no issues.
- Lesson: when a call fails with no HTTP status, separate DNS, TCP and the application layer before blaming keys; design secret-loading scripts so their output is safe to paste and let the developer run them.

## 2026-10-08: Over-engineering review with the ponytail skill

- Tool: Claude Code with the third-party `ponytail-review` skill, followed once from its plugin cache (not enabled for the project)
- Asked: review the weight and validator code only for things that can be deleted or shortened.
- AI produced: 8 numbered findings in the skill's format, with a "net -55 lines" estimate and its own verdict on which to accept.
- Problems found: the lens only measures size. It suggested deleting unused helpers that the next UI work needs, and trimming the 495-line edge-case test file, which is judged QA evidence. The developer chose findings 1 to 4 (pure shrinks) and declined the rest.
- How validated: _(developer to fill)_ Evidence: the 255 unit tests and 38 database tests are unchanged and pass; the four cuts removed 13 lines, fewer than the 20 estimated.
- Lesson: a complexity-only review is a useful second opinion for finding fat, not a decision-maker; read a third-party skill's instructions before following them.

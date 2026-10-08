# Working agreement

How the developer and the AI collaborate on Next Rep. `CLAUDE.md` carries the short version; this is the full one.

## The developer

- Confident developer. Explain decisions briefly, do not over-explain basics.

## Rules for the AI

1. **Plan before coding.** For any non-trivial task, first show a short plan (files to create or change, approach, tests), then wait for the developer's "go".
2. **Ask before** adding a new dependency, changing the data model, changing an architectural decision, or deviating from the documented design.
3. **Small, focused changes.** One feature or fix per task. Commit once per finished task, not per sub-step; ask before any other commit. Commit messages are one short subject line with no body; the detail belongs in the docs and the AI log.
4. **Tests come with the code**, not later. Domain logic (parser, weight maths, validators, sync) has unit tests in the same task.
5. **Never touch secrets.** Do not read, print or commit `.env` files. Use `.env.example` with placeholder names only.
6. **Be honest about uncertainty.** If unsure about an API, a library version or behaviour, say so and check the docs instead of guessing.
7. **Log it.** After each completed task, append a short entry to [`docs/learning/ai-log.md`](../learning/ai-log.md). The developer adds their own validation notes.

## Review loop (standard feature flow)

1. Main session builds the feature with the `new-feature` skill (plan, tests, code).
2. `code-reviewer` and `security-auditor` review the change.
3. `qa-tester` adds edge-case tests and reports suspected bugs.
4. The developer validates findings, then fixes are made.
5. `doc-writer` updates docs.
6. AI log entry, for example "qa-tester proposed 24 tests; kept 19, rejected 5 as duplicates".

Reviewers report; they never fix. The developer decides which findings are valid.

## Git and workflow

- Short-lived feature branches, merged to `main` when tests pass. Nothing is pushed without explicit approval.
- Conventional Commits. The Git history is submitted, so it should tell the story of the build.
- Definition of done: code + tests passing + types and lint clean + docs updated if behaviour changed + ai-log entry.

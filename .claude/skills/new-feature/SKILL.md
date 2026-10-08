---
name: new-feature
description: Use when building any new feature or non-trivial change in Next Rep. Runs the plan, tests, code, review, docs and ai-log workflow and enforces the project's rules.
---

# new-feature

Follow these steps in order. Do not skip the plan or the pause for the developer's "go".

1. **Read context.** Read `CLAUDE.md` and the docs for the area (`docs/domain/`, `docs/architecture/`, `docs/design/screens.md` for UI). Note which ADRs apply.
2. **Plan.** Write a short plan: files to create or change, approach, tests, docs to update. Flag anything that needs approval (new dependency, data model change, deviation from a decision). **Stop and wait for the developer's "go".**
3. **Tests first.** For domain logic (parser, weight maths, validators, progression, sync) write the failing unit tests, table-driven where possible. Confirm they fail for the right reason.
4. **Code.** Implement the smallest change that makes the tests pass. Keep `src/domain/` pure. Use design tokens and the shared component names from `docs/design/design-system.md`. Build functional and plain if the design has not arrived.
5. **Verify.** Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Fix failures. Commit with a Conventional Commit message.
6. **Review.** Delegate to `code-reviewer` and `security-auditor`; add `qa-tester` for domain or sync code. Present findings to the developer; do not auto-fix.
7. **Docs.** Update affected docs, add or amend an ADR if a decision changed (delegate to `doc-writer` if large).
8. **AI log.** Append an entry to `docs/learning/ai-log.md` (tool, asked, produced, problems found, how validated left for the developer, lesson). Promote reusable lessons to `docs/learning/lessons.md`.

Definition of done: code + tests passing + types and lint clean + docs updated if behaviour changed + ai-log entry.

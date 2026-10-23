---
name: new-feature
description: Use when building any new feature or non-trivial change in Next Rep. Runs the plan, tests, code, review, docs and ai-log workflow and enforces the project's rules.
---

# new-feature

Follow these steps in order. Do not skip the plan or the pause for the developer's "go".

1. **Read context.** Read `CLAUDE.md`, then `agent_docs/index.md` and the agent docs for the area, and only then the code if needed. Read the matching `docs/` files (`docs/domain/`, `docs/architecture/`, `docs/design/screens.md` for UI). Note which ADRs apply.
2. **Plan.** Write a short plan: files to create or change, approach, tests, docs to update. Flag anything that needs approval (new dependency, data model change, deviation from a decision). **Stop and wait for the developer's "go".**
3. **Tests first.** For domain logic (parser, weight maths, validators, progression, sync) write the failing unit tests, table-driven where possible. Confirm they fail for the right reason.
4. **Code.** Implement the smallest change that makes the tests pass. Keep `src/domain/` pure. Use design tokens and the shared component names from `docs/design/design-system.md`. Build functional and plain if the design has not arrived.
5. **Verify.** Run `npm run lint`, `npm run typecheck` and `npm test`. Fix failures. Do not run `npm run build` (it loads `.env.local`; the developer runs it). Do not commit yet.
6. **Review.** Delegate to `code-reviewer` and `security-auditor`; add `qa-tester` for domain or sync code. Present findings to the developer; do not auto-fix. The qa-tester agent may only add new test files.
7. **Docs.** Update the matching doc in `agent_docs/` (or create one and add it to its folder's `index.md`), update `AGENT_CONTEXT.md` if a route, table, column, component, hook, env var, endpoint, domain rule or command changed, and update affected `docs/`. Add or amend an ADR if a decision changed (delegate to `doc-writer` if large).
8. **AI log.** Append an entry to `docs/learning/ai-log.md` (tool, asked, produced, problems found, how it was validated (what was run and by whom, and what was not), lesson). Promote reusable lessons to `docs/learning/lessons.md`.
9. **Commit.** After the review and the developer's go: one finished task = one commit: a single short Conventional Commit subject line, no body, plus the Co-Authored-By attribution trailer when the harness asks for one (the trailer is the only allowed body). Ask before any other commit. Never push without approval. If the user says they handle git themselves, do not commit.

Definition of done: code + tests passing + types and lint clean + docs updated if behaviour changed + ai-log entry, committed after review.

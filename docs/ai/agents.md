# Subagents and the standard feature flow

Subagents run in their own context and are restricted to specific tools. They live in `.claude/agents/` (project scope, committed). Each has a precise `description` so delegation is reliable.

| Agent               | Job                                                                                                                           | Tools                               | Model               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------- |
| `code-reviewer`     | Reviews diffs against coding standards and the security checklist                                                             | Read, Grep, Glob (read-only)        | inherit             |
| `security-auditor`  | RLS, secrets, input validation, `/api/parse` auth, prompt injection                                                           | Read, Grep, Glob (read-only)        | inherit             |
| `qa-tester`         | Edge cases, negative tests, failure scenarios; writes tests in `tests/` or next to domain code; never changes production code | Read, Write, Edit, Bash, Grep, Glob | inherit             |
| `parser-specialist` | Owns `src/domain/parser` and `tests/fixtures/voice-phrases.json`                                                              | Read, Write, Edit, Bash, Grep, Glob | inherit             |
| `doc-writer`        | Updates docs, ADRs and README after features                                                                                  | Read, Write, Edit, Grep, Glob       | haiku (saves usage) |

## Rules for all agents

- Read the relevant `docs/` files before acting.
- Reviewers **report**, they do not fix. The developer decides which findings are valid.
- End with a short structured report: findings, files touched, tests added, open questions.

## Standard feature flow

1. Main session builds the feature using the `new-feature` skill (plan, tests, code).
2. `code-reviewer` and `security-auditor` review the change.
3. `qa-tester` adds edge-case tests and reports suspected bugs.
4. The developer validates findings, then fixes are made.
5. `doc-writer` updates docs.
6. AI log entry, for example "qa-tester proposed 24 tests; kept 19, rejected 5 as duplicates".

Installed plugins that complement these: `security-guidance`, `feature-dev`, `code-review`, `pr-review-toolkit`, `frontend-design`, `typescript-lsp`, `skill-creator`, `claude-md-management`, `claude-code-setup`.

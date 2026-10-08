# AI-assisted QA report

How AI contributed to QA and how its output was validated. The counts below are updated after each AI-assisted testing task; nothing is merged without the developer's review.

## Method

1. The `qa-tester` agent and the `parser-test-cases` skill propose edge cases, negative tests and failure scenarios, then write them as Vitest tests.
2. The developer reviews every generated test: keeps, edits or rejects it.
3. New tests must be shown to fail without the feature (or against a deliberately broken version) so they can actually catch regressions.
4. Suspected bugs are reported, not silently fixed; the developer decides which are valid.
5. Playwright MCP is used for exploratory and offline testing on the running app.
6. `code-reviewer`, `security-auditor`, the `code-review` plugin and `pr-review-toolkit` review each feature's diff; findings are triaged by the developer.

## Numbers

| Task                  | Generated | Kept | Rejected | Real bugs found | Notes |
| --------------------- | --------- | ---- | -------- | --------------- | ----- |
| _(none yet: Phase 0)_ | 0         | 0    | 0        | 0               |       |

## Where AI was wrong

Recorded in [`docs/learning/ai-log.md`](../learning/ai-log.md) and distilled in [`lessons.md`](../learning/lessons.md).

## Phone testing

Real-device testing on Chrome (Android) and Safari (iOS) over HTTPS preview deployments, with notes on voice accuracy and noisy gyms. Colleague testing (2 to 3 people) with AI-summarised feedback and the resulting changes.

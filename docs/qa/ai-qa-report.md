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

| Task                                                     | Generated   | Kept                         | Rejected                | Real bugs found | Notes                                                                                                                                                                                                                        |
| -------------------------------------------------------- | ----------- | ---------------------------- | ----------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1.1 validators and weight helpers (`qa-tester`)    | 123         | _(developer to review)_      | _(developer to review)_ | 4               | 6 of the 123 failed on purpose and exposed: no "Did you mean 60?" in the below-bar question, plate warning skipped for odd totals, unrounded bar weight, warnings lost on questions                                          |
| Phase 1.1 code review (`code-reviewer`, no shell access) | 14 findings | 5 verified real, 3 low-value | 6                       | 1               | The one unique real bug: `SetSchema.safeParse` threw a `RangeError` on negative bar or per-side weight (verified by a probe). Its claims were unverified because it could not run code, so each was reproduced before fixing |

## Where AI was wrong

Recorded in [`docs/learning/ai-log.md`](../learning/ai-log.md) and distilled in [`lessons.md`](../learning/lessons.md).

## Phone testing

Real-device testing on Chrome (Android) and Safari (iOS) over HTTPS preview deployments, with notes on voice accuracy and noisy gyms. Colleague testing (2 to 3 people) with AI-summarised feedback and the resulting changes.

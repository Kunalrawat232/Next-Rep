# AI across the lifecycle

Phase → AI tool → what it produced. Updated as work happens; this is judging evidence.

| Phase                  | AI tool                                             | What it produced                                                                                                 |
| ---------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Requirements and scope | Claude chat                                         | Product brief, MoSCoW scope, domain rules, architecture sketch                                                   |
| Planning               | Claude Code (plan mode, advisor)                    | Phase 0 plan reviewed by a stronger model before execution; gaps fixed (branching, JWT method, hook persistence) |
| Design                 | Claude Design                                       | Design system, logo, key screens (due 10 to 15 Oct)                                                              |
| Build                  | Claude Code + `feature-dev`, skills                 | Scaffold, config, domain code, UI, serverless function                                                           |
| Security               | `security-guidance`, `security-auditor`             | Threat model, RLS review, dependency risk review (removed `@vercel/node`)                                        |
| Testing and QA         | `qa-tester`, `parser-test-cases`, Playwright MCP    | Edge-case tests, phrase fixtures, exploratory offline testing                                                    |
| Code review            | `code-review`, `pr-review-toolkit`, `code-reviewer` | Review findings, simplifications                                                                                 |
| Documentation          | `doc-writer`, Claude Code                           | Docs, ADRs, README, QA report                                                                                    |
| Deployment             | Vercel plugin, CI                                   | Preview and production deploys, GitHub Actions                                                                   |
| In-app                 | Gemini (free tier)                                  | Fallback transcript interpretation only                                                                          |

## Notable decisions where AI input changed the outcome

- 2026-10-08: dependency review flagged that TypeScript 7 conflicts with `typescript-eslint`'s peer range; pinned 6.0.3 and documented it.
- 2026-10-08: `npm audit` traced 10 of 11 advisories to dev-only `@vercel/node`; removed it instead of accepting a nonsensical downgrade fix.
- 2026-10-08: advisor review of the Phase 0 plan caught that the planned final check (no mention of the brief's filename) would have failed against the log entries the plan itself required.

# AI across the lifecycle

Phase → AI tool → what it produced. Updated as work happens; this is judging evidence. Rows for work that has not happened yet are marked planned.

| Phase                  | AI tool                                             | What it produced                                                                                                                    |
| ---------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Requirements and scope | Claude chat                                         | Product brief, MoSCoW scope, domain rules, architecture sketch                                                                      |
| Planning               | Claude Code (plan mode, advisor)                    | Phase 0 plan reviewed by a stronger model before execution; gaps fixed (branching, JWT method, hook persistence)                    |
| Design                 | Claude Design                                       | Design system, logo, key screens (two handoffs received, 2026-10-08 and 2026-10-09)                                                 |
| Build                  | Claude Code + `feature-dev`, skills                 | Scaffold, config, domain code and UI (built). The voice parser and the `/api/parse` function are planned (Phase 3), not built yet   |
| Security               | `security-guidance`, `security-auditor`             | Threat model, RLS review, dependency risk review (removed `@vercel/node`)                                                           |
| Testing and QA         | `qa-tester`, `parser-test-cases`, Playwright MCP    | Edge-case tests (built, 26 `*.qa.test.*` files from the whole-UI pass). Phrase fixtures and exploratory offline testing are planned |
| Code review            | `code-review`, `pr-review-toolkit`, `code-reviewer` | Review findings, simplifications                                                                                                    |
| Documentation          | `doc-writer`, Claude Code                           | Docs, ADRs, README, QA report (a documentation audit was done on 2026-10-10)                                                        |
| Deployment             | Vercel plugin, CI                                   | GitHub Actions CI (built and running). Preview and production deploys are planned: no Vercel deploy exists yet                      |
| In-app                 | Gemini (free tier)                                  | Fallback transcript interpretation only. Status: planned (Phase 3), not built yet.                                                  |

## Notable decisions where AI input changed the outcome

- 2026-10-08: dependency review flagged that TypeScript 7 conflicts with `typescript-eslint`'s peer range; pinned 6.0.3 and documented it.
- 2026-10-08: `npm audit` reported 11 issues, all from dev-only `@vercel/node`; removed it instead of accepting a nonsensical downgrade fix.
- 2026-10-08: advisor review of the Phase 0 plan caught that the planned final check (no mention of the brief's filename) would have failed against the log entries the plan itself required.

# AI across the lifecycle

Phase → AI tool → what it produced. Updated as work happens; this is judging evidence. Rows for work that has not happened yet are marked planned.

| Phase                  | AI tool                                             | What it produced                                                                                                                    |
| ---------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Requirements and scope | Claude chat                                         | Product brief, MoSCoW scope, domain rules, architecture sketch                                                                      |
| Planning               | Claude Code (plan mode, advisor)                    | Phase 0 plan reviewed by a stronger model before execution; gaps fixed (branching, JWT method, hook persistence)                    |
| Design                 | Claude Design                                       | Design system, logo, key screens (two handoffs received)                                                                            |
| Build                  | Claude Code + `feature-dev`, skills                 | Scaffold, config, domain code, UI, the voice parser and the `/api/parse` and `/api/coach` functions (all built)                     |
| Security               | `security-guidance`, `security-auditor`             | Threat model, RLS review, dependency risk review (removed `@vercel/node`)                                                           |
| Testing and QA         | `qa-tester`, `parser-test-cases`, Playwright MCP    | Edge-case tests (built, 34 `*.qa.test.*` files from two QA passes) and 307 phrase fixtures. Exploratory offline testing is planned  |
| Code review            | `code-review`, `pr-review-toolkit`, `code-reviewer` | Review findings, simplifications                                                                                                    |
| Documentation          | `doc-writer`, Claude Code                           | Docs, ADRs, README, QA report (a documentation audit was done)                                                                      |
| Deployment             | Vercel plugin, CI                                   | GitHub Actions CI (built and running). A Vercel preview has been deployed; the production deploy is not done yet                    |
| In-app                 | Gemini and Groq (free tiers)                        | Gemini fallback for transcripts (`/api/parse`) and the text-only AI coach (`/api/coach`, Gemini first, Groq second). Status: built. |

## Notable decisions where AI input changed the outcome

- Dependency review flagged that TypeScript 7 conflicts with `typescript-eslint`'s peer range; pinned 6.0.3 and documented it.
- `npm audit` reported 11 issues, all from dev-only `@vercel/node`; removed it instead of accepting a nonsensical downgrade fix.
- Advisor review of the Phase 0 plan caught that the planned final check (no mention of the brief's filename) would have failed against the log entries the plan itself required.

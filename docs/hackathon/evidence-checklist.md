# Judging evidence checklist

Judges can only score what they can see. Every item needs **evidence in the repo**. Daily habit: five minutes on [`docs/learning/ai-log.md`](../learning/ai-log.md).

## AI development practices (35%)

| Criterion                      | How we use AI                                                                                                                                                    | Evidence                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| AI across the lifecycle        | Chat (requirements), Claude Design (UI, logo), Claude Code (build), agents + Playwright MCP (test), review plugins, AI-drafted docs, Vercel integration (deploy) | [`docs/ai/lifecycle-map.md`](../ai/lifecycle-map.md)                                          |
| Context engineering            | CLAUDE.md, domain docs, ADRs, design system; one with/without-context comparison experiment                                                                      | Context files + their Git history                                                             |
| AI-assisted development and QA | Features built with tests; AI-generated phrase fixtures and edge cases                                                                                           | [`docs/qa/ai-qa-report.md`](../qa/ai-qa-report.md) with numbers (generated / kept / rejected) |
| Agents / skills / instructions | Custom skills, five subagents, hooks, guardrails                                                                                                                 | `.claude/` folder + examples in the log                                                       |
| Human validation               | Developer reviews every diff, tests on real phones, checks tests fail before fixes                                                                               | "How validated" field in every AI log entry                                                   |
| Learning from AI failures      | Each AI mistake becomes a rule in CLAUDE.md or a skill                                                                                                           | [`docs/learning/lessons.md`](../learning/lessons.md): failure > rule added > commit           |

## Engineering and code quality (30%)

| Criterion            | How we use AI                                                                                     | Evidence                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Architecture         | AI proposes alternatives and critiques the chosen design                                          | ADRs with "alternatives considered"                                            |
| Maintainability      | Pure domain layer; review/simplification agents after each feature                                | Small modules, clean commits                                                   |
| Testing              | Developer specifies, AI implements; AI finds untested branches                                    | Coverage report, table-driven tests                                            |
| Security             | security-guidance, security-auditor, AI threat model, RLS isolation tests, prompt-injection tests | [`docs/security/threat-model.md`](../security/threat-model.md) + passing tests |
| Reliability          | AI lists failure scenarios; each becomes a test                                                   | Playwright offline tests, failure table                                        |
| Deployment           | AI writes CI and deployment guide                                                                 | Green CI, live link, preview deploys                                           |
| Documentation        | AI drafts from code and ADRs; developer edits; `new-feature` skill has a docs step                | Up-to-date docs                                                                |
| Technical trade-offs | AI plays devil's advocate per decision                                                            | ADRs + README limitations section                                              |

## Product quality (25%)

| Criterion             | How we use AI                                                                               | Evidence                             |
| --------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| Core functionality    | AI turns the primary journey into acceptance criteria; Playwright verifies                  | Flawless primary journey in the demo |
| UX                    | Claude Design screens; AI heuristic + accessibility review of screenshots                   | Before/after screenshots             |
| Completeness of scope | Weekly AI check of `requirements.md` vs built                                               | All must-haves done; cuts documented |
| Polish                | AI hunts empty/loading/error states and writes microcopy                                    | Consistent, friendly UI              |
| Usefulness            | In-app AI (voice, fallback, suggestions); 2 to 3 colleagues test it; AI summarises feedback | "User feedback > changes" section    |

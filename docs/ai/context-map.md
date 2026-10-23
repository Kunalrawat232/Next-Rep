# Context map: what each context file is for

Context engineering is judged, so every context file has a clear job. Keep them short, specific and up to date.

| File                                    | Purpose                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                             | Entry point for AI assistants. Short: product summary, commands, non-negotiable rules, folder map, links. No duplicated docs. |
| `README.md`                             | Product, setup, stack, limitations for humans and judges.                                                                     |
| `.claude/settings.json`                 | Enabled plugins, permission denies (the common `.env` files), hooks (lint/typecheck on edit, tests on stop).                  |
| `.claude/hooks/*.sh`                    | The hook scripts the settings call.                                                                                           |
| `.claude/agents/*.md`                   | Five subagents with scoped tools. See [agents](agents.md).                                                                    |
| `.claude/skills/*/SKILL.md`             | `new-feature` and `parser-test-cases` workflows.                                                                              |
| `docs/domain/*`                         | The rules the code must follow: weight rules, voice grammar, glossary.                                                        |
| `docs/architecture/*` and `decisions/`  | Design, data model, API contracts, offline sync, ADRs with alternatives considered.                                           |
| `docs/standards/*`                      | Working agreement, coding standards, testing strategy.                                                                        |
| `docs/security/*`                       | Security checklist and threat model.                                                                                          |
| `docs/design/*`                         | Design system, screens, design workflow.                                                                                      |
| `docs/ai/*`                             | Guardrails, prompts, lifecycle map, prompt template, this map.                                                                |
| `docs/learning/ai-log.md`, `lessons.md` | Running log of AI use and validation; distilled lessons that feed back into `CLAUDE.md`.                                      |

## Experiment

Planned, not done yet: one with/without-context comparison (the same task run with and without the context files, and what differed) to be recorded in the AI log. No such entry exists today.

## Maintenance

When a lesson repeats, promote it from the AI log to `lessons.md` and then into `CLAUDE.md` or a skill.

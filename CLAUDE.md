# Next Rep

Voice-first gym workout logger, delivered as an installable PWA. Say "bench 60 kilo 8 reps" between sets and it is logged correctly, even offline, with bar weight and per-side maths handled for you. Built solo for the Build With AI Hackathon 2026 (feature freeze 25 Oct, submit 30 Oct 2026).

**Principle: "AI listens, code verifies."** Speech recognition and Gemini are untrusted input. Every number that reaches storage passes deterministic validation and is shown to the user first.

## Commands

| Task        | Command             |
| ----------- | ------------------- |
| Dev server  | `npm run dev`       |
| Unit tests  | `npm test`          |
| Lint        | `npm run lint`      |
| Typecheck   | `npm run typecheck` |
| Build       | `npm run build`     |
| E2E (smoke) | `npm run test:e2e`  |
| Format      | `npm run format`    |

## Non-negotiable rules

- **Plan before coding.** Show a short plan (files, approach, tests) and wait for "go" on any non-trivial task.
- **Ask first** before adding a dependency, changing the data model, changing an architectural decision, or deviating from the docs.
- Small, focused changes. One feature or fix per task. Conventional Commits, commit after each working step.
- **Tests ship with the code.** Domain logic (parser, weight maths, validators, sync) gets unit tests in the same task.
- **Never touch secrets.** Do not read, print or commit `.env*` files. Only `.env.example` with placeholders is committed. Gitleaks guards commits and CI.
- Logged weight is always the **total in kg including the bar** (ADR-002). Dumbbells are per dumbbell.
- `src/domain/` stays pure: no React, no network, no storage.
- TypeScript strict. No `any` without a justifying comment. No `dangerouslySetInnerHTML`. No dead or commented-out code.
- Gemini is only a fallback behind `/api/parse`; its output goes through the same validators (ADR-003). Claude is never used inside the app.
- Free tiers only. Never link a billing account to Gemini.
- Invented sample data only. No customer or confidential information.
- Be honest about uncertainty. Check docs for versions and APIs instead of guessing.
- Definition of done: code + tests passing + lint/types clean + docs updated if behaviour changed + `docs/learning/ai-log.md` entry.

## Folder map

- `src/domain/` pure logic: `parser/`, `weight/`, `validation/`, `progression/`
- `src/features/` UI by feature: auth, gyms, exercises, workout, voice, history, progress
- `src/data/` `local/` (Dexie), `remote/` (Supabase), `sync/` (queue + worker)
- `src/components/` shared UI, `src/lib/` utilities, `src/app/` routing and layout
- `api/` Vercel serverless functions (`parse.ts`, Gemini fallback)
- `supabase/` migrations and seed, `tests/` e2e and fixtures
- `.claude/` agents, skills, hooks and settings

## Agents and skills

Subagents in `.claude/agents/`: `code-reviewer`, `security-auditor`, `qa-tester`, `parser-specialist`, `doc-writer`. Reviewers report, they do not fix. Skills in `.claude/skills/`: `new-feature` (plan, tests, code, docs, ai-log) and `parser-test-cases`. Details: [docs/ai/agents.md](docs/ai/agents.md).

## Docs

- Product: [problem](docs/product/problem-statement.md), [requirements](docs/product/requirements.md), [journeys](docs/product/user-journeys.md), [open questions](docs/product/open-questions.md)
- Architecture: [overview](docs/architecture/overview.md), [tech stack](docs/architecture/tech-stack.md), [offline sync](docs/architecture/offline-sync.md), [data model](docs/architecture/data-model.md), [API contracts](docs/architecture/api-contracts.md), [ADRs](docs/architecture/decisions/)
- Domain: [weight rules](docs/domain/weight-rules.md), [voice grammar](docs/domain/voice-grammar.md), [glossary](docs/domain/glossary.md)
- Standards: [working agreement](docs/standards/working-agreement.md), [coding standards](docs/standards/coding-standards.md), [testing strategy](docs/standards/testing-strategy.md)
- Design: [design system](docs/design/design-system.md), [screens](docs/design/screens.md), [design workflow](docs/design/design-workflow.md)
- Security: [checklist](docs/security/security-checklist.md), [threat model](docs/security/threat-model.md)
- AI: [context map](docs/ai/context-map.md), [agents](docs/ai/agents.md), [guardrails](docs/ai/guardrails.md), [Gemini prompts](docs/ai/gemini-prompts.md), [lifecycle map](docs/ai/lifecycle-map.md), [prompt template](docs/ai/prompt-template.md)
- Delivery and QA: [deployment](docs/delivery/deployment.md), [tooling setup](docs/delivery/tooling-setup.md), [test plan](docs/qa/test-plan.md), [AI QA report](docs/qa/ai-qa-report.md)
- Hackathon and plans: [rules and judging](docs/hackathon/rules-and-judging.md), [evidence checklist](docs/hackathon/evidence-checklist.md), [roadmap](docs/plans/roadmap.md), [phase 0](docs/plans/phase-0.md)
- Learning: [ai-log](docs/learning/ai-log.md), [lessons](docs/learning/lessons.md)

# AI guardrails

What AI may and may not do, for both Claude Code (development) and Gemini (in the app).

## Claude Code (development)

**May:** plan, write code and tests, review diffs, draft docs, generate edge cases and phrase fixtures, run lint/typecheck/tests, propose dependency changes.

**Must not, or only with explicit approval:**

- Read, print or commit `.env` files (the common `.env` files are denied in `.claude/settings.json`); only `.env.example` with placeholders is committed.
- Add a dependency, change the data model, change an architectural decision or deviate from the docs without asking first.
- Push to a remote, open PRs, or change CI/hosting settings without approval.
- Merge AI-generated tests the developer has not reviewed.
- Present uncertain API or version knowledge as fact; check docs instead.
- Use customer or confidential data; only invented sample data.

**Enforcement:** permission denies, a hook (lint and typecheck after edits; there is no Stop hook, so tests are run by hand before finishing a task), gitleaks pre-commit and CI, read-only reviewer agents, and human review of every diff.

**Review cadence:** at the start of each project phase the developer re-reads `.claude/settings.json` (permissions, plugins, sandbox), the hooks and `CLAUDE.md`, and removes rules or plugins that no longer earn their place. Changes to these files should go through a pull request.

**Licence and ownership:** code written with Claude Code is the developer's own work and is reviewed line by line before it is committed; it carries the `Co-Authored-By` trailer. No third-party code or text is pasted in unless its licence allows it, and new dependencies need approval first.

**Usage and cost:** Claude Code runs under the account the developer is signed in with (it must be an approved FiftyFive Technologies account, to be confirmed by the developer); the app itself never calls Claude. Usage is read from the account's usage page, which is the only telemetry (no `OTEL_*` or prompt logging is configured). The in-app providers (Gemini, Groq) are free tier only, with a daily ceiling in code (ADR-017, ADR-018).

**Data:** only invented sample data is used (see the rules above). Claude Code's own retention follows the account's plan settings, which are outside the repository.

## Gemini (in the app)

Status: built (the `/api/parse` fallback and the coach). Rationale and conditions: [ADR-003](../architecture/decisions/003-gemini-as-fallback-only.md), [ADR-017](../architecture/decisions/017-ai-coach.md), [ADR-018](../architecture/decisions/018-coach-second-provider.md), [API contracts](../architecture/api-contracts.md).

- Called from two places only: `/api/parse`, as a fallback for the local parser (ADR-003), and `/api/coach`, text advice on gym and diet (ADR-017). When Gemini cannot answer, the coach asks one second free provider, Groq, with the same prompt and the same checks (ADR-018). Claude is never used inside the app.
- `/api/parse` receives only the transcript and minimal context (current exercise, last set, unit). `/api/coach` receives the question, the earlier chat and an optional small summary of recent training (no ids or account details; off by default). No email, name or user id reaches a model.
- JSON-only output validated with Zod; invalid output is `unknown` (parse) or "can't answer right now" (coach). A coach reply with a link, a code block or an HTML tag is not passed on.
- Parse output goes through the same validators and is shown to the user before saving. Neither endpoint **writes data directly**; the coach is read only and its replies are shown as plain text.
- Free tier only; never link billing. Both endpoints share a project-wide daily ceiling. On 429, timeout or any error `/api/parse` returns `unavailable`; logging is never blocked.
- Suggestions are labelled as suggestions. The coach gives training tips, not medical advice.

## Handling AI failures

Each AI mistake is recorded in the [AI log](../learning/ai-log.md); reusable ones are distilled into [lessons](../learning/lessons.md) and become a rule in `CLAUDE.md` or a skill.

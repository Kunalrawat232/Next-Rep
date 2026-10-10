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

**Enforcement:** permission denies, hooks (lint and typecheck after edits, tests when a turn ends), gitleaks pre-commit and CI, read-only reviewer agents, and human review of every diff.

## Gemini (in the app)

Status: planned (Phase 3), not built yet; these are the rules the function must follow. Rationale and conditions: [ADR-003](../architecture/decisions/003-gemini-as-fallback-only.md), [API contracts](../architecture/api-contracts.md).

- Called only from `/api/parse`, only as a fallback (ADR-003).
- Receives only the transcript and minimal context (current exercise, last set, unit). No email, name or user id.
- JSON-only output validated with Zod; invalid output is `unknown`.
- Output goes through the same validators and is shown to the user before saving. It **never writes data directly**.
- Free tier only; never link billing. On 429, timeout or any error return `unavailable`; logging is never blocked.
- Suggestions are labelled as suggestions, never coaching or medical advice.

## Handling AI failures

Each AI mistake is recorded in the [AI log](../learning/ai-log.md); reusable ones are distilled into [lessons](../learning/lessons.md) and become a rule in `CLAUDE.md` or a skill.

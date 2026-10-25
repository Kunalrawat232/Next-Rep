# agent_docs: where to read

Start here. Find the task or area in the table, read what it points to, and only then read the code.

Detailed knowledge is in the area folders below (each with its own `index.md`), in what is left of [`AGENT_CONTEXT.md`](../AGENT_CONTEXT.md) (numbered sections), and in the human docs under [`docs/`](../docs/).

When you add a doc, add it here (or to its folder's `index.md`) with a one-line "read when".

## By area

Each folder has its own `index.md` listing its docs with a "read when".

| Area                                         | Folder                             | Read when                                                                                                                                                                                                                      |
| -------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local-first log and sync                     | [local-data/](local-data/index.md) | Anything that writes or reads workouts and sets, the Dexie tables, the outbox, the sync worker, the history pull, the sign-out purge, or the rule that an empty workout is never kept.                                         |
| Workout screens                              | [workout/](workout/index.md)       | Starting, logging (tap or voice), undoing and ending a workout, the rest timer, the round Workout button.                                                                                                                      |
| Vercel functions, the coach, Supabase client | [api/](api/index.md)               | Touching `api/`, the voice fallbacks (`/api/parse`, cloud speech-to-text `/api/transcribe`), the AI coach and its second provider, the `.js` import rule, the dev server's `/api`, `src/data/remote/` or error classification. |
| Database                                     | [database/](database/index.md)     | A table, column, policy, migration or the seed; rate limits and the daily ceiling.                                                                                                                                             |
| Testing                                      | [testing/](testing/index.md)       | Writing or fixing tests, the whole-app harness and fakes, QA conventions, which checks only the developer runs.                                                                                                                |

## Still in `AGENT_CONTEXT.md` (not split yet)

| Task or area                       | Read                                                                                                                                                                                                                                                                     | Read when                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| What exists                        | `AGENT_CONTEXT.md` section 1                                                                                                                                                                                                                                             | Starting a session, or unsure whether a feature is built, planned or missing.                        |
| Where things live                  | `AGENT_CONTEXT.md` section 2 (including "How data flows")                                                                                                                                                                                                                | Finding the file for something, or deciding which layer owns it.                                     |
| Screens, routes, hooks, components | `AGENT_CONTEXT.md` section 5; [screens](../docs/design/screens.md); [design system](../docs/design/design-system.md)                                                                                                                                                     | Adding or changing a screen, a hook or a shared component, loading states, glass or units on screen. |
| Auth and user data                 | `AGENT_CONTEXT.md` section 6; ADR [007](../docs/architecture/decisions/007-supabase-session-handling.md)                                                                                                                                                                 | Sign-in, session storage, the profile, sign-out.                                                     |
| Domain rules                       | `AGENT_CONTEXT.md` section 7; [weight rules](../docs/domain/weight-rules.md); [voice grammar](../docs/domain/voice-grammar.md); ADR [002](../docs/architecture/decisions/002-total-weight-convention.md), [005](../docs/architecture/decisions/005-progression-rules.md) | Weights and units, validation, records, progression, the voice parser, progress maths.               |
| Configuration and delivery         | `AGENT_CONTEXT.md` section 8; [deployment](../docs/delivery/deployment.md)                                                                                                                                                                                               | Env vars, `npm` scripts, builds, the PWA, Vercel, Supabase set-up, or the Claude Code set-up.        |
| Conventions and recipes            | `AGENT_CONTEXT.md` sections 10 and 11                                                                                                                                                                                                                                    | Adding a page, or following the project's patterns.                                                  |
| State, limits and decisions        | `AGENT_CONTEXT.md` section 12                                                                                                                                                                                                                                            | Before a risky change, or when asking "why is it like this?".                                        |

When one of these areas gets its own folder, move its row up into "By area".

## Human docs (`docs/`)

Written for people and the judges, one folder per kind: `product/`, `architecture/` (with `decisions/` for the ADRs), `domain/`, `standards/`, `design/`, `security/`, `ai/`, `qa/`, `delivery/`, `hackathon/`, `plans/`, `learning/`. Open one when a row above points to it.

## Not for context

- [`docs/learning/ai-log.md`](../docs/learning/ai-log.md): append-only record of how AI was used. Add to it; do not read it to learn the code.
- [`docs/qa/doc-audit-report.md`](../docs/qa/doc-audit-report.md) and [`docs/plans/phase-0.md`](../docs/plans/phase-0.md): historical records.
- [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md): licences only.

# ADR-004: Laya intent model deferred

- **Status:** accepted (2026-10-08). Outcome (2026-10-23): the spike was not done and Laya is dropped.

## Context

Laya is an intent model that could classify and extract fields from speech. It is interesting but not required for the MVP, and adds integration risk to a one-month solo build.

## Decision

Laya is **not** part of the MVP. It may be tried in a timeboxed spike on 21 to 22 Oct (after 19 Oct), only if all must-haves and the Gemini fallback work. Otherwise those days go to bug fixing. See the [roadmap](../../plans/roadmap.md).

## Alternatives considered

- **Build it into the MVP:** risks the core journey.
- **Drop it entirely:** loses a possible differentiator; keeping a timeboxed option costs nothing.

## Consequences

- The parser interface (`ParseResult`, `source`) is kept open so another source can be added later without changing consumers.
- If the spike does not pay off, the cut is documented, not hidden.

# ADR-005: Simple, explainable progression rules

- **Status:** accepted (2026-10-08)

## Context

The app suggests "what should I lift today?". It must be conservative, explainable and clearly not coaching or medical advice.

## Decision

Rule-based suggestion in `src/domain/progression/`:

- If the user hit all target reps for all working sets last time: suggest **+2.5 kg** (upper body) or **+5 kg** (lower body), rounded to achievable plate increments.
- If they missed reps: suggest the **same weight**.
- If they missed reps in **two consecutive sessions**: suggest about **10% less**.
- Always show the reason ("You hit 3 × 8 at 60 kg last time").
- Always labelled as a **suggestion**, never as coaching or medical advice. The user decides.

## Alternatives considered

- **LLM-generated suggestions:** non-deterministic and hard to test or explain.
- **Percentage-of-1RM programmes:** needs more data and assumes a programme structure we do not have.

## Consequences

- Fully unit-testable pure functions with table-driven tests.
- Predictable, explainable output suitable for the demo.
- Body part (`upper`/`lower`) on each exercise drives the increment.

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

## Clarification (2026-10-10, built)

- **Working sets** are the sets at the heaviest weight of the last session; the **target** is the reps of the first of them. Nothing but the sets is stored (no target reps), so a single set at the top weight is its own target and always counts as hit: lighter warm-up sets never count as misses.
- **Increase** (+2.5 kg / +5 lb upper body and core, +5 kg / +10 lb lower body) lands on the nearest weight the entry steppers can reach: the bar's weight (as shown) plus whole steps of the display unit. It is always above the last weight, and never above the 500 kg limit; at the limit the suggestion is the same weight and says so.
- **Decrease**: about 10% less, on the same grid, rounded down and never below the bar. It applies only when the last two sessions both missed at the same top weight.
- **Bodyweight exercises** get no suggestion (added weight 0 has nothing to progress).
- The suggestion is shown on Home for the first exercise of the last workout. It does not change what the log screen prefills.

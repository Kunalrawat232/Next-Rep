# ADR-005: Simple, explainable progression rules

- **Status:** accepted; clarified when built

## Context

The app suggests "what should I lift today?". It must be conservative, explainable and clearly not coaching or medical advice.

## Decision

Rule-based suggestion in `src/domain/progression/` (built, shown on Home for the first exercise of the last workout; it does not change what the log screen prefills):

- **Working sets** are the sets at the heaviest weight of the last session; the **target** is the reps of the first of them. Nothing but the sets is stored (no target reps), so a single set at the top weight is its own target and always counts as hit: lighter warm-up sets never count as misses.
- **Increase:** if all working sets hit the target, suggest +2.5 kg / +5 lb (upper body and core) or +5 kg / +10 lb (lower body). The suggestion lands on the nearest weight the entry steppers can reach (the bar's weight as shown plus whole steps of the display unit), is always above the last weight and never above the 500 kg limit; at the limit the suggestion is the same weight and says so.
- **Same weight:** if reps were missed, suggest the same weight.
- **Decrease:** about 10% less, on the same grid, rounded down and never below the bar. It applies only when the last two sessions both missed at the same top weight.
- **Bodyweight exercises** get no suggestion (added weight 0 has nothing to progress).
- Always show the reason ("You hit 3 × 8 at 60 kg last time").
- Always labelled as a **suggestion**, never as coaching or medical advice. The user decides.

## Alternatives considered

- **LLM-generated suggestions:** non-deterministic and hard to test or explain.
- **Percentage-of-1RM programmes:** needs more data and assumes a programme structure we do not have.

## Consequences

- Fully unit-testable pure functions with table-driven tests.
- Predictable, explainable output suitable for the demo.
- Body part (`upper`, `core` or `lower`) on each exercise drives the increment.

## History

The first version of this record said +2.5 kg (upper) or +5 kg (lower), about 10% less after two consecutive missed sessions, and body parts `upper`/`lower` only. The clarification (core, lb increments, same top weight, working sets) was merged into the Decision above when the code was built.

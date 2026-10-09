# Weight rules

## Convention ([ADR-002](../architecture/decisions/002-total-weight-convention.md))

- **The logged weight is always the TOTAL weight lifted, including the bar.** This matches the convention used by established lifting apps.
- All weights are **stored in kg** (numeric, up to 2 decimals). Display can convert to lb later (1 lb = 0.45359237 kg).
- Per-side input is converted on entry: `total = bar_kg + 2 × per_side_kg`.
- Store alongside the total: `bar_kg` (nullable), `per_side_kg` (nullable) and `input_mode` so the breakdown can be shown later.
- Charts, PRs and suggestions use `total_kg` only.

## Equipment types

| Type                           | What the number means                                                           |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `barbell` / `ez_bar` / `smith` | Total including bar; bar weight comes from the gym profile or exercise override |
| `dumbbell`                     | Weight **per dumbbell** (label the field clearly)                               |
| `machine` / `cable`            | Stack or pin weight as shown on the machine                                     |
| `bodyweight`                   | **Added** weight only (0 if none)                                               |

Dumbbells are the one case where `total_kg` is not literally everything lifted; see ADR-002.

## Gym profiles and bars

- A user can have multiple gyms (for example "Home", "Office gym").
- Each gym has a default barbell weight (common: 20 kg, 15 kg) and optional extra bars (EZ bar, Smith machine, custom values). Any custom bar weight must be allowed.
- A workout is linked to one gym; the bar used for each barbell exercise defaults from the gym and can be overridden per exercise.

## Plausibility checks (validators)

Run on every candidate set before the confirmation card:

- `total_kg < bar_kg` for a bar exercise: impossible as a total. Ask "total or per side?".
- Large jump vs. last session of the same exercise (for example more than ±40% or a plausible per-side reading exists): ask with both options.
- Known speech confusables: 13/30, 14/40, 15/50, 16/60, 17/70, 18/80, 19/90. If the alternative matches recent history much better, ask "Did you mean 60?".
- Ranges: reps 1 to 100; weight 0 to 500 kg; per-side 0 to 250 kg. Outside range: reject with a clear message.
- Weight should usually be achievable with standard plates (multiples of 1.25 kg per side). If not, warn softly, do not block.

All thresholds live in **one config file** so they can be tuned and tested.

## Personal records (`src/domain/records`)

A set is a personal record (PR) when it beats the sets **before it** of the same exercise, in order of logged time (then id). Records are worked out from the sets each time, never stored, so undoing a set fixes the badges. Weights are compared in hundredths of a kg.

- **PR (heaviest weight):** heavier than every earlier set, whatever the reps. Never the first set of an exercise, and never at 0 kg.
- **Rep PR:** more reps than any earlier set at exactly that weight. It needs an earlier set at that weight, so the first set at a new weight is not a rep PR.
- A set is at most one kind. Equal weight and reps is not a record. Bodyweight exercises (0 kg added) can only have rep PRs.
- Dumbbell weights are per dumbbell (ADR-002) and are only compared with the same exercise, so records need no doubling.
- The chart plots the top set of each workout: the heaviest, and on a tie the one with more reps. The badge in the sessions table is the kind of that top set.
- **Known limit:** records look only at the sets stored on this device. After a sign-out clears synced sets, or on a new device, a lighter set can show as a PR until the history pull ([ADR-012](../architecture/decisions/012-pull-history-from-server.md)) has finished, which happens in the background at app start when online.

## Progression rule ("what should I lift today?")

See [ADR-005](../architecture/decisions/005-progression-rules.md). Simple, conservative, explainable:

- Hit all target reps for all working sets last time: suggest **+2.5 kg** (upper body) or **+5 kg** (lower body), rounded to achievable plate increments.
- Missed reps: suggest the same weight.
- Missed reps in two consecutive sessions: suggest about 10% less.
- Always show the reason ("You hit 3 × 8 at 60 kg last time").
- Always labelled a **suggestion**, never coaching or medical advice. The user decides.

## Validator behaviour (`src/domain/validation`)

`validateSet(candidate, context)` runs before the confirmation card and returns one of four results. Thresholds live in `validation/config.ts`; the code and its tests are the reference.

| Result   | Meaning                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------- |
| `ok`     | Safe to show on the confirmation card. Carries `resolved`: total, bar, per side and input mode in kg. |
| `warn`   | Safe, with a soft warning (for example plates). Carries `resolved` and the issues.                    |
| `ask`    | Ambiguous. Carries `options`, each with a label and its own `resolved` weight, and the issues.        |
| `reject` | Impossible input (out of range, invalid number, missing bar). Carries a message; nothing is offered.  |

Behaviours worth knowing:

- **Every resolved weight is storable**: it satisfies the `sets` database constraints (ranges, `total = bar + 2 × per side` whenever both are stored). The per-side breakdown is left empty when it cannot be stored exactly at 2 decimals, for example 61.23 kg (135 lb) on a 20 kg bar. This is checked by a property test over thousands of generated candidates.
- **The jump band is inclusive**: a total exactly ±40% from the last session passes; anything further asks.
- **History is the last session's total** for the same exercise (`lastTotalKg`). Without history (missing, zero, negative or non-finite) there is no jump or confusable rule.
- **Confusables** (13/30 … 19/90, both directions) are offered only when the spoken number does not fit history and the alternative does, either on a large jump or in the "total below the bar" question ("sixteen" on a 20 kg bar with last time 60 offers "Did you mean 60?"). They keep the spoken mode, and only whole numbers count.
- **Tapped weights are not second-guessed**: the validator is told where the number came from (`source`: `tap` or `voice`). A tapped number was chosen on purpose, so "Did you mean 60?" is for voice only, and a tapped big jump with no other reading is a warning (the set is saved) instead of a one-choice prompt. A tapped total below the bar still asks, and shows only the readings the validator offers (per side, or total without the bar).
- **Per-side alternative**: offered when the mode was not stated and the per-side reading fits history. If the user said "total", it is not offered.
- **Total below the bar** asks "total or per side?" with the per-side reading and a "total without the bar" option. A total of exactly the bar weight is valid (empty bar). A 0 kg total on a barbell therefore also asks.
- **`as_said`** (what the user literally said) is always the last option on a large jump, so the user can confirm an intentional jump.
- **Equipment without a bar** (dumbbell, machine, cable, bodyweight) skips bar and plate rules. A per-side phrase is reinterpreted as the per-implement weight, with a `PER_SIDE_IGNORED` warning that is kept when the result becomes a question.
- **Bar weight** must be 0 to 100 kg and is rounded to 2 decimals; a missing bar with "per side" on bar equipment is rejected.
- **Plates** are checked on the exact per-side weight, not on the stored breakdown. Pound input is converted to kg first, so standard pound plates will often show the soft warning. That is accepted until lb display ships (storage is kg only).
- Sub-cent noise is rounded away (500.004 kg is accepted as 500).

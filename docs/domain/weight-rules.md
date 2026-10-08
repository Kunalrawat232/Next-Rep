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

## Progression rule ("what should I lift today?")

See [ADR-005](../architecture/decisions/005-progression-rules.md). Simple, conservative, explainable:

- Hit all target reps for all working sets last time: suggest **+2.5 kg** (upper body) or **+5 kg** (lower body), rounded to achievable plate increments.
- Missed reps: suggest the same weight.
- Missed reps in two consecutive sessions: suggest about 10% less.
- Always show the reason ("You hit 3 × 8 at 60 kg last time").
- Always labelled a **suggestion**, never coaching or medical advice. The user decides.

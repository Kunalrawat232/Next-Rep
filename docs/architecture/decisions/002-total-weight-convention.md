# ADR-002: Logged weight is the total, including the bar

- **Status:** accepted (2026-10-08)

## Context

"45 kg" is ambiguous: total on the bar or per side? Progress charts, personal records and suggestions need one consistent number.

## Decision

- The logged weight is always the **TOTAL weight lifted, including the bar**, matching established lifting apps.
- All weights are **stored in kg** (numeric, up to 2 decimals). Display can convert to lb later (1 lb = 0.45359237 kg).
- Per-side input is converted on entry: `total = bar_kg + 2 × per_side_kg`.
- Alongside `total_kg` store `bar_kg` (nullable), `per_side_kg` (nullable) and `input_mode` so the breakdown can be shown later.
- Charts, PRs and suggestions use `total_kg` only.
- **Dumbbells:** the number is the weight **per dumbbell**, and the field is labelled clearly. For these, `total_kg` holds the per-dumbbell weight, so it is not literally "everything lifted". Any volume calculation would need ×2 and must treat equipment type explicitly.
- **Machines and cables:** stack or pin weight as shown. **Bodyweight:** added weight only (0 if none).

## Alternatives considered

- **Store per-side:** matches how lifters load plates, but makes charts and PRs depend on the bar.
- **Store exactly what was said:** preserves intent but needs conversion everywhere and breaks comparisons.

## Consequences

- One number for all analytics; the breakdown is kept for display.
- The parser and UI must resolve "total or per side?" before saving, using bar settings from the gym profile or an exercise override.
- Dumbbell semantics are an explicit exception that every consumer of `total_kg` must respect.

## Addendum (2026-10-10): the weight unit is a display and entry choice

Storage stays kg. The user's unit (kg or lb, Settings) decides how every weight is **shown and typed**; the only place that converts is `src/domain/units`. Consequences that came with it:

- A weight shown in lb is rounded to 1 decimal and one typed in lb is stored as kg to 2 decimals, so any lb value typed to 0.1 shows again as typed. The other way is not exact (60 kg shows as 132.3 lb, which is 60.01 kg), so a field that starts from a stored weight (the last set, a gym's bar) remembers the stored value and uses it while the text is unchanged. Without that, accepting a prefilled weight would store a different number and show a false record.
- A weight typed per side in lb is added up in lb first (bar + 2 × side) and converted once, so the same weight typed as a total or per side is the same kg. Adding the converted parts in kg can differ by 0.01 kg, which would count as a record.
- Records and charts compare stored kg and are the same in both units.

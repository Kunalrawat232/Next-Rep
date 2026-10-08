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

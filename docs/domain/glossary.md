# Glossary

| Term                      | Meaning                                                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set                       | One continuous group of reps of one exercise at one weight.                                                                                                                             |
| Rep                       | One repetition of an exercise. Valid range in [weight rules](weight-rules.md).                                                                                                          |
| Total weight              | Everything on the bar including the bar. The stored `total_kg` (per dumbbell for dumbbell exercises).                                                                                   |
| Per side                  | Weight on one side of the bar, excluding the bar. `total = bar + 2 × per_side`.                                                                                                         |
| Bar weight                | Weight of the empty bar (commonly 15 or 20 kg); set per gym (the user can choose a different bar of that gym).                                                                          |
| Input mode                | How the weight was entered: `total` or `per_side`. Tap logging stores the mode the user actually used, with `source = 'tap'`; `tap` as an input mode is no longer written.              |
| Confidence                | 0 to 1 score of how sure the parser is, from match scores and completeness.                                                                                                             |
| Confirmation card         | Planned (Phase 3) for voice: the card showing the parsed set before saving. Built today for tap logging: `BreakdownCard`.                                                               |
| Ambiguity prompt          | The `AmbiguityPrompt` with big tap buttons used when weight mode or a number is unclear.                                                                                                |
| Confusable                | A pair of numbers speech recognition mixes up (list in [weight rules](weight-rules.md)).                                                                                                |
| Working set               | A set at the heaviest weight of the last session; it counts toward progression, so lighter warm-up sets never count. See [ADR-005](../architecture/decisions/005-progression-rules.md). |
| Unit                      | The weight unit the user chose (kg or lb). It only decides how weights are shown and typed; storage is always kg. See [weight rules](weight-rules.md).                                  |
| PR                        | Personal record: a set heavier than any earlier set of the exercise, or with more reps than any earlier set at that exact weight. See [weight rules](weight-rules.md).                  |
| Sync queue                | Pending local sets waiting to be pushed to Supabase.                                                                                                                                    |
| Idempotent upsert         | Insert-or-update keyed on the client UUID so retries create no duplicates.                                                                                                              |
| RLS                       | Row Level Security: Postgres policies so each user only sees their own rows.                                                                                                            |
| Hinglish                  | Mixed Hindi and English phrasing, for example "60 kilo 8 baar".                                                                                                                         |
| AI listens, code verifies | Speech recognition and Gemini are untrusted; deterministic code validates everything before it is saved.                                                                                |

# Glossary

| Term                      | Meaning                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set                       | One continuous group of reps of one exercise at one weight.                                                                                                                |
| Rep                       | One repetition of an exercise. Valid range 1 to 100.                                                                                                                       |
| Total weight              | Everything on the bar including the bar. The stored `total_kg` (per dumbbell for dumbbell exercises).                                                                      |
| Per side                  | Weight on one side of the bar, excluding the bar. `total = bar + 2 × per_side`.                                                                                            |
| Bar weight                | Weight of the empty bar (commonly 15 or 20 kg); set per gym, overridable per exercise.                                                                                     |
| Input mode                | How the weight was entered: `total` or `per_side`. Tap logging stores the mode the user actually used, with `source = 'tap'`; `tap` as an input mode is no longer written. |
| Confidence                | 0 to 1 score of how sure the parser is, from match scores and completeness.                                                                                                |
| Confirmation card         | The `SetConfirmCard` showing the parsed set and breakdown before saving.                                                                                                   |
| Ambiguity prompt          | The `AmbiguityPrompt` with big tap buttons used when weight mode or a number is unclear.                                                                                   |
| Confusable                | A pair of numbers speech recognition mixes up: 13/30, 14/40, ... 19/90.                                                                                                    |
| Working set               | A set counted toward progression (excludes warm-ups).                                                                                                                      |
| PR                        | Personal record: a set heavier than any earlier set of the exercise, or with more reps than any earlier set at that exact weight. See [weight rules](weight-rules.md).     |
| Sync queue                | Pending local sets waiting to be pushed to Supabase.                                                                                                                       |
| Idempotent upsert         | Insert-or-update keyed on the client UUID so retries create no duplicates.                                                                                                 |
| RLS                       | Row Level Security: Postgres policies so each user only sees their own rows.                                                                                               |
| Hinglish                  | Mixed Hindi and English phrasing, for example "60 kilo 8 baar".                                                                                                            |
| AI listens, code verifies | Speech recognition and Gemini are untrusted; deterministic code validates everything before it is saved.                                                                   |

# Voice grammar and parser specification

Status: planned (Phase 3), not built yet. Only the `ParseResult` schema exists in `src/domain/parser/`; this page is the specification.

## Intents (small, fixed set)

| Intent        | Example phrases                                                      |
| ------------- | -------------------------------------------------------------------- |
| `log_set`     | "bench press 60 kilo 8 reps", "squat 100 for 5", "deadlift 120 kg 3" |
| `repeat_last` | "same again", "same weight 8 reps", "one more set"                   |
| `undo_last`   | "undo", "delete that", "galat hai"                                   |
| `edit_last`   | "change that to 10 reps", "make it 62.5"                             |
| `rest_timer`  | "rest 90 seconds", "rest two minutes"                                |
| `unknown`     | anything else                                                        |

## Things the parser must handle

- **Number words and digits:** "sixty", "62.5", "sixty two point five", "sixty two and a half".
- **Units:** kg, kilo, kilos, kgs, lb, lbs, pounds (convert to kg). If no unit, use the user's default unit.
- **Rep markers:** "reps", "rep", "times", "for 8", "x 8", "into 8", "8 baar".
- **Per-side markers:** "each side", "per side", "a side", "both sides 20", "har side".
- **Common Hinglish:** "kilo ke 8", "60 kilo 8 reps", and Hindi numbers 1 to 20: ek, do, teen, chaar, paanch, chhe, saat, aath, nau, das, gyaarah, baarah, terah, chaudah, pandrah, solah, satrah, athaarah, unnees, bees.
- **Exercise names** via an alias table with fuzzy matching (for example "bench", "flat bench", "chest press" map to their canonical exercises). Use a normalised string distance and a minimum score.
- If no exercise is spoken, default to the **current exercise** in the active workout.

## Output

The parser returns a `ParseResult` (schema in [API contracts](../architecture/api-contracts.md)) with `intent`, optional `exerciseId` and match score, `weight` (`value`, `unit`, `mode`: `total` | `per_side` | `unspecified`), `reps`, `restSeconds`, a `confidence` from 0 to 1 (computed from match scores and completeness), `issues` (machine-readable reasons such as `NO_REPS`, `AMBIGUOUS_WEIGHT_MODE`), the `rawTranscript` and `source` (`parser` or `gemini`).

- The confidence threshold for skipping the Gemini fallback will live in config (start at 0.8, tune with tests); see [API contracts](../architecture/api-contracts.md).
- The parser is a **pure function** with table-driven tests in `tests/fixtures/voice-phrases.json` (planned, the file does not exist yet), aiming for 150+ phrases including Hinglish, noisy and adversarial cases.
- Recognition language defaults to `en-IN`.
- Transcripts are untrusted input: the parser never executes or interprets them beyond the grammar above.

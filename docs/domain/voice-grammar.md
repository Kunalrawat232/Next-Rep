# Voice grammar and parser specification

Status: the parser is built (`src/domain/parser/`), English and Hindi number words, and the mic and confirm card are on the workout page (`src/features/voice`, `src/features/workout/VoiceLogger.tsx`). The Gemini fallback is built too (`api/_lib/parse.ts`, read back by `src/domain/parser/fromGemini.ts`), and so are the voice commands repeat, undo, rest and editing a set (the `edit` kind in `src/features/voice/voiceDraft.ts`).

## Intents (small, fixed set)

| Intent        | Example phrases                                                      |
| ------------- | -------------------------------------------------------------------- |
| `log_set`     | "bench press 60 kilo 8 reps", "squat 100 for 5", "deadlift 120 kg 3" |
| `repeat_last` | "same again", "same weight 8 reps", "one more set"                   |
| `undo_last`   | "undo", "delete that", "galat hai"                                   |
| `edit_last`   | "change that to 10 reps", "make it 62.5"                             |
| `rest_timer`  | "rest 90 seconds", "rest two minutes"                                |
| `unknown`     | anything else                                                        |

## Rules (decided with the developer)

- **The weight is reported as spoken**: `value` and the spoken unit, with no conversion. Converting to kg happens later, in the units code. No unit spoken means the user's unit (Settings).
- **Mode:** "each side", "per side", "a side", "every side", "har side", "both sides" give `per_side`; "total" gives `total`; a weight with neither gives `unspecified` plus the issue `AMBIGUOUS_WEIGHT_MODE`, which the app answers on the confirm card: the validator reads a bar weight as a total and shows a Total / Per side toggle (it asks a question only for a number below the bar or a big jump from last time). This does **not** lower confidence. Saying both leaves it `unspecified`.
- **Numbers:** digits, decimals ("62.5"), and English words: "sixty", "sixty two point five", "sixty two and a half", "a hundred and five", "one fifty" (150), "two twenty five" (225). Digit strings longer than 9 are not read, and ".5" is 0.5.
- **Reps:** "8 reps", "8 rep", "8 times", "8 baar", "for 8", "x 8", "x8", "into 8", "reps 8". A number with no marker is the weight if no weight has been said, then the reps ("deadlift 120 kg 3", "bench 60 8"). A bodyweight exercise with one bare number reads it as reps.
- **Units:** kg, kgs, kilo, kilos, kilogram(s), lb, lbs, pound(s).
- **Exercises:** an exact name or alias (spaces ignored, so "dead lift" works) wins; longest and earliest first. Otherwise a close spelling of a name or alias of 5 or more letters, scored 1 minus edits over length, with a floor of 0.8. A close spelling of a longer phrase around an exact alias beats it when it scores 0.9 or more ("bench pres" beats the alias "bench"). Two exercises of the **best tier** answering to the same words is a guess (`LOW_EXERCISE_MATCH`, confidence at most 0.7); a better tier settles a tie, in the order the user's own, curated, imported. A name said twice counts once. Words before the first number that name nothing (an exercise we do not have, such as "zottman curl") add `UNKNOWN_EXERCISE_WORDS` and cap confidence at 0.6, even when a current exercise exists. No exercise spoken means the current exercise of the open workout; with neither, `NO_EXERCISE`.
- **Greetings, the app's name and interjections** at the start ("hey next rep", "oops", "arre", "no", "um") are ignored, as is filler elsewhere.
- **A set needs at least one number**, and either an exercise (spoken or current) or a unit or rep word. "bench press" alone, "60 8" alone and "script alert 1" are `unknown`.
- **Commands** are read only from the start of the phrase, so a set that merely contains the word is still a set ("squat 100 undo" is not undo): "undo", "delete that", "galat" (up to 5 words); "rest" or "timer", also after start, take, set or begin, with a duration (up to 8 words; a bare number is minutes up to 10, else seconds; only the first number is read); "same", "repeat", "again", "one more", "another set" (repeat); "change", "make", "edit", "correct", "update", "fix", "that was" (edit). A command followed by words it does not know ("same old story", "make it a bit heavier", "rest of the day") is `unknown`.
- **Transcripts are untrusted.** Text with "ignore", "disregard", "override", "instructions" or "system prompt" is `unknown` with `SUSPICIOUS_INPUT`; more than 300 characters or 40 words is `unknown` with `TOO_LONG`. Neither is ever sent to Gemini. The parser never executes or interprets a transcript beyond this grammar.
- **Out-of-range values** (5000 kg, 500 reps) are reported as spoken; the validators refuse them later.

## Output

`parseTranscript(text, { exercises, unit, currentExerciseId? })` returns a `ParseResult` (schema in [API contracts](../architecture/api-contracts.md)): `intent`, optional `exerciseId` and `exerciseMatchScore`, `weight` (`value`, `unit`, `mode`), `reps`, `restSeconds`, `confidence` from 0 to 1, `issues`, `rawTranscript` and `source` (`parser`). It is pure, never throws (the exercise list must not be changed in place: its index is cached by array identity), and always returns a schema-valid result (`unknown` with `PARSE_FAILED` if something breaks).

Issue codes: `NO_EXERCISE`, `NO_WEIGHT`, `NO_REPS`, `AMBIGUOUS_WEIGHT_MODE`, `LOW_EXERCISE_MATCH`, `UNKNOWN_EXERCISE_WORDS`, `EXTRA_NUMBER`, `UNRECOGNISED_WORDS`, `SUSPICIOUS_INPUT`, `TOO_LONG`, `NO_SPEECH`, `PARSE_FAILED` (defined once in `issues.ts`). `AMBIGUOUS_WEIGHT_MODE` means "no per-side or total word, or both": it is a question for the app, not a doubt about what was heard, so a screen should look at `weight.mode`, not at `issues.length`.

When only one number is missing and everything else is sure, the screen asks for it instead of reporting "not understood" (`draftFromParse` returns a `partial` draft): the exercise and the weight are known and the reps are missing ("bench press 45 kilo"), or the exercise and the reps are known and the weight is missing for a non-bodyweight exercise ("bench press 8 reps"). "Sure" means the only issues are `NO_REPS` (with `AMBIGUOUS_WEIGHT_MODE`) or `NO_WEIGHT`, and the exercise was matched. Both numbers missing, an exercise that is not matched, or any other doubt keeps today's "not understood" message. A partial draft is never sent to Gemini. The answer (a rep count from 1 to 100, or a weight) builds the same candidate a full phrase would, and goes to the same validators and confirm card.

Confidence starts at 1 and is capped or scaled: no exercise 0.4; no weight (not bodyweight) or no reps 0.5; times the exercise score; extra numbers or more than 2 unexplained words times 0.7. `needsFallback(result)` is true under **0.8** (`PARSER_CONFIG` in `config.ts`) unless the issues include `SUSPICIOUS_INPUT`, `TOO_LONG` or `NO_SPEECH` (nothing worth sending, and each call spends free-tier quota). Any other `unknown` has confidence 0, so it goes to the fallback when online. The injection word list is best effort and is **not** a security boundary: Gemini's output and every number still pass the validators.

## Hindi number words

Hindi numbers 1 to 20 are read as one word each: ek, do, teen, chaar, paanch, chhe, saat, aath, nau, das, gyaarah, baarah, terah, chaudah, pandrah, solah, satrah, athaarah, unnees, bees, plus common spellings (char, panch, chhah, ath, dus, gyarah, barah, atharah, unnis). They work as reps ("60 kilo paanch baar") and as weights ("das kilo", "bees kilo har side"), and in "rest do minute". Hindi numbers do not combine with each other or with English words. "do" is also an English word, so "do bench press 60 kilo 8 reps" reads it as an extra number and is flagged (`EXTRA_NUMBER`, low confidence) instead of trusted. Tens above 20 ("pachaas", "saath") are not built.

## Tests

`tests/fixtures/voice-phrases.json` holds 307 phrases in 12 groups, written by a separate agent from this specification before the parser existed (281 are stage 1, English and Hinglish markers; 26 are stage 2, Hindi number words). `src/domain/parser/phrases.test.ts` runs all of them; edge, number and seeded random tests sit beside the code. Recognition language defaults to `en-IN`.

---
name: parser-test-cases
description: Use to generate or extend voice phrase fixtures in tests/fixtures/voice-phrases.json for the Next Rep parser, including Hinglish, noisy and adversarial cases.
argument-hint: <group or topic to extend, e.g. "per side" or "Hinglish numbers">
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npm test*), Bash(git diff*)
---

# parser-test-cases

Generate table-driven phrase fixtures for the voice parser. Focus: `$ARGUMENTS` (all groups below if empty).

1. Read `docs/domain/voice-grammar.md` and `docs/domain/weight-rules.md`, and the existing `tests/fixtures/voice-phrases.json` (avoid duplicates).
2. Each fixture row has: `transcript`, expected `intent`, and the expected fields that matter (exercise, weight value/unit/mode, reps, restSeconds), plus a `note` for the reason it exists. Use invented data only.
3. Cover these groups, aiming for 150+ rows overall:
   - **Plain:** "bench press 60 kilo 8 reps", "squat 100 for 5", "deadlift 120 kg 3"
   - **Number forms:** "sixty two point five", "sixty two and a half", digits, decimals
   - **Units:** kg, kilo, kilos, kgs, lb, lbs, pounds; missing unit uses the default unit
   - **Rep markers:** reps, rep, times, "for 8", "x 8", "into 8", "8 baar"
   - **Per side:** "each side", "per side", "a side", "both sides 20", "har side"
   - **Hinglish and Hindi numbers 1 to 20:** ek, do, teen, ..., bees; "kilo ke 8"
   - **Intents:** repeat_last, undo_last (including "galat hai"), edit_last, rest_timer
   - **Exercise aliases and fuzzy matches**, and no exercise spoken (current exercise)
   - **Confusables:** 13/30 … 19/90 where history disambiguates
   - **Noisy and adversarial:** filler words, repeated words, partial phrases, empty input, very long input, numbers out of range, prompt-injection text such as "ignore previous instructions" (expected `unknown`)
4. Mark rows the parser should treat as low confidence (expected to go to the Gemini fallback) so the confidence threshold can be tuned.
5. **Verify.** Run `npm test` and `git diff --stat tests/fixtures/voice-phrases.json`: the suite must pass and no existing row may be removed or changed.
6. Report counts: generated, duplicates removed, per group. The developer reviews before merge; record kept and rejected counts in `docs/qa/ai-qa-report.md`.

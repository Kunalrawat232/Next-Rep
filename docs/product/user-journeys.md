# User journeys

Status: every journey below is built and merged: the tap path, offline sync, history, progress and the suggestion, and the voice path (the mic steps, "Misheard number", "Voice unavailable" and "Gemini unavailable").

## Primary journey (the demo story)

1. The user signs in and sets up their gym once (for example "Home gym, 15 kg bar").
2. Starts a workout.
3. After a set, holds the mic button and says "bench press sixty kilo eight reps".
4. The app shows **Bench press · 60 kg (15 kg bar + 22.5 kg each side) · 8 reps** and the user taps confirm. (Voice sets require a tap to confirm for the MVP; see [open questions](open-questions.md).)
5. Signal drops. The user logs more sets by voice or tap; they appear instantly with a "2 sets waiting to sync" badge.
6. Signal returns; sets sync automatically.
7. After the workout, the user sees history, a progress chart per exercise and a "new personal record" highlight.
8. Next session, the app suggests "Today: bench 62.5 kg × 8" with a short reason.

## Supporting journeys

- **Ambiguous weight.** The user says "bench 45 each side" or an implausible number. The app shows an ambiguity prompt with big buttons ("45 kg total" / "45 kg per side = 105 kg") and nothing is saved until one is chosen.
- **Misheard number.** The user says "sixty" and the recogniser hears "sixteen". If the alternative matches recent history much better, the app asks "Did you mean 60?".
- **Voice unavailable.** Offline, or in Firefox, the mic is hidden or shows "Needs internet" and tap logging remains fully usable.
- **Gemini unavailable.** Rate limit, timeout or error: the UI falls back to manual confirmation. Logging is never blocked.
- **First use.** Empty states guide the user to create a gym and start a first workout.

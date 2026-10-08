# Rest timer

Code: `src/features/workout/useRestTimer.ts` (state), `RestTimer.tsx` (the pill and panel), rules and limits in `src/domain/rest/index.ts`.

- **The pill** ("Rest", "Rest 1:27", "Rest over") is sticky at the top of the workout screen and has a glass lens on phones. Tapping it opens the panel: presets `REST_PRESETS` (60, 90, 120, 180 s), a custom length (`parseCustomRest`, 30 to 900 s: `REST_MIN_CUSTOM`, `REST_MAX`), +30 s (`REST_EXTEND`), Stop or Dismiss, and the **"Start after each set"** switch.
- **A rest starts by itself after each logged set**, tap (`LogSetPage`) or voice (`VoiceLogger`), through `startAfterSet()`, unless the switch is off. The default is `REST_DEFAULT = 90` s; the length the person last picked becomes the new default (`start(seconds)` remembers it). A voice "rest N" command also starts a rest.
- **Storage (device only, per user):** the end time under `next-rep-rest-<userId>` as `{workoutId, endsAt}`, tied to the workout and validated with Zod (a value more than 900 s ahead, or over for more than `REST_STALE_AFTER` = 1 hour, is ignored); the choices under `next-rep-rest-prefs-<userId>` as `{seconds, auto}` (one damaged field resets both to the defaults). Blocked storage only means nothing is kept.
- **It keeps the end time, not a count,** so the display is right after the screen locks or the page reloads. It reads the wall clock, ticks every 500 ms while running, and vibrates once when it sees the time run out on a visible page (never when a rest is already over at page load).
- **Not covered:** vibration on a real phone (iOS Safari has none) has not been tried.
- Tests: `src/features/workout/restTimer.test.tsx` (uses a fake `Date`), `restPrefs.qa.test.tsx`, `src/domain/rest/*.test.ts`.

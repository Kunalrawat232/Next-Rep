# Workout flow

| Route               | Component            | What it does                                                                                                                                                                                                                    |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/workout`          | `WorkoutPage`        | Starts a workout (shows the bar and a Start button) or, when one is open, the active workout: header, rest pill, "Sets so far", the voice button, Tap instead, Undo last, End workout. `?exercise=<uuid>` selects the exercise. |
| `/workout/exercise` | `ChooseExercisePage` | The exercise picker (with the History section, see [exercises in the UI](../../docs/design/screens.md)); choosing one returns to `/workout?exercise=<id>`.                                                                      |
| `/workout/log`      | `LogSetPage`         | The tap form for `?exercise=<uuid>`.                                                                                                                                                                                            |

## The journey

1. **Start workout** creates a workout on the device (never straight on the server). The gym comes from `useMyGym` (the server copy, or the device copy when offline); a first workout creates the gym with a standard barbell (`defaultBarbellKg(unit)`: 20 kg, or 45 lb for a pound user). The workout keeps a local `gymSnapshot` of the bars so logging works offline.
2. **Choose an exercise.** The big title in the header is a link to the picker (with a small arrow). With none chosen the second button is "Pick an exercise" (a real link), not a disabled "Tap instead".
3. **Log a set.**
   - By tap: `LogSetPage` (a `Stepper` for weight and reps, Total / Per side for bar exercises, a `BreakdownCard` showing bar + plates = total, prefilled from the last set). `validateSet` can ask first (`AmbiguityPrompt`).
   - By voice: `VoiceLogger` listens (`useSpeech`), `parseTranscript` reads the phrase, `draftFromParse` makes a draft and `VoiceConfirmCard` shows the breakdown. **Nothing is stored until Log set.** If the parser is unsure and the device is online, `ParseService` (`/api/parse`) is asked once and the confirm card says "Read by AI". Voice commands: rest N, same again, undo (asks first); edit says it is not available. Where the browser's own recogniser ends with no words (iPhone), see cloud speech-to-text below.
   - Either way the set is written to the device first (`store.logSet`), the sync is notified, and **a rest starts by itself** (see [rest-timer.md](rest-timer.md)).
4. **Undo last** removes the latest set. An unsynced set is removed locally; one that is already saved needs internet (the server is told first), and the screen says so.
5. **End workout** asks first (the text changes when there are no sets) and calls `store.finishWorkout`, then goes Home. An empty workout is discarded, see [empty-workouts.md](../local-data/empty-workouts.md).

## Details worth knowing

- **Weights are stored as the TOTAL in kg including the bar.** Tap helpers take the unit: `stepFor` (2.5 kg or 5 lb for a total, 1.25 kg or 2.5 lb per side), `perSideShown`, `weightForValidation`, `convertEntry`, `nextValue`, `breakdownFor`, `setSummary`, `initialEntry` (all in `src/domain/workout/index.ts`). The bar of a set comes from `barFor(gym, equipment)` (`src/domain/gyms/index.ts`).
- **Validation** (`src/domain/validation`): `validateSet` returns `ok`, `warn`, `ask` or `reject`. A tapped jump is only a warning; the "Did you mean 60?" confusion check is voice only. Thresholds are in `src/domain/validation/config.ts`.
- **Cloud speech-to-text (iPhone).** `useVoiceInput` (`src/features/voice/`) wraps the browser's recogniser (`useSpeech`) and a recorder. It starts with the browser's recogniser and switches to cloud when that ends with no words and no error, or fails other than "no speech" or a denied microphone. The choice is saved in localStorage `next-rep-voice-mode` = `cloud`, so every later phrase on that device is recorded and sent to `/api/transcribe`. In cloud mode `VoiceLogger` shows "Your voice is sent to a speech service to turn it into text. Next Rep does not keep it." While it works the button says "Checking…" and the line "Turning your voice into text…" appears. The words then go through the same parser and confirm card, and nothing is stored until Log set. Built and tested with fakes (`src/features/workout/voiceCloud.test.tsx`); checked on an iPhone 15 in Safari and Chrome against the deployed site. Details: [transcribe.md](../api/transcribe.md).
- **The round Workout button** (`AppShell`) is hidden on every `/workout` screen, where it would cover the buttons. The Workout link in the tab bar or sidebar stays.
- **Hooks:** `useWorkout` (the open workout and its sets, re-read as syncing moves), `useMyGym`, `useFreshGym(workout, reload)` (refreshes the workout's gym snapshot when online and the gym was edited), `useExerciseParam` and `exerciseQuery` (validate `?exercise=` as a UUID and build the query).
- **Components:** `Stepper`, `BreakdownCard`, `AmbiguityPrompt` (Escape cancels, focus returns), `OfflineBanner`, `SetList` (numbered sets with PR badges), `VoiceLogger` (uses `useVoiceInput`), `VoiceConfirmCard`, `RestTimer`.
- **One-shot actions** (log, undo, end) use `usePending()`, never a bare `useState` flag.

**Offline and loaders:** the active workout screen shows one loader until the exercise list is ready. `useExercises` skips the server wait when `navigator.onLine` is false (otherwise it waits up to `SERVER_WAIT_MS`, 8 s, for the custom exercises), so logging offline never stalls behind a loader.

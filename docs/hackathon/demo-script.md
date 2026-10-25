# Demo video: script and clip list

The submission's demo video, at most 5 minutes. Target: **about 3 minutes 30 seconds**, landscape 1920x1080, built in Hyperframes around real recordings of the live app (https://nextrep-gym.vercel.app) in a phone-sized browser, with narration, music and a few diagrams.

Judging weights it has to serve: AI development practices 35%, engineering and code quality 30%, product 25%, idea 10% ([rules](rules-and-judging.md)). So about half the video is the product working and half is how it was built.

## Script

Narration is about 480 words at a calm pace (about 140 words a minute). Timings are targets; the edit follows the narration.

### 1. Hook: 0:00 to 0:15

- **Picture:** clip V1 (your phone): you say "bench press 60 kilo 8 reps", the confirm card shows "60 Kg × 8" and "20 Kg bar + 20 Kg each side", you tap Log set.
- **Narration:** "Between sets, your hands are full and your head is somewhere else. So with Next Rep, you just say it. 'Bench 60 kilo 8 reps.' It works out the bar and the plates, shows you, and logs it."

### 2. The problem and the product: 0:15 to 0:35

- **Picture:** title card "Next Rep: voice-first gym logging", then the Home screen (clip C1).
- **Narration:** "Gym loggers make you type numbers with sweaty thumbs, and do the bar maths yourself. Next Rep is an installable web app: you speak or tap a set, and it is logged correctly, even with bad signal."

### 3. The product, working: 0:35 to 1:40

- **Tap logging and the maths** (clip C2): "Tapping works too. Type 20 per side and it shows 60 total with the bar, so what is stored is always the real weight."
- **A suspicious number** (clip C3): "Type something unusual, like a jump of more than 40 percent from last time, and it flags it as a big change; say it instead, and it asks you to confirm. The AI listens, but the code decides what is valid."
- **Rest timer** (clip C4): "After each set the rest timer starts on its own."
- **Offline** (clip C5): "In a basement gym the signal drops. You keep logging; the set waits on the phone and syncs when the signal comes back."
- **History and progress** (clips C6, C7): "Every workout is in History, and Progress shows workouts per week, your heaviest sets and personal records."
- **The AI coach** (clip C8): "And there is a coach for gym and diet questions. It gives advice only: it can never change your log."

### 4. How it is built: 1:40 to 2:30

- **Picture:** diagram D1 (architecture): phone app with an on-device store, sync worker, Supabase with row-level security, three Vercel functions, Gemini, and Groq as a second provider and for speech-to-text.
- **Narration:** "Under the hood the rule is: AI listens, code verifies. Speech is parsed on the device by our own parser; only when it is unsure does it ask Gemini. On an iPhone, where the browser cannot hear, a short clip goes to a speech service to become words first. Whatever comes back goes through the same validators before you see it. Sets are saved on the phone first and synced by a background worker, so offline is the normal case, not an error. Every table has row-level security, the functions check the sign-in and are rate limited, and a daily ceiling keeps the free AI tiers safe."
- **Picture:** card D2 (quality): 4,587 unit tests, 121 database tests, 26 integration tests, 5 end-to-end tests, CI green, secrets scanned on every commit.
- **Narration:** "It is covered by more than four and a half thousand unit tests, database tests for the security rules, and end-to-end tests, and every commit is scanned for secrets."

### 5. How AI built it: 2:30 to 3:20

- **Picture:** diagram D3 (the AI workflow): CLAUDE.md and the per-area agent docs → plan → code with tests → review agents → human check → AI log.
- **Narration:** "I built it with Claude Code as a partner, not an autopilot. The project carries its own context: a short rules file, per-area docs the agent reads before touching code, and decision records for every architectural choice. Specialist agents review the code and audit security, but they cannot change anything; a QA agent may only add new tests. Hooks lint and type-check every edit, and a pre-commit hook blocks secrets."
- **Picture:** clip C9 (the AI log and the lessons file, scrolling).
- **Narration:** "Every feature has an entry in the AI log: what was asked, what the AI produced, what went wrong and how it was checked. When the AI got something wrong, like a test that only failed on the build server, the lesson went into the docs, so the next session knows."

### 6. Close: 3:20 to 3:30

- **Picture:** the Next Rep logo, "Say the set. See the progress.", the live address.
- **Narration:** "Next Rep. Say the set, see the progress. Try it at nextrep-gym dot vercel dot app."

## Clip list

Phone-size browser recordings are made by Claude Code with Playwright (viewport 390x844, the demo account `demo1@example.com`, which holds the sample history). They are silent; narration and music are added in the edit.

| Clip | Who records                                                         | Screen and actions                                                                                                                                                                                         | Length     |
| ---- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| V1   | **You, on your phone** (screen recording, sound on; your iPhone 15) | Workout screen: tap the mic, say "bench press 60 kilo 8 reps", wait for the confirm card, tap Log set. On iPhone the cloud path (`/api/transcribe`, ADR-019) is deployed and works; the cloud notice shows | 15 to 20 s |
| C1   | Claude Code                                                         | Home: the suggestion card and the last workout, slow scroll                                                                                                                                                | 8 s        |
| C2   | Claude Code                                                         | Workout → Choose exercise → Barbell Bench Press → Weight per side 20, reps 8 → the breakdown → Log set                                                                                                     | 20 s       |
| C3   | Claude Code                                                         | Log set with a weight far above last time → the "…is a big change from last time" flag (a tapped number is saved with a warning; a spoken one asks)                                                        | 10 s       |
| C4   | Claude Code                                                         | After a set: the rest timer counting down                                                                                                                                                                  | 8 s        |
| C5   | Claude Code                                                         | Browser set offline → "You are offline" banner → log a set → "1 waiting to sync" → back online → "All synced"                                                                                              | 20 s       |
| C6   | Claude Code                                                         | History: list of workouts, open one                                                                                                                                                                        | 10 s       |
| C7   | Claude Code                                                         | Progress: workouts per week, one exercise's chart and records                                                                                                                                              | 12 s       |
| C8   | Claude Code                                                         | AI Coach: tap a suggested question, send, the reply appears                                                                                                                                                | 15 s       |
| C9   | Claude Code                                                         | The repository's AI log and lessons, scrolling (desktop size)                                                                                                                                              | 10 s       |

Diagrams and cards (D1 architecture, D2 quality, D3 AI workflow), titles, music and narration are built in Hyperframes.

## Before recording

1. **Sign in once for the recordings.** The developer runs one command that opens a browser and signs in as the demo account; the session is saved to a file that Claude Code reuses without reading or printing it. The file stays out of git and is deleted after the recordings. Claude Code never types the password.
2. **Clips C2, C3 and C5 add sets to the demo account.** After recording, those sets can be removed so judges see the clean sample history.
3. **Do not run `test:integration` or `test:e2e`** while recording: they touch the test accounts (not the demo accounts, but keep the database quiet).
4. **Voice for the narration:** Kokoro (`npx hyperframes tts`, free and local); the default voice is `af_heart`. Say if you want a different one.

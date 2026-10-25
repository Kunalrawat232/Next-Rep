# Next Rep

Voice-first gym workout logger, delivered as an installable web app (PWA).

> Say "bench press 60 kilo 8 reps" between sets and it is logged correctly, even with bad signal, with the bar weight and per-side maths handled for you.

**Live app: https://nextrep-gym.vercel.app**

Built solo for the **Build With AI Hackathon 2026** (internal company hackathon). Demo link and demo video are added at submission.

**Status:** tap and voice logging (with the Gemini fallback, `/api/parse`), history, progress, PRs, Settings, offline sync and the AI coach (`/coach`, `/api/coach`) are built and merged to `main`. Production is deployed on Vercel at https://nextrep-gym.vercel.app. See the [roadmap](docs/plans/roadmap.md).

## Problem

Lifters need to record exercise, weight and reps to progress. Notes apps and paper are slow; tap-heavy apps are awkward with chalky hands and a locked phone. Gyms often have poor signal, so online-only apps fail at the worst moment. Weight is also ambiguous: is "45 kg" the total on the bar or per side, and what does the bar weigh here? See [problem statement](docs/product/problem-statement.md).

## What it does

- Tap logging that always works, including offline (local-first with a sync queue)
- Weight validators (deterministic, unit-tested) that check every set before it is saved
- Voice logging via the browser Web Speech API with a deterministic parser (English, plus Hindi number words) and a Gemini fallback; voice commands for repeat, undo, rest and editing a set
- A text-only AI coach (gym and diet questions only) on Gemini, with Groq as a second free provider
- Weight convention handling: bar weight, per-side maths, plausibility checks, confirmation with breakdown
- History, per-exercise progress charts, personal records and a simple "what to lift today" suggestion
- Email + password sign-in, with per-user data isolation enforced by Postgres Row Level Security

Full scope: [requirements](docs/product/requirements.md). Journey: [user journeys](docs/product/user-journeys.md).

## Stack

TypeScript (strict), React, Vite, Tailwind CSS, React Router, vite-plugin-pwa, Dexie (IndexedDB), Zod, Supabase (Auth, Postgres, RLS), Vercel (hosting and serverless), Gemini API and Groq API free tiers (voice fallback and AI coach), Recharts, Vitest, Playwright, ESLint, Prettier, Gitleaks, GitHub Actions. Versions and rationale: [tech stack](docs/architecture/tech-stack.md).

## Architecture in one picture

```
Phone (PWA): UI, validators (pure TS), IndexedDB + sync queue, Web Speech + parser
Vercel:      static hosting + /api/parse and /api/coach (hold the AI keys, verify the Supabase JWT)
Supabase:    Auth + Postgres with RLS
Gemini:      called only by /api/parse (fallback) and /api/coach
Groq:        second free provider, asked by /api/coach only when Gemini cannot answer
```

Principle: **AI listens, code verifies.** See [architecture overview](docs/architecture/overview.md).

## Getting started

Requires Node 22.12+.

```bash
npm install            # also enables the gitleaks pre-commit hook
cp .env.example .env.local   # fill in your own values; never commit it
npm run dev
```

| Task                 | Command                                         |
| -------------------- | ----------------------------------------------- |
| Unit tests           | `npm test`                                      |
| DB schema tests      | `npm run test:db`                               |
| Hosted-project tests | `npm run test:integration` (needs `.env.local`) |
| Lint, format         | `npm run lint`, `npm run format`                |
| Typecheck            | `npm run typecheck`                             |
| Build                | `npm run build`                                 |
| E2E (smoke)          | `npm run test:e2e`                              |
| Supabase check       | `npm run check:supabase` (needs `.env.local`)   |
| Coach check          | `npm run check:coach` (needs `.env.local`)      |
| Seed SQL             | `npm run seed:generate`, `npm run seed:check`   |

Setup of Supabase, Vercel and Gemini: [deployment guide](docs/delivery/deployment.md). Local tooling: [tooling setup](docs/delivery/tooling-setup.md).

Voice needs HTTPS or localhost, so the easiest way to test on a phone is the live address, https://nextrep-gym.vercel.app (a tunnel also works; Vercel preview deployments need a Vercel login).

## Credits

Exercise names and muscle data come from [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (MIT licence). The exercise demonstrations are © [Gym visual](https://gymvisual.com/) and are shown for **non-commercial use only**: they are loaded from the dataset at run time and are never stored in this repository, the build or the offline cache. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [ADR-013](docs/architecture/decisions/013-hotlinked-exercise-demonstrations.md).

Photos of the popular exercises come from [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense) and are also hotlinked, not stored; re-run `node scripts/match-exercise-photos.mjs path/to/dist/exercises.json` (add `--write`, then run Prettier on `src/domain/exercises.photos.json`) the same way, with decisions in `scripts/exercise-photo-overrides.json`.

To re-run the matching of exercises to animations after the exercise list changes: download `data/exercises.json` from the dataset (do not commit it), then run `node scripts/match-exercise-demos.mjs path/to/exercises.json` to print the report of matched, ambiguous, declined and unmatched exercises, and add `--write` to update `src/domain/exercises.demo.json` (then run `npx prettier --write` on that file, so the diff only shows real changes). Decisions for names that do not match go in `scripts/exercise-demo-overrides.json`.

## Documentation map

Everything lives in [`docs/`](docs/): product, architecture (with ADRs), domain rules, standards, design, security, AI practices, QA, delivery, hackathon and plans. `CLAUDE.md` is the entry point for AI assistants and links to the main docs.

## Limitations

- Voice works on Chrome (Android, desktop) and Safari (iOS); Firefox lacks the Web Speech API, so voice is hidden and tap logging used.
- Speech recognition needs internet, so offline only tap logging works. The audio leaves the device to the browser vendor's recogniser, which the app does not control.
- Offline, only creating sets is supported. Editing or deleting needs a connection.
- Exercise demonstrations load from a third-party CDN and need internet; offline, or if the CDN is down, a placeholder shows. They are for non-commercial use (see Credits).
- Browsers (especially iOS Safari) can evict local data, so sets sync as soon as possible.
- Gemini free tier has low rate limits and its free-tier terms can change. It reads unclear voice phrases (a fallback) and powers the text-only AI coach; free-tier prompts may be used by Google to improve its products, so the app sends only a question and a small summary, and says so on the Coach screen. When Gemini cannot answer, the coach asks Groq (also free tier) with the same question. The coach gives training and diet tips, not medical advice.
- Supabase free projects can pause after a period of inactivity.
- Sign-in works offline for a user who is already signed in: the app reads the stored session instead of waiting for the network.
- "Confirm email" is on: a new account must click the link in a confirmation email before signing in. The emails go through Brevo's free plan (300 a day) from a personal Gmail sender, without a domain of our own, so they can land in spam; the demo accounts in the submission are already confirmed.
- Weight suggestions are conservative rules, not coaching or medical advice.

## AI use

AI is used across the whole lifecycle and documented in [`docs/ai/`](docs/ai/) and [`docs/learning/`](docs/learning/). Claude is a development tool only; the only AI inside the app is Gemini and, as the coach's second provider, Groq (both free tier).

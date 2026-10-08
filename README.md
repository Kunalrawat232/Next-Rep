# Next Rep

Voice-first gym workout logger, delivered as an installable web app (PWA).

> Say "bench 60 kilo 8 reps" between sets and it is logged correctly, even with bad signal, with the bar weight and per-side maths handled for you.

Built solo for the **Build With AI Hackathon 2026** (internal company hackathon). Demo link and demo video are added at submission.

## Problem

Lifters need to record exercise, weight and reps to progress. Notes apps and paper are slow; tap-heavy apps are awkward with chalky hands and a locked phone. Gyms often have poor signal, so online-only apps fail at the worst moment. Weight is also ambiguous: is "45 kg" the total on the bar or per side, and what does the bar weigh here? See [problem statement](docs/product/problem-statement.md).

## What it does

- Voice logging via the browser Web Speech API with a deterministic, unit-tested parser and validators
- Tap logging that always works, including offline (local-first with a sync queue)
- Weight convention handling: bar weight, per-side maths, plausibility checks, confirmation with breakdown
- History, per-exercise progress charts, personal records and a simple "what to lift today" suggestion
- Email + password sign-in, with per-user data isolation enforced by Postgres Row Level Security

Full scope: [requirements](docs/product/requirements.md). Journey: [user journeys](docs/product/user-journeys.md).

## Stack

TypeScript (strict), React, Vite, Tailwind CSS, React Router, vite-plugin-pwa, Dexie (IndexedDB), Zod, Supabase (Auth, Postgres, RLS), Vercel (hosting and serverless), Gemini API free tier (fallback only), Recharts, Vitest, Playwright, ESLint, Prettier, Gitleaks, GitHub Actions. Versions and rationale: [tech stack](docs/architecture/tech-stack.md).

## Architecture in one picture

```
Phone (PWA): UI, Web Speech, parser + validators (pure TS), IndexedDB + sync queue
Vercel:      static hosting + /api/parse (holds GEMINI_API_KEY, verifies Supabase JWT)
Supabase:    Auth + Postgres with RLS
Gemini:      called only by /api/parse, only as a fallback
```

Principle: **AI listens, code verifies.** See [architecture overview](docs/architecture/overview.md).

## Getting started

Requires Node 22.12+.

```bash
npm install            # also enables the gitleaks pre-commit hook
cp .env.example .env.local   # fill in your own values; never commit it
npm run dev
```

| Task            | Command             |
| --------------- | ------------------- |
| Unit tests      | `npm test`          |
| DB schema tests | `npm run test:db`   |
| Lint            | `npm run lint`      |
| Typecheck       | `npm run typecheck` |
| Build           | `npm run build`     |
| E2E (smoke)     | `npm run test:e2e`  |

Setup of Supabase, Vercel and Gemini: [deployment guide](docs/delivery/deployment.md). Local tooling: [tooling setup](docs/delivery/tooling-setup.md).

Voice needs HTTPS or localhost, so test on phones through a Vercel preview deployment or a tunnel.

## Documentation map

Everything lives in [`docs/`](docs/): product, architecture (with ADRs), domain rules, standards, design, security, AI practices, QA, delivery, hackathon and plans. `CLAUDE.md` is the entry point for AI assistants and links to all of it.

## Limitations

- Voice works on Chrome (Android, desktop) and Safari (iOS). Firefox lacks the Web Speech API, so voice is hidden and tap logging is used.
- Speech recognition needs internet; offline, only tap logging works.
- Offline, only creating sets is supported. Editing or deleting needs a connection.
- Browsers (especially iOS Safari) can evict local data, so sets sync as soon as possible.
- Gemini free tier has low rate limits and is a fallback only.
- Weight suggestions are conservative rules, not coaching or medical advice.

## AI use

AI is used across the whole lifecycle and documented in [`docs/ai/`](docs/ai/) and [`docs/learning/`](docs/learning/). Claude is a development tool only; the only AI inside the app is Gemini (free tier).

# Requirements

## Scope (MoSCoW)

### Must have

- Email + password sign-in (Supabase Auth) and per-user data isolation (Row Level Security)
- Gym profiles with bar settings; per-exercise equipment type and bar
- Exercise library (seeded) with aliases, plus user-created custom exercises
- Workout session: start, log sets, finish
- **Tap logging** (always available, works offline)
- **Voice logging** using the browser Web Speech API, with our own deterministic parser and validators
- Weight convention handling: total vs per side, bar weights, plausibility checks, confirmation with breakdown
- History list, per-exercise progress chart, personal records
- Deployed on Vercel, installable as a PWA
- Unit tests for all domain logic; a few Playwright smoke tests for the core journey
- Documentation and AI log

### Should have

- Offline-tolerant set logging: local-first save with a sync queue ([offline sync](../architecture/offline-sync.md))
- Gemini fallback (via serverless function) for phrases the parser cannot understand confidently
- "What should I lift today?" suggestion based on simple progressive-overload rules
- Rest timer started by voice ("rest 90 seconds") or tap (tap is built; voice comes with the voice task)

### Could have (only if ahead of schedule)

- Weekly AI summary of training (Gemini, cached once per week)
- kg/lb display toggle (storage is always kg)
- Plate loading helper ("load: 20 + 2.5 each side")

### Won't have (this hackathon)

- **Laya intent model** (deferred; may be added after 19 Oct if everything else is done; see [ADR-004](../architecture/decisions/004-laya-deferred.md))
- Offline voice recognition (for example in-browser Whisper)
- Social features, sharing, coaching programmes
- Native mobile apps
- Photo/OCR import of paper logs
- Any medical, injury or nutrition advice
- \"Forgot password\" and magic-link sign-in (reliable email delivery is not available on the free tier)

## Constraints

- **Budget: ₹0 for services.** Only free tiers. The one exception is Claude (a Team subscription), used for development only. See [ADR-006](../architecture/decisions/006-free-tier-only-stack.md).
  - Vercel: free (Hobby) tier for hosting and serverless functions.
  - Supabase: free tier for Auth and Postgres. Free projects can pause after inactivity.
  - Google Gemini API: **free tier only. Never link a billing account.** Low per-minute limits; treat it as a scarce fallback.
- **Claude is not used inside the app** (that would need paid API billing). In-app AI is Gemini free tier only.
- **Browser support:** Chrome (Android, desktop) and Safari (iOS) are primary. Firefox lacks the Web Speech API, so voice is hidden and tap logging is used.
- **Timeline:** see [roadmap](../plans/roadmap.md). If behind, cut from "Could" first, then "Should"; never compromise tests or security.

## Decisions recorded

- Sign-in is email + password (not magic link) so Playwright can automate it with a dedicated test account.
- Default unit is kg; storage is always kg.

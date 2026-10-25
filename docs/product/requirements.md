# Requirements

## Scope (MoSCoW)

Status: **done** (built and merged to `main`), **in progress**, or **not built**. The plan and dates are in the [roadmap](../plans/roadmap.md).

### Must have

- Email + password sign-in (Supabase Auth) and per-user data isolation (Row Level Security). Done.
- One gym per user with bar settings; each exercise's equipment type picks a bar kind of the gym ([ADR-015](../architecture/decisions/015-one-gym-per-user.md)). Done.
- Exercise library (seeded) with aliases, plus user-created custom exercises. Each exercise page has a History section. Done.
- Workout session: start, log sets, finish. An empty workout (no sets) is never sent to the server or kept. Done.
- **Tap logging** (always available, works offline). Done.
- **Voice logging** using the browser Web Speech API, with our own deterministic parser (English, plus Hindi number words) and validators, a confirm card, and voice commands (repeat, undo, rest, edit a set). Done.
- Weight convention handling: total vs per side, bar weights, plausibility checks, confirmation with breakdown. Done, for tap and voice logging.
- History list, per-exercise progress charts, personal records. Done.
- Deployed on Vercel, installable as a PWA. The PWA manifest and icons are built, and production is deployed on Vercel at https://nextrep-gym.vercel.app (public, no login). Preview deployments are behind Vercel Authentication.
- Unit tests for all domain logic; a few Playwright smoke tests for the core journey. Unit tests done; the Playwright specs exist and are run by the developer, not in CI (all 5 passed).
- Documentation and AI log. In progress (the AI log is updated per task, and each entry says how it was validated and who ran the checks).

### Should have

- Offline-tolerant set logging: local-first save with a sync queue ([offline sync](../architecture/offline-sync.md)). Done.
- Gemini fallback (via serverless function, `/api/parse`) for phrases the parser cannot understand confidently. Done.
- "What should I lift today?" suggestion based on simple progressive-overload rules. Done.
- Rest timer started by voice ("rest 90 seconds") or tap. Done: presets and a custom length, and it starts by itself after a set (the limits are in `src/domain/rest/index.ts`, behaviour in [screens](../design/screens.md)). By voice, the parser has a `rest_timer` intent.
- kg/lb unit setting (storage is always kg; typing and showing weights follow it). Done. It was a "Could" item.
- AI coach (`/coach`, `/api/coach`, named Elijah, nav tab "AI Coach"): text-only advice on gym training and diet, read only, on Gemini with Groq as the free second provider ([ADR-017](../architecture/decisions/017-ai-coach.md), [ADR-018](../architecture/decisions/018-coach-second-provider.md)). Done.
- About page with credits (Settings, then "About and credits"). Done.

### Could have (only if ahead of schedule)

- Weekly AI summary of training (Gemini, cached once per week). Not built.
- Plate loading helper ("load: 20 + 2.5 each side"). Not built.

### Won't have (this hackathon)

- **In-browser intent model** (dropped: not done and decided out; see [ADR-004](../architecture/decisions/004-intent-model-deferred.md))
- Offline voice recognition (for example in-browser Whisper)
- Social features, sharing, coaching programmes
- Native mobile apps
- Photo/OCR import of paper logs
- Any medical or injury advice (the coach refuses to diagnose and tells the user to see a doctor or physiotherapist). Diet and nutrition for fitness, including common supplements such as creatine, are on topic for the coach; crash or very low calorie diets and drugs or steroids are not.
- \"Forgot password\" and magic-link sign-in (reliable email delivery is not available on the free tier)

## Constraints

- **Budget: ₹0 for services.** Only free tiers. The one exception is Claude (a Team subscription), used for development only. See [ADR-006](../architecture/decisions/006-free-tier-only-stack.md).
  - Vercel: free (Hobby) tier for hosting and serverless functions.
  - Supabase: free tier for Auth and Postgres. Free projects can pause after inactivity.
  - Google Gemini API: **free tier only. Never link a billing account.** Low per-minute limits; treat it as a scarce fallback.
  - Groq API: free tier only, the coach's second provider.
- **Claude is not used inside the app** (that would need paid API billing). In-app AI is Gemini free tier, with Groq free tier as the coach's second provider.
- **Browser support:** Chrome (Android, desktop) and Safari (iOS) are primary. Firefox lacks the Web Speech API, so voice is hidden and tap logging is used.
- **Timeline:** see [roadmap](../plans/roadmap.md). If behind, cut from "Could" first, then "Should"; never compromise tests or security.

## Decisions recorded

- Sign-in is email + password (not magic link) so Playwright can automate it with a dedicated test account.
- Default unit is kg; storage is always kg. The user can switch to lb in Settings (see [open questions](open-questions.md)).

# Requirements

## Scope (MoSCoW)

Status as of 2026-10-10: **done** (built and merged to `main`), **done, on `feat/home`, not yet merged**, **in progress**, or **not built**. Items that are not built say "Status: planned (Phase 3), not built yet." The plan and dates are in the [roadmap](../plans/roadmap.md).

### Must have

- Email + password sign-in (Supabase Auth) and per-user data isolation (Row Level Security). Done.
- Gym profiles with bar settings; each exercise's equipment type picks a bar kind of the gym. Done.
- Exercise library (seeded) with aliases, plus user-created custom exercises. Done.
- Workout session: start, log sets, finish. Done.
- **Tap logging** (always available, works offline). Done.
- **Voice logging** using the browser Web Speech API, with our own deterministic parser and validators. Status: planned (Phase 3), not built yet. The validators are built; the parser is a schema only and the voice button is disabled.
- Weight convention handling: total vs per side, bar weights, plausibility checks, confirmation with breakdown. Done for tap logging; the spoken path waits for voice.
- History list, per-exercise progress chart, personal records. Done.
- Deployed on Vercel, installable as a PWA. In progress: the PWA manifest and icons are built; no Vercel deployment exists yet.
- Unit tests for all domain logic; a few Playwright smoke tests for the core journey. Unit tests done; the Playwright smoke specs exist and are run by the developer, not in CI.
- Documentation and AI log. In progress (the AI log is updated per task; "How validated" is for the developer to fill).

### Should have

- Offline-tolerant set logging: local-first save with a sync queue ([offline sync](../architecture/offline-sync.md)). Done.
- Gemini fallback (via serverless function) for phrases the parser cannot understand confidently. Status: planned (Phase 3), not built yet (`/api/parse` returns 501).
- "What should I lift today?" suggestion based on simple progressive-overload rules. Done, on `feat/home`, not yet merged.
- Rest timer started by voice ("rest 90 seconds") or tap. By tap: done, on `feat/home`, not yet merged (presets and a custom length; the limits are in `src/domain/rest/index.ts`, behaviour in [screens](../design/screens.md)). By voice: planned (Phase 3), not built yet.
- kg/lb unit setting (storage is always kg; typing and showing weights follow it). Done, on `feat/home`, not yet merged. It was a "Could" item and is built.

### Could have (only if ahead of schedule)

- Weekly AI summary of training (Gemini, cached once per week). Not built.
- Plate loading helper ("load: 20 + 2.5 each side"). Not built.

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
- Default unit is kg; storage is always kg. The user can switch to lb in Settings (see [open questions](open-questions.md)).

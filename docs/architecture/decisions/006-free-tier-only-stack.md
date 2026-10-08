# ADR-006: Free-tier-only stack

- **Status:** accepted (2026-10-08)

## Context

Budget is ₹0 for services. The only paid item is the developer's Claude Team subscription, used for development only.

## Decision

Use only free tiers: Vercel Hobby (hosting, serverless functions), Supabase free (Auth, Postgres), and Google Gemini API free tier. **Never link a billing account to Gemini.** Claude is not used inside the app.

## Alternatives considered

- **Paid tiers:** more headroom, but violates the budget and risks surprise bills.
- **Self-hosting:** more control, more operations work, and no benefit for an MVP.

## Consequences

- Supabase free projects can pause after inactivity (check before the demo).
- Gemini has low per-minute limits, which is why it is a scarce fallback with per-user rate limiting.
- Vercel serverless functions are stateless across instances, so the rate limit lives in Postgres.
- Hosting limits (bandwidth, function duration) are accepted and documented as limitations.

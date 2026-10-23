# Architecture overview

Status: built: voice input, the parser and `/api/parse` (the Gemini fallback, checked once against the live API), and the AI coach (`/api/coach`, Gemini with an optional Groq second provider; [ADR-017](decisions/017-ai-coach.md), [ADR-018](decisions/018-coach-second-provider.md)). Also built: auth, one gym per user, exercises, tap logging, offline log and sync, history, progress, Home, Settings and About. Deployed as a Vercel preview (2026-10-23); production is not deployed yet. See [AGENT_CONTEXT.md](../../AGENT_CONTEXT.md) for the current state.

## Components

```
Phone: installable web app (PWA)
├── UI screens ............ logging, history, charts, PRs, coach chat, settings
├── Voice input ........... browser Web Speech API (online only)
├── Parser + validators ... pure TypeScript domain logic (works offline)
└── Local store ........... IndexedDB (Dexie): sets, sync queue, coach chat

Vercel
├── Static hosting ........ the PWA
├── /api/parse ............ serverless function, holds GEMINI_API_KEY
└── /api/coach ............ serverless function, text advice; GEMINI_API_KEY and the optional FALLBACK_* settings

Supabase (free)
├── Auth .................. email + password sign-in
└── Postgres + RLS ........ each user can only access their own rows

Google Gemini API (free tier) ... called ONLY by /api/parse (as a fallback for voice) and /api/coach

Groq API (free tier, optional) .. the coach's second provider, asked only when Gemini cannot answer (ADR-018)

Laya ............................ dropped, never built (ADR-004)
```

## Data flow: logging a set by voice

Status: built. Tap logging follows steps 3, 6 (for tap, the ambiguity prompt), 7 and 8.

1. The user holds the mic button; the Web Speech API returns a transcript (plus alternatives if available).
2. The **parser** (local, deterministic) extracts intent, exercise, weight, unit, reps and weight mode, and returns a confidence score. See [voice grammar](../domain/voice-grammar.md).
3. **Validators** apply bar logic and plausibility checks. See [weight rules](../domain/weight-rules.md).
4. If confidence is high and validators pass: show the confirmation card.
5. If confidence is low **and** the device is online: call `/api/parse` (Gemini). The response must match a Zod schema and is run through the **same validators**. Gemini never writes data directly.
6. If still unclear: show an ambiguity prompt with big tap buttons (for example "45 kg total" / "45 kg per side = 105 kg").
7. On confirm: save to IndexedDB immediately (the UI updates instantly) and enqueue for sync.
8. The sync worker pushes to Supabase when online. See [offline sync](offline-sync.md).

## Principle: "AI listens, code verifies"

Speech recognition and the AI models (Gemini, and Groq for the coach) are treated as **untrusted inputs**. The coach is read only: its text is shown as plain text and never becomes a stored number. All numbers that reach storage must pass deterministic validation and be visible to the user before saving.

## Folder structure

The current project map is in [AGENT_CONTEXT.md](../../AGENT_CONTEXT.md) section 2.

**Rule:** `src/domain/` stays pure (no React, no network, no storage). This keeps it fully unit-testable and is where most AI-generated tests focus.

## Related

[Tech stack](tech-stack.md) · [Data model](data-model.md) · [API contracts](api-contracts.md) · [Security checklist](../security/security-checklist.md) · [ADRs](decisions/)

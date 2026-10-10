# Architecture overview

Status: planned (Phase 3), not built yet: voice input, the parser and `/api/parse` (the Gemini fallback). Built: auth, gyms, exercises, tap logging, offline log and sync, history, progress, Home and Settings. See [AGENT_CONTEXT.md](../../AGENT_CONTEXT.md) for the current state.

## Components

```
Phone: installable web app (PWA)
├── UI screens ............ logging, history, charts, PRs, settings
├── Voice input ........... browser Web Speech API (online only)
├── Parser + validators ... pure TypeScript domain logic (works offline)
└── Local store ........... IndexedDB (Dexie) + sync queue

Vercel
├── Static hosting ........ the PWA
└── /api/parse ............ serverless function, holds GEMINI_API_KEY

Supabase (free)
├── Auth .................. email + password sign-in
└── Postgres + RLS ........ each user can only access their own rows

Google Gemini API (free tier) ... called ONLY by /api/parse, ONLY as a fallback

Laya (later, optional) .......... intent model, not part of the MVP (ADR-004)
```

## Data flow: logging a set by voice (planned, Phase 3)

Status: planned (Phase 3), not built yet. Tap logging, which is built, follows steps 3, 6 (for tap, the ambiguity prompt), 7 and 8.

1. The user holds the mic button; the Web Speech API returns a transcript (plus alternatives if available).
2. The **parser** (local, deterministic) extracts intent, exercise, weight, unit, reps and weight mode, and returns a confidence score. See [voice grammar](../domain/voice-grammar.md).
3. **Validators** apply bar logic and plausibility checks. See [weight rules](../domain/weight-rules.md).
4. If confidence is high and validators pass: show the confirmation card.
5. If confidence is low **and** the device is online: call `/api/parse` (Gemini). The response must match a Zod schema and is run through the **same validators**. Gemini never writes data directly.
6. If still unclear: show an ambiguity prompt with big tap buttons (for example "45 kg total" / "45 kg per side = 105 kg").
7. On confirm: save to IndexedDB immediately (the UI updates instantly) and enqueue for sync.
8. The sync worker pushes to Supabase when online. See [offline sync](offline-sync.md).

## Principle: "AI listens, code verifies"

Speech recognition and Gemini are treated as **untrusted inputs**. All numbers that reach storage must pass deterministic validation and be visible to the user before saving.

## Folder structure

The current project map is in [AGENT_CONTEXT.md](../../AGENT_CONTEXT.md) section 2.

**Rule:** `src/domain/` stays pure (no React, no network, no storage). This keeps it fully unit-testable and is where most AI-generated tests focus.

## Related

[Tech stack](tech-stack.md) · [Data model](data-model.md) · [API contracts](api-contracts.md) · [Security checklist](../security/security-checklist.md) · [ADRs](decisions/)

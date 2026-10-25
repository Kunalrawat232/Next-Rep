# ADR-003: Gemini as a fallback only

- **Status:** accepted. Amended by [ADR-017](017-ai-coach.md) (the coach is a second Gemini caller) and [ADR-018](018-coach-second-provider.md) (a second provider for the coach). `/api/parse` is still the only Gemini caller for voice. [ADR-019](019-cloud-speech-to-text.md) adds a speech-to-text service (Groq, not Gemini) for phones whose browser cannot hear; its words go through the same validators.

## Context

A deterministic parser handles the common phrases and works offline, but it will miss unusual phrasing. An LLM can interpret free-form speech, but is non-deterministic, rate-limited on the free tier, and a prompt-injection and hallucination risk. Claude cannot be used inside the app (it needs paid API billing).

## Decision

Call Gemini (free tier) **only** from `/api/parse`, and **only** when the local parser's confidence is below the threshold and the device is online. The function verifies the user's Supabase JWT, validates input and output with Zod, rate-limits per user, and sends only the transcript plus minimal context (no personal data). Gemini's output goes through the **same validators** as parser output and is shown to the user for confirmation. Gemini never writes data directly. On error, timeout or 429 the UI falls back to manual confirmation. Details: [API contracts](../api-contracts.md), [prompts](../../ai/gemini-prompts.md).

## Alternatives considered

- **Gemini as the primary parser:** simpler grammar work, but slow, needs internet, burns the free quota and is non-deterministic.
- **No LLM:** fully deterministic, but unusual phrases dead-end in a manual form.
- **In-browser model (e.g. Whisper or an intent model):** offline, but heavy and out of scope (see [ADR-004](004-intent-model-deferred.md)).

## Consequences

- Most sets never touch the network or the quota.
- Logging is never blocked by the LLM.
- Prompt injection via transcript is mitigated by the JSON schema, validators and user confirmation.
- Free-tier prompts may be used by Google to improve its products, so only the transcript is sent.

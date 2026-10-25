# api

The server side and the client's talk to it: the three Vercel functions (`/api/parse`, `/api/coach` and `/api/transcribe`), their shared helpers, the AI coach, cloud speech-to-text, and how the browser reaches Supabase.

| Doc                                                            | Read when                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [functions-and-handlers.md](functions-and-handlers.md)         | Touching `api/`, the voice fallback, rate limits, the daily ceiling, the dev server's `/api`, or the `.js` import rule.  |
| [coach.md](coach.md)                                           | Touching the AI coach: its prompt, scope, privacy, chat storage, persona, or the second provider (Groq).                 |
| [transcribe.md](transcribe.md)                                 | Touching `/api/transcribe`, the raw audio request, the iPhone cloud recogniser, its limits or the Groq speech settings.  |
| [supabase-client-and-errors.md](supabase-client-and-errors.md) | Touching `src/data/remote/`, the Supabase services, or how errors become `offline`, `conflict`, `rejected` or `unknown`. |

Also: [API contracts](../../docs/architecture/api-contracts.md), [Gemini prompts](../../docs/ai/gemini-prompts.md), [guardrails](../../docs/ai/guardrails.md); ADR [003](../../docs/architecture/decisions/003-gemini-as-fallback-only.md), [017](../../docs/architecture/decisions/017-ai-coach.md), [018](../../docs/architecture/decisions/018-coach-second-provider.md), [019](../../docs/architecture/decisions/019-cloud-speech-to-text.md). Environment variables: `AGENT_CONTEXT.md` section 8.

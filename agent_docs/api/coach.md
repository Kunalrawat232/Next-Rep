# The AI coach

A text chat where a user asks gym and diet questions. **Text only and read only:** it cannot write to the log, change a weight or start a workout; "AI listens, code verifies" still holds. Decisions and reasons: ADR [017](../../docs/architecture/decisions/017-ai-coach.md) (the coach) and [018](../../docs/architecture/decisions/018-coach-second-provider.md) (the second provider). The prompt text lives only in `api/_lib/coachPrompt.ts`; [Gemini prompts](../../docs/ai/gemini-prompts.md) describes it.

## Where things are

| Part                                                           | Files                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screen                                                         | `src/features/coach/`: `CoachPage.tsx` (header, notice, ideas, bubbles, composer, "Use my last 3 workouts" switch, Clear chat), `ChatParts.tsx`, `CoachText.tsx` (replies as safe React text, never markup), `useCoachChat.ts`, `coachService.tsx` (`CoachService`, `CoachAnswer`) |
| Client call                                                    | `src/data/remote/coach.ts` `createFetchCoachService` (25 s limit, never throws; a 401 or no session becomes `signed_out`, a 429 `limited`)                                                                                                                                         |
| Shared domain (no React, `.js` imports because `api/` uses it) | `src/domain/coach/schemas.ts` (`COACH_NAME`, `COACH_QUESTION_MAX` 500, `COACH_HISTORY_MAX` 8, `COACH_REPLY_MAX` 2000, `COACH_REFUSAL`, the request and response schemas), `clean.ts` (`cleanText`), `index.ts` (`buildCoachContext`, `lastTurns`)                                  |
| Function                                                       | `api/coach.ts` (wiring) and `api/_lib/coach.ts` (`handleCoach`), `coachPrompt.ts` (system prompt), `coachScope.ts` (`isObviouslyOffTopic`), `fallbackProvider.ts`                                                                                                                  |

## Behaviour

- **Scope, privacy and the second provider** are decided in the ADRs, not repeated here: gym and diet only is enforced three ways (prompt, the model's `onTopic` answer with our own `COACH_REFUSAL`, and the `coachScope.ts` prefilter); the training summary goes only if the person turns the switch on (it starts off); Groq is asked once when Gemini fails or the daily ceiling is used up (`fallbackProvider.ts`, three `FALLBACK_*` settings, all or none). See ADR 017 and 018.
- **Persona:** the name is the single constant `COACH_NAME` (the header, the nav tab and the typing label all use it, and the prompt says the coach is an AI, not a person). The nav tab is labelled "AI Coach".
- **What the server does to a request:** cleans every turn (hidden and text-direction characters; earlier questions held to 500 characters), counts the per-user limits (scope `coach`, numbers in [rate-limits-and-ceiling.md](../database/rate-limits-and-ceiling.md)), then the daily ceiling, then asks the model. A reply with a link, a code block or an HTML tag, an empty reply, or one not in the agreed form is not passed on.
- **The chat stays on the device** (`coachMessages`, newest 50, cleared at sign-out and by Clear chat; see [device-database.md](../local-data/device-database.md)). A question the coach could not answer is taken back out of the chat and returned to the box. Clear is disabled while a question is out.
- **Answers are advice:** the prompt forbids diagnosis, drugs and crash diets, and never to invent a number; the person's facts arrive as JSON data and their text only ever as chat turns.

## Tests and checks

`api/_lib/coach.test.ts`, `coachScope.test.ts`, `fallbackProvider.test.ts`; `src/features/coach/coachPage.test.tsx`; `src/domain/coach/coach.test.ts`; `src/data/remote/coach.test.ts`. The developer's live check is `npm run check:coach`. Real answers have not been read through for quality and safety.

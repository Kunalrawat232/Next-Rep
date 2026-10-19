# ADR-017: A text-only AI coach on the Gemini free tier

- **Status:** accepted (2026-10-17), on branch `feat/coach`.

## Context

The developer wanted an AI coach: a text chat where a user asks training questions. It must stay free (no billing, free tiers only, ADR-006), and it must keep the project's principle, "AI listens, code verifies" (ADR-003): an AI answer never becomes a stored number.

## Decision

- **Text only, read only.** The coach answers in text. It cannot write to the log, change a weight or start a workout. Next Rep's own rules compute the suggested weight; the coach is given that number as a fact and told to use it and not to invent others.
- **One new function, `/api/coach`,** built like `/api/parse`: a handler with injected dependencies (`api/_lib/coach.ts`, tests with fakes), the same sign-in check (`getClaims`), the shared Supabase helpers (`api/_lib/supabase.ts`), and the same model client. The model is `COACH_MODEL` when set, else `GEMINI_MODEL` (free tier only, never a billing account).
- **Limits.** A question is at most 500 characters; eight earlier turns go with it; the reply is at most 700 tokens and 2000 characters; the model gets 20 seconds. Per user: 5 a minute and 20 an hour, through the existing `consume_rate_limit` (windows up to an hour, so there is no daily window). That function has no separate scope, so **the coach and the voice fallback share one counter per user**: heavy coach use can use up the voice fallback's hourly budget. Accepted for now; a `scope` column would split them.
- **What is sent to Google.** The question, the last turns, and, if the person leaves the switch on, a small summary built on the device (`buildCoachContext`): unit, up to three recent workouts as exercise names with set count, top weight and reps, and the rule-based suggestion. No email, name, account id or exercise id; the summary is validated by a strict schema. The free tier may use prompts to improve Google's products, so the Coach screen tells a new user once (and the switch lets them send nothing).
- **Gym and diet only, enforced three ways.** (1) The prompt defines what is on topic (training, recovery, motivation, body-composition goals, and diet and nutrition for fitness, including common supplements such as creatine) and what is not (weather, maths, coding, news, general knowledge, and so on), and makes the model answer in JSON, `{onTopic, reply}`. (2) The server trusts `onTopic` only to refuse: an off-topic question gets `{status: 'off_topic'}`, and the words shown (`COACH_REFUSAL`, "I can't answer this question. I can only help with gym training and diet…") come from our code, so a model cannot be talked into a partial answer. An answer that is not in the agreed form is treated as unavailable and shown as nothing. (3) A short, exact filter (`api/_lib/coachScope.ts`: sums, "solve … =", the weather, prices, code and poem requests) turns the plain cases away without a model call; it is kept narrow so a gym question ("5x5", "hot weather training") is never caught. A turned-away question still counts against the user's limit. Follow-ups ("why?") are understood from the chat.
- **Safety in the prompt and around it.** The system prompt keeps the coach to training, tells it never to diagnose or give medical advice (stop and see a doctor or physiotherapist for pain, injury or a health condition), no drugs or steroids, no crash or very low calorie diets, never to invent a number, and to treat the user's text and the earlier chat as untrusted. The user's text only ever goes in the chat turns, never into the instructions; the facts go in as JSON data. Replies are shown as React text with simple bullet lists, never as markup or links.
- **The chat stays on the device.** A new Dexie table (`coachMessages`, database version 3), newest 50 kept, cleared at sign-out with the other synced data and by a "Clear chat" button. Nothing about the chat is stored on the server, and the server does not log questions or replies.
- **Failure is quiet.** No connection, a rate limit or a model failure is a short message; a question that was not answered goes back into the box. Logging and everything else keep working.

## Alternatives considered

- **Stream the reply word by word:** nicer to watch, more code (and a longer-lived function); not in the first version.
- **A second provider (Groq) as a fallback:** more free quota, but another key, another vendor receiving the text, and more to maintain; only if Gemini's limits actually bite.
- **On-device Gemini Nano in Chrome:** free and private, but desktop Chrome with a large download and no confirmed Android support.
- **Letting the coach log or change sets:** against the project's principle; ruled out.
- **Keeping the chat on the server:** it would need a table, RLS and retention rules for little gain.

## Consequences

- A second provider can answer when Gemini cannot: see [ADR-018](018-coach-second-provider.md).

- A busy day can hit Gemini's per-project free limits; the coach then says it is busy.
- The shared rate counter couples the coach and the voice fallback (see above).
- The answers are advice from a language model: the screen says so, and the prompt keeps it away from medical topics, but it cannot be made perfect. The developer should read a few real answers before the demo.
- Needs the function deployed and `GEMINI_API_KEY` set (already done for `/api/parse`); `COACH_MODEL` is optional.
- The coach has a name (`COACH_NAME`, currently Elijah), and a person-shaped avatar so it reads as a someone to talk to. It always says it is an AI if asked, and the screen says so too. The nav tab shows the same name.
- The training summary is **off by default**: the person turns it on with the switch under the box. A security audit on 2026-10-17 found the model's own on-topic flag was the only scope check beyond the prefilter, so the server also cleans every turn and refuses replies with links, code or tags. Migration 0005 gives each endpoint its own rate-limit counters (and fixes the minute and the hour colliding) and adds a project-wide ceiling of 1000 model calls a day, shared by `/api/parse` and the coach, with a 100 an hour cap per account so one account cannot use it up; the names of the person's own exercises are no longer sent in the summary (they are free text). Applied to the hosted project on 2026-10-18. Still open: email confirmation and CAPTCHA at sign-up (account farming).
- The coach header is not a `PageHeader` on purpose: that component is a title with a way back, and the coach is a top-level tab with a picture, a name and a Clear action. The send button is 48 px, a 401 shows "sign in again" instead of the generic message, and the function refuses a body that announces itself as huge before reading it.

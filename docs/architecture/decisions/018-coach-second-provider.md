# ADR-018: A second provider for the coach, used only when Gemini cannot answer

- **Status:** accepted; merged to main. Builds on [ADR-017](017-ai-coach.md). Timeouts and token caps: [API contracts](../api-contracts.md).

## Context

The coach runs on Gemini's free tier. When the free quota runs out, or Gemini fails, the person sees "can't answer
right now". The developer asked for a fallback. Grok (xAI) was the first idea, but the project's rule is free tiers
only and no billing account (ADR-006), and no free tier from xAI could be confirmed (third-party sources disagree:
starter credits, a monthly credit that needs a paid spend first, or none). A free provider that fits the rule was
chosen instead.

## Decision

- **Groq is the second provider** (not Grok): one company, a few open models, fast, with a free tier and an
  OpenAI-style chat endpoint. OpenRouter was the alternative; it offers more models but its free list changes and
  requests may be passed on to different upstream providers, which is a worse thing to depend on as a backup.
- **Provider-neutral code.** `api/_lib/fallbackProvider.ts` speaks the OpenAI-style `/chat/completions` request over
  plain `fetch` (no new dependency). The provider is three settings: `FALLBACK_API_KEY`, `FALLBACK_BASE_URL` (https
  only) and `FALLBACK_MODEL`. All three or none; with none the coach behaves as before. Switching to OpenRouter later
  is a settings change.
- **When it is asked,** once per question: the first provider throws or answers in an unreadable form, or the
  project's day of Gemini calls (`consume_daily_ceiling`) is already used up, in which case Gemini is skipped.
  Timeouts are split so the two fit inside the app's own wait (numbers in the API contracts). If the day is used up and the second provider also fails, the answer
  is "busy" (`limited`), as before.
- **Same rules for both.** The second provider gets the same system prompt and chat, and its answer goes through the
  same checks: the agreed `{onTopic, reply}` form, our own refusal for off-topic, the length cap and the "no links,
  code or tags" check. The per-person limits still apply first.
- **The reply may think first.** The second provider gets a larger token cap than Gemini (see the API contracts), because a model that reasons before it answers counts that thinking against the limit and would otherwise be cut off mid-answer. `npm run check:coach` passed for `openai/gpt-oss-20b` on Groq.
- **Nothing secret in the log.** A refused request carries only its HTTP status in the error; the log never gets the
  provider's message (which can echo the chat), the question or the reply.

## Consequences

- **Privacy:** the question, the last turns and the optional training summary can now go to a second company, and
  Google's free tier may use the text to improve its products. Groq's own terms are more favourable (see "Groq's data terms" below), but the coach notice still says both may, which is the safe direction. The notice names Groq and is shown again
  once (`next-rep-coach-notice-2`), and the About page says so. The summary stays off by default.
- Groq's free limits (roughly 30 requests a minute per account, per-model daily limits) are not counted by us; the
  per-person limits keep one account well under them, and a Groq 429 just means "can't answer right now".
- A second company's key must be created and set in `.env.local` and in Vercel by the developer; it is never
  committed. `npm run check:coach` tests the second provider when it is set up.
- The model must keep to JSON; `response_format: json_object` is requested and the answer is still checked.

## Groq's data terms

Read in Groq's own documents when this ADR was checked (the terms can change, so read them again before relying on them): [Your Data in GroqCloud](https://console.groq.com/docs/your-data) and the [Groq Services Agreement](https://console.groq.com/docs/legal/services-agreement).

- **No training on inputs or outputs.** The Services Agreement (section 4.2, Inputs and Outputs) says Groq is not permitted to use inputs or outputs for training or fine-tuning unless the customer allows it. The coach's questions and summaries are inputs.
- **No retention by default.** The data page says that by default Groq does not retain customer data for inference requests. The exceptions are logs kept temporarily, for up to 30 days, to troubleshoot errors that hurt reliability and to investigate suspected abuse. Enabling Zero Data Retention in the Console's Data Controls removes those logs too; it is open to all customers and was not switched on for this project.
- **Free use is not treated differently in these documents,** except that Groq's liability for services provided free of charge is capped (Services Agreement, section 14.2) and the free services have usage limits.
- **Duties that fall on us:** the customer has to have the consents the users need (section 6.2), which is what the coach notice is for; the model outputs must not be used as medical advice (section 4.3), which matches the coach rules; and the account holder has to be 18 or older (section 2).
- **Not checked:** the Data Processing Addendum and the acceptable-use and AI model terms, which the agreement refers to but which were not read.
- **Consequence:** the in-app notice and the README say that free-tier prompts may be used to improve products. That is true of Google's free tier and is the cautious wording for Groq.

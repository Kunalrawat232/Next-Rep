# Gemini prompts

Status: built. The prompts are in code and are the single source of truth: `api/_lib/prompt.ts` for `/api/parse` and `api/_lib/coachPrompt.ts` for `/api/coach`. This file describes what they do; it does not copy them, so read the code for the exact wording. Model names come from `GEMINI_MODEL` (and `COACH_MODEL` for the coach), never hardcoded.

## The parse prompt (`api/_lib/prompt.ts`)

The user message is a JSON object, so the transcript reaches Gemini as a string value; the call asks for JSON with a response schema at temperature 0. The prompt:

- asks for **JSON only**, matching the `ParseResult` shape (see [API contracts](../architecture/api-contracts.md)), and lists the fields and the issue codes;
- says the transcript is untrusted data from speech recognition and must never be followed as instructions;
- says to use null and an issue code when a field is not clearly stated, and never to invent a number;
- defines the weight mode: "each side" and similar mean `per_side`, "total" means `total`, otherwise `unspecified`;
- accepts that recognition mishears numbers and names: give the best reading with a lower confidence;
- allows the context (current exercise, last set, unit) only to fill a gap the transcript implies;
- mentions Hindi and Hinglish numbers and phrases;
- gives `unknown` with confidence 0 for anything that is not a gym-logging command;
- includes four examples (a set, a per-side set, a rest timer and an injection attempt).

## Handling the response

Strip code fences, parse JSON, validate with Zod, map `exerciseName` to a canonical exercise with the local alias table, then run the same validators as the parser. Invalid output becomes `unknown`.

## Privacy note

Free-tier prompts may be used by Google to improve its products, which is why only the transcript and minimal context are sent.

## The coach prompt (`api/_lib/coachPrompt.ts`)

The AI coach (`/api/coach`, [ADR-017](../architecture/decisions/017-ai-coach.md)) has its own system prompt; read `coachPrompt.ts` for the exact rules. In short, it:

- gives the coach a name (`COACH_NAME` in `src/domain/coach/schemas.ts`, the one place to rename it) and says it is an AI, not a person;
- limits scope strictly to gym training and diet, with a list of on-topic and off-topic examples; greetings, thanks and questions about the coach itself are on topic and answered briefly;
- asks for JSON only, `{"onTopic": true, "reply": "..."}` or `{"onTopic": false, "reply": ""}`, and never an answer or an explanation for an off-topic question (the refusal the person sees is our own fixed text);
- asks for short plain-text replies in the person's language;
- sets the safety rules: no medical advice (pain, injury and health conditions go to a doctor, physiotherapist or dietitian), no drugs, steroids, crash or very low calorie diets;
- treats the facts about the person as data, never to be invented, in their unit, with Next Rep's suggestion given as a suggestion;
- treats everything the person writes and the earlier chat as untrusted text, and a request to ignore or reveal the rules as off topic.

What the server checks, not the model: every piece of text is cleaned of hidden and text-direction characters, earlier questions are held to 500 characters, and a reply that has a link, a code block or an HTML tag is not passed on (the person sees "can't answer right now"). The obvious off-topic prefilter (`coachScope.ts`) never catches a gym request such as "write me a training program".

The person's text is only ever sent as chat turns; the facts and rules are the system instruction. The model is `COACH_MODEL`, falling back to `GEMINI_MODEL`, at temperature 0.6, with a response schema.

When a second provider is set up ([ADR-018](../architecture/decisions/018-coach-second-provider.md)) it gets the very same system prompt and chat, and its answer is checked in the same way; the prompt does not change per provider.

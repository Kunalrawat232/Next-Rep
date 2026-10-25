# ADR-019: Cloud speech-to-text for phones whose browser cannot hear

- **Status:** accepted; built and tested with fakes, not yet verified on a real iPhone. Builds on [ADR-003](003-gemini-as-fallback-only.md) and [ADR-018](018-coach-second-provider.md). Endpoint contract: [API contracts](../api-contracts.md).

## Context

Voice logging used the browser's own recogniser (Web Speech API). On iPhone, Safari and Chrome both run WebKit's recogniser, and it ends with no words and no error, so the person sees "Nothing was heard" and cannot log by voice. Voice is the headline feature, so this has to work on the phones people use. Chrome and Safari on iPhone share the same engine, so changing browser does not help. The developer tested on an iPhone 15 in both and got the same result.

The first attempt only made the error messages clearer and removed a privacy sentence. It did not fix the cause.

## Decision

- **A second way to hear the person: cloud speech-to-text.** `POST /api/transcribe` takes the raw recording (Content-Type audio/webm, audio/mp4, audio/ogg or audio/wav) and returns the words as text. It sits behind the same sign-in check, per-user limits and project-wide daily ceiling as `/api/parse` and `/api/coach`, and it counts toward the same 1000 calls a day (scope `gemini` in `consume_daily_ceiling`), so no data-model change was needed.
- **Provider: Groq's Whisper** (`whisper-large-v3-turbo`, optional `TRANSCRIBE_MODEL`), through the same key and https address as the coach's second provider (`FALLBACK_API_KEY`, `FALLBACK_BASE_URL`). Groq is the second free service the project already uses (ADR-018); no new vendor, key or account.
- **The browser's recogniser stays first.** The app uses it wherever it works. It switches to the cloud recogniser only when the browser's recogniser ends with no words and no error, or fails for a reason that is not the person's own silence or a denied microphone. The choice is remembered on the device (`next-rep-voice-mode` = `cloud`), so after a switch every phrase on that device is recorded and sent. On a browser with no recogniser at all, cloud is used from the start.
- **Audio is handled as untrusted input and never kept.** The server checks the token, the content type and the size (1000 to 1,000,000 bytes; the app records at most 8 s) before it calls the service. The request is not stored, and the logs record only the failing step and the error kind, never the audio or the words. The reply is cleaned and capped at 300 characters.
- **The words follow the same path as browser words.** They go through the parser, the optional Gemini fallback, the validators and the confirm card. Nothing is stored until the person taps Log set ("AI listens, code verifies", ADR-003).
- **The person is told.** In cloud mode the workout screen always shows: "Your voice is sent to a speech service to turn it into text. Next Rep does not keep it."
- **If the service is not set up,** the endpoint answers 503 and the app keeps the browser's recogniser only, as before.

## Alternatives considered

- **Gemini with audio input.** Rejected: Google's free tier may use prompts to improve its products, and a voice recording is more personal than a typed transcript.
- **A speech model in the browser (for example Whisper compiled to WebAssembly).** Rejected: the model is too large to download and run comfortably on a phone PWA, and it would be slow on the devices that need it most.
- **Keep the browser only and document the iPhone limitation.** Rejected: voice is the headline feature, and the limitation would leave it broken for iPhone users.

## Consequences

- **Privacy change, stated plainly:** the person's voice now leaves the device and goes through our own server to Groq, a third party. Before this, the browser's recogniser already sent audio to Google or Apple when it ran, and only the text reached our servers and then, for unclear phrases, Gemini. Now our server forwards the audio too, and only on devices where the browser cannot hear, or after such a device has switched. The notice in the workout screen says so when cloud mode is on. The coach notice and the About page were not changed for this and do not mention voice (see the open questions in the report).
- **Groq's terms** (read when [ADR-018](018-coach-second-provider.md) was checked; not re-read for this ADR, so re-read them before the submission): the Services Agreement (section 4.2) does not allow inputs or outputs to be used for training unless the customer allows it, and by default Groq does not keep inference data, apart from temporary logs for up to 30 days for reliability and abuse checks. Speech-to-text is eligible for Zero Data Retention; it was not switched on for this project. Files under 10 s are billed as 10 s. The terms can change, so read them again before relying on them.
- **Quota:** voice counts toward the same daily ceiling and the per-person limits (10 a minute and 60 an hour for `transcribe`, on top of the parse and coach limits). Heavy voice use can use up the day's shared allowance and leave the coach and the parser "busy" for everyone.
- **Not verified:** the real iPhone path, the accuracy of Whisper on gym talk, and the cost in a real session. The deployed function must be checked on a real iPhone before this is called working.
- The model must not echo the prompt: the vocabulary prompt holds gym words only, with no example sentence and no digits.

# Cloud speech-to-text (`/api/transcribe`)

Used only where the browser's own recogniser cannot hear, which is iPhone (Safari and Chrome both run WebKit's, and it ends with no words and no error). The decision and the privacy change are in [ADR-019](../../docs/architecture/decisions/019-cloud-speech-to-text.md). Built, tested with fakes, and checked on an iPhone 15 in Safari and Chrome against the deployed site.

## Where things are

| Part            | Files                                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Function        | `api/transcribe.ts` (wiring), `api/_lib/transcribe.ts` (`handleTranscribe`), `api/_lib/transcribeProvider.ts` (Groq Whisper; `transcribeConfigFrom`, `createTranscribe`)                                                             |
| Shared contract | `src/domain/parser/transcribe.ts` (`TranscribeResponseSchema`, `audioTypeOf`, `extensionOf`, `cleanTranscript`, `MAX_RECORDING_MS` 8000, `MIN_AUDIO_BYTES` 1000, `MAX_AUDIO_BYTES` 1000000, `MAX_TRANSCRIPT_CHARS` 300)              |
| Client call     | `src/data/remote/transcribe.ts` `createFetchTranscribeService` (12 s; returns text, `''` for nothing said, or `null` for any trouble)                                                                                                |
| Client flow     | `src/features/voice/useVoiceInput.ts` (browser first, then cloud), `recorder.ts` (`browserRecorder`: getUserMedia and MediaRecorder), `silence.ts` (`createSilenceDetector`), `transcribeService.tsx` (context)                      |
| Screen          | `src/features/workout/VoiceLogger.tsx` (mic, "Checking…", the cloud notice)                                                                                                                                                          |
| Tests           | `api/_lib/transcribe.test.ts`, `api/_lib/transcribeProvider.test.ts`, `src/data/remote/transcribe.test.ts`, `src/features/voice/{recorder,silence,useVoiceInput}.test.ts(x)`, `src/features/workout/voiceCloud.test.tsx` (whole app) |

## Behaviour

- **Request pattern: raw audio, not JSON or multipart.** The body is the recording bytes, `Content-Type` is `audio/webm`, `audio/mp4`, `audio/ogg` or `audio/wav` (codec parameters allowed), and the bearer token is in `Authorization`. The client sends the blob as the body with its own type. Do not change this to JSON to "match the other functions": the handler reads `request.arrayBuffer()`.
- **Order of checks:** token (401), content type (400), size (413 when the declared length or the body is over 1,000,000 bytes, 400 under 1000 bytes), per-user limits (429), the daily ceiling (429), then the speech service. Failures of the check itself, or missing settings, are 503 `{status:'unavailable'}`.
- **Limits:** scope `transcribe` in `TRANSCRIBE_LIMITS` (10 a minute, 60 an hour), through `consume_rate_limit`. The daily ceiling is `consume_daily_ceiling` with scope `gemini`, so voice counts toward the same 1000 a day and 100 an hour per account as parse and the coach. Numbers: [rate-limits-and-ceiling.md](../database/rate-limits-and-ceiling.md).
- **Provider:** Groq `whisper-large-v3-turbo` (or `TRANSCRIBE_MODEL`) at `${FALLBACK_BASE_URL}/audio/transcriptions`, with `FALLBACK_API_KEY`. It needs only the key and the https address; `FALLBACK_MODEL` is not read here. Sent: language `en`, temperature 0, `verbose_json` and a vocabulary-only prompt of gym words (no sentence, no digits). A reply whose segments all have `no_speech_prob` above 0.6 is treated as silence. Timeout 10 s (`TRANSCRIBE_TIMEOUT_MS`).
- **Answers:** 200 `{status:'ok', text}`, where `text` is cleaned (control characters removed, spaces collapsed, at most 300 characters) and may be `''`. Every answer has `Cache-Control: no-store`.
- **Never logged:** the audio and the words. The log keeps the failing step's kind (`transcribe: speech service failed` and the error name).
- **Client:** the browser's recogniser runs first. It switches to recording when it ends with no words and no error (`silent`), or fails with `service-off`, `unavailable` or `failed`; not for `no-speech` (the person said nothing) or `denied`. The choice is kept in localStorage `next-rep-voice-mode` = `cloud`, so every later phrase on that device is recorded. With no browser recogniser at all and a recorder present, cloud is used from the start. The recorder prefers webm/opus, then mp4 (Safari), then ogg, stops at 8 s or after speech followed by 1.2 s of quiet, and releases the microphone. Without a `TranscribeService` in context nothing changes.
- **Screen:** in cloud mode the workout screen always shows "Your voice is sent to a speech service to turn it into text. Next Rep does not keep it." While transcribing the button reads "Checking…". The words then follow the same parser, optional Gemini fallback, validators and confirm card as browser words; nothing is stored until Log set.

## Dev server

`npm run dev` serves `/api/transcribe` through `vite.devApi.ts` too (dev only), passing the body as raw bytes, and reads `TRANSCRIBE_MODEL` from `.env.local` with the `FALLBACK_*` settings. A restart is needed after changes.

## Tests and checks

Unit tests use fakes for the speech service and the limits. There is no hosted check for transcription yet. The real iPhone run of the deployed function is done: an iPhone 15 in Safari and Chrome (see [deployment guide](../../docs/delivery/deployment.md)).

## Failure kinds

When the cloud recogniser fails, the screen shows one friendly sentence per kind and no technical code. `createFetchTranscribeService` returns `{ok:false, kind}` with kind `limited` for HTTP 429 ("Voice is busy") and `unavailable` for anything else; the recorder gives `denied` (`NotAllowedError`), `mic-busy` (`NotReadableError`: "The microphone is busy"), `unavailable` (`NotFoundError`) or `failed`. The free Vercel plan keeps no useful function logs.

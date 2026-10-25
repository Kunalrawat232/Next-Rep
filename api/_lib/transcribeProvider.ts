// The speech service behind /api/transcribe: Groq's Whisper, through the same key and address as the coach's
// second provider (ADR-018, ADR-019). Nothing in the handler depends on it: the key, address and model are settings.
import { z } from 'zod';
import { extensionOf } from '../../src/domain/parser/transcribe.js';
import type { TranscribeDeps } from './transcribe.js';

export type TranscribeConfig = {
  apiKey: string;
  /** Without the trailing "/audio/transcriptions", for example https://api.groq.com/openai/v1. */
  baseUrl: string;
  model: string;
  /** For tests. */
  fetch?: typeof fetch;
};

export const DEFAULT_TRANSCRIBE_MODEL = 'whisper-large-v3-turbo';

/** Words that help the speech service spell gym talk; no example sentence, so it cannot echo one back. */
const VOCABULARY =
  'Gym workout log. bench press, squat, deadlift, overhead press, barbell row, lat pulldown, dumbbell curl, kilo, kilos, reps, sets, per side, bar, rest.';

/** A segment the service itself thinks is probably silence or noise is dropped. */
const NO_SPEECH_LIMIT = 0.6;

const isSet = (value: string | undefined): value is string =>
  value !== undefined && value !== '' && !/^your-/.test(value);

/**
 * The speech service from the settings, or null when it is not set up (then the endpoint answers "unavailable").
 * The address must be https, so the key is never sent in the clear.
 */
export function transcribeConfigFrom(
  env: Record<string, string | undefined>,
): TranscribeConfig | null {
  const apiKey = env.FALLBACK_API_KEY?.trim();
  const baseUrl = env.FALLBACK_BASE_URL?.trim();
  if (!isSet(apiKey) || !isSet(baseUrl) || !/^https:\/\//.test(baseUrl)) return null;
  const model = env.TRANSCRIBE_MODEL?.trim();
  return { apiKey, baseUrl, model: isSet(model) ? model : DEFAULT_TRANSCRIBE_MODEL };
}

const ReplySchema = z.object({
  text: z.string(),
  segments: z.array(z.object({ no_speech_prob: z.number().optional() })).optional(),
});

/** Sends the audio to the speech service and returns its words ('' for silence). Throws on any failure. */
export function createTranscribe(config: TranscribeConfig): TranscribeDeps['transcribe'] {
  const send = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const url = `${config.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`;
  return async ({ audio, type, signal }) => {
    const form = new FormData();
    form.append('file', audio, `speech.${extensionOf(type)}`);
    form.append('model', config.model);
    form.append('language', 'en');
    form.append('temperature', '0');
    form.append('prompt', VOCABULARY);
    form.append('response_format', 'verbose_json');
    const response = await send(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal,
    });
    if (!response.ok) {
      // Only the status: the service's own message could repeat what was said.
      throw new Error(`speech service answered ${response.status}`);
    }
    const reply = ReplySchema.parse(await response.json());
    const segments = reply.segments ?? [];
    const allSilence =
      segments.length > 0 &&
      segments.every((segment) => (segment.no_speech_prob ?? 0) > NO_SPEECH_LIMIT);
    return allSilence ? '' : reply.text;
  };
}

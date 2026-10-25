// The contract of /api/transcribe, shared by the function and the app: what audio is accepted, what comes back,
// and how the words that come back are cleaned. Pure: no network, no browser. The audio and the words are
// untrusted; the words only ever go to the same parser and confirm card as words from the browser's recogniser.
import { z } from 'zod';

/** A clip longer than this is cut off by the recorder; a few seconds is a spoken set. */
export const MAX_RECORDING_MS = 8000;
/** Eight seconds of speech is far below this at any codec; a bigger body is refused before it is read. */
export const MAX_AUDIO_BYTES = 1_000_000;
/** Shorter than this is a stray tap, not speech. */
export const MIN_AUDIO_BYTES = 1000;
/** The longest transcript the parser takes (the same cap as /api/parse). */
export const MAX_TRANSCRIPT_CHARS = 300;

/** The containers browsers record in (Chrome and Firefox: webm and ogg, Safari on iPhone: mp4), and wav. */
const AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-wav'] as const;
export type AudioType = (typeof AUDIO_TYPES)[number];

/** The container of a Content-Type header such as "audio/webm;codecs=opus", or null when it is not accepted. */
export function audioTypeOf(contentType: string | null): AudioType | null {
  const base = contentType?.split(';')[0]?.trim().toLowerCase();
  return AUDIO_TYPES.find((type) => type === base) ?? null;
}

/** The file extension the speech service needs to recognise the container. */
export function extensionOf(type: AudioType): string {
  switch (type) {
    case 'audio/webm':
      return 'webm';
    case 'audio/mp4':
      return 'mp4';
    case 'audio/ogg':
      return 'ogg';
    default:
      return 'wav';
  }
}

export const TranscribeResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), text: z.string().max(MAX_TRANSCRIPT_CHARS) }),
  z.object({ status: z.literal('unauthorized') }),
  z.object({ status: z.literal('invalid') }),
  z.object({ status: z.literal('unavailable') }),
]);
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

/**
 * Tidies the speech service's words: no control characters, one space between words, no longer than the parser
 * takes. An empty answer means nothing was said.
 */
export function cleanTranscript(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex -- stripping control characters is the point
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TRANSCRIPT_CHARS)
  );
}

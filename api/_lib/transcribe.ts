// POST /api/transcribe: turns a few seconds of recorded speech into words, for browsers whose own speech
// recognition does not work (Safari and Chrome on iPhone). Pure of Vercel and the network: the speech service is
// passed in, so the tests use fakes. The words are untrusted: they only go to the same parser and confirm card as
// words from the browser's recogniser, and nothing is stored until the user taps Log set.
import {
  audioTypeOf,
  cleanTranscript,
  MAX_AUDIO_BYTES,
  MIN_AUDIO_BYTES,
  type AudioType,
  type TranscribeResponse,
} from '../../src/domain/parser/transcribe.js';

export const TRANSCRIBE_LIMITS = { perMinute: 10, perHour: 60 } as const;
export const TRANSCRIBE_TIMEOUT_MS = 10_000;

export type TranscribeDeps = {
  /** True when the token is a valid, signed-in user's access token. */
  verify(token: string): Promise<boolean>;
  /** Counts a request in the window of this many seconds for the token's user; null when it cannot be counted. */
  consume(token: string, windowSeconds: number): Promise<number | null>;
  /** True while the whole project is under its model calls for the day; null when it cannot be counted. */
  ceiling(token: string): Promise<boolean | null>;
  /** The words in the audio ('' when nothing was said). Throws on any failure. */
  transcribe(input: { audio: Blob; type: AudioType; signal: AbortSignal }): Promise<string>;
};

const reply = (status: number, body: TranscribeResponse) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const unavailable = (status: number) => reply(status, { status: 'unavailable' });

export async function handleTranscribe(request: Request, deps: TranscribeDeps): Promise<Response> {
  const token = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return reply(401, { status: 'unauthorized' });
  try {
    if (!(await deps.verify(token))) return reply(401, { status: 'unauthorized' });
  } catch {
    return unavailable(503);
  }

  const type = audioTypeOf(request.headers.get('content-type'));
  if (!type) return reply(400, { status: 'invalid' });
  // A body that says it is too big is refused before it is read.
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_AUDIO_BYTES)
    return reply(413, { status: 'invalid' });
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_AUDIO_BYTES) return reply(413, { status: 'invalid' });
  if (bytes.byteLength < MIN_AUDIO_BYTES) return reply(400, { status: 'invalid' });

  try {
    const perMinute = await deps.consume(token, 60);
    if (perMinute === null) return unavailable(503);
    if (perMinute > TRANSCRIBE_LIMITS.perMinute) return unavailable(429);
    const perHour = await deps.consume(token, 3600);
    if (perHour === null) return unavailable(503);
    if (perHour > TRANSCRIBE_LIMITS.perHour) return unavailable(429);
  } catch {
    return unavailable(503);
  }

  try {
    const room = await deps.ceiling(token);
    if (room === null) return unavailable(503);
    if (!room) return unavailable(429);
  } catch {
    return unavailable(503);
  }

  try {
    const words = await deps.transcribe({
      audio: new Blob([bytes], { type }),
      type,
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    });
    return reply(200, { status: 'ok', text: cleanTranscript(words) });
  } catch (error) {
    // The kind of failure only: never the audio or the words, and never next to a user id.
    console.error(
      'transcribe: speech service failed',
      error instanceof Error ? error.name : 'unknown',
    );
    return unavailable(503);
  }
}

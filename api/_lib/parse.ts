// POST /api/parse: the Gemini fallback. Pure of Vercel and the network: everything it talks to is passed in,
// so the tests use fakes. Rules: docs/architecture/api-contracts.md. Gemini is untrusted; its answer is only
// checked against a schema here and is validated again, and shown to the user, before anything is stored.
import {
  ParseRequestSchema,
  readGeminiText,
  type ParseResponse,
} from '../../src/domain/parser/gemini.js';
import { SYSTEM_PROMPT } from './prompt.js';

export const LIMITS = { perMinute: 10, perHour: 60 } as const;
export const GEMINI_TIMEOUT_MS = 8000;
/** A request body larger than this is refused before it is read as JSON. */
const BODY_MAX_CHARS = 2000;

export type ParseDeps = {
  /** True when the token is a valid, signed-in user's access token. */
  verify(token: string): Promise<boolean>;
  /** Counts a request in the window of this many seconds for the token's user; null when it cannot be counted. */
  consume(token: string, windowSeconds: number): Promise<number | null>;
  /** Asks Gemini and returns its text. Throws on any failure. */
  ask(input: { system: string; user: string; signal: AbortSignal }): Promise<string>;
};

const reply = (status: number, body: ParseResponse | { status: string }) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const unavailable = (status: number) => reply(status, { status: 'unavailable' });

export async function handleParse(request: Request, deps: ParseDeps): Promise<Response> {
  const token = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return reply(401, { status: 'unauthorized' });
  try {
    if (!(await deps.verify(token))) return reply(401, { status: 'unauthorized' });
  } catch {
    return unavailable(503);
  }

  const text = await request.text();
  if (text.length > BODY_MAX_CHARS) return reply(413, { status: 'invalid' });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400, { status: 'invalid' });
  }
  const parsed = ParseRequestSchema.safeParse(body);
  if (!parsed.success) return reply(400, { status: 'invalid' });

  try {
    const perMinute = await deps.consume(token, 60);
    if (perMinute === null) return unavailable(503);
    if (perMinute > LIMITS.perMinute) return unavailable(429);
    const perHour = await deps.consume(token, 3600);
    if (perHour === null) return unavailable(503);
    if (perHour > LIMITS.perHour) return unavailable(429);
  } catch {
    return unavailable(503);
  }

  try {
    const answer = await deps.ask({
      system: SYSTEM_PROMPT,
      // The transcript travels as a JSON string value, so it stays data and cannot continue the prompt.
      user: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    return reply(200, { status: 'ok', result: readGeminiText(answer) });
  } catch (error) {
    // The kind of failure only: never the transcript, and never next to a user id.
    console.error('parse: gemini failed', error instanceof Error ? error.name : 'unknown');
    return unavailable(503);
  }
}

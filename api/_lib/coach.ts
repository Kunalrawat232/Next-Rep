// POST /api/coach: the AI coach. Pure of Vercel and the network: everything it talks to is passed in, so the
// tests use fakes. The coach only answers in text. It never writes data and never decides a number (see ADR-017).
import {
  COACH_REPLY_MAX,
  CoachModelOutputSchema,
  CoachRequestSchema,
  type CoachModelOutput,
  type CoachRequest,
  type CoachResponse,
} from '../../src/domain/coach/schemas.js';
import { COACH_PROMPT, factsFor } from './coachPrompt.js';
import { isObviouslyOffTopic } from './coachScope.js';

export const COACH_LIMITS = { perMinute: 5, perHour: 20 } as const;
export const COACH_TIMEOUT_MS = 20_000;
/** Eight earlier turns of up to 2000 characters, a question and the facts fit in this. */
const BODY_MAX_CHARS = 24_000;

export type CoachTurnForModel = { role: 'user' | 'model'; text: string };

export type CoachDeps = {
  /** True when the token is a valid, signed-in user's access token. */
  verify(token: string): Promise<boolean>;
  /** Counts a request in the window of this many seconds for the token's user; null when it cannot be counted. */
  consume(token: string, windowSeconds: number): Promise<number | null>;
  /** Asks the model and returns its text. Throws on any failure. */
  ask(input: { system: string; turns: CoachTurnForModel[]; signal: AbortSignal }): Promise<string>;
};

const reply = (status: number, body: CoachResponse | { status: string }) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const unavailable = (status: number) => reply(status, { status: 'unavailable' });

/**
 * Says which step failed, in the server log: the step, the kind of error and an HTTP status when it has one. Never
 * the question, the reply, a key or an error message (those can hold what the person typed).
 */
function logFailure(step: string, error?: unknown) {
  const kind = error instanceof Error ? error.name : error === undefined ? '' : 'unknown';
  const status = (error as { status?: unknown } | null)?.status;
  console.error(`coach: ${step}`, kind, typeof status === 'number' ? `HTTP ${status}` : '');
}

/**
 * The chat as the model wants it: starting with the person, and taking turns. Earlier turns that would break
 * that (a reply that was never kept, two questions in a row) are merged or dropped instead of failing.
 */
export function turnsFor(request: Pick<CoachRequest, 'history' | 'question'>): CoachTurnForModel[] {
  const all: CoachTurnForModel[] = [
    ...request.history.map((turn) => ({
      role: turn.role === 'coach' ? ('model' as const) : ('user' as const),
      text: turn.text,
    })),
    { role: 'user', text: request.question },
  ];
  const turns: CoachTurnForModel[] = [];
  for (const turn of all) {
    const last = turns.at(-1);
    if (last?.role === turn.role) last.text = `${last.text}\n${turn.text}`;
    else if (last || turn.role === 'user') turns.push({ ...turn });
  }
  return turns;
}

/** Reads what the model answered: the JSON, with a code fence around it tolerated. Null when it is not usable. */
export function readModelOutput(text: string): CoachModelOutput | null {
  const body = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const parsed = CoachModelOutputSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function handleCoach(request: Request, deps: CoachDeps): Promise<Response> {
  const token = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return reply(401, { status: 'unauthorized' });
  try {
    if (!(await deps.verify(token))) return reply(401, { status: 'unauthorized' });
  } catch (error) {
    logFailure('could not check the sign-in', error);
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
  const parsed = CoachRequestSchema.safeParse(body);
  if (!parsed.success) return reply(400, { status: 'invalid' });

  try {
    const perMinute = await deps.consume(token, 60);
    if (perMinute === null) {
      logFailure('could not count the limit');
      return unavailable(503);
    }
    if (perMinute > COACH_LIMITS.perMinute) return reply(429, { status: 'limited' });
    const perHour = await deps.consume(token, 3600);
    if (perHour === null) {
      logFailure('could not count the limit');
      return unavailable(503);
    }
    if (perHour > COACH_LIMITS.perHour) return reply(429, { status: 'limited' });
  } catch (error) {
    logFailure('could not count the limit', error);
    return unavailable(503);
  }

  // A question that is plainly not about the gym or diet is turned away without asking the model.
  if (isObviouslyOffTopic(parsed.data.question)) return reply(200, { status: 'off_topic' });

  try {
    const answer = await deps.ask({
      system: `${COACH_PROMPT}\n\n${factsFor(parsed.data.context)}`,
      turns: turnsFor(parsed.data),
      signal: AbortSignal.timeout(COACH_TIMEOUT_MS),
    });
    const output = readModelOutput(answer);
    if (output === null) {
      logFailure('the model answered in a form that could not be read');
      return unavailable(503);
    }
    // The refusal is ours: whatever the model wrote next to "off topic" is thrown away.
    if (!output.onTopic) return reply(200, { status: 'off_topic' });
    const textOut = output.reply.trim().slice(0, COACH_REPLY_MAX);
    if (textOut === '') {
      logFailure('the model answered with nothing');
      return unavailable(503);
    }
    return reply(200, { status: 'ok', text: textOut });
  } catch (error) {
    // The kind of failure only: never the question, and never next to a user id.
    logFailure('the model call failed', error);
    return unavailable(503);
  }
}

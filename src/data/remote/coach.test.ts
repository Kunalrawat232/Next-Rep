import { describe, expect, it, vi } from 'vitest';
import type { CoachRequest } from '../../domain/coach';
import { createFetchCoachService } from './coach';

const request: CoachRequest = { question: 'How do I squat deeper?', history: [] };
const session = (token: string | null) => ({
  getSession: vi.fn(async () => ({ data: { session: token ? { access_token: token } : null } })),
});
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const make = (
  send: (...args: never[]) => Promise<Response>,
  token: string | null = 'tok',
  online = true,
  timeoutMs?: number,
) =>
  createFetchCoachService({ auth: session(token) } as never, {
    fetch: send as unknown as typeof fetch,
    online: () => online,
    timeoutMs,
  });

describe('the coach service', () => {
  it("posts the request with the access token and returns the coach's text", async () => {
    const send = vi.fn(async () => answer({ status: 'ok', text: 'Work on ankle mobility.' }));
    const service = make(send as never);
    expect(await service.ask(request)).toEqual({ status: 'ok', text: 'Work on ankle mobility.' });
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/coach');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual(request);
  });

  it('says "limited" for a 429, and the body of a limited answer too', async () => {
    expect(
      await make((async () => answer({ status: 'limited' }, 429)) as never).ask(request),
    ).toEqual({
      status: 'limited',
    });
  });

  it('passes on that a question was off topic', async () => {
    expect(await make((async () => answer({ status: 'off_topic' })) as never).ask(request)).toEqual(
      {
        status: 'off_topic',
      },
    );
  });

  it.each([
    ['a server error', answer({ status: 'unavailable' }, 503)],
    ['an unauthorized answer', answer({ status: 'unauthorized' }, 401)],
    ['a refused request', answer({ status: 'invalid' }, 400)],
    ['an ok status with no text', answer({ status: 'ok' })],
    ['an ok status with empty text', answer({ status: 'ok', text: '' })],
    ['an unknown status', answer({ status: 'weird' })],
    ['not json', new Response('<html>', { status: 200 })],
  ])('says unavailable for %s', async (_name, response) => {
    expect(await make((async () => response) as never).ask(request)).toEqual({
      status: 'unavailable',
    });
  });

  it('says offline when the network fails and the device is offline, unavailable when it is online', async () => {
    const failing = (async () => {
      throw new TypeError('Failed to fetch');
    }) as never;
    expect(await make(failing, 'tok', false).ask(request)).toEqual({ status: 'offline' });
    expect(await make(failing, 'tok', true).ask(request)).toEqual({ status: 'unavailable' });
  });

  it('gives no answer without a session, and never calls the network', async () => {
    const send = vi.fn();
    expect(await make(send as never, null, true).ask(request)).toEqual({ status: 'unavailable' });
    expect(await make(send as never, null, false).ask(request)).toEqual({ status: 'offline' });
    expect(send).not.toHaveBeenCalled();
  });

  it('gives up when the session never comes back', async () => {
    const hang = { getSession: vi.fn(() => new Promise<never>(() => undefined)) };
    const send = vi.fn();
    const service = createFetchCoachService({ auth: hang } as never, {
      fetch: send as unknown as typeof fetch,
      timeoutMs: 20,
      online: () => true,
    });
    expect(await service.ask(request)).toEqual({ status: 'unavailable' });
    expect(send).not.toHaveBeenCalled();
  });

  it('passes a timeout signal to the request', async () => {
    let signal: AbortSignal | null | undefined;
    const service = make((async (_url: string, init: RequestInit) => {
      signal = init.signal;
      return answer({ status: 'unavailable' }, 503);
    }) as never);
    await service.ask(request);
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { ParseRequest } from '../../domain/parser';
import { createFetchParseService } from './parse';

const request: ParseRequest = { transcript: 'bench sixty five', context: { unit: 'kg' } };
const GOOD = {
  intent: 'log_set',
  exerciseName: 'bench press',
  weight: { value: 65, unit: 'kg', mode: 'unspecified' },
  reps: 8,
  restSeconds: null,
  confidence: 0.9,
  issues: [],
};
const session = (token: string | null) => ({
  getSession: vi.fn(async () => ({ data: { session: token ? { access_token: token } : null } })),
});
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('the parse service', () => {
  it('posts the request with the access token and returns Gemini output', async () => {
    const send = vi.fn(async () => answer({ status: 'ok', result: GOOD }));
    const service = createFetchParseService({ auth: session('tok') } as never, {
      fetch: send as unknown as typeof fetch,
    });
    expect(await service.parse(request)).toEqual(GOOD);
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/parse');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual(request);
  });

  it('gives no answer without a session, and never calls the network', async () => {
    const send = vi.fn();
    const service = createFetchParseService({ auth: session(null) } as never, {
      fetch: send as unknown as typeof fetch,
    });
    expect(await service.parse(request)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['unavailable', answer({ status: 'unavailable' }, 503)],
    ['rate limited', answer({ status: 'unavailable' }, 429)],
    ['unauthorized', answer({ status: 'unauthorized' }, 401)],
    ['an ok status with a bad body', answer({ status: 'ok', result: { intent: 'delete_all' } })],
    ['not json', new Response('<html>', { status: 200 })],
    ['an unknown status', answer({ status: 'weird' })],
  ])('gives no answer when the server says %s', async (_name, response) => {
    const service = createFetchParseService({ auth: session('tok') } as never, {
      fetch: (async () => response) as unknown as typeof fetch,
    });
    expect(await service.parse(request)).toBeNull();
  });

  it('gives no answer when the network fails', async () => {
    const service = createFetchParseService({ auth: session('tok') } as never, {
      fetch: (async () => {
        throw new TypeError('Failed to fetch');
      }) as unknown as typeof fetch,
    });
    expect(await service.parse(request)).toBeNull();
  });

  it('gives up when the session never comes back', async () => {
    const hang = { getSession: vi.fn(() => new Promise<never>(() => undefined)) };
    const send = vi.fn();
    const service = createFetchParseService({ auth: hang } as never, {
      fetch: send as unknown as typeof fetch,
      timeoutMs: 20,
    });
    expect(await service.parse(request)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('passes a timeout signal to the request', async () => {
    let signal: AbortSignal | null | undefined;
    const service = createFetchParseService({ auth: session('tok') } as never, {
      fetch: (async (_url: string, init: RequestInit) => {
        signal = init.signal;
        return answer({ status: 'unavailable' }, 503);
      }) as unknown as typeof fetch,
    });
    await service.parse(request);
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

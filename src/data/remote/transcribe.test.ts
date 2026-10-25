import { describe, expect, it, vi } from 'vitest';
import { createFetchTranscribeService } from './transcribe';

const session = (token: string | null) => ({
  getSession: vi.fn(async () => ({ data: { session: token ? { access_token: token } : null } })),
});
const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const clip = new Blob([new Uint8Array(2000)], { type: 'audio/mp4' });

describe('the transcribe service', () => {
  it('posts the recording as it is, with its type and the access token, and returns the words', async () => {
    const send = vi.fn(async () => answer({ status: 'ok', text: 'bench press 60 kilo 8 reps' }));
    const service = createFetchTranscribeService({ auth: session('tok') } as never, {
      fetch: send as unknown as typeof fetch,
    });
    expect(await service.transcribe(clip)).toBe('bench press 60 kilo 8 reps');
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/transcribe');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(clip);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['Content-Type']).toBe('audio/mp4');
  });

  it('returns an empty text when nothing was said', async () => {
    const service = createFetchTranscribeService({ auth: session('tok') } as never, {
      fetch: (async () => answer({ status: 'ok', text: '' })) as unknown as typeof fetch,
    });
    expect(await service.transcribe(clip)).toBe('');
  });

  it('gives no words without a session, and never calls the network', async () => {
    const send = vi.fn();
    const service = createFetchTranscribeService({ auth: session(null) } as never, {
      fetch: send as unknown as typeof fetch,
    });
    expect(await service.transcribe(clip)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('gives no words for a failed call, a bad answer, a network error or a slow reply', async () => {
    const make = (fetcher: unknown, timeoutMs?: number) =>
      createFetchTranscribeService({ auth: session('tok') } as never, {
        fetch: fetcher as typeof fetch,
        timeoutMs,
      });
    expect(
      await make(async () => answer({ status: 'unavailable' }, 503)).transcribe(clip),
    ).toBeNull();
    expect(await make(async () => answer({ status: 'ok' })).transcribe(clip)).toBeNull();
    expect(
      await make(async () => answer({ status: 'ok', text: 'x'.repeat(400) })).transcribe(clip),
    ).toBeNull();
    expect(
      await make(async () => {
        throw new TypeError('offline');
      }).transcribe(clip),
    ).toBeNull();
    const slow = make(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      20,
    );
    expect(await slow.transcribe(clip)).toBeNull();
  });

  it('gives no words when the session never comes back (offline)', async () => {
    const hanging = { getSession: () => new Promise<never>(() => undefined) };
    const send = vi.fn();
    const service = createFetchTranscribeService({ auth: hanging } as never, {
      fetch: send as unknown as typeof fetch,
      timeoutMs: 20,
    });
    expect(await service.transcribe(clip)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});

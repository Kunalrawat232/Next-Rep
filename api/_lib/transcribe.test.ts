import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscribeResponseSchema } from '../../src/domain/parser/transcribe';
import { handleTranscribe, TRANSCRIBE_LIMITS, type TranscribeDeps } from './transcribe.js';

function deps(over: Partial<TranscribeDeps> = {}) {
  const calls = {
    transcribe: [] as { size: number; type: string }[],
    consume: [] as number[],
  };
  const made: TranscribeDeps = {
    verify: async () => true,
    ceiling: async () => true,
    consume: async (_token, window) => {
      calls.consume.push(window);
      return 1;
    },
    transcribe: async ({ audio, type }) => {
      calls.transcribe.push({ size: audio.size, type });
      return '  bench press 60 kilo\n8 reps ';
    },
    ...over,
  };
  return { deps: made, calls };
}

const audio = (bytes = 5000) => new Uint8Array(new ArrayBuffer(bytes)).fill(7);
const request = (
  body: string | Uint8Array<ArrayBuffer> = audio(),
  headers: Record<string, string> = {
    authorization: 'Bearer tok',
    'content-type': 'audio/webm;codecs=opus',
  },
) => new Request('https://example.test/api/transcribe', { method: 'POST', headers, body });

afterEach(() => vi.restoreAllMocks());

describe('POST /api/transcribe', () => {
  it('answers with the cleaned words, counts the limits and never caches', async () => {
    const { deps: d, calls } = deps();
    const response = await handleTranscribe(request(), d);
    expect(response.status).toBe(200);
    expect(TranscribeResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
      text: 'bench press 60 kilo 8 reps',
    });
    expect(calls.consume).toEqual([60, 3600]);
    expect(calls.transcribe).toEqual([{ size: 5000, type: 'audio/webm' }]);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('takes the containers browsers record in, including the iPhone one', async () => {
    for (const type of ['audio/mp4', 'audio/ogg;codecs=opus', 'audio/wav']) {
      const { deps: d } = deps();
      const response = await handleTranscribe(
        request(audio(), { authorization: 'Bearer tok', 'content-type': type }),
        d,
      );
      expect(response.status, type).toBe(200);
    }
  });

  it('answers an empty text when nothing was said', async () => {
    const { deps: d } = deps({ transcribe: async () => '   ' });
    const response = await handleTranscribe(request(), d);
    expect(await response.json()).toEqual({ status: 'ok', text: '' });
  });

  it('refuses a missing or invalid token without touching the speech service', async () => {
    const { deps: d, calls } = deps({ verify: async () => false });
    const none = await handleTranscribe(request(audio(), { 'content-type': 'audio/webm' }), d);
    expect(none.status).toBe(401);
    const bad = await handleTranscribe(request(), d);
    expect(bad.status).toBe(401);
    expect(calls.transcribe).toHaveLength(0);
    expect(calls.consume).toHaveLength(0);
  });

  it('is unavailable when the token cannot be checked', async () => {
    const { deps: d } = deps({
      verify: async () => {
        throw new Error('down');
      },
    });
    expect((await handleTranscribe(request(), d)).status).toBe(503);
  });

  it('refuses a type that is not audio, a clip that is too big and one that is too small', async () => {
    const { deps: d, calls } = deps();
    const text = await handleTranscribe(
      request('hi', { authorization: 'Bearer tok', 'content-type': 'application/json' }),
      d,
    );
    expect(text.status).toBe(400);
    const missing = await handleTranscribe(request(audio(), { authorization: 'Bearer tok' }), d);
    expect(missing.status).toBe(400);
    expect((await handleTranscribe(request(audio(2_000_000)), d)).status).toBe(413);
    expect((await handleTranscribe(request(audio(10)), d)).status).toBe(400);
    expect(calls.transcribe).toHaveLength(0);
    expect(calls.consume).toHaveLength(0);
  });

  it('refuses before reading when the declared size is too big', async () => {
    const { deps: d } = deps();
    const response = await handleTranscribe(
      request(audio(), {
        authorization: 'Bearer tok',
        'content-type': 'audio/webm',
        'content-length': '5000000',
      }),
      d,
    );
    expect(response.status).toBe(413);
  });

  it('limits a user per minute and per hour', async () => {
    const minute = deps({
      consume: async (_t, w) => (w === 60 ? TRANSCRIBE_LIMITS.perMinute + 1 : 1),
    });
    expect((await handleTranscribe(request(), minute.deps)).status).toBe(429);
    const hour = deps({
      consume: async (_t, w) => (w === 3600 ? TRANSCRIBE_LIMITS.perHour + 1 : 1),
    });
    expect((await handleTranscribe(request(), hour.deps)).status).toBe(429);
    expect(minute.calls.transcribe).toHaveLength(0);
    expect(hour.calls.transcribe).toHaveLength(0);
  });

  it('is unavailable when a limit cannot be counted', async () => {
    const { deps: d } = deps({ consume: async () => null });
    expect((await handleTranscribe(request(), d)).status).toBe(503);
    const thrown = deps({
      consume: async () => {
        throw new Error('down');
      },
    });
    expect((await handleTranscribe(request(), thrown.deps)).status).toBe(503);
  });

  it('stops at the daily ceiling, and when the ceiling cannot be counted', async () => {
    const over = deps({ ceiling: async () => false });
    expect((await handleTranscribe(request(), over.deps)).status).toBe(429);
    const unknown = deps({ ceiling: async () => null });
    expect((await handleTranscribe(request(), unknown.deps)).status).toBe(503);
    const thrown = deps({
      ceiling: async () => {
        throw new Error('down');
      },
    });
    expect((await handleTranscribe(request(), thrown.deps)).status).toBe(503);
    expect(over.calls.transcribe).toHaveLength(0);
  });

  it('answers unavailable, and logs only the kind of failure, when the speech service fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deps: d } = deps({
      transcribe: async () => {
        throw new TypeError('secret words in a message');
      },
    });
    const response = await handleTranscribe(request(), d);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
    expect(log).toHaveBeenCalledWith('transcribe: speech service failed', 'TypeError');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
  });

  it('keeps the words to the length the parser takes', async () => {
    const { deps: d } = deps({ transcribe: async () => 'bench '.repeat(200) });
    const body = TranscribeResponseSchema.parse(
      await (await handleTranscribe(request(), d)).json(),
    );
    expect(body.status === 'ok' && body.text.length).toBeLessThanOrEqual(300);
  });
});

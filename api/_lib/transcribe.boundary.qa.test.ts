import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanTranscript,
  MAX_AUDIO_BYTES,
  MIN_AUDIO_BYTES,
} from '../../src/domain/parser/transcribe';
import { handleTranscribe, TRANSCRIBE_LIMITS, type TranscribeDeps } from './transcribe.js';

// QA pass: exact limits, header oddities and what reaches the log. Complements transcribe.test.ts.
function deps(over: Partial<TranscribeDeps> = {}) {
  const calls = { transcribe: 0, verify: 0 };
  const made: TranscribeDeps = {
    verify: async () => {
      calls.verify += 1;
      return true;
    },
    ceiling: async () => true,
    consume: async () => 1,
    transcribe: async () => {
      calls.transcribe += 1;
      return 'bench press 60 kilo 8 reps';
    },
    ...over,
  };
  return { deps: made, calls };
}
const request = (
  bytes = 5000,
  headers: Record<string, string> = { authorization: 'Bearer tok', 'content-type': 'audio/webm' },
) =>
  new Request('https://example.test/api/transcribe', {
    method: 'POST',
    headers,
    body: new Uint8Array(new ArrayBuffer(bytes)).fill(7),
  });

afterEach(() => vi.restoreAllMocks());

describe('size limits are exact', () => {
  it.each<[number, number]>([
    [MIN_AUDIO_BYTES - 1, 400],
    [MIN_AUDIO_BYTES, 200],
    [MAX_AUDIO_BYTES, 200],
    [MAX_AUDIO_BYTES + 1, 413],
    [0, 400],
  ])('a clip of %d bytes answers %d', async (bytes, status) => {
    const { deps: d } = deps();
    expect((await handleTranscribe(request(bytes), d)).status).toBe(status);
  });

  it('does not trust a declared size that lies low: the real size still decides', async () => {
    const { deps: d, calls } = deps();
    const response = await handleTranscribe(
      request(MAX_AUDIO_BYTES + 1, {
        authorization: 'Bearer tok',
        'content-type': 'audio/webm',
        'content-length': '2000',
      }),
      d,
    );
    expect(response.status).toBe(413);
    expect(calls.transcribe).toBe(0);
  });
});

describe('the token header', () => {
  it.each(['bearer tok', 'Bearer', 'Bearer ', 'Bearer a b', 'Basic tok', 'tok', ''])(
    '%j is refused without checking the token or reading the audio',
    async (authorization) => {
      const { deps: d, calls } = deps();
      const response = await handleTranscribe(
        request(5000, { authorization, 'content-type': 'audio/webm' }),
        d,
      );
      expect(response.status).toBe(401);
      expect(calls.verify).toBe(0);
      expect(calls.transcribe).toBe(0);
    },
  );

  it('answers 401 before it looks at the audio, so an anonymous caller learns nothing about limits', async () => {
    const { deps: d } = deps();
    const response = await handleTranscribe(
      request(10, { authorization: 'Bearer tok', 'content-type': 'text/plain' }),
      { ...d, verify: async () => false },
    );
    expect(response.status).toBe(401);
  });
});

describe('the limits are inclusive', () => {
  it('allows the last request of the minute and the hour, and refuses the next', async () => {
    const at = (minute: number, hour: number) =>
      deps({ consume: async (_t, w) => (w === 60 ? minute : hour) });
    const last = at(TRANSCRIBE_LIMITS.perMinute, TRANSCRIBE_LIMITS.perHour);
    expect((await handleTranscribe(request(), last.deps)).status).toBe(200);
    const over = at(TRANSCRIBE_LIMITS.perMinute + 1, 1);
    expect((await handleTranscribe(request(), over.deps)).status).toBe(429);
  });

  it('does not count the hour, or ask the ceiling, once the minute is used up', async () => {
    const windows: number[] = [];
    const ceiling = vi.fn(async () => true);
    const { deps: d } = deps({
      consume: async (_t, w) => {
        windows.push(w);
        return TRANSCRIBE_LIMITS.perMinute + 1;
      },
      ceiling,
    });
    expect((await handleTranscribe(request(), d)).status).toBe(429);
    expect(windows).toEqual([60]);
    expect(ceiling).not.toHaveBeenCalled();
  });
});

describe('what the service returns', () => {
  it.each(['', '   ', '\n\t', '\u0000\u0007'])(
    'answers ok with empty text for %j',
    async (said) => {
      const { deps: d } = deps({ transcribe: async () => said });
      const response = await handleTranscribe(request(), d);
      expect(await response.json()).toEqual({ status: 'ok', text: '' });
    },
  );

  it('answers unavailable when the service returns something that is not text', async () => {
    // A provider bug must not become a 500 with a stack trace.
    const { deps: d } = deps({ transcribe: async () => undefined as unknown as string });
    const response = await handleTranscribe(request(), d);
    expect(response.status).toBe(503);
  });

  it('logs nothing at all when it works, and never the audio type or size on failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await handleTranscribe(request(), deps().deps);
    expect(log).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    const failing = deps({
      transcribe: async () => {
        throw Object.assign(new Error('bench press 60 kilo 8 reps'), { name: 'ProviderError' });
      },
    });
    await handleTranscribe(request(), failing.deps);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/bench|kilo|tok|5000/);
  });

  it('answers unavailable, not a crash, when the failure is not an Error at all', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deps: d } = deps({
      transcribe: async () => {
        throw 'plain string with a secret';
      },
    });
    const response = await handleTranscribe(request(), d);
    expect(response.status).toBe(503);
    expect(console.error).toHaveBeenCalledWith('transcribe: speech service failed', 'unknown');
  });
});

describe('cleanTranscript', () => {
  it.each<[string, string]>([
    ['bench\tpress\n60', 'bench press 60'],
    ['  a   b  ', 'a b'],
    ['\u0000a\u007fb', 'a b'],
    ['', ''],
    ['x'.repeat(301), 'x'.repeat(300)],
  ])('%j becomes %j', (input, expected) => {
    expect(cleanTranscript(input)).toBe(expected);
  });
});

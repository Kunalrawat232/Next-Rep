import { describe, expect, it, vi } from 'vitest';
import { createFallbackAsk, fallbackConfigFrom } from './fallbackProvider.js';

const GOOD = {
  FALLBACK_API_KEY: 'key-123',
  FALLBACK_BASE_URL: 'https://api.example.test/openai/v1',
  FALLBACK_MODEL: 'some-model',
};

describe('fallbackConfigFrom', () => {
  it('reads the three settings, trimmed', () => {
    expect(
      fallbackConfigFrom({
        FALLBACK_API_KEY: ' key-123 ',
        FALLBACK_BASE_URL: ' https://api.example.test/v1 ',
        FALLBACK_MODEL: ' some-model ',
      }),
    ).toEqual({ apiKey: 'key-123', baseUrl: 'https://api.example.test/v1', model: 'some-model' });
  });

  it.each(['FALLBACK_API_KEY', 'FALLBACK_BASE_URL', 'FALLBACK_MODEL'] as const)(
    'is off when %s is missing, empty or still the example text',
    (name) => {
      expect(fallbackConfigFrom({ ...GOOD, [name]: undefined })).toBeNull();
      expect(fallbackConfigFrom({ ...GOOD, [name]: '' })).toBeNull();
      expect(fallbackConfigFrom({ ...GOOD, [name]: '   ' })).toBeNull();
      expect(fallbackConfigFrom({ ...GOOD, [name]: 'your-value-here' })).toBeNull();
    },
  );

  it('is off when nothing is set', () => {
    expect(fallbackConfigFrom({})).toBeNull();
  });

  it('refuses an address that is not https, so the key is never sent in the clear', () => {
    expect(
      fallbackConfigFrom({ ...GOOD, FALLBACK_BASE_URL: 'http://api.example.test/v1' }),
    ).toBeNull();
    expect(fallbackConfigFrom({ ...GOOD, FALLBACK_BASE_URL: 'api.example.test/v1' })).toBeNull();
  });
});

const reply = (content: string) => ({ choices: [{ message: { content } }] });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const input = {
  system: 'RULES',
  turns: [
    { role: 'user' as const, text: 'hi' },
    { role: 'model' as const, text: 'hello' },
    { role: 'user' as const, text: 'how many sets?' },
  ],
  signal: new AbortController().signal,
};

describe('createFallbackAsk', () => {
  it('sends the chat in the OpenAI form with the key, and returns the text', async () => {
    const send = vi.fn(async () => json(reply('{"onTopic":true,"reply":"3 sets"}')));
    const ask = createFallbackAsk({
      apiKey: 'key-123',
      baseUrl: 'https://api.example.test/v1/',
      model: 'some-model',
      fetch: send as never,
    });
    expect(await ask(input)).toBe('{"onTopic":true,"reply":"3 sets"}');
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key-123');
    expect(init.signal).toBe(input.signal);
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'some-model',
      messages: [
        { role: 'system', content: 'RULES' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'user', content: 'how many sets?' },
      ],
      temperature: 0.6,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });
  });

  it('throws with only the status when the provider refuses, never its message', async () => {
    const ask = createFallbackAsk({
      apiKey: 'k',
      baseUrl: 'https://a.test/v1',
      model: 'm',
      fetch: (async () => json({ error: { message: 'echo: how many sets?' } }, 429)) as never,
    });
    const error = await ask(input).catch((e: unknown) => e as Error & { status?: number });
    expect(error).toBeInstanceOf(Error);
    expect((error as { status?: number }).status).toBe(429);
    expect((error as Error).message).not.toContain('sets');
  });

  it.each([
    ['no choices', { choices: [] }],
    ['no content', { choices: [{ message: {} }] }],
    ['a content that is not text', { choices: [{ message: { content: 5 } }] }],
    ['another shape altogether', { text: 'hello' }],
  ])('throws on %s', async (_name, body) => {
    const ask = createFallbackAsk({
      apiKey: 'k',
      baseUrl: 'https://a.test/v1',
      model: 'm',
      fetch: (async () => json(body)) as never,
    });
    await expect(ask(input)).rejects.toThrow();
  });

  it('throws when the answer is not JSON at all', async () => {
    const ask = createFallbackAsk({
      apiKey: 'k',
      baseUrl: 'https://a.test/v1',
      model: 'm',
      fetch: (async () => new Response('<html>', { status: 200 })) as never,
    });
    await expect(ask(input)).rejects.toThrow();
  });
});

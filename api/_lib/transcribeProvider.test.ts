import { describe, expect, it } from 'vitest';
import {
  createTranscribe,
  DEFAULT_TRANSCRIBE_MODEL,
  transcribeConfigFrom,
} from './transcribeProvider.js';

describe('transcribeConfigFrom', () => {
  const env = {
    FALLBACK_API_KEY: 'k-123',
    FALLBACK_BASE_URL: 'https://api.example.test/openai/v1/',
  };

  it('uses the second provider key and address, with the default model', () => {
    expect(transcribeConfigFrom(env)).toEqual({
      apiKey: 'k-123',
      baseUrl: 'https://api.example.test/openai/v1/',
      model: DEFAULT_TRANSCRIBE_MODEL,
    });
  });

  it('takes a model from TRANSCRIBE_MODEL', () => {
    expect(transcribeConfigFrom({ ...env, TRANSCRIBE_MODEL: 'whisper-large-v3' })?.model).toBe(
      'whisper-large-v3',
    );
  });

  it('is null when the key or address is missing, still the example text, or not https', () => {
    expect(transcribeConfigFrom({})).toBeNull();
    expect(transcribeConfigFrom({ ...env, FALLBACK_API_KEY: '' })).toBeNull();
    expect(transcribeConfigFrom({ ...env, FALLBACK_API_KEY: 'your-key-here' })).toBeNull();
    expect(
      transcribeConfigFrom({ ...env, FALLBACK_BASE_URL: 'http://api.example.test' }),
    ).toBeNull();
  });
});

function fake(answer: unknown, status = 200) {
  const seen: { url: string; headers: Record<string, string>; form: FormData }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    seen.push({
      url,
      headers: init.headers as Record<string, string>,
      form: init.body as FormData,
    });
    return new Response(JSON.stringify(answer), { status });
  }) as unknown as typeof fetch;
  return { seen, fetcher };
}

const audio = new Blob([new Uint8Array(3000)], { type: 'audio/mp4' });
const make = (fetcher: typeof fetch) =>
  createTranscribe({
    apiKey: 'k-123',
    baseUrl: 'https://api.example.test/v1/',
    model: 'm',
    fetch: fetcher,
  });

describe('createTranscribe', () => {
  it('posts the audio as a file with the model, language and a vocabulary hint, and returns the text', async () => {
    const { seen, fetcher } = fake({ text: 'bench press 60 kilo 8 reps' });
    const text = await make(fetcher)({
      audio,
      type: 'audio/mp4',
      signal: AbortSignal.timeout(1000),
    });
    expect(text).toBe('bench press 60 kilo 8 reps');
    const call = seen[0];
    expect(call?.url).toBe('https://api.example.test/v1/audio/transcriptions');
    expect(call?.headers.Authorization).toBe('Bearer k-123');
    expect(call?.form.get('model')).toBe('m');
    expect(call?.form.get('language')).toBe('en');
    expect((call?.form.get('file') as File).name).toBe('speech.mp4');
    const prompt = String(call?.form.get('prompt'));
    expect(prompt).toContain('bench press');
    expect(prompt).not.toMatch(/\d/);
  });

  it('returns nothing when every segment is probably silence', async () => {
    const { fetcher } = fake({
      text: 'Thank you.',
      segments: [{ no_speech_prob: 0.9 }, { no_speech_prob: 0.8 }],
    });
    const text = await make(fetcher)({
      audio,
      type: 'audio/mp4',
      signal: AbortSignal.timeout(1000),
    });
    expect(text).toBe('');
  });

  it('keeps the text when at least one segment is speech', async () => {
    const { fetcher } = fake({
      text: 'squat 100 for 5',
      segments: [{ no_speech_prob: 0.9 }, { no_speech_prob: 0.05 }],
    });
    const text = await make(fetcher)({
      audio,
      type: 'audio/mp4',
      signal: AbortSignal.timeout(1000),
    });
    expect(text).toBe('squat 100 for 5');
  });

  it('throws on a failed call with only the status, and on an answer of the wrong shape', async () => {
    const failed = fake({ error: { message: 'bench press 60 said by the user' } }, 429);
    await expect(
      make(failed.fetcher)({ audio, type: 'audio/mp4', signal: AbortSignal.timeout(1000) }),
    ).rejects.toThrow('speech service answered 429');
    const odd = fake({ nope: true });
    await expect(
      make(odd.fetcher)({ audio, type: 'audio/mp4', signal: AbortSignal.timeout(1000) }),
    ).rejects.toThrow();
  });
});

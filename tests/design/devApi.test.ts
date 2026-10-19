// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { Plugin, ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { devApi } from '../../vite.devApi';

const KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'COACH_MODEL',
  'FALLBACK_API_KEY',
  'FALLBACK_BASE_URL',
  'FALLBACK_MODEL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'OTHER_SECRET',
];
let saved: Record<string, string | undefined> = {};
let dir = '';

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  dir = mkdtempSync(join(tmpdir(), 'devapi-'));
});
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => Promise<void> | void;

function setup(
  envFile = '',
  load: (url: string) => unknown = () => ({ POST: async () => new Response('{}') }),
) {
  writeFileSync(join(dir, '.env.local'), envFile);
  let handler: Handler | undefined;
  const server = {
    config: { mode: 'development', envDir: dir },
    middlewares: { use: (fn: Handler) => (handler = fn) },
    ssrLoadModule: vi.fn(async (url: string) => load(url)),
  } as unknown as ViteDevServer;
  const configure = (devApi() as unknown as { configureServer: (server: ViteDevServer) => void })
    .configureServer;
  configure(server);
  return { handler: handler!, server };
}

function request(method: string, url: string, body = '', headers: Record<string, string> = {}) {
  const req = Object.assign(Readable.from(body ? [Buffer.from(body)] : []), {
    method,
    url,
    headers: {
      'content-type': 'application/json',
      'content-length': String(body.length),
      ...headers,
    },
  }) as unknown as IncomingMessage;
  const captured = { status: 0, headers: new Map<string, string>(), body: '' };
  const res = {
    set statusCode(value: number) {
      captured.status = value;
    },
    get statusCode() {
      return captured.status;
    },
    setHeader: (key: string, value: string) => captured.headers.set(key.toLowerCase(), value),
    end: (chunk?: string) => void (captured.body = chunk ?? ''),
  } as unknown as ServerResponse;
  return { req, res, captured };
}

describe('the dev server api', () => {
  it('is only for the dev server: not a build, and not the tests', () => {
    const plugin = devApi() as Plugin & {
      apply: (config: unknown, env: { command: string }) => boolean;
    };
    expect(plugin.apply({}, { command: 'serve' })).toBe(false); // this run is a test
    expect(plugin.apply({}, { command: 'build' })).toBe(false);
    vi.stubEnv('VITEST', '');
    expect(plugin.apply({}, { command: 'serve' })).toBe(true);
    expect(plugin.apply({}, { command: 'build' })).toBe(false);
    vi.unstubAllEnvs();
  });

  it('passes on everything that is not /api/parse or /api/coach', async () => {
    const { handler, server } = setup();
    for (const url of ['/', '/api', '/api/other', '/api/coach/extra', '/coach', '/src/main.tsx']) {
      const next = vi.fn();
      const { req, res } = request('POST', url);
      await handler(req, res, next);
      expect(next, url).toHaveBeenCalledTimes(1);
    }
    expect(server.ssrLoadModule).not.toHaveBeenCalled();
  });

  it('answers a method other than POST with 405, without running anything', async () => {
    const { handler, server } = setup();
    const { req, res, captured } = request('GET', '/api/coach');
    await handler(req, res, vi.fn());
    expect(captured.status).toBe(405);
    expect(server.ssrLoadModule).not.toHaveBeenCalled();
  });

  it('runs the function for the path with the same body and headers, and relays its answer', async () => {
    const seen: {
      url: string;
      method: string;
      auth: string | null;
      body: string;
      length: string | null;
    }[] = [];
    const { handler, server } = setup('', () => ({
      POST: async (request: Request) => {
        seen.push({
          url: request.url,
          method: request.method,
          auth: request.headers.get('authorization'),
          body: await request.text(),
          length: request.headers.get('content-length'),
        });
        return Response.json(
          { status: 'ok', text: 'hi' },
          { status: 201, headers: { 'Cache-Control': 'no-store' } },
        );
      },
    }));
    const { req, res, captured } = request('POST', '/api/coach', '{"question":"squat?"}', {
      authorization: 'Bearer tok',
    });
    await handler(req, res, vi.fn());
    expect(server.ssrLoadModule).toHaveBeenCalledWith('/api/coach.ts');
    expect(seen).toEqual([
      {
        url: 'http://localhost/api/coach',
        method: 'POST',
        auth: 'Bearer tok',
        body: '{"question":"squat?"}',
        length: null,
      },
    ]);
    expect(captured.status).toBe(201);
    expect(captured.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(captured.body)).toEqual({ status: 'ok', text: 'hi' });
  });

  it('also serves /api/parse, with a query string', async () => {
    const { handler, server } = setup();
    const { req, res } = request('POST', '/api/parse?x=1', '{}');
    await handler(req, res, vi.fn());
    expect(server.ssrLoadModule).toHaveBeenCalledWith('/api/parse.ts');
  });

  it('says unavailable, and prints only the kind of failure, when the function breaks', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handler } = setup('', () => ({
      POST: async () => {
        throw new TypeError('secret question text sk-live-123');
      },
    }));
    const { req, res, captured } = request('POST', '/api/coach', '{}');
    await handler(req, res, vi.fn());
    expect(captured.status).toBe(500);
    expect(JSON.parse(captured.body)).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(log.mock.calls)).not.toContain('sk-live');
  });

  it('refuses a body that is too large', async () => {
    const { handler, server } = setup();
    const { req, res, captured } = request('POST', '/api/coach', 'x'.repeat(1_000_001));
    await handler(req, res, vi.fn());
    expect(captured.status).toBe(413);
    expect(server.ssrLoadModule).not.toHaveBeenCalled();
  });

  it('gives the functions the server-only settings from .env.local, and nothing else', () => {
    setup(
      'GEMINI_API_KEY=key-a\nGEMINI_MODEL=model-a\nCOACH_MODEL=model-b\nSUPABASE_URL=https://a.example\nSUPABASE_ANON_KEY=anon-a\nOTHER_SECRET=nope\n',
    );
    expect(process.env.GEMINI_API_KEY).toBe('key-a');
    expect(process.env.GEMINI_MODEL).toBe('model-a');
    expect(process.env.COACH_MODEL).toBe('model-b');
    expect(process.env.SUPABASE_URL).toBe('https://a.example');
    expect(process.env.SUPABASE_ANON_KEY).toBe('anon-a');
    expect(process.env.OTHER_SECRET).toBeUndefined();
  });

  it("uses the browser's public settings when the server-only ones are missing", () => {
    setup('VITE_SUPABASE_URL=https://public.example\nVITE_SUPABASE_ANON_KEY=public-anon\n');
    expect(process.env.SUPABASE_URL).toBe('https://public.example');
    expect(process.env.SUPABASE_ANON_KEY).toBe('public-anon');
  });

  it('never overwrites a setting that is already set in the shell', () => {
    process.env.GEMINI_API_KEY = 'from-shell';
    setup('GEMINI_API_KEY=from-file\n');
    expect(process.env.GEMINI_API_KEY).toBe('from-shell');
  });

  describe('the warning at start-up', () => {
    const warned = (spy: ReturnType<typeof vi.spyOn>) =>
      spy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');

    it('names what is missing, and nothing about any value', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      setup('GEMINI_API_KEY=real-secret-key\n');
      const text = warned(warn);
      expect(text).toContain('GEMINI_MODEL');
      expect(text).toContain('SUPABASE_URL');
      expect(text).not.toContain('GEMINI_API_KEY');
      expect(text).not.toContain('real-secret-key');
    });

    it('catches settings that are still the example text', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      setup(
        'GEMINI_API_KEY=your-gemini-api-key\nGEMINI_MODEL=your-free-tier-model-name\nSUPABASE_URL=https://a.example\nSUPABASE_ANON_KEY=anon\n',
      );
      const text = warned(warn);
      expect(text).toContain('GEMINI_API_KEY');
      expect(text).toContain('GEMINI_MODEL');
    });

    it('is quiet when everything is set', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      setup(
        'GEMINI_API_KEY=k\nGEMINI_MODEL=gemini-3.5-flash-lite\nSUPABASE_URL=https://a.example\nSUPABASE_ANON_KEY=anon\n',
      );
      expect(warn).not.toHaveBeenCalled();
    });

    it('accepts COACH_MODEL in place of GEMINI_MODEL', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      setup(
        'GEMINI_API_KEY=k\nCOACH_MODEL=gemini-3.5-flash\nSUPABASE_URL=https://a.example\nSUPABASE_ANON_KEY=anon\n',
      );
      expect(warn).not.toHaveBeenCalled();
    });
  });
});

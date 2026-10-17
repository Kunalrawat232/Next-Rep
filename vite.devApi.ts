import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';

/**
 * The functions in /api only run on Vercel, so `npm run dev` would answer them with the app's own page.
 * This serves them from the dev server too, so the coach and the voice fallback can be tried locally. It is
 * for `npm run dev` only (never a build, never the tests), and the handlers are the same code Vercel runs.
 */
const FUNCTIONS = new Set(['parse', 'coach']);
/** The server-only settings the functions read. Nothing else from the env files is copied. */
const SERVER_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'COACH_MODEL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
];
const BODY_LIMIT = 1_000_000;

async function readBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > BODY_LIMIT) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function devApi(): Plugin {
  return {
    name: 'next-rep-dev-api',
    // Not for builds, and not for the tests, which use fakes.
    apply: (_config, { command }) => command === 'serve' && !process.env.VITEST,
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.envDir || process.cwd(), '');
      for (const key of SERVER_KEYS) {
        const value = env[key];
        if (value && !process.env[key]) process.env[key] = value;
      }
      // The browser's own (public) settings stand in when the server-only ones are not set.
      process.env.SUPABASE_URL ||= env.VITE_SUPABASE_URL;
      process.env.SUPABASE_ANON_KEY ||= env.VITE_SUPABASE_ANON_KEY;

      server.middlewares.use(async (req, res, next) => {
        const name = /^\/api\/([a-z]+)(?:\?.*)?$/.exec(req.url ?? '')?.[1];
        if (!name || !FUNCTIONS.has(name)) return next();
        if (req.method !== 'POST') return send(res, 405, { status: 'invalid' });
        try {
          const body = await readBody(req);
          if (body === null) return send(res, 413, { status: 'invalid' });
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value === undefined || key === 'content-length' || key === 'transfer-encoding')
              continue;
            headers.set(key, Array.isArray(value) ? value.join(', ') : value);
          }
          const module = (await server.ssrLoadModule(`/api/${name}.ts`)) as {
            POST: (request: Request) => Promise<Response>;
          };
          const response = await module.POST(
            new Request(`http://localhost${req.url}`, { method: 'POST', headers, body }),
          );
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) {
          // The kind of failure only: a question or a key must never reach the terminal.
          console.error(`dev api ${name}: failed`, error instanceof Error ? error.name : 'unknown');
          send(res, 500, { status: 'unavailable' });
        }
      });
    },
  };
}

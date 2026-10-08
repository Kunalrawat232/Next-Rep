import { z } from 'zod';

export type SupabaseEnv = { url: string; anonKey: string };
export type EnvResult = { ok: true; env: SupabaseEnv } | { ok: false; message: string };

/** The role claim of a JWT, or null when the value is not a decodable JWT. */
function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3 || parts[1] === undefined) return null;
  try {
    const decoded: unknown = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded === 'object' &&
      decoded !== null &&
      'role' in decoded &&
      typeof decoded.role === 'string'
      ? decoded.role
      : null;
  } catch {
    return null;
  }
}

/**
 * Why a value must not be used as the browser key, or null if it may. An allowlist, not a blocklist:
 * only a publishable key or a legacy anon JWT is accepted, so padding, quotes or an unknown format
 * can never smuggle a secret key into the browser bundle.
 */
export function anonKeyProblem(raw: string): string | null {
  const key = raw.trim();
  if (key.length < 20) return 'is missing or too short to be a Supabase key';
  if (key.startsWith('sb_secret_'))
    return 'is a secret key. Use the publishable key, never a secret key in the browser';
  const role = jwtRole(key);
  if (role === 'service_role')
    return 'is a service_role key. Use the anon or publishable key, never service_role in the browser';
  if (key.startsWith('sb_publishable_') || role === 'anon') return null;
  return 'must be a publishable key (sb_publishable_...) or a legacy anon key';
}

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z
    .string({ error: 'is missing' })
    .trim()
    .min(1, 'is missing')
    .pipe(z.url({ error: 'must be a URL' }))
    .refine((url) => url.startsWith('https://'), 'must use https'),
  VITE_SUPABASE_ANON_KEY: z
    .string({ error: 'is missing' })
    .superRefine((key, ctx) => {
      const problem = anonKeyProblem(key);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    })
    .transform((key) => key.trim()),
});

/** Reads the two public Supabase settings. Messages name the variables, never their values. */
export function parseSupabaseEnv(raw: Record<string, unknown>): EnvResult {
  const parsed = EnvSchema.safeParse(raw);
  if (parsed.success) {
    return {
      ok: true,
      env: { url: parsed.data.VITE_SUPABASE_URL, anonKey: parsed.data.VITE_SUPABASE_ANON_KEY },
    };
  }
  const firstPerVariable = new Map<string, string>();
  for (const issue of parsed.error.issues) {
    const name = issue.path.join('.');
    if (!firstPerVariable.has(name)) firstPerVariable.set(name, issue.message);
  }
  const message = [...firstPerVariable].map(([name, text]) => `${name} ${text}`).join('; ');
  return { ok: false, message };
}

const SECRET_LOOKING_NAME = /SECRET|SERVICE|PRIVATE|PASSWORD|TOKEN|GEMINI/i;

/**
 * Checked while building: Vite copies every VITE_* value into the public bundle, so a secret put in
 * one would be published even though the running app would refuse to start. Absent Supabase values
 * are fine here (CI builds without them); the app then shows its setup screen.
 */
export function unsafePublicEnvProblems(env: Record<string, unknown>): string[] {
  const problems = Object.keys(env)
    .filter((name) => name.startsWith('VITE_') && SECRET_LOOKING_NAME.test(name))
    .map(
      (name) =>
        `${name} looks like a secret and would be published to every visitor. Remove the VITE_ prefix.`,
    );
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (typeof key === 'string' && key.trim() !== '') {
    const problem = anonKeyProblem(key);
    if (problem) problems.push(`VITE_SUPABASE_ANON_KEY ${problem}`);
  }
  return problems;
}

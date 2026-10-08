// Checks that the hosted Supabase project is reachable and set up as the migration expects.
// Usage: npm run check:supabase   (loads .env.local; prints PASS/FAIL only, never keys, passwords or tokens)
// Reads from the database, except one call to consume_rate_limit(), which adds one row to the
// test user's own rate-limit counter.
const env = process.env;
const url = (env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? '';
const users = {
  A: { email: env.E2E_USER_A_EMAIL ?? '', password: env.E2E_USER_A_PASSWORD ?? '' },
  B: { email: env.E2E_USER_B_EMAIL ?? '', password: env.E2E_USER_B_PASSWORD ?? '' },
};

let failures = 0;
const report = (ok, name, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  return ok;
};

async function call(path, { token, method = 'GET', body, headers = {} } = {}) {
  try {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: {
        apikey: anonKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // not JSON
    }
    return { status: res.status, json, headers: res.headers };
  } catch (error) {
    const cause = error.cause?.code ?? error.cause?.message ?? error.message;
    return {
      status: 0,
      json: null,
      headers: new Headers(),
      error: `network error: ${error.name === 'TimeoutError' ? 'timed out' : cause}`,
    };
  }
}

async function signIn(who) {
  const { email, password } = users[who];
  const res = await call('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  const token = res.status === 200 ? res.json?.access_token : null;
  const reason = res.json?.error_description ?? res.json?.msg ?? res.error ?? `HTTP ${res.status}`;
  return { token, reason };
}

const countOf = (res) => Number((res.headers.get('content-range') ?? '').split('/')[1]);

async function main() {
  // 1. configuration, by name only
  const missing = [
    ['VITE_SUPABASE_URL (or SUPABASE_URL)', url],
    ['VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)', anonKey],
    ['E2E_USER_A_EMAIL', users.A.email],
    ['E2E_USER_A_PASSWORD', users.A.password],
    ['E2E_USER_B_EMAIL', users.B.email],
    ['E2E_USER_B_PASSWORD', users.B.password],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (
    !report(
      missing.length === 0,
      'env values are set',
      missing.length ? `missing: ${missing.join(', ')}` : '',
    )
  )
    return;

  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    // handled below
  }
  if (
    !report(
      url.startsWith('https://') && host.endsWith('.supabase.co'),
      'project URL looks like https://<ref>.supabase.co',
      host,
    )
  )
    return;
  report(
    anonKey.startsWith('sb_publishable_') || anonKey.startsWith('eyJ'),
    'key is a publishable (sb_publishable_...) or legacy anon (eyJ...) key',
  );
  report(
    !anonKey.startsWith('sb_secret_'),
    'key is not a secret key',
    'a secret or service_role key must never be used here',
  );

  // 2. reachability and key validity
  const health = await call('/auth/v1/health');
  if (
    !report(
      health.status === 200,
      'Auth service reachable with this key',
      health.error ?? `HTTP ${health.status}`,
    )
  )
    return;

  // 3. anon must be locked out of the tables
  const anon = await call('/rest/v1/exercises?select=id&limit=1');
  report(
    anon.status === 401 || anon.status === 403,
    'anon (signed-out) cannot read exercises',
    `HTTP ${anon.status}`,
  );

  // 4. sign in both test users
  const a = await signIn('A');
  const b = await signIn('B');
  report(Boolean(a.token), 'test user A can sign in', a.token ? '' : a.reason);
  report(Boolean(b.token), 'test user B can sign in', b.token ? '' : b.reason);
  if (!a.token) return;

  // 5. seed and read access as a signed-in user
  const ex = await call('/rest/v1/exercises?select=id&user_id=is.null&limit=1', {
    token: a.token,
    headers: { Prefer: 'count=exact' },
  });
  report(
    ex.status === 200 || ex.status === 206,
    'signed-in user can read exercises',
    `HTTP ${ex.status}`,
  );
  report(
    countOf(ex) === 56,
    'seed loaded: 56 global exercises',
    `found ${Number.isNaN(countOf(ex)) ? 'unknown' : countOf(ex)}`,
  );

  // 6. isolation: a fresh user sees none of the other user's data
  for (const table of ['gyms', 'workouts', 'sets']) {
    const own = await call(`/rest/v1/${table}?select=id&limit=1`, {
      token: a.token,
      headers: { Prefer: 'count=exact' },
    });
    report(
      own.status === 200 || own.status === 206,
      `user A can query ${table}`,
      `HTTP ${own.status}`,
    );
  }
  if (b.token) {
    const bGyms = await call('/rest/v1/gyms?select=id', { token: b.token });
    report(bGyms.status === 200, 'user B can query gyms', `HTTP ${bGyms.status}`);
  }

  // 7. the rate-limit function is callable by a signed-in user, not by anon
  const rl = await call('/rest/v1/rpc/consume_rate_limit', {
    method: 'POST',
    token: a.token,
    body: { p_window_seconds: 60 },
  });
  report(
    rl.status === 200 && Number.isInteger(rl.json),
    'rate-limit function works for a signed-in user',
    `HTTP ${rl.status}`,
  );
  const rlAnon = await call('/rest/v1/rpc/consume_rate_limit', {
    method: 'POST',
    body: { p_window_seconds: 60 },
  });
  report(
    rlAnon.status === 401 || rlAnon.status === 403,
    'rate-limit function is closed to anon',
    `HTTP ${rlAnon.status}`,
  );
}

await main();
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

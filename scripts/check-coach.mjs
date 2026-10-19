// Checks that the AI coach can work with the settings in .env.local: the Gemini key and model, and the sign-in
// and rate-limit steps it needs. Usage: npm run check:coach   (loads .env.local; prints PASS/FAIL only, never a
// key, password, token, question or reply). It makes one tiny Gemini call (free tier) and one call to
// consume_rate_limit() as the test user, which adds one row to that user's own counter.
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

const env = process.env;
const placeholder = (value) => !value || /^your-/.test(value);
const model = env.COACH_MODEL || env.GEMINI_MODEL || '';
const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

let failures = 0;
const report = (ok, name, detail = '') => {
  if (!ok) failures += 1;
  // The hint explains a failure, so a passing line has none.
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  (${detail})` : ''}`);
  return ok;
};

// 1. the settings are there and are not the example text (names only, never values)
report(
  !placeholder(env.GEMINI_API_KEY),
  'GEMINI_API_KEY is set',
  'still empty or the example text',
);
report(
  !placeholder(model),
  'a model name is set (COACH_MODEL or GEMINI_MODEL)',
  'still empty or the example text, try gemini-3.5-flash-lite',
);
report(Boolean(url), 'the Supabase URL is set');
report(Boolean(anonKey), 'the Supabase anon key is set');

// 2. the model answers in the form the coach needs
if (!placeholder(env.GEMINI_API_KEY) && !placeholder(model)) {
  try {
    const response = await new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }).models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: 'How many sets of squats per week?' }] }],
      config: {
        systemInstruction:
          'You are a gym coach. Answer with JSON only: {"onTopic": true, "reply": "..."} for a gym or diet question, or {"onTopic": false, "reply": ""} otherwise.',
        temperature: 0.6,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json',
        // The same schema api/coach.ts sends (CoachModelOutputSchema), made the same way.
        responseJsonSchema: z.toJSONSchema(
          z.object({ onTopic: z.boolean(), reply: z.string().max(4000) }),
        ),
        abortSignal: AbortSignal.timeout(20000),
      },
    });
    let parsed = null;
    try {
      parsed = JSON.parse(response.text ?? '');
    } catch {
      // not JSON
    }
    report(
      parsed !== null && typeof parsed.onTopic === 'boolean' && typeof parsed.reply === 'string',
      `the model "${model}" answers in the agreed form`,
      'it answered, but not as {onTopic, reply}',
    );
  } catch (error) {
    const status =
      typeof error?.status === 'number' ? `HTTP ${error.status}` : (error?.name ?? 'error');
    const hint =
      error?.status === 404
        ? 'that model name does not exist for this key'
        : error?.status === 400
          ? 'the key is not valid, or the request was refused'
          : error?.status === 403
            ? 'the key may not be allowed to use this model'
            : error?.status === 429
              ? 'the free limit was reached, wait and retry'
              : 'see the status';
    report(false, `the model "${model}" answers`, `${status}: ${hint}`);
  }
} else {
  report(false, 'the model answers', 'skipped: fix the settings above first');
}

// 2b. the second provider, when it is set up (all three settings, or none)
const [fbKey, fbUrl, fbModel] = [env.FALLBACK_API_KEY, env.FALLBACK_BASE_URL, env.FALLBACK_MODEL];
if (placeholder(fbKey) && placeholder(fbUrl) && placeholder(fbModel)) {
  console.log('SKIP  the second provider is not set (optional)');
} else if (
  placeholder(fbKey) ||
  placeholder(fbUrl) ||
  placeholder(fbModel) ||
  !/^https:\/\//.test(fbUrl)
) {
  report(
    false,
    'the second provider settings',
    'FALLBACK_API_KEY, FALLBACK_BASE_URL (https) and FALLBACK_MODEL must all be set',
  );
} else {
  try {
    const response = await fetch(`${fbUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fbKey}` },
      body: JSON.stringify({
        model: fbModel,
        messages: [
          {
            role: 'system',
            content:
              'You are a gym coach. Answer with JSON only: {"onTopic": true, "reply": "..."} for a gym or diet question, or {"onTopic": false, "reply": ""} otherwise.',
          },
          { role: 'user', content: 'How many sets of squats per week?' },
        ],
        temperature: 0.6,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(20000),
    });
    let parsed = null;
    if (response.ok) {
      try {
        parsed = JSON.parse((await response.json()).choices?.[0]?.message?.content ?? '');
      } catch {
        // not JSON
      }
    }
    report(
      parsed !== null && typeof parsed.onTopic === 'boolean' && typeof parsed.reply === 'string',
      `the second provider's model "${fbModel}" answers in the agreed form`,
      response.ok ? 'it answered, but not as {onTopic, reply}' : `HTTP ${response.status}`,
    );
  } catch (error) {
    report(false, `the second provider's model "${fbModel}" answers`, error?.name ?? 'error');
  }
}

// 3. sign in as the test user and count one request, as the function does
const email = env.E2E_USER_A_EMAIL ?? '';
const password = env.E2E_USER_A_PASSWORD ?? '';
if (!url || !anonKey || !email || !password) {
  report(
    false,
    'sign-in and the rate limit',
    'skipped: needs the Supabase settings and E2E_USER_A_* in .env.local',
  );
} else {
  try {
    const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15000),
    });
    const token = login.ok ? (await login.json()).access_token : null;
    if (!report(Boolean(token), 'the test user can sign in', `HTTP ${login.status}`))
      throw new Error('stop');
    const count = await fetch(`${url}/rest/v1/rpc/consume_rate_limit`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_scope: 'coach', p_window_seconds: 60 }),
      signal: AbortSignal.timeout(15000),
    });
    const value = count.ok ? await count.json() : null;
    report(typeof value === 'number', 'the rate limit can be counted', `HTTP ${count.status}`);
  } catch (error) {
    if (error.message !== 'stop')
      report(false, 'sign-in and the rate limit', error?.name ?? 'error');
  }
}

console.log(
  failures === 0
    ? '\nThe coach should work.'
    : `\n${failures} problem(s). Fix the FAIL lines and run it again.`,
);
process.exit(failures === 0 ? 0 : 1);

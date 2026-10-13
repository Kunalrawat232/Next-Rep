// Gemini fallback endpoint (see docs/architecture/api-contracts.md). Wires the real Supabase and Gemini
// clients into the handler in ./_lib/parse.ts, where the rules and the tests are.
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { GeminiOutputSchema } from '../src/domain/parser/gemini';
import { handleParse, type ParseDeps } from './_lib/parse';

function supabaseFor(token: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('supabase not configured');
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const deps: ParseDeps = {
  async verify(token) {
    const { data, error } = await supabaseFor(token).auth.getClaims(token);
    return !error && data?.claims.role === 'authenticated' && Boolean(data.claims.sub);
  },
  async consume(token, windowSeconds) {
    const { data, error } = await supabaseFor(token).rpc('consume_rate_limit', {
      p_window_seconds: windowSeconds,
    });
    return error || typeof data !== 'number' ? null : data;
  },
  async ask({ system, user, signal }) {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL;
    if (!apiKey || !model) throw new Error('gemini not configured');
    const response = await new GoogleGenAI({ apiKey }).models.generateContent({
      model,
      contents: user,
      config: {
        systemInstruction: system,
        temperature: 0,
        maxOutputTokens: 300,
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(GeminiOutputSchema),
        abortSignal: signal,
      },
    });
    return response.text ?? '';
  },
};

export function POST(request: Request): Promise<Response> {
  return handleParse(request, deps);
}

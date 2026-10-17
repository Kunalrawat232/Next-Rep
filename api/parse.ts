// Gemini fallback endpoint (see docs/architecture/api-contracts.md). Wires the real Supabase and Gemini
// clients into the handler in ./_lib/parse.ts, where the rules and the tests are.
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { GeminiOutputSchema } from '../src/domain/parser/gemini.js';
import { handleParse, type ParseDeps } from './_lib/parse.js';
import { consumeLimit, verifyToken } from './_lib/supabase.js';

const deps: ParseDeps = {
  verify: verifyToken,
  consume: consumeLimit,
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

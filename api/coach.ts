// The AI coach endpoint (see docs/architecture/api-contracts.md). Wires the real Supabase and Gemini clients
// into the handler in ./_lib/coach.ts, where the rules and the tests are.
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { CoachModelOutputSchema } from '../src/domain/coach/schemas.js';
import { handleCoach, type CoachDeps } from './_lib/coach.js';
import { consumeLimit, consumeModelCall, verifyToken } from './_lib/supabase.js';

const deps: CoachDeps = {
  verify: verifyToken,
  consume: (token, windowSeconds) => consumeLimit(token, 'coach', windowSeconds),
  ceiling: consumeModelCall,
  async ask({ system, turns, signal }) {
    const apiKey = process.env.GEMINI_API_KEY;
    // The coach may use a stronger free model than the voice fallback; it falls back to the same one.
    const model = process.env.COACH_MODEL || process.env.GEMINI_MODEL;
    if (!apiKey || !model) throw new Error('gemini not configured');
    const response = await new GoogleGenAI({ apiKey }).models.generateContent({
      model,
      contents: turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
      config: {
        systemInstruction: system,
        temperature: 0.6,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(CoachModelOutputSchema),
        abortSignal: signal,
      },
    });
    return response.text ?? '';
  },
};

export function POST(request: Request): Promise<Response> {
  return handleCoach(request, deps);
}

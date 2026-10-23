// The second provider of the coach: any service with an OpenAI-style chat endpoint (Groq is the one chosen, see
// ADR-018). It is only asked when the first one fails or the project's day of calls is used up, and what it says
// goes through the same checks. Nothing here depends on the provider: the key, address and model are settings.
import { z } from 'zod';
import type { CoachTurnForModel } from './coach.js';

export type FallbackConfig = {
  apiKey: string;
  /** Without the trailing "/chat/completions", for example https://api.groq.com/openai/v1. */
  baseUrl: string;
  model: string;
  /** For tests. */
  fetch?: typeof fetch;
};

const isSet = (value: string | undefined): value is string =>
  typeof value === 'string' && value.trim() !== '' && !/^your-/.test(value.trim());

/**
 * The second provider from the settings, or null when it is not fully set up (then the coach uses only the
 * first provider). The address must be https, so the key is never sent in the clear.
 */
export function fallbackConfigFrom(env: Record<string, string | undefined>): FallbackConfig | null {
  const apiKey = env.FALLBACK_API_KEY;
  const baseUrl = env.FALLBACK_BASE_URL;
  const model = env.FALLBACK_MODEL;
  if (!isSet(apiKey) || !isSet(baseUrl) || !isSet(model)) return null;
  if (!/^https:\/\//.test(baseUrl.trim())) return null;
  return { apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim() };
}

const ReplySchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

/** Asks the second provider, with the same input as the first, and returns its text. Throws on any failure. */
export function createFallbackAsk(config: FallbackConfig) {
  const send = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  return async (input: {
    system: string;
    turns: CoachTurnForModel[];
    signal: AbortSignal;
  }): Promise<string> => {
    const response = await send(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: input.system },
          ...input.turns.map((turn) => ({
            role: turn.role === 'model' ? 'assistant' : 'user',
            content: turn.text,
          })),
        ],
        temperature: 0.6,
        // Room for a model that thinks first: its thinking counts toward this limit, and a cut-off answer is useless.
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      }),
      signal: input.signal,
    });
    // Only the status travels in the error: the log never gets the provider's message, which can echo the chat.
    if (!response.ok)
      throw Object.assign(new Error('second provider refused'), { status: response.status });
    return ReplySchema.parse(await response.json()).choices[0]!.message.content;
  };
}

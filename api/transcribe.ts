// Speech-to-text endpoint for browsers whose own recogniser does not work (see docs/architecture/api-contracts.md).
// Wires the real Supabase and speech-service clients into the handler in ./_lib/transcribe.ts, where the rules and
// the tests are.
import { handleTranscribe, type TranscribeDeps } from './_lib/transcribe.js';
import { consumeLimit, consumeModelCall, verifyToken } from './_lib/supabase.js';
import { createTranscribe, transcribeConfigFrom } from './_lib/transcribeProvider.js';

const deps: TranscribeDeps = {
  verify: verifyToken,
  consume: (token, windowSeconds) => consumeLimit(token, 'transcribe', windowSeconds),
  // One daily ceiling for every model call the project makes, voice included (the free tiers are small).
  ceiling: consumeModelCall,
  async transcribe(input) {
    const config = transcribeConfigFrom(process.env);
    if (!config) throw new Error('speech service not configured');
    return createTranscribe(config)(input);
  },
};

export function POST(request: Request): Promise<Response> {
  return handleTranscribe(request, deps);
}

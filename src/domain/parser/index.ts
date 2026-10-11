// Voice phrase parser. Pure: no React, network or storage. The transcript is untrusted input: it is only ever
// matched against the grammar in docs/domain/voice-grammar.md, and every number it yields is validated later.
import { ParseResultSchema, type ParseResult } from './schema';
import { parseCore, type ParseContext } from './parse';
import { PARSER_CONFIG } from './config';
import { ISSUE, NEVER_SENT } from './issues';

export { INTENTS, WEIGHT_MODES, ParseResultSchema, type ParseResult } from './schema';
export { PARSER_CONFIG } from './config';
export type { ParseContext } from './parse';

/** Turns what the person said into a ParseResult. Never throws; anything it cannot read is `unknown`. */
export function parseTranscript(transcript: string, context: ParseContext): ParseResult {
  const fallback: ParseResult = {
    intent: 'unknown',
    confidence: 0,
    issues: [ISSUE.PARSE_FAILED],
    rawTranscript: transcript,
    source: 'parser',
  };
  try {
    const parsed = parseCore(transcript, context);
    const result = ParseResultSchema.safeParse({
      ...parsed,
      rawTranscript: transcript,
      source: 'parser',
    });
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}

/** True when the local parser is not sure enough and the Gemini fallback should be asked (online only). */
export const needsFallback = (result: ParseResult): boolean =>
  result.confidence < PARSER_CONFIG.confidenceThreshold &&
  !NEVER_SENT.some((issue) => result.issues.includes(issue));
export { ISSUE } from './issues';

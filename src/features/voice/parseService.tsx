import { createContext, useContext, type ReactNode } from 'react';
import type { GeminiOutput, ParseRequest } from '../../domain/parser';

/** The Gemini fallback, as the screens see it. Implemented over `/api/parse` in src/data/remote/parse.ts. */
export interface ParseService {
  /** Gemini's reading of a phrase, or null when none is available (offline, slow, limited, not signed in). Never throws. */
  parse(request: ParseRequest): Promise<GeminiOutput | null>;
}

/** Used where no service is provided: there is simply no fallback. */
const NO_FALLBACK: ParseService = { parse: async () => null };

const ParseServiceContext = createContext<ParseService>(NO_FALLBACK);

export function ParseServiceProvider({
  service,
  children,
}: {
  service: ParseService;
  children: ReactNode;
}) {
  return <ParseServiceContext.Provider value={service}>{children}</ParseServiceContext.Provider>;
}

export function useParseService(): ParseService {
  return useContext(ParseServiceContext);
}

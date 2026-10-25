import { createContext, useContext, type ReactNode } from 'react';

/** Speech-to-text in the cloud, as the screens see it. Implemented over `/api/transcribe` in src/data/remote/transcribe.ts. */
export interface TranscribeService {
  /**
   * The words in a short recording ('' when nothing was said), or what kind of failure it was. Never throws.
   */
  transcribe(audio: Blob): Promise<TranscribeResult>;
}

export type TranscribeResult =
  { ok: true; text: string } | { ok: false; kind: 'unavailable' | 'limited' };

/** Used where no service is provided: then the browser's own recogniser is the only way to speak. */
const ServiceContext = createContext<TranscribeService | null>(null);

export function TranscribeServiceProvider({
  service,
  children,
}: {
  service: TranscribeService;
  children: ReactNode;
}) {
  return <ServiceContext.Provider value={service}>{children}</ServiceContext.Provider>;
}

export function useTranscribeService(): TranscribeService | null {
  return useContext(ServiceContext);
}

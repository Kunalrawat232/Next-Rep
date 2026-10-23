import { createContext, useContext, type ReactNode } from 'react';
import type { CoachRequest } from '../../domain/coach';

/** What the coach said, or why it could not. The screen turns each reason into a friendly message. */
export type CoachAnswer =
  | { status: 'ok'; text: string }
  /** The question is not about gym training or diet: the screen shows `COACH_REFUSAL`. */
  | { status: 'off_topic' }
  /** This user asked a lot in a short time. */
  | { status: 'limited' }
  /** No connection, or the server could not be reached. */
  | { status: 'offline' }
  /** The session has ended: signing in again is the fix, and trying again will not help. */
  | { status: 'signed_out' }
  /** The coach could not answer right now (a slow or failing model). */
  | { status: 'unavailable' };

/** The AI coach, as the screens see it. Implemented over `/api/coach` in src/data/remote/coach.ts. */
export interface CoachService {
  /** Never throws. */
  ask(request: CoachRequest): Promise<CoachAnswer>;
}

/** Used where no service is provided: there is no coach. */
const NO_COACH: CoachService = { ask: async () => ({ status: 'unavailable' }) };

const CoachServiceContext = createContext<CoachService>(NO_COACH);

export function CoachServiceProvider({
  service,
  children,
}: {
  service: CoachService;
  children: ReactNode;
}) {
  return <CoachServiceContext.Provider value={service}>{children}</CoachServiceContext.Provider>;
}

export function useCoachService(): CoachService {
  return useContext(CoachServiceContext);
}

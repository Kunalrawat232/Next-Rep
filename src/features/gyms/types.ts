import type { Gym, GymInput } from '../../domain/gyms';

/** `conflict` is a name or bar kind that is already used in the gym. */
export type GymFailure = 'offline' | 'conflict' | 'unknown';

export type GymResult<T = void> =
  { status: 'ok'; value: T } | { status: 'error'; reason: GymFailure };

/** What the gym screens need from the backend. Implemented for Supabase in src/data/remote/gyms.ts. */
export interface GymService {
  list(): Promise<GymResult<Gym[]>>;
  /** Creates the gym and its bars. Safe to retry with the same `gymId` and bar ids: a retry finishes the job. */
  create(userId: string, gymId: string, input: GymInput, makeDefault: boolean): Promise<GymResult>;
  update(userId: string, gymId: string, input: GymInput): Promise<GymResult>;
  remove(gymId: string): Promise<GymResult>;
  /** Clears the old default, then sets the new one, so a failure in between leaves no default, not two. */
  setDefault(gymId: string): Promise<GymResult>;
}

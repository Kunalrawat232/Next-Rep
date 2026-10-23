import type { Gym, GymInput } from '../../domain/gyms';
import type { Failure, Result } from '../../lib/result';

/** `conflict` is a bar name or kind that is already used, or a gym that was set up on another device meanwhile. */
export type GymFailure = Failure;
export type GymResult<T = void> = Result<T>;

/** What the gym screens need from the backend. Implemented for Supabase in src/data/remote/gyms.ts. */
export interface GymService {
  /** The user's gym, or null when they have not set one up yet. */
  get(): Promise<GymResult<Gym | null>>;
  /**
   * Creates the gym and its bars, or updates them if the gym exists. Safe to retry with the same `gymId` and
   * bar ids: a retry finishes the job instead of making a second gym (there can only be one).
   */
  save(userId: string, gymId: string, input: GymInput): Promise<GymResult>;
}

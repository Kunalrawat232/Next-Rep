import type { Unit } from '../../domain/schemas';
import type { Result } from '../../lib/result';

/** What the settings screens need from the backend. Implemented for Supabase in src/data/remote/profiles.ts. */
export interface ProfileService {
  /** The saved weight unit, or null when the profile has none yet (a new account). */
  getUnit(userId: string): Promise<Result<Unit | null>>;
  /** Saves the unit. Creates the profile row if it is not there yet. */
  setUnit(userId: string, unit: Unit): Promise<Result>;
}

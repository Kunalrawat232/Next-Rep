import type { CustomExerciseInput, Exercise } from '../../domain/exercises';
import type { Result } from '../../lib/result';

/** What the exercise screens need from the backend. Implemented for Supabase in src/data/remote/exercises.ts. */
export interface ExerciseService {
  /** The user's own exercises. The built-in ones ship with the app. */
  listCustom(): Promise<Result<Exercise[]>>;
  /** Safe to retry with the same `exerciseId`: a retry does not make a second exercise. */
  create(userId: string, exerciseId: string, input: CustomExerciseInput): Promise<Result>;
}

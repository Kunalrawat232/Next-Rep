import { useSearchParams } from 'react-router';
import { z } from 'zod';

const IdSchema = z.uuid();

/** The exercise named in the address, or null when there is none or it is not a valid id. */
export function useExerciseParam(): string | null {
  const [params] = useSearchParams();
  const parsed = IdSchema.safeParse(params.get('exercise'));
  return parsed.success ? parsed.data : null;
}

export const exerciseQuery = (id: string | null): string =>
  id ? `?exercise=${encodeURIComponent(id)}` : '';

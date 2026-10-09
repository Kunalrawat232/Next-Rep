import { createContext, useContext, type ReactNode } from 'react';
import type { ExerciseService } from './types';

const ExerciseServiceContext = createContext<ExerciseService | null>(null);

export function ExerciseServiceProvider({
  service,
  children,
}: {
  service: ExerciseService;
  children: ReactNode;
}) {
  return (
    <ExerciseServiceContext.Provider value={service}>{children}</ExerciseServiceContext.Provider>
  );
}

export function useExerciseService(): ExerciseService {
  const service = useContext(ExerciseServiceContext);
  if (!service) throw new Error('useExerciseService must be used inside <ExerciseServiceProvider>');
  return service;
}

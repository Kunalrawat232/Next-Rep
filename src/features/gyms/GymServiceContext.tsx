import { createContext, useContext, type ReactNode } from 'react';
import type { GymService } from './types';

const GymServiceContext = createContext<GymService | null>(null);

export function GymServiceProvider({
  service,
  children,
}: {
  service: GymService;
  children: ReactNode;
}) {
  return <GymServiceContext.Provider value={service}>{children}</GymServiceContext.Provider>;
}

export function useGymService(): GymService {
  const service = useContext(GymServiceContext);
  if (!service) throw new Error('useGymService must be used inside <GymServiceProvider>');
  return service;
}

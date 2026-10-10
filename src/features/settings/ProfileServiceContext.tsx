import { createContext, useContext, type ReactNode } from 'react';
import type { ProfileService } from './types';

const ProfileServiceContext = createContext<ProfileService | null>(null);

export function ProfileServiceProvider({
  service,
  children,
}: {
  service: ProfileService;
  children: ReactNode;
}) {
  return (
    <ProfileServiceContext.Provider value={service}>{children}</ProfileServiceContext.Provider>
  );
}

export function useProfileService(): ProfileService {
  const service = useContext(ProfileServiceContext);
  if (!service) throw new Error('useProfileService must be used inside <ProfileServiceProvider>');
  return service;
}

import { useState, type ReactNode } from 'react';
import type { Unit } from '../domain/schemas';
import { useAuth } from '../features/auth';
import { ProfileServiceProvider } from '../features/settings/ProfileServiceContext';
import { UnitProvider } from '../features/settings/UnitProvider';
import { createFakeProfileService } from './fakeProfile';

/**
 * The weight unit for a test that builds its own provider tree. Goes inside an `AuthProvider`.
 * The unit is read from the device first, so call `setDeviceUnit` before rendering for lb.
 */
export function UnitsForTest({
  children,
  saved = null,
  gate = true,
}: {
  children: ReactNode;
  saved?: Unit | null;
  /** Show nothing until the user is known (the default). Turn off to test what a signed-out visitor sees. */
  gate?: boolean;
}) {
  const [service] = useState(() => createFakeProfileService(saved).service);
  return (
    <ProfileServiceProvider service={service}>
      <UnitProvider>{gate ? <AfterSignIn>{children}</AfterSignIn> : children}</UnitProvider>
    </ProfileServiceProvider>
  );
}

/** The unit provider starts again when the user becomes known, which remounts what is under it; wait for that. */
function AfterSignIn({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  return state.status === 'signedIn' ? <>{children}</> : null;
}

/** Puts the unit on the device for a user, as choosing it in Settings does. */
export function setDeviceUnit(userId: string, unit: Unit): void {
  localStorage.setItem(`next-rep-unit-${userId}`, unit);
}

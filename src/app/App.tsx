import type { ComponentProps, ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import { AuthProvider, type AuthService } from '../features/auth';
import { ExerciseServiceProvider, type ExerciseService } from '../features/exercises';
import { GymServiceProvider, type GymService } from '../features/gyms';
import type { RemoteLog } from '../data/sync';
import { ProfileServiceProvider, UnitProvider, type ProfileService } from '../features/settings';
import { SyncProvider } from '../features/sync';
import { CoachServiceProvider, type CoachService } from '../features/coach';
import { ParseServiceProvider, type ParseService } from '../features/voice';

type Props = {
  service: AuthService;
  gymService: GymService;
  exerciseService: ExerciseService;
  profileService: ProfileService;
  logRemote: RemoteLog;
  /** The Gemini fallback; without it, phrases the parser is unsure of are not sent anywhere. */
  parseService?: ParseService;
  /** The AI coach; without it the Coach screen says it is unavailable. */
  coachService?: CoachService;
  router: ComponentProps<typeof RouterProvider>['router'];
  ensureProfile?: (userId: string) => Promise<void>;
};

export function App({
  service,
  gymService,
  exerciseService,
  profileService,
  logRemote,
  parseService,
  coachService,
  router,
  ensureProfile,
}: Props) {
  return (
    <AuthProvider service={service} ensureProfile={ensureProfile}>
      <ProfileServiceProvider service={profileService}>
        <UnitProvider>
          <GymServiceProvider service={gymService}>
            <ExerciseServiceProvider service={exerciseService}>
              <SyncProvider remote={logRemote}>
                <Fallback service={parseService}>
                  <CoachFallback service={coachService}>
                    <RouterProvider router={router} />
                  </CoachFallback>
                </Fallback>
              </SyncProvider>
            </ExerciseServiceProvider>
          </GymServiceProvider>
        </UnitProvider>
      </ProfileServiceProvider>
    </AuthProvider>
  );
}

function Fallback({ service, children }: { service?: ParseService; children: ReactNode }) {
  return service ? (
    <ParseServiceProvider service={service}>{children}</ParseServiceProvider>
  ) : (
    children
  );
}

function CoachFallback({ service, children }: { service?: CoachService; children: ReactNode }) {
  return service ? (
    <CoachServiceProvider service={service}>{children}</CoachServiceProvider>
  ) : (
    children
  );
}

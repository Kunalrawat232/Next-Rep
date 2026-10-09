import type { ComponentProps } from 'react';
import { RouterProvider } from 'react-router';
import { AuthProvider, type AuthService } from '../features/auth';
import { ExerciseServiceProvider, type ExerciseService } from '../features/exercises';
import { GymServiceProvider, type GymService } from '../features/gyms';
import type { RemoteLog } from '../data/sync';
import { SyncProvider } from '../features/sync';

type Props = {
  service: AuthService;
  gymService: GymService;
  exerciseService: ExerciseService;
  logRemote: RemoteLog;
  router: ComponentProps<typeof RouterProvider>['router'];
  ensureProfile?: (userId: string) => Promise<void>;
};

export function App({
  service,
  gymService,
  exerciseService,
  logRemote,
  router,
  ensureProfile,
}: Props) {
  return (
    <AuthProvider service={service} ensureProfile={ensureProfile}>
      <GymServiceProvider service={gymService}>
        <ExerciseServiceProvider service={exerciseService}>
          <SyncProvider remote={logRemote}>
            <RouterProvider router={router} />
          </SyncProvider>
        </ExerciseServiceProvider>
      </GymServiceProvider>
    </AuthProvider>
  );
}

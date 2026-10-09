import type { ComponentProps } from 'react';
import { RouterProvider } from 'react-router';
import { AuthProvider, type AuthService } from '../features/auth';
import { ExerciseServiceProvider, type ExerciseService } from '../features/exercises';
import { GymServiceProvider, type GymService } from '../features/gyms';

type Props = {
  service: AuthService;
  gymService: GymService;
  exerciseService: ExerciseService;
  router: ComponentProps<typeof RouterProvider>['router'];
  ensureProfile?: (userId: string) => Promise<void>;
};

export function App({ service, gymService, exerciseService, router, ensureProfile }: Props) {
  return (
    <AuthProvider service={service} ensureProfile={ensureProfile}>
      <GymServiceProvider service={gymService}>
        <ExerciseServiceProvider service={exerciseService}>
          <RouterProvider router={router} />
        </ExerciseServiceProvider>
      </GymServiceProvider>
    </AuthProvider>
  );
}

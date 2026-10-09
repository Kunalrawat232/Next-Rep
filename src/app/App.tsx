import type { ComponentProps } from 'react';
import { RouterProvider } from 'react-router';
import { AuthProvider, type AuthService } from '../features/auth';
import { GymServiceProvider, type GymService } from '../features/gyms';

type Props = {
  service: AuthService;
  gymService: GymService;
  router: ComponentProps<typeof RouterProvider>['router'];
  ensureProfile?: (userId: string) => Promise<void>;
};

export function App({ service, gymService, router, ensureProfile }: Props) {
  return (
    <AuthProvider service={service} ensureProfile={ensureProfile}>
      <GymServiceProvider service={gymService}>
        <RouterProvider router={router} />
      </GymServiceProvider>
    </AuthProvider>
  );
}

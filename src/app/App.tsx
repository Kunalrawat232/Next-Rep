import type { ComponentProps } from 'react';
import { RouterProvider } from 'react-router';
import { AuthProvider, type AuthService } from '../features/auth';

type Props = {
  service: AuthService;
  router: ComponentProps<typeof RouterProvider>['router'];
  ensureProfile?: (userId: string) => Promise<void>;
};

export function App({ service, router, ensureProfile }: Props) {
  return (
    <AuthProvider service={service} ensureProfile={ensureProfile}>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

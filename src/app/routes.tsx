import { Navigate, type RouteObject } from 'react-router';
import { AppShell } from '../components';
import { ProtectedRoute, SignInPage } from '../features/auth';
import { GymFormPage, GymsPage } from '../features/gyms';
import { HomePage } from './HomePage';

export const appRoutes: RouteObject[] = [
  { path: '/sign-in', element: <SignInPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/gyms', element: <GymsPage /> },
          { path: '/gyms/new', element: <GymFormPage /> },
          { path: '/gyms/:gymId', element: <GymFormPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

import { Navigate, type RouteObject } from 'react-router';
import { AppShell } from '../components';
import { ProtectedRoute, SignInPage } from '../features/auth';
import { HomePage } from './HomePage';

export const appRoutes: RouteObject[] = [
  { path: '/sign-in', element: <SignInPage /> },
  {
    element: <ProtectedRoute />,
    children: [{ element: <AppShell />, children: [{ path: '/', element: <HomePage /> }] }],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

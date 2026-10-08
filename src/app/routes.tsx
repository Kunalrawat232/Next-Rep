import { Navigate, type RouteObject } from 'react-router';
import { ProtectedRoute, SignInPage } from '../features/auth';
import { HomePage } from './HomePage';

export const appRoutes: RouteObject[] = [
  { path: '/sign-in', element: <SignInPage /> },
  { element: <ProtectedRoute />, children: [{ path: '/', element: <HomePage /> }] },
  { path: '*', element: <Navigate to="/" replace /> },
];

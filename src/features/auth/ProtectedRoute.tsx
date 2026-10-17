import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageLoader } from '../../components';
import { useAuth } from './AuthProvider';

export function ProtectedRoute() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <FullPageLoader />;
  if (state.status === 'signedOut')
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  return <Outlet />;
}

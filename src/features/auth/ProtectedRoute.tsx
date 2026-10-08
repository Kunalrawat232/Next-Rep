import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';

export function ProtectedRoute() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') {
    return (
      <p role="status" className="p-4 text-center text-ink-muted">
        Loading…
      </p>
    );
  }
  if (state.status === 'signedOut')
    return <Navigate to="/sign-in" state={{ from: location }} replace />;
  return <Outlet />;
}

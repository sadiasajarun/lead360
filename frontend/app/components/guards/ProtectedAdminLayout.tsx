import { Navigate, Outlet } from 'react-router';
import { useAuth } from '~/contexts/AuthContext';
import { ManagementLayout } from '~/components/layouts/ManagementLayout';
import { UserRole } from '~/enums/role.enum';

// Admin-only shell: waits for the session, redirects non-admins to the Sales home, guests to /login.
export default function ProtectedAdminLayout() {
  const { status, user } = useAuth();

  if (status === 'idle' || status === 'loading') {
    return (
      <div data-testid="auth-loading" className="grid min-h-screen place-items-center text-sm text-[#6B6660]">
        Loading…
      </div>
    );
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }
  if (user?.role !== UserRole.ADMIN) {
    return <Navigate to="/" replace />;
  }

  return (
    <ManagementLayout>
      <Outlet />
    </ManagementLayout>
  );
}

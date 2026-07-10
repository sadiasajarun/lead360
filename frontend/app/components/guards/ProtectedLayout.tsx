import { Navigate, Outlet, useLocation, useParams } from 'react-router';
import { useAuth } from '~/contexts/AuthContext';
import { UserRole } from '~/enums/role.enum';
import { AppLayout } from '~/components/layouts/AppLayout';

// Wraps all protected SALES routes: waits for the session check, redirects to /login if
// unauthenticated, and bounces admins to the equivalent page in their own shell — an admin has no
// Sales view, so even a hand-typed /leads/:id lands on /admin/leads/:id.
export default function ProtectedLayout() {
  const { status, user } = useAuth();
  const { pathname } = useLocation();
  const { id } = useParams();

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

  if (user?.role === UserRole.ADMIN) {
    const to =
      pathname === '/' ? '/admin/leads'
      : pathname === '/leads/new' ? '/admin/leads/new'
      : id && pathname === `/leads/${id}` ? `/admin/leads/${id}`
      : pathname === '/projects' ? '/admin/projects'
      : pathname === '/settings' ? '/admin/settings'
      : '/overview';
    return <Navigate to={to} replace />;
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

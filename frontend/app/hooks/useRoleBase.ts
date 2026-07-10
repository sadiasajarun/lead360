import { useAuth } from '~/contexts/AuthContext';
import { UserRole } from '~/enums/role.enum';

/**
 * Shared pages (leads list, lead detail, new-lead wizard, projects) render inside BOTH shells.
 * This returns the URL prefix for the current role so their internal links keep the user inside
 * their own shell — admins must never be bounced into the Sales layout.
 *
 *   sales_pm → ''        (`/`, `/leads/:id`,       `/projects`)
 *   admin    → '/admin'  (`/admin/leads`, `/admin/leads/:id`, `/admin/projects`)
 */
export function useRoleBase() {
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;
  return {
    isAdmin,
    /** Leads list path for this role. */
    leadsPath: isAdmin ? '/admin/leads' : '/',
    /** Lead detail path for a given id. */
    leadPath: (id: string) => (isAdmin ? `/admin/leads/${id}` : `/leads/${id}`),
    /** New-lead wizard path. */
    newLeadPath: isAdmin ? '/admin/leads/new' : '/leads/new',
    /** Projects path. */
    projectsPath: isAdmin ? '/admin/projects' : '/projects',
  };
}

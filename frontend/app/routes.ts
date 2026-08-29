import { type RouteConfig, route, layout, index } from '@react-router/dev/routes';

// Route aggregator. Public: /login. Protected app (behind ProtectedLayout): / (leads).
// More pages (lead-detail, new-lead wizard, projects, settings, admin, client views) are added in later D6 chunks.
export default [
  route('login', 'pages/login.tsx'),
  layout('components/guards/ProtectedLayout.tsx', [
    index('pages/leads.tsx'),
    route('leads/new', 'pages/new-lead.tsx'),
    route('leads/:id', 'pages/lead-detail.tsx'),
    route('projects', 'pages/projects.tsx'),
    route('settings', 'pages/settings.tsx'),
  ]),
  // Admin shell. Admins never enter the Sales layout — every page they can reach lives here, so
  // opening a lead or Settings no longer swaps the shell. Lead detail / new-lead / projects reuse
  // the exact same components as Sales (they are role-aware, not role-specific), which is why each
  // needs an explicit unique route id — React Router derives ids from the file path by default.
  layout('components/guards/ProtectedAdminLayout.tsx', [
    route('overview', 'pages/management/overview.tsx'),
    route('approvals', 'pages/management/approvals.tsx'),
    route('admin/leads', 'pages/leads.tsx', { id: 'admin-leads' }),
    route('admin/leads/new', 'pages/new-lead.tsx', { id: 'admin-new-lead' }),
    route('admin/leads/:id', 'pages/lead-detail.tsx', { id: 'admin-lead-detail' }),
    route('admin/projects', 'pages/projects.tsx', { id: 'admin-projects' }),
    route('admin/settings', 'pages/management/settings.tsx'),
  ]),
  // Public demo — locked Design-2 block renderer with a sample document (dev/QA only).
  route('proposal-demo', 'pages/proposal-demo.tsx'),
  // Client / present deliverable views — standalone (no app shell), read-only.
  route('present/:id/budget', 'pages/client/budget-view.tsx'),
  route('present/:id/proposal', 'pages/client/proposal-view.tsx'),
  route('*', 'pages/not-found.tsx'), // mandatory 404 catch-all (RULE-F4)
] satisfies RouteConfig;

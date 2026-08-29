import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { LayoutGrid, CheckSquare, List, Folder, Settings as SettingsIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '~/contexts/AuthContext';
import GlobalSearch from '~/components/shared/GlobalSearch';
import { useAvatarUrl } from '~/lib/avatar';
import { useSidebarCollapsed } from '~/hooks/useSidebarCollapsed';

// Every destination lives under the admin shell — an admin is never sent into the Sales layout.
const NAV = [
  { to: '/overview', label: 'Overview', icon: LayoutGrid },
  { to: '/approvals', label: 'Approvals', icon: CheckSquare },
  { to: '/admin/leads', label: 'Leads', icon: List },
  { to: '/admin/projects', label: 'Projects', icon: Folder },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
];

export function ManagementLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const initials = (user?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('');
  const avatar = useAvatarUrl(user?.avatarUrl);

  return (
    <div className="flex min-h-screen bg-[#FAFAF9] text-[#0F0F0F]">
      <aside className={`sticky top-0 flex h-screen flex-col bg-[#111111] p-3 transition-[width] duration-200 ${collapsed ? 'w-[68px]' : 'w-[260px]'}`}>
        <div className={`flex items-center gap-2 py-4 ${collapsed ? 'flex-col px-0' : 'justify-between px-3'}`}>
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#EA5400] text-xs font-bold text-white">L</span>
            {!collapsed && <span className="whitespace-nowrap text-base font-semibold text-white">Lead360</span>}
          </div>
          <button
            data-testid="nav-collapse"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#C4C0BB] hover:bg-[#1F1F1F] hover:text-white"
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/admin/leads'} // don't stay active on /admin/leads/:id children
                data-testid={`nav-${n.label.toLowerCase()}`}
                title={collapsed ? n.label : undefined}
                className={({ isActive }) =>
                  `flex h-9 items-center rounded-md text-sm font-medium ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'} ${
                    isActive ? 'bg-[#1F1F1F] text-white' : 'text-[#C4C0BB] hover:bg-[#1F1F1F] hover:text-white'
                  }`
                }
              >
                <Icon size={16} className="shrink-0" />
                {!collapsed && n.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="relative mt-auto">
          <button data-testid="acct-trigger" onClick={() => setMenu((m) => !m)} className={`flex w-full items-center border-t border-[#262626] py-2.5 text-left ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'}`} title={collapsed ? user?.name : undefined}>
            {avatar ? (
              <img data-testid="acct-avatar" src={avatar} alt="" className="h-[30px] w-[30px] shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[#2a2a2a] text-xs font-semibold text-white">{initials}</span>
            )}
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-white">{user?.name}</span>
                <span className="block text-[11px] text-[#C4C0BB]">Admin</span>
              </span>
            )}
          </button>
          {menu && (
            <div data-testid="acct-pop" className={`absolute bottom-[60px] rounded-[10px] border border-[#E8E6E3] bg-white p-1.5 shadow-xl ${collapsed ? 'left-2 w-[220px]' : 'left-3 right-3'}`}>
              <div className="border-b border-[#E8E6E3] px-2.5 pb-2.5 pt-2">
                <div className="text-[13.5px] font-semibold">{user?.name}</div>
                <div className="text-xs text-[#6B6660]">{user?.email}</div>
              </div>
              {/* No "Switch to Sales view": admins have no Sales view — they work the same pages
                  inside their own shell (user decision 2026-07-10). */}
              <button data-testid="acct-signout" onClick={logout} className="mt-1.5 flex h-9 w-full items-center rounded-md px-2.5 text-sm font-medium text-[#B42318] hover:bg-[#F4F4F2]">Sign out</button>
            </div>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3.5 border-b border-[#E8E6E3] bg-white px-8">
          <GlobalSearch />
        </header>
        <main className="mx-auto w-full max-w-[1400px] p-8">{children}</main>
      </div>
    </div>
  );
}

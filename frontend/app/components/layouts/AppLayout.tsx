import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { List, Folder, Settings as SettingsIcon, ChevronUp, Search, Repeat, LogOut } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '~/contexts/AuthContext';
import GlobalSearch from '~/components/shared/GlobalSearch';
import { useAvatarUrl } from '~/lib/avatar';
import { UserRole } from '~/enums/role.enum';

const NAV: { to: string; label: string; end: boolean; icon: LucideIcon }[] = [
  { to: '/', label: 'Leads', end: true, icon: List }, // Leads is the index route
  { to: '/projects', label: 'Projects', end: false, icon: Folder },
  { to: '/settings', label: 'Settings', end: false, icon: SettingsIcon },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const initials = (user?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('');
  const avatar = useAvatarUrl(user?.avatarUrl);
  const isAdmin = user?.role === UserRole.ADMIN;

  return (
    <div className="flex min-h-screen bg-[#FAFAF9] text-[#0F0F0F]">
      <aside className="sticky top-0 flex h-screen w-[260px] flex-col bg-[#111111] p-3">
        <div className="flex items-center gap-2 px-3 pb-[22px] pt-1.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-[#EA5400] text-xs font-bold text-white">L</span>
          <span className="text-base font-semibold text-white">Lead360</span>
        </div>
        <nav className="flex flex-col gap-px" aria-label="Primary">
          {NAV.map(({ to, label, end, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={`nav-${label.toLowerCase()}`}
              className={({ isActive }) =>
                `relative flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium ${
                  isActive
                    ? "bg-[#1F1F1F] text-white before:absolute before:bottom-2 before:left-0 before:top-2 before:w-[2px] before:rounded before:bg-[#EA5400] before:content-['']"
                    : 'text-[#C4C0BB] hover:bg-[#1F1F1F] hover:text-white'
                }`
              }
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>

        <div className="relative mt-auto">
          <button
            data-testid="acct-trigger"
            onClick={() => setMenu((m) => !m)}
            className="flex w-full items-center gap-2.5 border-t border-[#262626] px-3 py-2.5 text-left hover:bg-[#1F1F1F]"
          >
            {avatar ? (
              <img data-testid="acct-avatar" src={avatar} alt="" className="h-[30px] w-[30px] shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[#2a2a2a] text-xs font-semibold text-white">{initials}</span>
            )}
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[13px] font-medium text-white">{user?.name}</span>
              <span className="block text-[11px] text-[#C4C0BB]">{isAdmin ? 'Admin' : 'Sales / PM'}</span>
            </span>
            <ChevronUp size={15} className="shrink-0 text-[#C4C0BB]" />
          </button>
          {menu && (
            <div data-testid="acct-pop" className="absolute bottom-[60px] left-3 right-3 rounded-[10px] border border-[#E8E6E3] bg-white p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.3)]">
              <div className="mb-1.5 border-b border-[#E8E6E3] px-2.5 pb-2.5 pt-2">
                <div className="text-[13.5px] font-semibold">{user?.name}</div>
                <div className="mt-0.5 text-xs text-[#6B6660]">{user?.email}</div>
              </div>
              <Link to="/settings" data-testid="acct-settings" onClick={() => setMenu(false)} className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium hover:bg-[#F4F4F2]">
                <SettingsIcon size={15} className="text-[#6B6660]" /> Settings
              </Link>
              {/* No view-switcher: ProtectedLayout redirects admins into their own shell, so this
                  layout is only ever seen by Sales/PM (user decision 2026-07-10). */}
              <div className="my-1.5 h-px bg-[#E8E6E3]" />
              <button data-testid="acct-signout" onClick={logout} className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-[#B42318] hover:bg-[#F4F4F2]">
                <LogOut size={15} /> Sign out
              </button>
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

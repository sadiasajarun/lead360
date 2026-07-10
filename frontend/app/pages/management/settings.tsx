import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User, SlidersHorizontal, Shield, Users, LayoutTemplate, Wallet, GitPullRequest,
  Palette, Database as DatabaseIcon, Send, ScrollText, Upload, Check, Lock, UserPlus,
  Plus, Pencil, RefreshCw, Trash2, RotateCcw, AlertTriangle, Loader2, MoreHorizontal,
  X, Copy, PowerOff, type LucideIcon,
} from 'lucide-react';
import FileTypeBadge from '~/components/atoms/FileTypeBadge';
import { useAuth } from '~/contexts/AuthContext';
import { useAppDispatch } from '~/redux/store/hooks';
import { UserRole } from '~/enums/role.enum';
import {
  changePassword, fetchMe, updateProfile, uploadAvatar, removeAvatar, updatePreferences,
} from '~/services/httpServices/authService';
import { getKbTrash, restoreKbDocument, purgeKbTrash, getKbDocuments } from '~/services/httpServices/kbService';
import {
  getRateCards, saveRateCards, previewRateImport, commitRateImport,
} from '~/services/httpServices/rateCardService';
import { getSettings, updateSettingsSection, syncCurrency, uploadBrandingLogo, removeBrandingLogo } from '~/services/httpServices/settingsService';
import {
  getTeam, getInvitations, inviteUser, revokeInvitation, setUserRole, setUserActive,
} from '~/services/httpServices/userService';
import { getAudit } from '~/services/httpServices/auditService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import { useAvatarUrl } from '~/lib/avatar';
import type { KbTrashItem, KbDocument } from '~/types/kb';
import type { RateCard, RateImportPreview } from '~/types/rateCard';
import type { OrgSettings } from '~/types/settings';
import type { TeamMember, PendingInvitation, InviteResult } from '~/types/user';
import type { AuditEntry } from '~/types/audit';

// ---------------------------------------------------------------------------
// Shared style tokens (match the existing admin pages / DESIGN_SYSTEM)
// ---------------------------------------------------------------------------
// Backend origin — the branding-logo preview is a PUBLIC endpoint, so a plain <img src> to this
// absolute URL works without auth (unlike the avatar, which needs the axios blob hook).
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

const CARD = 'rounded-lg border border-[#E8E6E3] bg-white p-6';
const H2 = 'text-[15px] font-semibold';
const DESC = 'mt-[3px] text-[13px] leading-[1.55] text-[#6B6660]';
const HR = 'my-[18px] h-px bg-[#E8E6E3]';
const LABEL = 'mb-1.5 block text-[13px] font-semibold';
const INPUT = 'w-full rounded-md border border-[#D4D1CC] px-[11px] py-[9px] text-sm outline-none focus:border-[#EA5400]';
const INPUT_RO = 'w-full rounded-md border border-[#E8E6E3] bg-[#F4F4F2] px-[11px] py-[9px] text-sm text-[#6B6660]';
const SELECT = 'w-full rounded-md border border-[#D4D1CC] bg-white px-[11px] py-[9px] text-sm outline-none focus:border-[#EA5400]';
const BTN_PRIMARY = 'inline-flex h-9 items-center gap-1.5 rounded-md bg-[#EA5400] px-3.5 text-sm font-medium text-white hover:bg-[#CC4900] disabled:cursor-not-allowed disabled:opacity-45';
const BTN_SECONDARY = 'inline-flex h-8 items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-3 text-[13px] font-medium hover:bg-[#F4F4F2] disabled:cursor-not-allowed disabled:opacity-45';
const BTN_GHOST = 'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-[#6B6660] hover:bg-[#F4F4F2] hover:text-[#0F0F0F] disabled:cursor-not-allowed disabled:opacity-45';
const HINT = 'mt-1.5 text-[12px] text-[#9A948E]';
const GRID2 = 'grid max-w-[560px] grid-cols-1 gap-3.5 sm:grid-cols-2';
const OK = 'text-[13px] text-[#0E7C5A]';
const BAD = 'text-[13px] text-[#B42318]';

// ---------------------------------------------------------------------------
// Navigation model
// ---------------------------------------------------------------------------
type PanelKey =
  | 'profile' | 'prefs' | 'security'
  | 'team' | 'templates' | 'rates' | 'approvals' | 'branding' | 'kb' | 'delivery' | 'audit';

interface NavItem {
  key: PanelKey;
  label: string;
  testid: string;
  icon: LucideIcon;
}

const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  {
    group: 'Personal',
    items: [
      { key: 'profile', label: 'Profile', testid: 'set-nav-profile', icon: User },
      { key: 'prefs', label: 'Preferences', testid: 'set-nav-prefs', icon: SlidersHorizontal },
      { key: 'security', label: 'Security', testid: 'set-nav-security', icon: Shield },
    ],
  },
  {
    group: 'Organization',
    items: [
      { key: 'team', label: 'Team & Roles', testid: 'set-nav-team', icon: Users },
      { key: 'templates', label: 'Templates', testid: 'set-nav-templates', icon: LayoutTemplate },
      { key: 'rates', label: 'Rates & Currency', testid: 'set-nav-rates', icon: Wallet },
      { key: 'approvals', label: 'Approvals', testid: 'set-nav-approvals', icon: GitPullRequest },
      { key: 'branding', label: 'Branding', testid: 'set-nav-branding', icon: Palette },
      { key: 'kb', label: 'Knowledge Base', testid: 'set-nav-kb', icon: DatabaseIcon },
      { key: 'delivery', label: 'Delivery & Integrations', testid: 'set-nav-delivery', icon: Send },
      { key: 'audit', label: 'Security & Audit', testid: 'set-nav-audit', icon: ScrollText },
    ],
  },
];

const PANEL_KEYS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key));

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------

// Interactive toggle. Disabled variant is used only where the backend genuinely refuses the change
// (email delivery when EMAIL_ENABLED=false).
function Toggle({ on, onChange, disabled, testid }: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testid?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-testid={testid}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-block h-[22px] w-[38px] shrink-0 rounded-full transition after:absolute after:left-[2px] after:top-[2px] after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:transition ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${on ? 'bg-[#EA5400] after:translate-x-[16px]' : 'bg-[#D4D1CC]'}`}
    />
  );
}

function RoleChip({ role }: { role: UserRole }) {
  const admin = role === UserRole.ADMIN;
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded border border-[#E8E6E3] px-2.5 text-[11.5px] font-semibold text-[#0F0F0F]">
      <span className={`h-1.5 w-1.5 rounded-full ${admin ? 'bg-[#EA5400]' : 'bg-[#175CD3]'}`} />
      {admin ? 'Admin' : 'Sales/PM'}
    </span>
  );
}

function StatusChip({ active }: { active: boolean }) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded border border-[#E8E6E3] px-2.5 text-[11.5px] font-semibold text-[#0F0F0F]">
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-[#0E7C5A]' : 'bg-[#9A948E]'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// Human "3 minutes ago" from an ISO string.
function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const abs = Math.abs(diff);
  const m = 60_000, h = 3_600_000, d = 86_400_000;
  const suffix = diff >= 0 ? 'ago' : 'from now';
  const fmt = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ${suffix}`;
  if (abs < m) return 'just now';
  if (abs < h) return fmt(Math.round(abs / m), 'minute');
  if (abs < d) return fmt(Math.round(abs / h), 'hour');
  if (abs < 30 * d) return fmt(Math.round(abs / d), 'day');
  return new Date(iso).toLocaleDateString();
}

// Shared loader for the org-settings sections. Each org panel derives its own draft from `settings`.
function useOrgSettings() {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [err, setErr] = useState('');
  const reload = async () => {
    try {
      setSettings(await getSettings());
    } catch (e) {
      setErr(apiErrorMessage(e));
    }
  };
  useEffect(() => { void reload(); }, []);
  return { settings, err, reload };
}

// ===========================================================================
// PAGE
// ===========================================================================
export default function AdminSettings() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('panel') ?? '';
  const active: PanelKey = (PANEL_KEYS as string[]).includes(raw) ? (raw as PanelKey) : 'profile';
  const setActive = (key: PanelKey) =>
    setParams((p) => { const n = new URLSearchParams(p); n.set('panel', key); return n; }, { replace: true });

  return (
    <div data-testid="admin-settings-page">
      <h1 className="text-[22px] font-semibold">Settings</h1>
      <p className="mt-1.5 text-[13px] text-[#6B6660]">Personal preferences and organization-wide configuration.</p>

      <div className="mt-6 grid grid-cols-1 items-start gap-7 lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* left settings nav */}
        <nav
          aria-label="Settings sections"
          className="flex max-h-[calc(100vh-110px)] flex-col gap-px overflow-auto lg:sticky lg:top-2"
        >
          {NAV_GROUPS.map((grp) => (
            <div key={grp.group}>
              <div className="px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9A948E]">
                {grp.group}
              </div>
              {grp.items.map((item) => {
                const Icon = item.icon;
                const on = active === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-testid={item.testid}
                    onClick={() => setActive(item.key)}
                    className={`relative flex h-[34px] w-full items-center gap-2.5 rounded-md px-3 text-left text-[13.5px] font-medium ${
                      on
                        ? "border border-[#D4D1CC] bg-white text-[#0F0F0F] before:absolute before:bottom-[7px] before:left-0 before:top-[7px] before:w-0.5 before:rounded-full before:bg-[#EA5400] before:content-['']"
                        : 'text-[#6B6660] hover:bg-[#F4F4F2] hover:text-[#0F0F0F]'
                    }`}
                  >
                    <Icon size={15} className="shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* right panel area — only the active panel is mounted */}
        <div className="flex flex-col gap-4">
          {active === 'profile' && <ProfilePanel />}
          {active === 'prefs' && <PrefsPanel />}
          {active === 'security' && <SecurityPanel />}
          {active === 'team' && <TeamPanel />}
          {active === 'templates' && <TemplatesPanel />}
          {active === 'rates' && <RatesPanel />}
          {active === 'approvals' && <ApprovalsPanel />}
          {active === 'branding' && <BrandingPanel />}
          {active === 'kb' && <KbPanel />}
          {active === 'delivery' && <DeliveryPanel />}
          {active === 'audit' && <AuditPanel />}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// PROFILE — fully wired (updateProfile + fetchMe + avatar)
// ===========================================================================
function ProfilePanel() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  // Name falls back to the email's unique local part (sadia.noor@… -> sadia.noor) until set.
  const [name, setName] = useState(user?.name || user?.email?.split('@')[0] || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const initials = (name || user?.email || '?')
    .split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const currentAvatar = useAvatarUrl(user?.avatarUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarErr, setAvatarErr] = useState('');
  const MAX_AVATAR = 2 * 1024 * 1024;

  const onPickAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after an error
    if (!file) return;
    setAvatarErr('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setAvatarErr('Please choose a PNG, JPG or WebP image.');
      return;
    }
    if (file.size > MAX_AVATAR) {
      setAvatarErr('Image is too large — the maximum is 2 MB.');
      return;
    }
    setAvatarBusy(true);
    try {
      await uploadAvatar(file);
      await dispatch(fetchMe()); // refresh so the sidebar avatar updates too
    } catch (err) {
      setAvatarErr(apiErrorMessage(err));
    } finally {
      setAvatarBusy(false);
    }
  };

  const onRemoveAvatar = async () => {
    setAvatarErr('');
    setAvatarBusy(true);
    try {
      await removeAvatar();
      await dispatch(fetchMe());
    } catch (err) {
      setAvatarErr(apiErrorMessage(err));
    } finally {
      setAvatarBusy(false);
    }
  };

  const onSave = async () => {
    setSaving(true); setMsg(''); setErr('');
    try {
      await updateProfile(name.trim() || user?.email?.split('@')[0] || '');
      await dispatch(fetchMe()); // refresh the auth store so the sidebar chip updates too
      setMsg('Saved.');
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={CARD}>
      <h2 className={H2}>Profile</h2>
      <div className={DESC}>How you appear across Lead360.</div>
      <div className={HR} />

      <div className="mb-5 flex items-center gap-4">
        {currentAvatar ? (
          <img
            data-testid="set-avatar-img"
            src={currentAvatar}
            alt="Profile photo"
            className="h-16 w-16 shrink-0 rounded-full border border-[#E8E6E3] object-cover"
          />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[#EA5400]/[0.08] text-[22px] font-bold text-[#EA5400]">
            {initials}
          </span>
        )}
        <div>
          <input
            ref={fileRef}
            data-testid="set-avatar-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void onPickAvatar(e)}
          />
          <div className="flex items-center gap-2">
            <button type="button" data-testid="set-avatar-upload" disabled={avatarBusy} onClick={() => fileRef.current?.click()} className={BTN_SECONDARY}>
              {avatarBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload photo
            </button>
            {currentAvatar && (
              <button type="button" data-testid="set-avatar-remove" disabled={avatarBusy} onClick={() => void onRemoveAvatar()} className={BTN_GHOST}>
                <Trash2 size={14} /> Remove photo
              </button>
            )}
          </div>
          <div className={HINT}>PNG, JPG or WebP · up to 2 MB.</div>
          {avatarErr && <div data-testid="set-avatar-error" className="mt-1 text-[12px] text-[#B42318]">{avatarErr}</div>}
        </div>
      </div>

      <div className={GRID2}>
        <div>
          <label htmlFor="set-name" className={LABEL}>Full name</label>
          <input
            id="set-name"
            data-testid="set-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
          />
        </div>
      </div>

      <div className="mt-4 max-w-[560px]">
        <label htmlFor="set-email" className={LABEL}>Work email</label>
        <input id="set-email" data-testid="set-email" readOnly disabled defaultValue={user?.email} className={INPUT_RO} />
      </div>

      {msg && <p data-testid="set-profile-msg" className={`mt-3 ${OK}`}>{msg}</p>}
      {err && <p data-testid="set-profile-error" className={`mt-3 ${BAD}`}>{err}</p>}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          data-testid="set-profile-save"
          disabled={saving || !name.trim()}
          onClick={() => void onSave()}
          className={BTN_PRIMARY}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// PREFERENCES — personal defaults (GET /auth/me → PATCH /auth/me/preferences)
// ===========================================================================
const TEMPLATE_OPTIONS = [
  { value: 'global', label: 'Global' },
  { value: 'local', label: 'Local' },
  { value: 'agency', label: 'Agency' },
  { value: 'design_portfolio', label: 'Design Portfolio' },
];
const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD $' },
  { value: 'BDT', label: 'BDT ৳' },
];
const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'mixture', label: 'Mixture' },
];
const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'bn', label: 'Bangla' },
];

function PrefsPanel() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { settings, err: settingsErr } = useOrgSettings();

  const [defaultTemplate, setDefaultTemplate] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [proposalTheme, setProposalTheme] = useState('light');
  const [language, setLanguage] = useState('en');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Load once both the user profile and the org settings (for the template fallback) are available.
  useEffect(() => {
    if (!user || !settings || ready) return;
    const p = user.preferences ?? {};
    setDefaultTemplate(p.defaultTemplate ?? settings.templates.defaultTemplate);
    setDefaultCurrency(p.defaultCurrency ?? 'USD');
    setProposalTheme(p.proposalTheme ?? 'light');
    setLanguage(p.language ?? 'en');
    setReady(true);
  }, [user, settings, ready]);

  const onSave = async () => {
    setSaving(true); setMsg(''); setErr('');
    try {
      await updatePreferences({ defaultTemplate, defaultCurrency, proposalTheme, language });
      await dispatch(fetchMe());
      setMsg('Preferences saved.');
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={CARD}>
      <h2 className={H2}>Defaults</h2>
      <div className={DESC}>Your personal defaults for new leads and documents. The org default template is used until you pick your own.</div>
      <div className={HR} />

      {settingsErr && <p data-testid="prefs-error" className={BAD}>{settingsErr}</p>}
      {!ready && !settingsErr && (
        <p data-testid="prefs-loading" className="flex items-center gap-2 text-[13px] text-[#6B6660]">
          <Loader2 size={14} className="animate-spin" /> Loading preferences…
        </p>
      )}

      {ready && (
        <>
          <div className={GRID2}>
            <div>
              <label htmlFor="set-default-template" className={LABEL}>Default proposal template</label>
              <select id="set-default-template" data-testid="set-default-template" value={defaultTemplate} onChange={(e) => setDefaultTemplate(e.target.value)} className={SELECT}>
                {TEMPLATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="set-default-currency" className={LABEL}>Default budget currency</label>
              <select id="set-default-currency" data-testid="set-default-currency" value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} className={SELECT}>
                {CURRENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="set-default-theme" className={LABEL}>Proposal theme</label>
              <select id="set-default-theme" data-testid="set-default-theme" value={proposalTheme} onChange={(e) => setProposalTheme(e.target.value)} className={SELECT}>
                {THEME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="set-language" className={LABEL}>Language</label>
              <select id="set-language" data-testid="set-language" value={language} onChange={(e) => setLanguage(e.target.value)} className={SELECT}>
                {LANGUAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {msg && <p data-testid="set-prefs-msg" className={`mt-4 ${OK}`}>{msg}</p>}
          {err && <p data-testid="set-prefs-error" className={`mt-4 ${BAD}`}>{err}</p>}

          <div className="mt-5 flex justify-end">
            <button type="button" data-testid="set-prefs-save" disabled={saving} onClick={() => void onSave()} className={BTN_PRIMARY}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {saving ? 'Saving…' : 'Save preferences'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// SECURITY — change-password (personal) + Authentication card (org, settings.security)
// ===========================================================================
const passwordSchema = z
  .object({
    currentPassword: z.string().min(6),
    newPassword: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'mismatch' });
type PasswordValues = z.infer<typeof passwordSchema>;

const SIGN_IN_OPTIONS = [
  { value: 'email_password', label: 'Email & password' },
  { value: 'sso', label: 'SSO (not yet available)' },
];
const SESSION_OPTIONS = [
  { value: 8, label: '8 hours' },
  { value: 24, label: '24 hours' },
  { value: 168, label: '7 days' },
];

function SecurityPanel() {
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  const onChangePassword = async (values: PasswordValues) => {
    setPwErr(''); setPwMsg('');
    try {
      await changePassword(values.currentPassword, values.newPassword);
      setPwMsg('Password changed. Other sessions have been signed out.');
      reset();
    } catch (e) {
      setPwErr(apiErrorMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={CARD}>
        <h2 className={H2}>Password</h2>
        <div className={DESC}>Choose a strong password you don&apos;t use elsewhere. Changing it signs you out everywhere else.</div>
        <div className={HR} />
        <form onSubmit={handleSubmit(onChangePassword)} className="flex flex-col gap-4">
          <div className="max-w-[560px]">
            <label htmlFor="set-cur-pw" className={LABEL}>Current password</label>
            <input id="set-cur-pw" data-testid="set-cur-pw" type="password" autoComplete="current-password" placeholder="••••••••" {...register('currentPassword')} className={INPUT} />
            {errors.currentPassword && <span className="mt-1 block text-xs text-[#B42318]">Enter your current password (min 6 characters)</span>}
          </div>
          <div className={GRID2}>
            <div>
              <label htmlFor="set-new-pw" className={LABEL}>New password</label>
              <input id="set-new-pw" data-testid="set-new-pw" type="password" autoComplete="new-password" placeholder="••••••••" {...register('newPassword')} className={INPUT} />
              {errors.newPassword && <span className="mt-1 block text-xs text-[#B42318]">Min 8 characters</span>}
            </div>
            <div>
              <label htmlFor="set-confirm-pw" className={LABEL}>Confirm</label>
              <input id="set-confirm-pw" data-testid="set-confirm-pw" type="password" autoComplete="new-password" placeholder="••••••••" {...register('confirmPassword')} className={INPUT} />
              {errors.confirmPassword && <span className="mt-1 block text-xs text-[#B42318]">Passwords do not match</span>}
            </div>
          </div>
          {pwErr && <p data-testid="set-pw-error" className={BAD}>{pwErr}</p>}
          {pwMsg && <p data-testid="set-pw-msg" className={OK}>{pwMsg}</p>}
          <div className="flex justify-end">
            <button type="submit" data-testid="set-pw-save" disabled={isSubmitting} className={BTN_PRIMARY}>
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
              {isSubmitting ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </div>

      <AuthenticationCard />
    </div>
  );
}

// Org "Authentication" card — editable sign-in method, session timeout, min password length.
function AuthenticationCard() {
  const { settings, err: loadErr, reload } = useOrgSettings();
  const [signInMethod, setSignInMethod] = useState('email_password');
  const [sessionTimeoutHours, setSessionTimeoutHours] = useState(8);
  const [minPasswordLength, setMinPasswordLength] = useState('8');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!settings) return;
    const s = settings.security;
    setSignInMethod(s.signInMethod);
    setSessionTimeoutHours(s.sessionTimeoutHours);
    setMinPasswordLength(String(s.minPasswordLength));
  }, [settings]);

  const onSave = async () => {
    setSaving(true); setMsg(''); setErr('');
    try {
      await updateSettingsSection('security', {
        signInMethod,
        sessionTimeoutHours,
        minPasswordLength: Number(minPasswordLength),
      });
      await reload();
      setMsg('Authentication settings saved.');
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={CARD}>
      <h2 className={H2}>Authentication</h2>
      <div className={DESC}>How your team signs in.</div>
      <div className={HR} />

      {loadErr && <p data-testid="auth-card-error" className={BAD}>{loadErr}</p>}
      {!settings && !loadErr && (
        <p data-testid="auth-card-loading" className="flex items-center gap-2 text-[13px] text-[#6B6660]">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </p>
      )}

      {settings && (
        <>
          <div className="max-w-[280px]">
            <label htmlFor="set-auth-method" className={LABEL}>Sign-in method</label>
            <select id="set-auth-method" data-testid="set-auth-method" value={signInMethod} onChange={(e) => setSignInMethod(e.target.value)} className={SELECT}>
              {SIGN_IN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="mt-4 grid max-w-[560px] grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label htmlFor="set-session" className={LABEL}>Session timeout</label>
              <select id="set-session" data-testid="set-session" value={sessionTimeoutHours} onChange={(e) => setSessionTimeoutHours(Number(e.target.value))} className={SELECT}>
                {SESSION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="set-pw-min" className={LABEL}>Min password length</label>
              <input
                id="set-pw-min"
                data-testid="set-pw-min"
                type="number"
                min={8}
                max={64}
                value={minPasswordLength}
                onChange={(e) => setMinPasswordLength(e.target.value)}
                className={INPUT}
              />
              <div className={HINT}>Must be between 8 and 64.</div>
            </div>
          </div>

          {msg && <p data-testid="set-auth-msg" className={`mt-4 ${OK}`}>{msg}</p>}
          {err && <p data-testid="set-auth-error" className={`mt-4 ${BAD}`}>{err}</p>}

          <div className="mt-5 flex justify-end">
            <button type="button" data-testid="set-auth-save" disabled={saving} onClick={() => void onSave()} className={BTN_PRIMARY}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// TEAM & ROLES — real team list + pending invitations + invite modal
// ===========================================================================
function TeamPanel() {
  const { user } = useAuth();
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [pending, setPending] = useState<PendingInvitation[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState('');
  const [menuFor, setMenuFor] = useState('');
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    try {
      const [t, p] = await Promise.all([getTeam(), getInvitations()]);
      setTeam(t);
      setPending(p);
    } catch (e) {
      setErr(apiErrorMessage(e));
    }
  };
  useEffect(() => { void load(); }, []);

  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 3600); };

  const changeRole = async (m: TeamMember) => {
    setMenuFor(''); setErr(''); setBusyId(m.id);
    const next = m.role === UserRole.ADMIN ? UserRole.SALES_PM : UserRole.ADMIN;
    try {
      await setUserRole(m.id, next);
      flash(`${m.name} is now ${next === UserRole.ADMIN ? 'an Admin' : 'Sales/PM'}.`);
      await load();
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setBusyId('');
    }
  };

  const toggleActive = async (m: TeamMember) => {
    setMenuFor(''); setErr(''); setBusyId(m.id);
    try {
      await setUserActive(m.id, !m.isActive);
      flash(`${m.name} ${m.isActive ? 'deactivated' : 'activated'}.`);
      await load();
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setBusyId('');
    }
  };

  const revoke = async (inv: PendingInvitation) => {
    setErr(''); setBusyId(inv.id);
    try {
      await revokeInvitation(inv.id);
      flash(`Invitation to ${inv.email} revoked.`);
      await load();
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={CARD}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={H2}>Team &amp; Roles</h2>
            <div className={DESC}>Manage who can access Lead360 and what they can do.</div>
          </div>
          <button type="button" data-testid="set-invite-user" onClick={() => setInviting(true)} className={BTN_PRIMARY}>
            <UserPlus size={15} /> Invite user
          </button>
        </div>
        <div className={HR} />

        {err && <p data-testid="team-error" className={`mb-3 ${BAD}`}>{err}</p>}
        {msg && <p data-testid="team-msg" className={`mb-3 ${OK}`}>{msg}</p>}

        {!team && !err && (
          <p data-testid="team-loading" className="flex items-center gap-2 text-[13px] text-[#6B6660]">
            <Loader2 size={14} className="animate-spin" /> Loading team…
          </p>
        )}

        {team && team.length === 0 && (
          <div data-testid="team-empty" className="rounded-lg border border-dashed border-[#D4D1CC] py-10 text-center text-[13px] text-[#6B6660]">
            <Users size={22} className="mx-auto mb-2 text-[#9A948E]" /> No team members yet.
          </div>
        )}

        {team && team.length > 0 && (
          <div className="overflow-x-auto">
            <table data-testid="team-table" className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr>
                  {['Name', 'Email', 'Role', 'Status', 'Joined', ''].map((h, i) => (
                    <th key={i} className={`border-b border-[#D4D1CC] px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9A948E] ${i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.map((m) => (
                  <tr key={m.id} data-testid={`team-row-${m.id}`}>
                    <td className="border-b border-[#E8E6E3] px-3 py-2.5 font-medium">
                      {m.name}{m.id === user?.id && <span className="ml-1.5 text-[11px] font-normal text-[#9A948E]">(you)</span>}
                    </td>
                    <td className="border-b border-[#E8E6E3] px-3 py-2.5 text-[#6B6660]">{m.email}</td>
                    <td className="border-b border-[#E8E6E3] px-3 py-2.5"><RoleChip role={m.role} /></td>
                    <td className="border-b border-[#E8E6E3] px-3 py-2.5"><StatusChip active={m.isActive} /></td>
                    <td className="border-b border-[#E8E6E3] px-3 py-2.5 text-[#6B6660]">{new Date(m.createdAt).toLocaleDateString()}</td>
                    <td className="relative border-b border-[#E8E6E3] px-3 py-2.5 text-right">
                      <button
                        type="button"
                        data-testid={`team-menu-${m.id}`}
                        disabled={busyId === m.id}
                        onClick={() => setMenuFor(menuFor === m.id ? '' : m.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#6B6660] hover:bg-[#F4F4F2] hover:text-[#0F0F0F] disabled:opacity-40"
                      >
                        {busyId === m.id ? <Loader2 size={15} className="animate-spin" /> : <MoreHorizontal size={16} />}
                      </button>
                      {menuFor === m.id && (
                        <>
                          <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuFor('')} />
                          <div className="absolute right-3 top-[42px] z-50 w-[190px] rounded-lg border border-[#E8E6E3] bg-white p-1 text-left shadow-xl">
                            <button
                              type="button"
                              data-testid={`team-role-${m.id}`}
                              onClick={() => void changeRole(m)}
                              className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-[13px] hover:bg-[#F4F4F2]"
                            >
                              <RefreshCw size={14} className="text-[#6B6660]" />
                              {m.role === UserRole.ADMIN ? 'Make Sales/PM' : 'Make Admin'}
                            </button>
                            <button
                              type="button"
                              data-testid={`team-active-${m.id}`}
                              onClick={() => void toggleActive(m)}
                              className={`flex w-full items-center gap-2 rounded px-2.5 py-2 text-[13px] hover:bg-[#F4F4F2] ${m.isActive ? 'text-[#B42318]' : 'text-[#0E7C5A]'}`}
                            >
                              {m.isActive ? <PowerOff size={14} /> : <Check size={14} />}
                              {m.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending invitations */}
      <div className={CARD}>
        <h2 className={H2}>Pending invitations</h2>
        <div className={DESC}>Invited users who haven&apos;t created an account yet. Links expire automatically.</div>
        <div className={HR} />

        {!pending && !err && (
          <p data-testid="invites-loading" className="flex items-center gap-2 text-[13px] text-[#6B6660]">
            <Loader2 size={14} className="animate-spin" /> Loading invitations…
          </p>
        )}

        {pending && pending.length === 0 && (
          <div data-testid="invites-empty" className="rounded-lg border border-dashed border-[#D4D1CC] py-8 text-center text-[13px] text-[#6B6660]">
            No pending invitations.
          </div>
        )}

        {pending && pending.length > 0 && (
          <div className="overflow-x-auto">
            <table data-testid="invites-table" className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr>
                  {['Email', 'Role', 'Expires', ''].map((h, i) => (
                    <th key={i} className={`border-b border-[#D4D1CC] px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9A948E] ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.map((inv) => (
                  <tr key={inv.id} data-testid={`invite-row-${inv.id}`}>
                    <td className="border-b border-[#E8E6E3] px-3 py-2.5 font-medium">{inv.email}</td>
                    <td className="border-b border-[#E8E6E3] px-3 py-2.5"><RoleChip role={inv.role} /></td>
                    <td className="border-b border-[#E8E6E3] px-3 py-2.5 text-[#6B6660]">{relativeTime(inv.expiresAt)}</td>
                    <td className="border-b border-[#E8E6E3] px-3 py-2.5 text-right">
                      <button type="button" data-testid={`invite-revoke-${inv.id}`} disabled={busyId === inv.id} onClick={() => void revoke(inv)} className={BTN_GHOST}>
                        {busyId === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {inviting && (
        <InviteModal
          onClose={() => setInviting(false)}
          onInvited={() => { flash('Invitation created.'); void load(); }}
        />
      )}
    </div>
  );
}

function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.SALES_PM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true); setErr('');
    try {
      const r = await inviteUser(email.trim(), role);
      setResult(r);
      onInvited();
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Could not copy — select the link and copy it manually.');
    }
  };

  return (
    <div data-testid="invite-modal" className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-[460px] rounded-xl border border-[#E8E6E3] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><UserPlus size={17} className="text-[#EA5400]" /> Invite a user</div>

        {!result ? (
          <>
            <p className="mb-4 text-xs text-[#9A948E]">They receive a one-time signup link. Email delivery is disabled in this environment, so you&apos;ll copy the link and share it yourself.</p>
            <label htmlFor="invite-email" className={LABEL}>Email</label>
            <input
              id="invite-email"
              data-testid="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              placeholder="name@riseuplabs.com"
              className={INPUT}
            />
            <div className="mt-3">
              <label htmlFor="invite-role" className={LABEL}>Role</label>
              <select id="invite-role" data-testid="invite-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={SELECT}>
                <option value={UserRole.SALES_PM}>Sales/PM</option>
                <option value={UserRole.ADMIN}>Admin</option>
              </select>
            </div>
            {err && <p data-testid="invite-error" className={`mt-3 ${BAD}`}>{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" data-testid="invite-cancel" disabled={busy} onClick={onClose} className="h-9 rounded-md border border-[#D4D1CC] px-4 text-sm font-medium hover:bg-[#F4F4F2]">Cancel</button>
              <button type="button" data-testid="invite-submit" disabled={busy || !email.trim()} onClick={() => void submit()} className={BTN_PRIMARY}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Send invite
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 text-[13px] text-[#6B6660]">
              Invitation for <strong>{result.email}</strong> created. {result.note}
            </p>
            <label htmlFor="invite-link" className={LABEL}>One-time signup link</label>
            <div className="flex items-center gap-2">
              <input id="invite-link" data-testid="invite-link" readOnly value={result.inviteUrl} onFocus={(e) => e.currentTarget.select()} className={INPUT_RO} />
              <button type="button" data-testid="invite-copy" onClick={() => void copy()} className={BTN_SECONDARY}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            {err && <p data-testid="invite-copy-error" className={`mt-3 ${BAD}`}>{err}</p>}
            <div className="mt-4 flex justify-end">
              <button type="button" data-testid="invite-done" onClick={onClose} className={BTN_PRIMARY}><Check size={15} /> Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// TEMPLATES — four cards; org default from settings.templates.defaultTemplate
// ===========================================================================
const TEMPLATE_CARDS = [
  { value: 'global', testid: 'global', name: 'Global', rule: 'Proposal (PDF) + separate Excel budget · 11-section technical format' },
  { value: 'local', testid: 'local', name: 'Local', rule: 'Proposal (PDF) + separate Excel budget · 11-section technical format' },
  { value: 'agency', testid: 'agency', name: 'Agency', rule: 'Proposal + budget combined · inline Financial Proposal' },
  { value: 'design_portfolio', testid: 'design', name: 'Design Portfolio', rule: 'Proposal + budget combined · inline Financial Proposal' },
];

function TemplatesPanel() {
  const { settings, err: loadErr, reload } = useOrgSettings();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const current = settings?.templates.defaultTemplate;

  const setDefault = async (value: string) => {
    setBusy(value); setErr(''); setMsg('');
    try {
      await updateSettingsSection('templates', { defaultTemplate: value });
      await reload();
      setMsg('Org default template updated.');
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className={CARD}>
      <h2 className={H2}>Proposal templates</h2>
      <div className={DESC}>The four template types and how their budget is delivered. Section structure follows the Riseup document standard.</div>
      <div className={HR} />

      {loadErr && <p data-testid="templates-error" className={BAD}>{loadErr}</p>}
      {!settings && !loadErr && (
        <p data-testid="templates-loading" className="flex items-center gap-2 text-[13px] text-[#6B6660]">
          <Loader2 size={14} className="animate-spin" /> Loading templates…
        </p>
      )}

      {msg && <p data-testid="templates-msg" className={`mb-2 ${OK}`}>{msg}</p>}
      {err && <p data-testid="templates-save-error" className={`mb-2 ${BAD}`}>{err}</p>}

      {settings && TEMPLATE_CARDS.map((t) => {
        const isDefault = current === t.value;
        return (
          <div key={t.value} data-testid={`tmpl-card-${t.testid}`} className="flex items-center justify-between gap-3 border-b border-[#E8E6E3] py-3.5 last:border-b-0">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                {t.name}
                {isDefault && (
                  <span data-testid={`tmpl-default-badge-${t.testid}`} className="rounded border border-[#E8E6E3] bg-[#F4F4F2] px-2 py-0.5 text-[11px] font-semibold text-[#6B6660]">
                    Org default
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[12.5px] text-[#6B6660]">{t.rule}</div>
            </div>
            <button
              type="button"
              data-testid={`set-tmpl-${t.testid}-default`}
              disabled={isDefault || busy === t.value}
              onClick={() => void setDefault(t.value)}
              className={BTN_GHOST}
            >
              {busy === t.value ? <Loader2 size={14} className="animate-spin" /> : null}
              {isDefault ? 'Current default' : 'Set default'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// RATES & CURRENCY — editable head-cost table + CSV import + Currencies/FX
// ===========================================================================
const MONEY_FIELDS = [
  { key: 'monthlyBdtCents', label: 'Monthly Head Cost (BDT)' },
  { key: 'dailyBdtCents', label: 'Daily Head Cost (BDT)' },
  { key: 'hourlyBdtCents', label: 'Hourly Cost (BDT)' },
  { key: 'monthlyUsdCents', label: 'Monthly Head Cost (USD)' },
  { key: 'dailyUsdCents', label: 'Daily Head Cost (USD)' },
  { key: 'hourlyUsdCents', label: 'Hourly Cost (USD)' },
] as const;
type MoneyField = (typeof MONEY_FIELDS)[number]['key'];

const centsToUnits = (cents: string | number) => (Number(cents) / 100).toFixed(2);
const unitsToCents = (units: string) => String(Math.round(Number(units) * 100));
const cellInvalid = (v: string) => v.trim() === '' || !Number.isFinite(Number(v)) || Number(v) < 0;

function RatesPanel() {
  return (
    <div className="flex flex-col gap-4">
      <RatesTable />
      <CurrencyCard />
    </div>
  );
}

function RatesTable() {
  const [rows, setRows] = useState<RateCard[] | null>(null);
  const [draft, setDraft] = useState<Record<string, Record<MoneyField, string>>>({});
  const [loadErr, setLoadErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [importing, setImporting] = useState(false);

  const hydrate = (list: RateCard[]) => {
    const d: Record<string, Record<MoneyField, string>> = {};
    for (const r of list) {
      d[r.id] = {} as Record<MoneyField, string>;
      for (const f of MONEY_FIELDS) d[r.id][f.key] = centsToUnits(r[f.key]);
    }
    setRows(list);
    setDraft(d);
  };

  const load = async () => {
    try {
      hydrate(await getRateCards());
    } catch (e) {
      setLoadErr(apiErrorMessage(e));
    }
  };
  useEffect(() => { void load(); }, []);

  const sorted = useMemo(
    () => [...(rows ?? [])].sort((a, b) => a.department.localeCompare(b.department) || a.role.localeCompare(b.role)),
    [rows],
  );

  const setCell = (id: string, field: MoneyField, value: string) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));

  const anyInvalid = useMemo(
    () => Object.values(draft).some((row) => MONEY_FIELDS.some((f) => cellInvalid(row[f.key]))),
    [draft],
  );

  const changedRows = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => MONEY_FIELDS.some((f) => draft[r.id] && draft[r.id][f.key] !== centsToUnits(r[f.key])));
  }, [rows, draft]);

  const dirty = changedRows.length > 0;

  const onSave = async () => {
    if (!dirty || anyInvalid) return;
    setSaving(true); setMsg(''); setSaveErr('');
    try {
      const payload = changedRows.map((r) => {
        const cents: Record<string, string> = {};
        for (const f of MONEY_FIELDS) cents[f.key] = unitsToCents(draft[r.id][f.key]);
        return { id: r.id, department: r.department, role: r.role, ...cents };
      });
      hydrate(await saveRateCards(payload));
      setMsg(`Saved ${payload.length} rate row${payload.length === 1 ? '' : 's'}.`);
    } catch (e) {
      setSaveErr(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const th = 'border-b border-[#D4D1CC] px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9A948E]';

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={H2}>Head-cost rates</h2>
          <div className={DESC}>
            Per-head monthly / daily / hourly cost used to ground generated budgets, ingested from Riseup&apos;s head-cost sheet.
            Edit any cell and Save, or replace the whole card from a spreadsheet.
          </div>
        </div>
        <button type="button" data-testid="set-rates-import" onClick={() => setImporting(true)} className={BTN_SECONDARY}>
          <Upload size={14} /> Upload CSV/Excel
        </button>
      </div>
      <div className={HR} />

      {loadErr && <p data-testid="rates-error" className={BAD}>{loadErr}</p>}
      {!rows && !loadErr && (
        <p data-testid="rates-loading" className="flex items-center gap-2 text-[13px] text-[#6B6660]">
          <Loader2 size={14} className="animate-spin" /> Loading rates…
        </p>
      )}

      {rows && sorted.length === 0 && (
        <div data-testid="rates-empty" className="rounded-lg border border-dashed border-[#D4D1CC] py-8 text-center text-[13px] text-[#6B6660]">
          No rate-card entries yet. Upload a spreadsheet to populate the card.
        </div>
      )}

      {rows && sorted.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table data-testid="rates-table" className="w-full border-collapse text-[13px] tabular-nums">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>Departments</th>
                  <th className={`${th} text-left`}>Heads</th>
                  {MONEY_FIELDS.map((f) => <th key={f.key} className={`${th} text-right`}>{f.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} data-testid={`rate-row-${r.id}`}>
                    <td className="border-b border-[#E8E6E3] px-2.5 py-2 whitespace-nowrap">{r.department}</td>
                    <td className="border-b border-[#E8E6E3] px-2.5 py-2 whitespace-nowrap">{r.role}</td>
                    {MONEY_FIELDS.map((f) => {
                      const v = draft[r.id]?.[f.key] ?? '';
                      const bad = cellInvalid(v);
                      return (
                        <td key={f.key} className="border-b border-[#E8E6E3] px-1.5 py-1.5 text-right">
                          <input
                            data-testid={`rate-cell-${r.id}-${f.key}`}
                            type="number"
                            min={0}
                            step="0.01"
                            value={v}
                            onChange={(e) => setCell(r.id, f.key, e.target.value)}
                            className={`h-8 w-[104px] rounded-md border px-2 text-right text-[13px] tabular-nums outline-none focus:border-[#EA5400] ${bad ? 'border-[#B42318] bg-[#FEF3F2]' : 'border-[#D4D1CC]'}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {anyInvalid && <p data-testid="rates-invalid" className={`mt-3 ${BAD}`}>Every cost must be a non-negative number.</p>}
          {msg && <p data-testid="rates-msg" className={`mt-3 ${OK}`}>{msg}</p>}
          {saveErr && <p data-testid="rates-save-error" className={`mt-3 ${BAD}`}>{saveErr}</p>}

          <div className="mt-4 flex items-center justify-end gap-3">
            {dirty && <span className="text-[12px] text-[#9A948E]">{changedRows.length} row{changedRows.length === 1 ? '' : 's'} changed</span>}
            <button type="button" data-testid="set-rates-save" disabled={!dirty || anyInvalid || saving} onClick={() => void onSave()} className={BTN_PRIMARY}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {saving ? 'Saving…' : 'Save rates'}
            </button>
          </div>
        </>
      )}

      {importing && (
        <RateImportModal
          onClose={() => setImporting(false)}
          onImported={async () => { setImporting(false); setMsg('Rate card replaced from the uploaded file.'); await load(); }}
        />
      )}
    </div>
  );
}

function RateImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RateImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const runPreview = async (f: File) => {
    setBusy(true); setErr(''); setPreview(null);
    try {
      setPreview(await previewRateImport(f));
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = (f: File | null) => {
    setFile(f);
    if (f) void runPreview(f);
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true); setErr('');
    try {
      await commitRateImport(preview.rows);
      await onImported();
    } catch (e) {
      setErr(apiErrorMessage(e));
      setBusy(false);
    }
  };

  const mappingEntries = preview ? Object.entries(preview.mapping) : [];

  return (
    <div data-testid="rate-import-modal" className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div className="max-h-[88vh] w-full max-w-[640px] overflow-auto rounded-xl border border-[#E8E6E3] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><Upload size={17} className="text-[#EA5400]" /> Import rate card</div>
        <p className="mb-4 text-xs text-[#9A948E]">
          Upload a .xlsx or .csv (≤5 MB). The AI maps your column <strong>headers</strong> onto the canonical fields only —
          every number is parsed straight from the file, never generated. Review the mapping, then replace the card.
        </p>

        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-3 text-[13px] font-medium hover:bg-[#F4F4F2]">
          <Upload size={14} /> {file ? 'Choose a different file' : 'Choose file'}
          <input data-testid="rate-import-file" type="file" accept=".xlsx,.csv" className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => pick(e.target.files?.[0] ?? null)} />
        </label>
        {file && <span className="ml-2 text-[13px] text-[#6B6660]">{file.name}</span>}

        {busy && !preview && (
          <p data-testid="rate-import-loading" className="mt-4 flex items-center gap-2 text-[13px] text-[#6B6660]">
            <Loader2 size={14} className="animate-spin" /> Reading &amp; mapping the file…
          </p>
        )}
        {err && <p data-testid="rate-import-error" className={`mt-4 ${BAD}`}>{err}</p>}

        {preview && (
          <div className="mt-4">
            <div data-testid="rate-import-summary" className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[#6B6660]">
              <span>Header row: <strong className="text-[#0F0F0F]">{preview.headerRow}</strong></span>
              <span>Parsed: <strong className="text-[#0E7C5A]">{preview.parsed}</strong></span>
              <span>Skipped: <strong className="text-[#B42318]">{preview.skipped}</strong></span>
            </div>

            <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#9A948E]">Column mapping</div>
            <div className="overflow-hidden rounded-lg border border-[#E8E6E3]">
              {mappingEntries.map(([header, field], i) => (
                <div key={header} data-testid={`rate-map-${i}`} className={`flex items-center justify-between gap-3 px-3 py-1.5 text-[13px] ${i > 0 ? 'border-t border-[#E8E6E3]' : ''}`}>
                  <span className="truncate text-[#0F0F0F]" title={header}>{header}</span>
                  <span className={field ? 'font-medium text-[#EA5400]' : 'text-[#9A948E]'}>{field ?? '— ignored —'}</span>
                </div>
              ))}
            </div>

            {preview.warnings.length > 0 && (
              <div data-testid="rate-import-warnings" className="mt-3 rounded-md border border-[#B8710A]/25 bg-[#B8710A]/10 px-3 py-2 text-[12.5px] text-[#B8710A]">
                {preview.warnings.map((w, i) => <div key={i}>{w}</div>)}
              </div>
            )}

            <div className="mb-1 mt-4 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#9A948E]">
              Preview — first {Math.min(10, preview.rows.length)} of {preview.rows.length} rows
            </div>
            <div className="overflow-x-auto rounded-lg border border-[#E8E6E3]">
              <table data-testid="rate-import-preview-table" className="w-full border-collapse text-[12.5px] tabular-nums">
                <thead>
                  <tr>
                    {['Department', 'Head', 'Daily USD', 'Daily BDT'].map((h, i) => (
                      <th key={i} className={`border-b border-[#E8E6E3] bg-[#FCFBFA] px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[#9A948E] ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 10).map((r, i) => (
                    <tr key={i} data-testid={`rate-import-row-${i}`}>
                      <td className="border-t border-[#E8E6E3] px-2.5 py-1.5">{r.department}</td>
                      <td className="border-t border-[#E8E6E3] px-2.5 py-1.5">{r.role}</td>
                      <td className="border-t border-[#E8E6E3] px-2.5 py-1.5 text-right">${centsToUnits(r.dailyUsdCents)}</td>
                      <td className="border-t border-[#E8E6E3] px-2.5 py-1.5 text-right">৳{centsToUnits(r.dailyBdtCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" data-testid="rate-import-cancel" disabled={busy} onClick={onClose} className="h-9 rounded-md border border-[#D4D1CC] px-4 text-sm font-medium hover:bg-[#F4F4F2]">Cancel</button>
          <button type="button" data-testid="rate-import-commit" disabled={!preview || busy} onClick={() => void commit()} className={BTN_PRIMARY}>
            {busy && preview ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Import &amp; replace
          </button>
        </div>
      </div>
    </div>
  );
}

function CurrencyCard() {
  const { settings, err: loadErr, reload } = useOrgSettings();
  const cur = settings?.currency;

  const [editingRate, setEditingRate] = useState(false);
  const [rate, setRate] = useState('');
  const [vat, setVat] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!cur) return;
    setRate(String(cur.usdBdt));
    setVat(String(cur.vatPercent));
  }, [cur]);

  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 3600); };

  const saveRate = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      await updateSettingsSection('currency', { usdBdt: Number(rate) });
      await reload();
      setEditingRate(false);
      flash('Exchange rate saved.');
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveVat = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      await updateSettingsSection('currency', { vatPercent: Number(vat) });
      await reload();
      flash('VAT saved.');
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setSyncing(true); setErr(''); setMsg('');
    try {
      await syncCurrency();
      await reload();
      flash('Fetched the live rate.');
    } catch (e) {
      setErr(apiErrorMessage(e)); // FX unreachable → keep the old value, show the error
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={CARD}>
      <h2 className={H2}>Currencies &amp; FX</h2>
      <div className={DESC}>The USD→BDT rate and default VAT. Rates are relative to USD.</div>
      <div className={HR} />

      {loadErr && <p data-testid="currency-error" className={BAD}>{loadErr}</p>}
      {!cur && !loadErr && (
        <p data-testid="currency-loading" className="flex items-center gap-2 text-[13px] text-[#6B6660]">
          <Loader2 size={14} className="animate-spin" /> Loading currency…
        </p>
      )}

      {cur && (
        <>
          <div className="grid max-w-[560px] grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={LABEL}>USD → BDT rate</label>
              {editingRate ? (
                <div className="flex items-center gap-2">
                  <input data-testid="set-fx-rate-input" type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className={`${INPUT} max-w-[140px]`} />
                  <button type="button" data-testid="set-fx-rate-save" disabled={busy} onClick={() => void saveRate()} className={BTN_PRIMARY}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  </button>
                  <button type="button" data-testid="set-fx-rate-cancel" disabled={busy} onClick={() => { setEditingRate(false); setRate(String(cur.usdBdt)); }} className={BTN_SECONDARY}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span data-testid="set-fx-rate" className="text-[18px] font-semibold tabular-nums">৳{cur.usdBdt.toFixed(2)}</span>
                  <button type="button" data-testid="set-fx-rate-edit" onClick={() => setEditingRate(true)} className={BTN_GHOST}><Pencil size={13} /> Edit</button>
                </div>
              )}
              <div data-testid="set-fx-synced" className={HINT}>
                {cur.syncedAt ? `Synced ${relativeTime(cur.syncedAt)}${cur.syncSource ? ` from ${cur.syncSource}` : ''}` : 'Never synced'}
              </div>
            </div>

            <div>
              <label htmlFor="set-vat" className={LABEL}>Default VAT (%)</label>
              <div className="flex items-center gap-2">
                <input id="set-vat" data-testid="set-vat" type="number" min={0} max={100} step="0.01" value={vat} onChange={(e) => setVat(e.target.value)} className={`${INPUT} max-w-[140px]`} />
                <button type="button" data-testid="set-vat-save" disabled={busy} onClick={() => void saveVat()} className={BTN_SECONDARY}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <button type="button" data-testid="set-fx-sync" disabled={syncing} onClick={() => void sync()} className={BTN_SECONDARY}>
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {syncing ? 'Syncing…' : 'Sync live rate'}
            </button>
          </div>

          {msg && <p data-testid="currency-msg" className={`mt-3 ${OK}`}>{msg}</p>}
          {err && <p data-testid="currency-save-error" className={`mt-3 ${BAD}`}>{err}</p>}

          <p className={`mt-4 ${HINT}`}>
            BDT budget prices come from the rate card&apos;s own BDT columns; this rate is for display/conversion only.
          </p>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// APPROVALS — requireAdminApproval / readinessThreshold / lossReasons
// ===========================================================================
function ApprovalsPanel() {
  const { settings, err: loadErr, reload } = useOrgSettings();
  const [requireApproval, setRequireApproval] = useState(true);
  const [threshold, setThreshold] = useState('80');
  const [reasons, setReasons] = useState<string[]>([]);
  const [newReason, setNewReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!settings) return;
    const a = settings.approvals;
    setRequireApproval(a.requireAdminApproval);
    setThreshold(String(a.readinessThreshold));
    setReasons(a.lossReasons);
  }, [settings]);

  const addReason = () => {
    const r = newReason.trim();
    if (!r || reasons.some((x) => x.toLowerCase() === r.toLowerCase())) { setNewReason(''); return; }
    setReasons((rs) => [...rs, r]);
    setNewReason('');
  };
  const removeReason = (r: string) => setReasons((rs) => rs.filter((x) => x !== r));

  const thresholdInvalid = threshold.trim() === '' || !Number.isFinite(Number(threshold)) || Number(threshold) < 0 || Number(threshold) > 100;

  const onSave = async () => {
    if (thresholdInvalid) return;
    setSaving(true); setMsg(''); setErr('');
    try {
      await updateSettingsSection('approvals', {
        requireAdminApproval: requireApproval,
        readinessThreshold: Number(threshold),
        lossReasons: reasons,
      });
      await reload();
      setMsg('Approval settings saved.');
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={CARD}>
        <h2 className={H2}>Approval workflow</h2>
        <div className={DESC}>Control the verification gate before a proposal can be delivered.</div>
        <div className={HR} />

        {loadErr && <p data-testid="approvals-error" className={BAD}>{loadErr}</p>}
        {!settings && !loadErr && (
          <p data-testid="approvals-loading" className="flex items-center gap-2 text-[13px] text-[#6B6660]">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </p>
        )}

        {settings && (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-[#E8E6E3] py-3.5">
              <div>
                <div className="text-sm font-medium">Require admin approval</div>
                <div className="mt-0.5 max-w-[440px] text-[12.5px] leading-[1.5] text-[#6B6660]">Proposals must be verified by an admin before they can be delivered to the client.</div>
              </div>
              <Toggle on={requireApproval} onChange={setRequireApproval} testid="set-require-approval" />
            </div>
            <div className="mt-4 max-w-[280px]">
              <label htmlFor="set-readiness-threshold" className={LABEL}>Readiness threshold</label>
              <input
                id="set-readiness-threshold"
                data-testid="set-readiness-threshold"
                type="number"
                min={0}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className={`${INPUT} ${thresholdInvalid ? 'border-[#B42318]' : ''}`}
              />
              <div className={HINT}>Minimum readiness score (0–100) before a proposal can be generated without an override.</div>
            </div>
          </>
        )}
      </div>

      {settings && (
        <div className={CARD}>
          <h2 className={H2}>Lost reasons</h2>
          <div className={DESC}>Options shown when a lead is marked Lost (feeds loss analytics).</div>
          <div className={HR} />
          <div className="flex flex-wrap items-center gap-2">
            {reasons.map((r) => (
              <span key={r} data-testid={`lossreason-${r}`} className="inline-flex h-[26px] items-center gap-1.5 rounded border border-[#E8E6E3] bg-[#F4F4F2] px-2.5 text-[12px] font-semibold text-[#6B6660]">
                {r}
                <button type="button" data-testid={`lossreason-remove-${r}`} onClick={() => removeReason(r)} className="text-[#9A948E] hover:text-[#B42318]"><X size={12} /></button>
              </span>
            ))}
            {reasons.length === 0 && <span className="text-[13px] text-[#9A948E]">No loss reasons yet.</span>}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              data-testid="set-lossreason-input"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReason(); } }}
              placeholder="Add a reason…"
              className={`${INPUT} max-w-[240px]`}
            />
            <button type="button" data-testid="set-add-lossreason" onClick={addReason} className={BTN_SECONDARY}><Plus size={14} /> Add</button>
          </div>

          {msg && <p data-testid="approvals-msg" className={`mt-4 ${OK}`}>{msg}</p>}
          {err && <p data-testid="approvals-save-error" className={`mt-4 ${BAD}`}>{err}</p>}

          <div className="mt-5 flex justify-end">
            <button type="button" data-testid="set-approvals-save" disabled={saving || thresholdInvalid} onClick={() => void onSave()} className={BTN_PRIMARY}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {saving ? 'Saving…' : 'Save approvals'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// BRANDING — companyName / website / contactEmail / colors / fileNaming / footer
// ===========================================================================
function BrandingPanel() {
  const { settings, err: loadErr, reload } = useOrgSettings();
  const [form, setForm] = useState<OrgSettings['branding'] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Company logo (separate from the branding form fields — uploaded via multipart, not saved with them).
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoErr, setLogoErr] = useState('');
  const [logoBust, setLogoBust] = useState(0); // cache-bust the preview after upload/remove
  const MAX_LOGO = 2 * 1024 * 1024;
  const logoSrc = `${API_BASE}/settings/branding/logo?v=${logoBust}`;

  useEffect(() => { if (settings) setForm({ ...settings.branding }); }, [settings]);

  const onPickLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after an error
    if (!file) return;
    setLogoErr('');
    if (!['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'].includes(file.type)) {
      setLogoErr('Please choose a PNG, JPG, SVG or WebP image.');
      return;
    }
    if (file.size > MAX_LOGO) {
      setLogoErr('Logo is too large — the maximum is 2 MB.');
      return;
    }
    setLogoBusy(true);
    try {
      await uploadBrandingLogo(file);
      await reload();           // refresh logoKey so every consumer + the Remove button update
      setLogoBust(Date.now());  // force the preview to reload the new image
    } catch (err2) {
      setLogoErr(apiErrorMessage(err2));
    } finally {
      setLogoBusy(false);
    }
  };

  const onRemoveLogo = async () => {
    setLogoErr('');
    setLogoBusy(true);
    try {
      await removeBrandingLogo();
      await reload();
      setLogoBust(Date.now());
    } catch (err2) {
      setLogoErr(apiErrorMessage(err2));
    } finally {
      setLogoBusy(false);
    }
  };

  const set = <K extends keyof OrgSettings['branding']>(key: K, value: OrgSettings['branding'][K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const onSave = async () => {
    if (!form) return;
    setSaving(true); setMsg(''); setErr('');
    try {
      // logoKey is managed by the upload/remove endpoints — never send it through the form save.
      await updateSettingsSection('branding', {
        companyName: form.companyName,
        website: form.website,
        contactEmail: form.contactEmail,
        primaryColor: form.primaryColor,
        textColor: form.textColor,
        fileNaming: form.fileNaming,
        footerText: form.footerText,
      });
      await reload();
      setMsg('Branding saved.');
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={CARD}>
      <h2 className={H2}>Branding</h2>
      <div className={DESC}>Applied to client-facing proposals, budgets and deliverables.</div>
      <div className={HR} />

      {loadErr && <p data-testid="branding-error" className={BAD}>{loadErr}</p>}
      {!form && !loadErr && (
        <p data-testid="branding-loading" className="flex items-center gap-2 text-[13px] text-[#6B6660]">
          <Loader2 size={14} className="animate-spin" /> Loading branding…
        </p>
      )}

      {form && (
        <>
          {/* Company logo — PUBLIC preview endpoint (404s to the bundled mark when unset). */}
          <label className={LABEL}>Company logo</label>
          <div className="mb-1 flex items-center gap-4">
            <img
              data-testid="set-logo-img"
              src={logoSrc}
              alt="Company logo"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/riseup-logo.svg'; }}
              className="h-14 w-auto max-w-[180px] shrink-0 rounded-md border border-[#E8E6E3] bg-white object-contain p-2"
            />
            <div>
              <input
                ref={logoInputRef}
                data-testid="set-logo-file"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => void onPickLogo(e)}
              />
              <div className="flex items-center gap-2">
                <button type="button" data-testid="set-logo-upload" disabled={logoBusy} onClick={() => logoInputRef.current?.click()} className={BTN_SECONDARY}>
                  {logoBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Replace logo
                </button>
                {form.logoKey && (
                  <button type="button" data-testid="set-logo-remove" disabled={logoBusy} onClick={() => void onRemoveLogo()} className={BTN_GHOST}>
                    <Trash2 size={14} /> Remove logo
                  </button>
                )}
              </div>
              <div className={HINT}>Used across Lead360 and embedded in every generated proposal PDF. PNG, JPG, SVG or WebP · up to 2 MB.</div>
              {logoErr && <div data-testid="set-logo-error" className="mt-1 text-[12px] text-[#B42318]">{logoErr}</div>}
            </div>
          </div>

          <div className={HR} />

          <ColorField
            label="Primary color"
            testid="primary"
            value={form.primaryColor}
            onChange={(v) => set('primaryColor', v)}
          />
          <div className="mt-3">
            <ColorField
              label="Text / charcoal"
              testid="ink"
              value={form.textColor}
              onChange={(v) => set('textColor', v)}
            />
          </div>

          <div className={HR} />
          <div className={GRID2}>
            <div>
              <label htmlFor="set-company-name" className={LABEL}>Company name</label>
              <input id="set-company-name" data-testid="set-company-name" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="set-company-web" className={LABEL}>Website</label>
              <input id="set-company-web" data-testid="set-company-web" value={form.website} onChange={(e) => set('website', e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="set-company-email" className={LABEL}>Contact email</label>
              <input id="set-company-email" data-testid="set-company-email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="set-file-naming" className={LABEL}>Deliverable file naming</label>
              <input id="set-file-naming" data-testid="set-file-naming" value={form.fileNaming} onChange={(e) => set('fileNaming', e.target.value)} className={INPUT} />
            </div>
          </div>
          <div className="mt-4 max-w-[560px]">
            <label htmlFor="set-footer" className={LABEL}>Proposal footer text</label>
            <textarea id="set-footer" data-testid="set-footer" value={form.footerText} onChange={(e) => set('footerText', e.target.value)} className={`${INPUT} min-h-16`} />
          </div>

          {msg && <p data-testid="branding-msg" className={`mt-4 ${OK}`}>{msg}</p>}
          {err && <p data-testid="branding-save-error" className={`mt-4 ${BAD}`}>{err}</p>}

          <div className="mt-5 flex justify-end">
            <button type="button" data-testid="set-branding-save" disabled={saving} onClick={() => void onSave()} className={BTN_PRIMARY}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {saving ? 'Saving…' : 'Save branding'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Color swatch + native color input + hex text input kept in sync.
function ColorField({ label, testid, value, onChange }: {
  label: string;
  testid: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = /^#([0-9a-fA-F]{6})$/.test(value);
  return (
    <div className="flex items-center gap-3">
      <span className="h-[34px] w-[34px] shrink-0 rounded-md border border-[#E8E6E3]" style={{ background: valid ? value : '#FFFFFF' }} />
      <div className="max-w-[220px]">
        <label className={LABEL}>{label}</label>
        <div className="flex items-center gap-2">
          <input
            data-testid={`set-color-${testid}`}
            type="color"
            value={valid ? value : '#000000'}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="h-[34px] w-[38px] cursor-pointer rounded-md border border-[#D4D1CC] p-0.5"
          />
          <input
            data-testid={`set-color-${testid}-hex`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${INPUT} ${valid ? '' : 'border-[#B42318]'}`}
          />
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// KNOWLEDGE BASE — fully wired: Database summary (getKbDocuments) + Trash
// ===========================================================================
function KbPanel() {
  return (
    <div className="flex flex-col gap-4">
      <KbSummary />
      <TrashSection />
    </div>
  );
}

function KbSummary() {
  const [docs, setDocs] = useState<KbDocument[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getKbDocuments()
      .then((d) => setDocs(d))
      .catch((e) => setErr(apiErrorMessage(e)));
  }, []);

  const bySection = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs ?? []) m.set(d.section, (m.get(d.section) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [docs]);

  return (
    <div className={CARD}>
      <h2 className={`flex items-center gap-2 ${H2}`}>
        <DatabaseIcon size={16} className="text-[#6B6660]" /> Database
      </h2>
      <div className={DESC}>Read-only overview of the Riseup Proposal &amp; Budget Database — the source documents that ground proposal generation.</div>
      <div className={HR} />

      {err && <p data-testid="kb-summary-error" className={BAD}>{err}</p>}

      {!docs && !err && (
        <p data-testid="kb-summary-loading" className="flex items-center gap-2 text-[13px] text-[#6B6660]">
          <Loader2 size={14} className="animate-spin" /> Loading database…
        </p>
      )}

      {docs && bySection.length === 0 && !err && (
        <div data-testid="kb-summary-empty" className="rounded-lg border border-dashed border-[#D4D1CC] py-8 text-center text-[13px] text-[#6B6660]">
          The Database is empty.
        </div>
      )}

      {docs && bySection.length > 0 && (
        <>
          <div className="mb-3 text-[13px] text-[#6B6660]">
            <strong className="text-[#0F0F0F]">{docs.length}</strong> document{docs.length === 1 ? '' : 's'} across {bySection.length} section{bySection.length === 1 ? '' : 's'}.
          </div>
          <div className="overflow-hidden rounded-lg border border-[#E8E6E3]">
            {bySection.map(([section, count], i) => (
              <div
                key={section}
                data-testid={`kb-section-${section}`}
                className={`flex items-center justify-between px-3.5 py-2.5 text-[13px] ${i > 0 ? 'border-t border-[#E8E6E3]' : ''}`}
              >
                <span className="text-[#0F0F0F]">{section}</span>
                <span className="font-semibold tabular-nums text-[#6B6660]">{count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type PurgeTarget = { kind: 'one'; item: KbTrashItem } | { kind: 'selected' } | { kind: 'all' };

// Settings > Trash — deleted Database documents. Restorable for 30 days (restore re-teaches the AI
// from the stored file); purging is permanent. Empty/selected/single purges all confirm first.
function TrashSection() {
  const [items, setItems] = useState<KbTrashItem[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<PurgeTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    getKbTrash()
      .then((t) => { setItems(t); setSelected(new Set()); })
      .catch((e) => setErr(apiErrorMessage(e)));
  useEffect(() => { load(); }, []);

  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 3200); };

  const toggle = (id: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () =>
    setSelected((s) => (s.size === (items?.length ?? 0) ? new Set() : new Set((items ?? []).map((i) => i.id))));

  const restore = async (item: KbTrashItem) => {
    setBusy(true);
    try {
      await restoreKbDocument(item.id);
      flash(`“${item.title}” restored to the Database (re-learned by the AI).`);
      await load();
    } catch (e) { setErr(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  const runPurge = async () => {
    if (!confirm) return;
    setBusy(true); setErr('');
    try {
      if (confirm.kind === 'one') await purgeKbTrash({ ids: [confirm.item.id] });
      else if (confirm.kind === 'selected') await purgeKbTrash({ ids: [...selected] });
      else await purgeKbTrash({ all: true });
      flash('Permanently deleted.');
      setConfirm(null);
      await load();
    } catch (e) { setErr(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  const confirmText =
    confirm?.kind === 'one'
      ? `“${confirm.item.title}” will be permanently deleted — file and record. This cannot be undone.`
      : confirm?.kind === 'selected'
        ? `${selected.size} selected document(s) will be permanently deleted — files and records. This cannot be undone.`
        : `ALL ${items?.length ?? 0} document(s) in the Trash will be permanently deleted. This cannot be undone.`;

  return (
    <div data-testid="settings-trash" className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className={`flex items-center gap-2 ${H2}`}><Trash2 size={16} className="text-[#6B6660]" /> Trash</h2>
          <p className="mt-1 text-[13px] text-[#6B6660]">Deleted Database documents stay here for <strong>30 days</strong>, then are removed automatically. Trashed files stop feeding the AI immediately.</p>
        </div>
        {(items?.length ?? 0) > 0 && (
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="trash-purge-selected"
              disabled={selected.size === 0 || busy}
              onClick={() => setConfirm({ kind: 'selected' })}
              className="h-8 rounded-md border border-[#D4D1CC] px-3 text-[13px] font-medium text-[#B42318] hover:bg-[#FEF3F2] disabled:opacity-40"
            >
              Delete selected ({selected.size})
            </button>
            <button
              type="button"
              data-testid="trash-purge-all"
              disabled={busy}
              onClick={() => setConfirm({ kind: 'all' })}
              className="h-8 rounded-md bg-[#B42318] px-3 text-[13px] font-medium text-white hover:bg-[#912018] disabled:opacity-40"
            >
              Empty trash
            </button>
          </div>
        )}
      </div>

      {err && <p data-testid="trash-error" className="mt-3 text-[13px] text-[#B42318]">{err}</p>}
      {msg && <p data-testid="trash-msg" className="mt-3 text-[13px] text-[#0E7C5A]">{msg}</p>}

      {!items ? (
        <p className="mt-4 text-[13px] text-[#6B6660]">Loading trash…</p>
      ) : items.length === 0 ? (
        <div data-testid="trash-empty" className="mt-4 rounded-lg border border-dashed border-[#D4D1CC] py-8 text-center text-[13px] text-[#6B6660]">
          <Trash2 size={22} className="mx-auto mb-2 text-[#9A948E]" /> Trash is empty.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-[#E8E6E3]">
          <div className="flex items-center gap-3 border-b border-[#E8E6E3] bg-[#FCFBFA] px-3.5 py-2 text-[12px] font-semibold text-[#9A948E]">
            <input data-testid="trash-select-all" type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} className="h-4 w-4 accent-[#EA5400]" />
            <span>Select all</span>
          </div>
          {items.map((t, i) => (
            <div key={t.id} data-testid={`trash-row-${t.id}`} className={`flex items-center gap-3 px-3.5 py-[10px] ${i > 0 ? 'border-t border-[#E8E6E3]' : ''}`}>
              <input type="checkbox" data-testid={`trash-check-${t.id}`} checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="h-4 w-4 shrink-0 accent-[#EA5400]" />
              <FileTypeBadge fileType={t.fileType} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium" title={t.title}>{t.title}</div>
                <div className="text-[11px] text-[#9A948E]">{t.category} · {t.section} · deleted {new Date(t.deletedAt).toLocaleDateString()}</div>
              </div>
              <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${t.daysLeft <= 5 ? 'bg-[#FEF3F2] text-[#B42318]' : 'bg-[#F4F4F2] text-[#6B6660]'}`}>
                {t.daysLeft}d left
              </span>
              <button type="button" data-testid={`trash-restore-${t.id}`} disabled={busy} onClick={() => void restore(t)} title="Restore" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[#D4D1CC] px-2.5 text-[12px] font-medium hover:bg-[#F4F4F2] disabled:opacity-40">
                <RotateCcw size={13} /> Restore
              </button>
              <button type="button" data-testid={`trash-delete-${t.id}`} disabled={busy} onClick={() => setConfirm({ kind: 'one', item: t })} title="Delete forever" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#9A948E] hover:bg-[#FEF3F2] hover:text-[#B42318] disabled:opacity-40">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <div data-testid="trash-confirm-modal" className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4" onClick={() => !busy && setConfirm(null)}>
          <div className="w-full max-w-[420px] rounded-xl border border-[#E8E6E3] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><AlertTriangle size={17} className="text-[#B42318]" /> Delete forever?</div>
            <p className="text-[13px] leading-relaxed text-[#6B6660]">{confirmText}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" data-testid="trash-confirm-no" disabled={busy} onClick={() => setConfirm(null)} className="h-9 rounded-md border border-[#D4D1CC] px-4 text-sm font-medium hover:bg-[#F4F4F2]">No, cancel</button>
              <button type="button" data-testid="trash-confirm-yes" disabled={busy} onClick={() => void runPurge()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#B42318] px-4 text-sm font-medium text-white hover:bg-[#912018] disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Yes, delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// DELIVERY & INTEGRATIONS — settings.delivery (email + Slack/Zoom)
// ===========================================================================
const PROVIDER_OPTIONS = [
  { value: 'ses', label: 'AWS SES' },
  { value: 'smtp', label: 'SMTP' },
];

function DeliveryPanel() {
  const { settings, err: loadErr, reload } = useOrgSettings();
  const [form, setForm] = useState<OrgSettings['delivery'] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { if (settings) setForm({ ...settings.delivery }); }, [settings]);

  const set = <K extends keyof OrgSettings['delivery']>(key: K, value: OrgSettings['delivery'][K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const onSave = async () => {
    if (!form) return;
    setSaving(true); setMsg(''); setErr('');
    try {
      // emailEnabled can only be true when the environment allows it — the API rejects it otherwise,
      // so never send true when EMAIL_ENABLED=false.
      const emailEnabled = form.emailEnabledEnv ? form.emailEnabled : false;
      await updateSettingsSection('delivery', {
        emailEnabled,
        provider: form.provider,
        smtpHost: form.smtpHost,
        fromAddress: form.fromAddress,
        replyTo: form.replyTo,
        // Slack/Zoom are display-only until the integrations exist — never written back.
      });
      await reload();
      setMsg('Delivery settings saved.');
    } catch (e) {
      setErr(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={CARD}>
        <h2 className={H2}>Deliverables</h2>
        <div className={DESC}>How each lead is delivered to the client. These formats are always produced.</div>
        <div className={HR} />
        <div className="flex items-start justify-between gap-4 border-b border-[#E8E6E3] py-3.5">
          <div>
            <div className="text-sm font-medium">Proposal — PDF</div>
            <div className="mt-0.5 text-[12.5px] text-[#6B6660]">Branded, print-ready PDF.</div>
          </div>
          <span className="inline-flex h-[22px] items-center rounded-full bg-[#0E7C5A]/10 px-2.5 text-[11.5px] font-semibold text-[#0E7C5A]">Always on</span>
        </div>
        <div className="flex items-start justify-between gap-4 py-3.5">
          <div>
            <div className="text-sm font-medium">Budget — Excel (.xlsx)</div>
            <div className="mt-0.5 text-[12.5px] text-[#6B6660]">Excel matching the Riseup budget format.</div>
          </div>
          <span className="inline-flex h-[22px] items-center rounded-full bg-[#0E7C5A]/10 px-2.5 text-[11.5px] font-semibold text-[#0E7C5A]">Always on</span>
        </div>
      </div>

      {loadErr && <div className={CARD}><p data-testid="delivery-error" className={BAD}>{loadErr}</p></div>}
      {!form && !loadErr && (
        <div className={CARD}>
          <p data-testid="delivery-loading" className="flex items-center gap-2 text-[13px] text-[#6B6660]">
            <Loader2 size={14} className="animate-spin" /> Loading delivery settings…
          </p>
        </div>
      )}

      {form && (
        <>
          <div className={CARD}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className={H2}>Email delivery</h2>
                <div className={DESC}>Send documents to clients from within Lead360.</div>
              </div>
              {!form.emailEnabledEnv && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#B8710A]/25 bg-[#B8710A]/10 px-2.5 py-1 text-[11.5px] font-semibold text-[#B8710A]">
                  <PowerOff size={12} /> Disabled for production
                </span>
              )}
            </div>
            <div className={HR} />
            <div className="flex items-start justify-between gap-4 border-b border-[#E8E6E3] py-3.5">
              <div>
                <div className="text-sm font-medium">Enable email delivery</div>
                <div className="mt-0.5 max-w-[440px] text-[12.5px] leading-[1.5] text-[#6B6660]">
                  {form.emailEnabledEnv
                    ? 'When on, deliverables can be emailed to clients directly.'
                    : 'Email delivery is disabled in this environment (EMAIL_ENABLED=false). Until enabled, deliver by downloading the PDF + Excel and sending them yourself.'}
                </div>
              </div>
              <Toggle on={form.emailEnabled} disabled={!form.emailEnabledEnv} onChange={(v) => set('emailEnabled', v)} testid="set-email-enabled" />
            </div>

            <div className="mt-4 grid max-w-[560px] grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label htmlFor="set-smtp-host" className={LABEL}>SMTP host</label>
                <input id="set-smtp-host" data-testid="set-smtp-host" value={form.smtpHost} onChange={(e) => set('smtpHost', e.target.value)} placeholder="smtp.provider.com" className={INPUT} />
              </div>
              <div>
                <label htmlFor="set-smtp-from" className={LABEL}>From address</label>
                <input id="set-smtp-from" data-testid="set-smtp-from" value={form.fromAddress} onChange={(e) => set('fromAddress', e.target.value)} placeholder="sales@riseuplabs.com" className={INPUT} />
              </div>
              <div>
                <label htmlFor="set-smtp-replyto" className={LABEL}>Reply-to</label>
                <input id="set-smtp-replyto" data-testid="set-smtp-replyto" value={form.replyTo} onChange={(e) => set('replyTo', e.target.value)} placeholder="reply@riseuplabs.com" className={INPUT} />
              </div>
              <div>
                <label htmlFor="set-smtp-provider" className={LABEL}>Provider</label>
                <select id="set-smtp-provider" data-testid="set-smtp-provider" value={form.provider} onChange={(e) => set('provider', e.target.value)} className={SELECT}>
                  {PROVIDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className={CARD}>
            <h2 className={H2}>Integrations</h2>
            <div className={DESC}>Optional channels. The switch is stored but nothing is sent yet.</div>
            <div className={HR} />
            <div className="flex items-start justify-between gap-4 border-b border-[#E8E6E3] py-3.5">
              <div>
                <div className="text-sm font-medium">Slack</div>
                <div className="mt-0.5 text-[12.5px] text-[#6B6660]">Not yet available — this integration isn't built.</div>
              </div>
              <Toggle on={form.slackEnabled} onChange={(v) => set('slackEnabled', v)} disabled testid="set-slack" />
            </div>
            <div className="flex items-start justify-between gap-4 py-3.5">
              <div>
                <div className="text-sm font-medium">Zoom</div>
                <div className="mt-0.5 text-[12.5px] text-[#6B6660]">Not yet available — this integration isn't built.</div>
              </div>
              <Toggle on={form.zoomEnabled} onChange={(v) => set('zoomEnabled', v)} disabled testid="set-zoom" />
            </div>

            {msg && <p data-testid="delivery-msg" className={`mt-4 ${OK}`}>{msg}</p>}
            {err && <p data-testid="delivery-save-error" className={`mt-4 ${BAD}`}>{err}</p>}

            <div className="mt-5 flex justify-end">
              <button type="button" data-testid="set-delivery-save" disabled={saving} onClick={() => void onSave()} className={BTN_PRIMARY}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {saving ? 'Saving…' : 'Save delivery settings'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// SECURITY & AUDIT — real audit log (GET /audit?limit=50)
// ===========================================================================
function AuditPanel() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    getAudit(50)
      .then((r) => setRows(r))
      .catch((e) => setErr(apiErrorMessage(e)));
  }, []);

  return (
    <div className={CARD}>
      <h2 className={H2}>Audit log</h2>
      <div className={DESC}>Recent approvals, imports and setting changes.</div>
      <div className={HR} />

      {err && <p data-testid="audit-error" className={BAD}>{err}</p>}

      {!rows && !err && (
        <p data-testid="audit-loading" className="flex items-center gap-2 text-[13px] text-[#6B6660]">
          <Loader2 size={14} className="animate-spin" /> Loading audit log…
        </p>
      )}

      {rows && rows.length === 0 && !err && (
        <div data-testid="audit-empty" className="rounded-lg border border-dashed border-[#D4D1CC] py-10 text-center text-[13px] text-[#6B6660]">
          <ScrollText size={22} className="mx-auto mb-2 text-[#9A948E]" />
          No audit entries yet.
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table data-testid="audit-table" className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>
                {['When', 'Who', 'Action', 'Entity'].map((h) => (
                  <th key={h} className="border-b border-[#D4D1CC] px-3 pb-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9A948E]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid={`audit-row-${r.id}`}>
                  <td className="border-b border-[#E8E6E3] px-3 py-2.5 whitespace-nowrap text-[#6B6660]">{relativeTime(r.createdAt)}</td>
                  <td className="border-b border-[#E8E6E3] px-3 py-2.5">{r.actor ?? 'System'}</td>
                  <td className="border-b border-[#E8E6E3] px-3 py-2.5 font-medium">{r.action.replace(/\./g, ' · ')}</td>
                  <td className="border-b border-[#E8E6E3] px-3 py-2.5 text-[#6B6660]">{r.entity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

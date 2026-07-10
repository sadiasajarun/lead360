import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2, RotateCcw, AlertTriangle, Loader2, Upload } from 'lucide-react';
import FileTypeBadge from '~/components/atoms/FileTypeBadge';
import { useAuth } from '~/contexts/AuthContext';
import { useAppDispatch } from '~/redux/store/hooks';
import { changePassword, fetchMe, updateProfile, uploadAvatar, removeAvatar } from '~/services/httpServices/authService';
import { getKbTrash, restoreKbDocument, purgeKbTrash } from '~/services/httpServices/kbService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import { useAvatarUrl } from '~/lib/avatar';
import type { KbTrashItem } from '~/types/kb';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(6),
    newPassword: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'mismatch',
  });
type PasswordValues = z.infer<typeof passwordSchema>;

const inputCls = 'mt-1.5 h-10 w-full rounded-md border border-[#D4D1CC] px-3 text-sm outline-none focus:border-[#EA5400]';

export default function Settings() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  // Name falls back to the email's unique local part (farah.karim@… -> farah.karim) until set.
  const [name, setName] = useState(user?.name || user?.email?.split('@')[0] || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  const currentAvatar = useAvatarUrl(user?.avatarUrl);
  const initials = (name || user?.email || '?')
    .split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarErr, setAvatarErr] = useState('');
  const MAX_AVATAR = 2 * 1024 * 1024;

  const onPickAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
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
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  const onChangePassword = async (values: PasswordValues) => {
    setPwErr('');
    setPwMsg('');
    try {
      await changePassword(values.currentPassword, values.newPassword);
      setPwMsg('Password changed. Other sessions have been signed out.');
      reset();
    } catch (e) {
      setPwErr(apiErrorMessage(e));
    }
  };

  return (
    <div data-testid="settings-page" className="max-w-[560px]">
      <h1 className="mb-5 text-[22px] font-semibold">Settings</h1>
      <div className="rounded-lg border border-[#E8E6E3] bg-white p-5">
        <h2 className="text-[15px] font-semibold">Profile</h2>

        <div className="mt-4 flex items-center gap-4">
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
              <button
                type="button"
                data-testid="set-avatar-upload"
                disabled={avatarBusy}
                onClick={() => fileRef.current?.click()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-3 text-[13px] font-medium hover:bg-[#F4F4F2] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {avatarBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload photo
              </button>
              {currentAvatar && (
                <button
                  type="button"
                  data-testid="set-avatar-remove"
                  disabled={avatarBusy}
                  onClick={() => void onRemoveAvatar()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-[#6B6660] hover:bg-[#F4F4F2] hover:text-[#0F0F0F] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Trash2 size={14} /> Remove photo
                </button>
              )}
            </div>
            <div className="mt-1.5 text-[12px] text-[#9A948E]">PNG, JPG or WebP · up to 2 MB.</div>
            {avatarErr && <div data-testid="set-avatar-error" className="mt-1 text-[12px] text-[#B42318]">{avatarErr}</div>}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <label className="text-[13px] font-semibold">
            Name
            <input data-testid="set-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </label>
          <label className="text-[13px] font-semibold">
            Email
            <input data-testid="set-email" defaultValue={user?.email} disabled className="mt-1.5 h-10 w-full rounded-md border border-[#E8E6E3] bg-[#F4F4F2] px-3 text-sm text-[#6B6660]" />
          </label>
          <div className="text-[13px] text-[#6B6660]">
            Role: <span className="font-semibold capitalize">{user?.role?.replace('_', ' ')}</span>
          </div>
        </div>
        {msg && <p data-testid="set-msg" className="mt-3 text-[13px] text-[#0E7C5A]">{msg}</p>}
        <button
          data-testid="set-save"
          disabled={saving || !name.trim()}
          onClick={async () => {
            setSaving(true); setMsg('');
            try {
              await updateProfile(name);
              await dispatch(fetchMe()); // refresh the auth store so the sidebar chip updates too
              setMsg('Saved.');
            } catch (e) {
              setMsg(apiErrorMessage(e));
            } finally {
              setSaving(false);
            }
          }}
          className="mt-4 h-9 rounded-md bg-[#EA5400] px-4 text-sm font-medium text-white hover:bg-[#CC4900] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-[#E8E6E3] bg-white p-5">
        <h2 className="text-[15px] font-semibold">Change password</h2>
        <p className="mt-1 text-[13px] text-[#6B6660]">Changing your password signs you out everywhere else.</p>
        <form onSubmit={handleSubmit(onChangePassword)} className="mt-4 flex flex-col gap-3">
          <label className="text-[13px] font-semibold">
            Current password
            <input data-testid="set-pw-current" type="password" autoComplete="current-password" {...register('currentPassword')} className={inputCls} />
            {errors.currentPassword && <span className="mt-1 block text-xs font-normal text-[#B42318]">Enter your current password (min 6 characters)</span>}
          </label>
          <label className="text-[13px] font-semibold">
            New password
            <input data-testid="set-pw-new" type="password" autoComplete="new-password" {...register('newPassword')} className={inputCls} />
            {errors.newPassword && <span className="mt-1 block text-xs font-normal text-[#B42318]">Min 8 characters</span>}
          </label>
          <label className="text-[13px] font-semibold">
            Confirm new password
            <input data-testid="set-pw-confirm" type="password" autoComplete="new-password" {...register('confirmPassword')} className={inputCls} />
            {errors.confirmPassword && <span className="mt-1 block text-xs font-normal text-[#B42318]">Passwords do not match</span>}
          </label>
          {pwErr && <p data-testid="set-pw-error" className="text-[13px] text-[#B42318]">{pwErr}</p>}
          {pwMsg && <p data-testid="set-pw-msg" className="text-[13px] text-[#0E7C5A]">{pwMsg}</p>}
          <button data-testid="set-pw-submit" type="submit" disabled={isSubmitting} className="h-9 self-start rounded-md bg-[#EA5400] px-4 text-sm font-medium text-white hover:bg-[#CC4900] disabled:opacity-50">
            {isSubmitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>

      <TrashSection />
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
    <div data-testid="settings-trash" className="mt-4 rounded-lg border border-[#E8E6E3] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Trash2 size={16} className="text-[#6B6660]" /> Trash</h2>
          <p className="mt-1 text-[13px] text-[#6B6660]">Deleted Database documents stay here for <strong>30 days</strong>, then are removed automatically. Trashed files stop feeding the AI immediately.</p>
        </div>
        {(items?.length ?? 0) > 0 && (
          <div className="flex gap-2">
            <button
              data-testid="trash-purge-selected"
              disabled={selected.size === 0 || busy}
              onClick={() => setConfirm({ kind: 'selected' })}
              className="h-8 rounded-md border border-[#D4D1CC] px-3 text-[13px] font-medium text-[#B42318] hover:bg-[#FEF3F2] disabled:opacity-40"
            >
              Delete selected ({selected.size})
            </button>
            <button
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
          {items.map((t, i) => {
            return (
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
                <button data-testid={`trash-restore-${t.id}`} disabled={busy} onClick={() => void restore(t)} title="Restore" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[#D4D1CC] px-2.5 text-[12px] font-medium hover:bg-[#F4F4F2] disabled:opacity-40">
                  <RotateCcw size={13} /> Restore
                </button>
                <button data-testid={`trash-delete-${t.id}`} disabled={busy} onClick={() => setConfirm({ kind: 'one', item: t })} title="Delete forever" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#9A948E] hover:bg-[#FEF3F2] hover:text-[#B42318] disabled:opacity-40">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {confirm && (
        <div data-testid="trash-confirm-modal" className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4" onClick={() => !busy && setConfirm(null)}>
          <div className="w-full max-w-[420px] rounded-xl border border-[#E8E6E3] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><AlertTriangle size={17} className="text-[#B42318]" /> Delete forever?</div>
            <p className="text-[13px] leading-relaxed text-[#6B6660]">{confirmText}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button data-testid="trash-confirm-no" disabled={busy} onClick={() => setConfirm(null)} className="h-9 rounded-md border border-[#D4D1CC] px-4 text-sm font-medium hover:bg-[#F4F4F2]">No, cancel</button>
              <button data-testid="trash-confirm-yes" disabled={busy} onClick={() => void runPurge()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#B42318] px-4 text-sm font-medium text-white hover:bg-[#912018] disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Yes, delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

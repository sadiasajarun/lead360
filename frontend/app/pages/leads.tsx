import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AlertTriangle, Calculator, Coins, Eye, History, Loader2, Search, Sun, Trash2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '~/redux/store/hooks';
import { fetchLeads, deleteLead } from '~/services/httpServices/leadService';
import { fetchTokenStats } from '~/services/httpServices/generationService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import { useRoleBase } from '~/hooks/useRoleBase';
import { LeadStatus, STATUS_ORDER, TemplateType } from '~/enums/lead.enum';
import { formatMoneyWhole } from '~/enums/currency.enum';
import StatusPill, { STATUS_LABEL } from '~/components/atoms/StatusPill';
import type { Lead, LeadFilters } from '~/types/lead';

const TEMPLATE_LABEL: Record<string, string> = {
  [TemplateType.GLOBAL]: 'Global',
  [TemplateType.LOCAL]: 'Local',
  [TemplateType.AGENCY]: 'Agency',
  [TemplateType.DESIGN_PORTFOLIO]: 'Design Portfolio',
};

/**
 * Date-range presets. They filter on CREATION time, because that is the only date every lead has —
 * a draft has no `submittedAt`, and `updatedAt` moves every time anyone touches the record, so
 * neither works as a stable "when did this lead happen" axis.
 */
const RANGES: Record<string, { label: string; from?: () => Date }> = {
  '': { label: 'All time' },
  month: { label: 'This month', from: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
  d30: { label: 'Last 30 days', from: () => new Date(Date.now() - 30 * 86_400_000) },
  d90: { label: 'Last 90 days', from: () => new Date(Date.now() - 90 * 86_400_000) },
  year: { label: 'This year', from: () => new Date(new Date().getFullYear(), 0, 1) },
};

const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
const fullDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '');

// Compact token count (2.9M / 12.4k / 840) for the stat cards; full value shown on hover.
const fmtTokens = (n?: number) => {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
};
// USD cost — 2 dp for ≥ $1, 4 dp for the small buckets so cents-scale values stay legible.
const fmtUsd = (n?: number) => (n == null ? '—' : `$${n >= 1 ? n.toFixed(2) : n.toFixed(4)}`);

export default function Leads() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isAdmin, leadPath, newLeadPath } = useRoleBase();
  const { items, total, status, error } = useAppSelector((s) => s.leads);
  const tokenStats = useAppSelector((s) => s.tokenStats);
  useEffect(() => void dispatch(fetchTokenStats()), [dispatch]);

  // Filters live in the URL: reloads and shared links keep the same view. Bad params are ignored.
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const rawStatus = params.get('status') ?? '';
  const rawTemplate = params.get('template') ?? '';
  const range = params.get('range') && RANGES[params.get('range') as string] ? (params.get('range') as string) : '';
  const statusFilter = (Object.values(LeadStatus) as string[]).includes(rawStatus) ? (rawStatus as LeadStatus) : undefined;
  const templateFilter = (Object.values(TemplateType) as string[]).includes(rawTemplate) ? (rawTemplate as TemplateType) : undefined;
  const hasFilters = !!(q || statusFilter || templateFilter || range);

  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState('');

  // Debounce the free-text search so typing doesn't fire a request per keystroke.
  const [qDraft, setQDraft] = useState(q);
  useEffect(() => setQDraft(q), [q]);
  useEffect(() => {
    if (qDraft === q) return;
    const t = window.setTimeout(() => setParam('q', qDraft), 350);
    return () => window.clearTimeout(t);
  }, [qDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = () => {
    const filters: LeadFilters = { limit: 100 };
    if (q) filters.q = q;
    if (statusFilter) filters.status = statusFilter;
    if (templateFilter) filters.template = templateFilter;
    const from = RANGES[range]?.from?.();
    if (from) filters.from = from.toISOString();
    dispatch(fetchLeads(filters));
  };
  useEffect(load, [dispatch, q, statusFilter, templateFilter, range]); // eslint-disable-line react-hooks/exhaustive-deps

  const setParam = (key: string, value: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (value) n.set(key, value);
        else n.delete(key);
        return n;
      },
      { replace: true },
    );
  const clearAll = () => setParams(new URLSearchParams(), { replace: true });

  const askDelete = (e: MouseEvent, lead: Lead) => {
    e.stopPropagation();
    setConfirmDelete(lead);
  };
  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setMsg('');
    try {
      await deleteLead(confirmDelete.id);
      setConfirmDelete(null);
      load();
    } catch (err) {
      setMsg(apiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const selectCls =
    'h-9 rounded-md border border-[#D4D1CC] bg-white px-2.5 text-[13px] font-medium text-[#475467] outline-none focus:border-[#EA5400]';

  // AI token-usage dashboard cards. Values are undefined until the stats load → formatters render "—".
  const ts = tokenStats.data;
  const loadingStats = tokenStats.status === 'loading' && !ts;
  const statCards: { key: string; label: string; icon: LucideIcon; tokens?: number; cost?: number; sub: string }[] = [
    { key: 'lifetime', label: 'Lifetime tokens', icon: Coins, tokens: ts?.lifetime.tokens, cost: ts?.lifetime.costUsd, sub: 'all generations' },
    { key: 'avg', label: 'Avg / proposal', icon: Calculator, tokens: ts?.avgPerProposal.tokens, cost: ts?.avgPerProposal.costUsd, sub: ts ? `across ${ts.avgPerProposal.proposals} proposal${ts.avgPerProposal.proposals === 1 ? '' : 's'}` : ' ' },
    { key: 'today', label: 'Today', icon: Sun, tokens: ts?.today.tokens, cost: ts?.today.costUsd, sub: 'since midnight' },
    { key: 'yesterday', label: 'Yesterday', icon: History, tokens: ts?.yesterday.tokens, cost: ts?.yesterday.costUsd, sub: 'full day' },
  ];

  return (
    <div data-testid="leads-page">
      <div className="mb-1.5 flex items-center justify-between">
        <h1 className="text-[22px] font-semibold">Leads</h1>
        <Link to={newLeadPath} data-testid="leads-new" className="h-9 rounded-md bg-[#EA5400] px-4 text-sm font-medium leading-9 text-white hover:bg-[#CC4900]">+ New Lead</Link>
      </div>
      {isAdmin && (
        <p className="mb-5 text-[13px] text-[#6B6660]">
          Your own leads plus every lead submitted for approval. Leads you create are auto-approved and filed into Projects → Database.
        </p>
      )}

      {/* AI token-usage dashboard — lifetime, average per proposal, today, yesterday (USD cost in each corner) */}
      <div data-testid="leads-token-stats" className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} data-testid={`leads-stat-${c.key}`} className="relative overflow-hidden rounded-lg border border-[#E8E6E3] bg-white p-4">
              <span
                data-testid={`leads-stat-${c.key}-cost`}
                title="Estimated USD cost at current model rates"
                className="absolute right-3 top-3 text-[11px] font-medium tabular-nums text-[#EA5400]"
              >
                {loadingStats ? '…' : fmtUsd(c.cost)}
              </span>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">
                <Icon size={13} className="text-[#9A948E]" /> {c.label}
              </div>
              <div
                title={c.tokens != null ? `${c.tokens.toLocaleString()} tokens` : ''}
                className="mt-2 text-[22px] font-semibold leading-none tabular-nums text-[#0F0F0F]"
              >
                {loadingStats ? '—' : fmtTokens(c.tokens)}
              </div>
              <div className="mt-1 text-[11px] text-[#9A948E]">{c.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Search + three filters + clear */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9A948E]" />
          <input
            data-testid="leads-search"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Search lead or company…"
            className="h-9 w-[260px] rounded-md border border-[#D4D1CC] bg-white pl-8 pr-2.5 text-[13px] outline-none focus:border-[#EA5400]"
          />
        </div>
        <select data-testid="leads-filter-template" value={rawTemplate} onChange={(e) => setParam('template', e.target.value)} className={selectCls}>
          <option value="">All templates</option>
          {Object.entries(TEMPLATE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select data-testid="leads-filter-status" value={rawStatus} onChange={(e) => setParam('status', e.target.value)} className={selectCls}>
          <option value="">All statuses</option>
          {STATUS_ORDER.map((v) => <option key={v} value={v}>{STATUS_LABEL[v]}</option>)}
        </select>
        <select data-testid="leads-filter-range" value={range} onChange={(e) => setParam('range', e.target.value)} title="Filters on when the lead was created" className={selectCls}>
          {Object.entries(RANGES).map(([v, r]) => <option key={v} value={v}>{r.label}</option>)}
        </select>
        {hasFilters && (
          <button data-testid="leads-filter-clear" onClick={clearAll} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-[#6B6660] hover:bg-[#F4F4F2] hover:text-[#0F0F0F]">
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {status === 'succeeded' && (
        <p data-testid="leads-count" className="mb-3 text-[13px] text-[#9A948E]">
          Showing {items.length} of {total} lead{total === 1 ? '' : 's'}
        </p>
      )}

      {status === 'loading' && <div data-testid="leads-loading" className="text-sm text-[#6B6660]">Loading…</div>}
      {status === 'failed' && <div data-testid="leads-error" className="text-sm text-[#B42318]">{error}</div>}
      {status === 'succeeded' && items.length === 0 && (
        <div data-testid="leads-empty" className="rounded-lg border border-dashed border-[#D4D1CC] p-14 text-center text-sm text-[#6B6660]">
          {hasFilters ? (
            <>
              No leads match these filters.
              <div className="mt-2"><button onClick={clearAll} className="text-xs font-medium text-[#EA5400] hover:underline">Clear filters</button></div>
            </>
          ) : (
            'No leads yet — create one to get started.'
          )}
        </div>
      )}
      {msg && <div data-testid="leads-msg" className="mb-3 text-[13px] text-[#B42318]">{msg}</div>}

      {status === 'succeeded' && items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-[#E8E6E3] bg-white">
          <table data-testid="leads-table" className="w-full text-sm">
            <thead className="bg-[#F4F4F2] text-left text-xs uppercase tracking-wide text-[#9A948E]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Lead / Company</th>
                <th className="px-4 font-semibold">Template</th>
                <th className="px-4 font-semibold">Status</th>
                <th className="px-4 text-right font-semibold">Value</th>
                <th className="px-4 font-semibold">Submitted</th>
                <th className="px-4 font-semibold">Updated</th>
                <th className="px-4 text-right font-semibold" />
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} data-testid={`leads-row-${l.id}`} onClick={() => navigate(leadPath(l.id))} className="h-11 border-t border-[#E8E6E3] hover:bg-[#F4F4F2]">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{l.title}</div>
                    <div className="text-xs text-[#6B6660]">{l.company}</div>
                  </td>
                  <td className="px-4">
                    <span className="rounded border border-[#E8E6E3] bg-[#F4F4F2] px-2 py-0.5 text-[11px] font-medium text-[#475467]">
                      {TEMPLATE_LABEL[l.template] ?? l.template}
                    </span>
                  </td>
                  <td className="px-4">
                    <StatusPill
                      data-testid={`leads-status-${l.id}`}
                      status={l.status}
                      suffix={l.status === LeadStatus.LOST ? l.lossReason : null}
                    />
                  </td>
                  <td className="px-4 text-right tabular-nums">{formatMoneyWhole(l.valueCents, l.budgetCurrency || 'USD')}</td>
                  {/* Submitted: blank for never-submitted drafts — the tooltip explains why. */}
                  <td className="px-4 text-[13px] text-[#9A948E]" title={l.submittedAt ? fullDate(l.submittedAt) : `Not submitted yet · created ${fullDate(l.createdAt)}`}>
                    {shortDate(l.submittedAt)}
                  </td>
                  <td className="px-4 text-[13px] text-[#9A948E]" title={fullDate(l.updatedAt)}>{shortDate(l.updatedAt)}</td>
                  <td className="px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to={leadPath(l.id)}
                        data-testid={`leads-view-${l.id}`}
                        title="Open lead"
                        aria-label={`Open ${l.title}`}
                        onClick={(e) => e.stopPropagation()}
                        className="grid h-8 w-8 place-items-center rounded-md text-[#9A948E] hover:bg-[#F4F4F2] hover:text-[#0F0F0F]"
                      >
                        <Eye size={15} />
                      </Link>
                      <button
                        data-testid={`leads-delete-${l.id}`}
                        title="Delete lead"
                        aria-label={`Delete ${l.title}`}
                        onClick={(e) => askDelete(e, l)}
                        className="grid h-8 w-8 place-items-center rounded-md text-[#9A948E] hover:bg-[#FEF3F2] hover:text-[#B42318]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDelete && (
        <div data-testid="leads-delete-modal" className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4" onClick={() => !deleting && setConfirmDelete(null)}>
          <div className="w-full max-w-[420px] rounded-xl border border-[#E8E6E3] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><AlertTriangle size={17} className="text-[#B42318]" /> Delete this lead?</div>
            <p className="text-[13px] leading-relaxed text-[#6B6660]">
              “{confirmDelete.title}” ({confirmDelete.company}) will be removed from the pipeline along with its
              proposal and budget. This cannot be undone from the UI.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button data-testid="leads-delete-no" disabled={deleting} onClick={() => setConfirmDelete(null)} className="h-9 rounded-md border border-[#D4D1CC] px-4 text-sm font-medium hover:bg-[#F4F4F2]">No, keep it</button>
              <button data-testid="leads-delete-yes" disabled={deleting} onClick={() => void doDelete()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#B42318] px-4 text-sm font-medium text-white hover:bg-[#912018] disabled:opacity-50">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

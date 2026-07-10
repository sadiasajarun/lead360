import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Check, Clock, Eye, FileText, Table, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '~/redux/store/hooks';
import { fetchQueue, approveLead, rejectLead } from '~/services/httpServices/approvalService';
import { getProposal, getBudget } from '~/services/httpServices/presentService';
import { fetchComments } from '~/services/httpServices/leadDetailService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import { useRoleBase } from '~/hooks/useRoleBase';
import { TemplateType } from '~/enums/lead.enum';
import CommentThread from '~/components/shared/CommentThread';
import type { Lead } from '~/types/lead';
import type { ProposalPayload } from '~/services/httpServices/presentService';
import type { BudgetResponse } from '~/types/budget';
import type { LeadComment } from '~/types/comment';

const TEMPLATE_LABEL: Record<string, string> = {
  [TemplateType.LOCAL]: 'Local',
  [TemplateType.GLOBAL]: 'Global',
  [TemplateType.AGENCY]: 'Agency',
  [TemplateType.DESIGN_PORTFOLIO]: 'Design Portfolio',
};
const templateLabel = (t: string) => TEMPLATE_LABEL[t] ?? t;

const money = (cents: number | string) => '$' + Math.round(Number(cents) / 100).toLocaleString();

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '—';

// "Jun 28, 09:12" (24h). Used for the Submitted column and the review meta.
const fmtSubmitted = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

// Age since submission → "3d 4h" / "20h" / "45m". Returns urgent=true past 48h.
function waiting(iso: string): { text: string; urgent: boolean } {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const text = days >= 1 ? `${days}d ${hours % 24}h` : hours >= 1 ? `${hours}h` : `${mins}m`;
  return { text, urgent: hours > 48 };
}

// camelCase proposal key → "Executive Summary".
const humanizeKey = (k: string) =>
  k
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

// First 4 prose-ish sections (string or string[]) in insertion order — mirrors what the design shows.
function proseSections(sections: Record<string, unknown>): { title: string; body: string }[] {
  return Object.entries(sections)
    .filter(
      ([, v]) =>
        (typeof v === 'string' && v.trim().length > 0) ||
        (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string')),
    )
    .slice(0, 4)
    .map(([key, v]) => ({ title: humanizeKey(key), body: Array.isArray(v) ? (v as string[]).join('\n') : String(v) }));
}

function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-grid flex-none place-items-center rounded-full border border-[#E8E6E3] bg-[#F4F4F2] text-[11px] font-semibold text-[#6B6660]"
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  );
}

function ProposalPane({ leadId }: { leadId: string }) {
  const [data, setData] = useState<ProposalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    setData(null);
    getProposal(leadId)
      .then((p) => !cancelled && setData(p))
      .catch((e) => !cancelled && setErr(apiErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const secs = data ? proseSections(data.sections) : [];

  return (
    <div data-testid="approvals-proposal-pane" className="bg-white p-5">
      <h4 className="mb-3.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9A948E]">
        <FileText size={15} /> Proposal
      </h4>
      {loading ? (
        <div className="text-[13px] text-[#6B6660]">Loading proposal…</div>
      ) : err ? (
        <div className="text-[13px] text-[#B42318]">{err}</div>
      ) : secs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#D4D1CC] p-6 text-center text-[13px] text-[#6B6660]">
          No proposal generated yet.
        </div>
      ) : (
        secs.map((s, i) => (
          <div key={i} className="mb-4 last:mb-0">
            <div className="mb-1.5 text-[13px] font-semibold text-[#0F0F0F]">
              {i + 1} · {s.title}
            </div>
            <p className="whitespace-pre-line text-[13px] leading-[1.55] text-[#6B6660]">{s.body}</p>
          </div>
        ))
      )}
    </div>
  );
}

function BudgetPane({ leadId, template }: { leadId: string; template: string }) {
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    setData(null);
    getBudget(leadId)
      .then((b) => !cancelled && setData(b))
      .catch((e) => !cancelled && setErr(apiErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const lines = data?.budget.lines ?? [];

  return (
    <div data-testid="approvals-budget-pane" className="bg-white p-5">
      <h4 className="mb-3.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9A948E]">
        <Table size={15} /> Budget — {templateLabel(template).toUpperCase()} structure
      </h4>
      {loading ? (
        <div className="text-[13px] text-[#6B6660]">Loading budget…</div>
      ) : err ? (
        <div className="text-[13px] text-[#B42318]">{err}</div>
      ) : lines.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#D4D1CC] p-6 text-center text-[13px] text-[#6B6660]">
          No budget generated yet.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-[#E8E6E3]">
            <table className="w-full text-[13px]">
              <thead className="bg-[#F4F4F2] text-left text-[11px] uppercase tracking-wide text-[#9A948E]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Dept / Head</th>
                  <th className="px-3 py-2 text-right font-semibold">Days</th>
                  <th className="px-3 py-2 text-right font-semibold">Rate</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const units = Number(l.units) || 1;
                  const total = units * Number(l.days) * Number(l.dayRateCents);
                  return (
                    <tr key={l.id ?? i} className="border-t border-[#E8E6E3]">
                      <td className="px-3 py-2">
                        <div className="font-medium text-[#0F0F0F]">
                          {l.role}
                          {units > 1 ? ` ×${units}` : ''}
                        </div>
                        <div className="text-[11px] text-[#9A948E]">{l.department}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.days}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(l.dayRateCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(total)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-[#D4D1CC] bg-[#F4F4F2] font-semibold text-[#0F0F0F]">
                  <td className="px-3 py-2.5">Total</td>
                  <td />
                  <td />
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(data!.computed.totalCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-[#9A948E]">Values mirror the exported .xlsx structure.</p>
        </>
      )}
    </div>
  );
}

// Read-only thread for the selected lead. `reloadKey` bumps after a decision so the thread
// refetches even when the same lead stays selected.
function CommentsPane({ leadId, reloadKey }: { leadId: string; reloadKey: number }) {
  const [comments, setComments] = useState<LeadComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    fetchComments(leadId)
      .then((c) => !cancelled && setComments(c))
      .catch((e) => !cancelled && setErr(apiErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [leadId, reloadKey]);

  return (
    <div data-testid="approvals-comment-thread" className="border-t border-[#E8E6E3] px-5 py-5">
      <h4 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9A948E]">Comments</h4>
      <CommentThread comments={comments} loading={loading} error={err} />
    </div>
  );
}

export default function Approvals() {
  const dispatch = useAppDispatch();
  const { leadPath } = useRoleBase();
  const { items, status, error } = useAppSelector((s) => s.approvals);
  const [view, setView] = useState<'pending' | 'empty'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [commentsReloadKey, setCommentsReloadKey] = useState(0);

  useEffect(() => {
    dispatch(fetchQueue());
  }, [dispatch]);

  // Oldest first: by submittedAt when present, else updatedAt (legacy rows). Ascending.
  const sorted = useMemo(() => {
    const key = (l: Lead) => new Date(l.submittedAt ?? l.updatedAt).getTime();
    return [...items].sort((a, b) => key(a) - key(b));
  }, [items]);

  const selected = sorted.find((l) => l.id === selectedId) ?? sorted[0] ?? null;

  const decide = async (kind: 'approve' | 'reject') => {
    if (!selected) return;
    if (kind === 'reject' && !note.trim()) return;
    setBusy(true);
    setMsg('');
    // Choose the next lead to focus before the queue refetches and this row drops out.
    const idx = sorted.findIndex((l) => l.id === selected.id);
    const next = sorted[idx + 1] ?? sorted[idx - 1] ?? null;
    try {
      if (kind === 'approve') await approveLead(selected.id, note.trim() || undefined);
      else await rejectLead(selected.id, note.trim());
      setSelectedId(next ? next.id : null);
      setNote('');
      setMsg(kind === 'approve' ? 'Approved — sent back to Sales to deliver.' : 'Returned to Sales with notes.');
      setCommentsReloadKey((k) => k + 1);
      await dispatch(fetchQueue());
    } catch (e) {
      setMsg(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = sorted.length;
  // "All caught up" is a view toggle in the design; an actually-empty queue also shows the empty state.
  const showEmpty = view === 'empty' || pendingCount === 0;

  return (
    <div data-testid="approvals-page">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-[22px] font-semibold tracking-[-0.01em]">
            Approvals — verify each project
            <span
              data-testid="approvals-queue-count"
              className="inline-grid h-6 min-w-[24px] place-items-center rounded-full bg-[#EA5400]/[0.08] px-1.5 text-[13px] font-semibold text-[#EA5400]"
            >
              {pendingCount}
            </span>
          </h1>
          <p className="mt-1 max-w-[720px] text-[14px] text-[#6B6660]">
            Verify each project before it can be sent. Leads pending approval, oldest first — review the proposal and
            budget side-by-side, then approve or reject.
          </p>
        </div>
        <label className="flex items-center gap-2 whitespace-nowrap text-[12px] font-semibold text-[#6B6660]">
          State
          <select
            data-testid="approvals-state-switch"
            value={view}
            onChange={(e) => setView(e.target.value as 'pending' | 'empty')}
            className="h-8 rounded-md border border-[#D4D1CC] bg-white px-2 text-[12px] font-semibold text-[#0F0F0F] outline-none focus:border-[#EA5400]"
          >
            <option value="pending">Pending ({pendingCount})</option>
            <option value="empty">All caught up</option>
          </select>
        </label>
      </div>

      {msg && (
        <div data-testid="approvals-msg" className="mb-4 rounded-md border border-[#E8E6E3] bg-white px-4 py-2.5 text-[13px] text-[#6B6660]">
          {msg}
        </div>
      )}

      {status === 'loading' && (
        <div data-testid="approvals-loading" className="text-sm text-[#6B6660]">
          Loading queue…
        </div>
      )}
      {status === 'failed' && (
        <div data-testid="approvals-error" className="rounded-lg border border-[#E8E6E3] bg-white p-8 text-center text-sm text-[#B42318]">
          {error ?? 'Failed to load the approval queue.'}
        </div>
      )}

      {status === 'succeeded' && showEmpty && (
        <div
          data-testid="approvals-empty"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#E8E6E3] bg-white px-6 py-[72px] text-center"
        >
          <span className="grid h-[52px] w-[52px] place-items-center rounded-[14px] bg-[#0E7C5A]/10 text-[#0E7C5A]">
            <Check size={26} />
          </span>
          <h3 className="text-[16px] font-semibold">All caught up</h3>
          <p className="max-w-[380px] text-[13.5px] leading-[1.55] text-[#6B6660]">
            No leads are waiting for approval.
          </p>
        </div>
      )}

      {status === 'succeeded' && !showEmpty && (
        <>
          {/* Queue */}
          <section className="mb-6 overflow-hidden rounded-xl border border-[#E8E6E3] bg-white">
            <div className="overflow-x-auto">
              <table data-testid="approvals-queue" className="w-full text-[14px]">
                <thead className="bg-[#F4F4F2] text-left text-[12px] uppercase tracking-wide text-[#9A948E]">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Client / Lead</th>
                    <th className="px-4 font-semibold">Template</th>
                    <th className="px-4 font-semibold">Submitted by</th>
                    <th className="px-4 text-right font-semibold">Value</th>
                    <th className="px-4 font-semibold">Submitted</th>
                    <th className="px-4 text-right font-semibold">Waiting</th>
                    <th className="px-4" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((l) => {
                    const submittedIso = l.submittedAt ?? l.updatedAt;
                    const w = waiting(submittedIso);
                    const isSel = selected?.id === l.id;
                    return (
                      <tr
                        key={l.id}
                        data-testid={`approvals-row-${l.id}`}
                        aria-selected={isSel}
                        onClick={() => setSelectedId(l.id)}
                        className={`h-11 cursor-pointer border-t border-[#E8E6E3] hover:bg-[#F4F4F2] ${isSel ? 'bg-[#EA5400]/[0.08]' : ''}`}
                      >
                        <td className="px-4 py-2">
                          <div className="font-semibold">{l.company}</div>
                          <div className="text-[12px] text-[#6B6660]">{l.title}</div>
                        </td>
                        <td className="px-4">
                          <span className="inline-flex h-[22px] items-center rounded border border-[#E8E6E3] bg-[#F4F4F2] px-2.5 text-[12px] font-medium text-[#6B6660]">
                            {templateLabel(l.template)}
                          </span>
                        </td>
                        <td className="px-4">
                          {l.submittedBy ? (
                            <span className="inline-flex items-center gap-2">
                              <Avatar name={l.submittedBy.name} />
                              {l.submittedBy.name}
                            </span>
                          ) : (
                            <span className="text-[#9A948E]">—</span>
                          )}
                        </td>
                        <td className="px-4 text-right tabular-nums">{money(l.valueCents)}</td>
                        <td
                          className="px-4 text-[13px] text-[#6B6660]"
                          title={l.submittedAt ? undefined : 'Approximate — submitted before timestamps were recorded'}
                        >
                          {fmtSubmitted(submittedIso)}
                          {!l.submittedAt && <span className="ml-1 text-[#9A948E]">~</span>}
                        </td>
                        <td className="px-4 text-right">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-0.5 text-[12px] font-semibold ${
                              w.urgent ? 'bg-[#B42318]/10 text-[#B42318]' : 'bg-[#B8710A]/10 text-[#B8710A]'
                            }`}
                          >
                            {w.urgent && <Clock size={13} />}
                            {w.text}
                          </span>
                        </td>
                        <td className="px-4 text-right">
                          {/* Icon-only: opens the full lead. Clicking the row still loads the
                              side-by-side review panel below. */}
                          <Link
                            to={leadPath(l.id)}
                            data-testid={`approvals-review-${l.id}`}
                            title="Open full lead"
                            aria-label={`Open ${l.title}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-grid h-8 w-8 place-items-center rounded-md border border-[#D4D1CC] bg-white text-[#6B6660] hover:bg-[#F4F4F2] hover:text-[#0F0F0F]"
                          >
                            <Eye size={15} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Review panel */}
          {selected && (
            <section data-testid="approvals-review-panel" className="overflow-hidden rounded-xl border border-[#E8E6E3] bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8E6E3] px-5 py-[18px]">
                <div>
                  <div data-testid="approvals-review-title" className="text-[16px] font-semibold">
                    {selected.title}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3.5 text-[13px] text-[#6B6660]">
                    <span>
                      Client <b className="font-medium text-[#0F0F0F]">{selected.company}</b>
                    </span>
                    <span>
                      Template <b className="font-medium text-[#0F0F0F]">{templateLabel(selected.template)}</b>
                    </span>
                    <span>
                      Submitted by{' '}
                      <b className="font-medium text-[#0F0F0F]">{selected.submittedBy?.name ?? '—'}</b>
                    </span>
                    <span>
                      Value <b className="font-medium text-[#0F0F0F]">{money(selected.valueCents)}</b>
                    </span>
                    <span className="inline-flex h-[22px] items-center gap-2 rounded border border-[#E8E6E3] px-2.5 text-[12px] font-semibold">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#B8710A]" />
                      Pending Approval
                    </span>
                  </div>
                </div>
                {/* "Open full lead" removed — the queue's eye icon is the way in. */}
              </div>

              {/* Proposal + Budget side-by-side */}
              <div className="grid grid-cols-1 gap-px bg-[#E8E6E3] md:grid-cols-2">
                <ProposalPane leadId={selected.id} />
                <BudgetPane leadId={selected.id} template={selected.template} />
              </div>

              {/* Comment thread (read-only here — the decision note below is the admin's input). */}
              <CommentsPane leadId={selected.id} reloadKey={commentsReloadKey} />

              {/* Decision bar */}
              <div className="flex flex-wrap items-center gap-3 border-t border-[#E8E6E3] bg-[#F4F4F2] px-5 py-[18px]">
                <input
                  data-testid="approvals-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={busy}
                  placeholder="Add a note — it's posted as a comment (required to reject)…"
                  aria-label="Decision note"
                  className="h-9 min-w-[200px] flex-1 rounded-md border border-[#D4D1CC] bg-white px-3 text-[13px] outline-none focus:border-[#EA5400] disabled:opacity-50"
                />
                <button
                  data-testid="approvals-reject"
                  onClick={() => void decide('reject')}
                  disabled={busy || !note.trim()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#B42318] px-3.5 text-sm font-medium text-[#B42318] hover:bg-[#B42318]/5 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <X size={15} /> Reject
                </button>
                <button
                  data-testid="approvals-approve"
                  onClick={() => void decide('approve')}
                  disabled={busy}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#EA5400] px-3.5 text-sm font-medium text-white hover:bg-[#CC4900] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Check size={15} /> Approve
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

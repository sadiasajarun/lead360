import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams, Link } from 'react-router';
import {
  ChevronRight, Download, ExternalLink, Check, Database, FileText, Sheet,
  Info, CheckCircle2, Clock, Sparkles, RefreshCw, Loader2, Send, X, XCircle,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '~/redux/store/hooks';
import {
  fetchLead, submitLead, markSent, markLocked, markLost, generate, regenerateBudget, generateBrief, generatePitch,
  regenerateSection, downloadProposalPdf, saveProposalSection, deleteProposalSection, updateLead,
  fetchComments, postComment,
} from '~/services/httpServices/leadDetailService';
import { getProposal } from '~/services/httpServices/presentService';
import type { ProposalPayload } from '~/services/httpServices/presentService';
import { SalesBriefView, PitchDeckView } from '~/components/SalesBriefPitch';
import { fetchBudget, updateBudget } from '~/services/httpServices/budgetService';
import { BudgetEditor } from '~/components/BudgetEditor';
import { BudgetConvertedView } from '~/components/BudgetConvertedView';
import { ProposalDocument, buildPricing } from '~/components/ProposalDocument';
import { LeadStatus, LossReason, LOSS_REASON_LABEL } from '~/enums/lead.enum';
import { CURRENCIES, formatMoneyWhole } from '~/enums/currency.enum';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import { useRoleBase } from '~/hooks/useRoleBase';
import { useAuth } from '~/contexts/AuthContext';
import { MarkLostModal } from '~/components/modals/MarkLostModal';
import { approveLead, rejectLead } from '~/services/httpServices/approvalService';
import CommentThread from '~/components/shared/CommentThread';
import StatusPill from '~/components/atoms/StatusPill';
import type { LeadComment } from '~/types/comment';

const TABS = ['proposal', 'budget', 'brief', 'pitch'] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = { proposal: 'Proposal', budget: 'Budget', brief: 'Sales Brief', pitch: 'Pitch Deck' };

// Output routing (Generation-Engine spec §5): Global & Local deliver a proposal + a SEPARATE budget,
// so they get a Budget tab. Agency & Design Portfolio deliver ONE combined document — the budget is
// the Financial Proposal section inside the proposal, so there is no Budget tab.
const COMBINED_TEMPLATES = new Set(['agency', 'design_portfolio']);
const isCombined = (template: string) => COMBINED_TEMPLATES.has(template);
const tabsFor = (template: string) =>
  (isCombined(template) ? TABS.filter((t) => t !== 'budget') : TABS) as readonly (typeof TABS)[number][];
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';


export default function LeadDetail() {
  const { id = '' } = useParams();
  const dispatch = useAppDispatch();
  const { isAdmin, leadsPath } = useRoleBase();
  const { user } = useAuth();
  const { lead, status } = useAppSelector((s) => s.leadDetail);
  const budgetData = useAppSelector((s) => s.budget.data);
  const [tab, setTab] = useState<(typeof TABS)[number]>('proposal');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [proposal, setProposal] = useState<ProposalPayload | null>(null);
  const [propPrompt, setPropPrompt] = useState('');
  const reloadProposal = () => getProposal(id).then(setProposal).catch(() => setProposal(null));

  // Comment thread (shared by Sales/PM + Admin).
  const [comments, setComments] = useState<LeadComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const reloadComments = () => {
    setCommentsLoading(true);
    return fetchComments(id)
      .then((c) => { setComments(c); setCommentsError(''); })
      .catch((e) => setCommentsError(apiErrorMessage(e)))
      .finally(() => setCommentsLoading(false));
  };

  // Admin approve/reject modal ('approve' -> optional note, 'reject' -> required note).
  const [decision, setDecision] = useState<null | 'approve' | 'reject'>(null);
  const [decisionNote, setDecisionNote] = useState('');

  // Mark-lost modal (replaces the old window.prompt flow).
  const [lostOpen, setLostOpen] = useState(false);

  // Budget-tab display currency. Empty = follow the lead's own budget currency. Changing it re-prices
  // the budget for DISPLAY ONLY via a read-only view — the editor (and its Save) is hidden while a
  // converted currency is active, so converted rates can never be persisted.
  const [viewCurrency, setViewCurrency] = useState('');

  useEffect(() => { if (id) dispatch(fetchLead(id)); }, [dispatch, id]);
  useEffect(() => { if (id) { reloadProposal(); dispatch(fetchBudget(id)); reloadComments(); } }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg('');
    try { await fn(); dispatch(fetchLead(id)); setMsg(ok); }
    catch (e) { setMsg(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  const sendComment = async () => {
    const body = commentDraft.trim();
    if (!body || posting) return;
    setPosting(true); setCommentsError('');
    try {
      await postComment(id, body);
      setCommentDraft('');
      await reloadComments();
    } catch (e) {
      setCommentsError(apiErrorMessage(e));
    } finally {
      setPosting(false);
    }
  };

  const confirmDecision = async () => {
    if (!decision) return;
    const note = decisionNote.trim();
    if (decision === 'reject' && !note) return;
    await act(
      () => (decision === 'approve' ? approveLead(id, note || undefined) : rejectLead(id, note)),
      decision === 'approve'
        ? 'Lead approved — deliverables filed into Projects → Database.'
        : 'Lead rejected and returned to Sales.',
    );
    await reloadComments();
    setDecision(null);
    setDecisionNote('');
  };

  const genBrief = () => act(async () => { await generateBrief(id); await reloadProposal(); }, 'Sales brief generated');
  const genPitch = () => act(async () => { await generatePitch(id); await reloadProposal(); }, 'Pitch deck generated');
  const regenProposal = () => act(async () => {
    await generate(id, propPrompt.trim() || undefined);
    await reloadProposal();
    dispatch(fetchBudget(id));
    setPropPrompt('');
  }, 'Proposal regenerated');

  if (status === 'loading') return <div className="text-sm text-[#6B6660]">Loading…</div>;
  if (!lead) return <div data-testid="lead-notfound" className="text-sm text-[#6B6660]">Lead not found.</div>;

  const primary = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#EA5400] px-3 text-sm font-medium text-white hover:bg-[#CC4900] disabled:opacity-50';
  const secondary = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-3 text-sm font-medium hover:bg-[#F4F4F2] disabled:opacity-50';
  // The lead value + hero Investment always show in the budget's OWN authored currency (never the
  // Budget-tab view currency), so the page stays internally consistent.
  const budgetCurrency = lead.budgetCurrency || 'USD';
  const activeViewCurrency = viewCurrency || budgetCurrency;
  // Headline lead value (header + proposal hero Investment) shows whole units — no cents on a figure
  // the client reads as a number. The budget breakdown keeps its cents (formatMoney) elsewhere.
  const money = formatMoneyWhole(lead.valueCents, budgetCurrency);
  const archived = lead.status === LeadStatus.APPROVED || lead.status === LeadStatus.SENT || lead.status === LeadStatus.LOCKED;
  const sections = proposal?.sections ? Object.entries(proposal.sections) : [];

  // ── Role × status × ownership: the action rail below mirrors the backend state machine exactly.
  // Ownership comes from the FK column `submittedById` (always serialised, even when the `submittedBy`
  // relation isn't joined on the detail payload); `submittedBy.id` is a fallback for list-sourced rows.
  const s = lead.status;
  const ownerId = lead.submittedById ?? lead.submittedBy?.id ?? null;
  const isOwner = !!user && !!ownerId && ownerId === user.id;
  // An admin's OWN lead skips the approval queue (generated → sent directly); the timeline drops the
  // two approval steps for it. Admins never own pending/approved/rejected leads (they can't submit).
  const adminDirect = isAdmin && isOwner;

  const submittedDone = s !== LeadStatus.GENERATED; // ever entered the approval queue
  const verifiedDone = [LeadStatus.APPROVED, LeadStatus.SENT, LeadStatus.LOCKED, LeadStatus.LOST].includes(s);
  const deliveredDone = [LeadStatus.SENT, LeadStatus.LOCKED, LeadStatus.LOST].includes(s);

  // Latest admin rejection note from the shared thread — echoed as a hint (never duplicating the thread).
  const rejectionNote = [...comments].reverse().find((c) => c.decision === 'rejected')?.body;
  const lossReasonLabel = lead.lossReason
    ? LOSS_REASON_LABEL[lead.lossReason as LossReason] ?? lead.lossReason
    : '—';

  const railHint =
    s === LeadStatus.GENERATED
      ? isAdmin
        ? isOwner
          ? 'You are the approver — sending files the documents to the Database automatically.'
          : 'Waiting on the rep to send this for approval.'
        : 'Draft. Send for approval when the proposal and budget are ready.'
      : s === LeadStatus.PENDING_APPROVAL
        ? isAdmin
          ? 'Review the proposal and budget, then approve or reject.'
          : 'An admin will verify the proposal and budget before it can be sent.'
        : s === LeadStatus.APPROVED
          ? 'Approved. Download the branded PDF + Excel and send them to the client.'
          : s === LeadStatus.REJECTED
            ? isAdmin
              ? 'Returned to the rep for revision.'
              : 'Returned by the admin. Revise the proposal or budget, then resubmit.'
            : s === LeadStatus.SENT
              ? 'Sent to the client. Mark Locked when they sign, or Mark Lost.'
              : s === LeadStatus.LOCKED
                ? 'Won and locked. Archived to the Database and auto-added to Projects.'
                : s === LeadStatus.LOST
                  ? 'Lost. The recorded reason is shown below for reporting.'
                  : 'Track the lead through approval, send, and close.';

  // §5 routing: combined templates have no Budget tab; the budget renders inside the proposal.
  const combined = isCombined(lead.template);
  const visibleTabs = tabsFor(lead.template);
  const activeTab = (visibleTabs as readonly string[]).includes(tab) ? tab : 'proposal';
  const financial = combined && budgetData
    ? {
        currency: budgetData.budget.currency,
        lines: budgetData.budget.lines,
        subtotalCents: Number(budgetData.computed.subtotalCents),
        contingencyCents: Number(budgetData.computed.contingencyCents),
        discountCents: Number(budgetData.computed.discountCents),
        vatCents: Number(budgetData.computed.vatCents),
        totalCents: Number(budgetData.computed.totalCents),
      }
    : undefined;

  return (
    <div data-testid="lead-detail-page">
      {/* Breadcrumb + header */}
      <div className="mb-1 flex items-center gap-1.5 text-[13px] text-[#9A948E]">
        <Link to={leadsPath} className="hover:text-[#0F0F0F]">Leads</Link><ChevronRight size={14} /><span className="text-[#6B6660]">{lead.title}</span>
      </div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">{lead.title}</h1>
          <div className="mt-1.5 flex items-center gap-2 text-[13px] text-[#6B6660]">
            <StatusPill data-testid="lead-status" status={lead.status} suffix={lead.status === LeadStatus.LOST ? lead.lossReason : null} />
            {lead.company} · {money} · {lead.template} template
          </div>
        </div>
      </div>
      {msg && <div data-testid="act-msg" className="mb-4 rounded-md border border-[#E8E6E3] bg-white px-3 py-2 text-[13px] text-[#6B6660]">{msg}</div>}

      {/* Admin decision bar — the only thing an admin does that Sales can't: approve or reject. */}
      {isAdmin && lead.status === LeadStatus.PENDING_APPROVAL && (
        <div data-testid="admin-decision-bar" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#F79009]/40 bg-[#FFFAEB] px-4 py-3">
          <div className="text-[13px] text-[#B54708]">
            <b>Awaiting your decision.</b> Review the proposal and budget, then approve or reject.
          </div>
          <div className="flex gap-2">
            <button
              data-testid="admin-approve"
              disabled={busy}
              onClick={() => { setDecisionNote(''); setDecision('approve'); }}
              className={primary}
            >
              <Check size={15} /> Approve
            </button>
            <button
              data-testid="admin-reject"
              disabled={busy}
              onClick={() => { setDecisionNote(''); setDecision('reject'); }}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#B42318]/40 bg-white px-3 text-sm font-medium text-[#B42318] hover:bg-[#FEF3F2] disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_344px]">
        {/* MAIN */}
        <div className="min-w-0 rounded-xl border border-[#E8E6E3] bg-white">
          <div className="flex gap-1 border-b border-[#E8E6E3] px-4">
            {visibleTabs.map((t) => (
              <button key={t} data-testid={`lead-detail-tab-${t}`} onClick={() => setTab(t)}
                className={`px-3.5 py-3.5 text-sm font-medium ${activeTab === t ? 'border-b-2 border-[#EA5400] text-[#0F0F0F]' : 'text-[#6B6660] hover:text-[#0F0F0F]'}`}>{TAB_LABEL[t]}</button>
            ))}
          </div>

          <div className="p-5">
            {/* PROPOSAL */}
            {activeTab === 'proposal' && (
              <div data-testid="proposal-tab">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div><div className="text-[15px] font-semibold">Proposal</div><p className="text-[13px] text-[#6B6660]">The interactive client-facing document — exactly what the client receives.</p></div>
                  <div className="flex gap-2">
                    {sections.length > 0 && (
                      <button data-testid="lead-detail-download-pdf" disabled={busy}
                        onClick={() => act(() => downloadProposalPdf(id, `${lead.title.replace(/[^\w.\-]+/g, '_')}-Proposal.pdf`), 'Proposal PDF downloaded')}
                        className={primary}><Download size={15} /> Download PDF</button>
                    )}
                    <a data-testid="lead-detail-open-full" href={`/present/${id}/proposal`} target="_blank" rel="noreferrer" className={secondary}><ExternalLink size={15} /> Open full</a>
                  </div>
                </div>

                {sections.length > 0 ? (
                  <>
                    <ProposalDocument
                      title={lead.title}
                      company={lead.company}
                      template={lead.template}
                      valueLabel={money}
                      currency={budgetCurrency}
                      financial={financial}
                      pricing={!combined && budgetData ? buildPricing(Number(budgetData.computed.totalCents), budgetData.budget.lines, proposal?.sections?.timeline, `/present/${id}/budget`) : undefined}
                      contactName={lead.contactName ?? undefined}
                      sections={proposal?.sections ?? {}}
                      withNav={false}
                      onRegenerateSection={async (key, instruction) => {
                        await regenerateSection(id, key, instruction);
                        await reloadProposal();
                      }}
                      onSaveSection={async (key, value) => {
                        await saveProposalSection(id, key, value);
                        await reloadProposal();
                      }}
                      onDeleteSection={async (key) => {
                        await deleteProposalSection(id, key);
                        await reloadProposal();
                      }}
                      // Hero project-name edit persists to the lead itself (PATCH /leads/:id).
                      onSaveTitle={async (t) => {
                        await updateLead(id, { title: t });
                        dispatch(fetchLead(id));
                      }}
                      // Financial Proposal inline edits reuse the Budget-tab plumbing: map edited
                      // units/days onto the existing lines (preserving every other field) and PUT
                      // the full budget, then refresh the same way the Budget tab does.
                      onSaveLines={financial && budgetData ? async (rows) => {
                        const b = budgetData.budget;
                        const byIndex = new Map(rows.map((r) => [r.index, r]));
                        const lines = b.lines.map((l, i) => ({
                          milestoneName: l.milestoneName || undefined,
                          department: l.department,
                          role: l.role,
                          seniority: l.seniority,
                          units: byIndex.get(i)?.units ?? Number(l.units),
                          days: byIndex.get(i)?.days ?? Number(l.days),
                          dayRateCents: Math.max(0, Math.round(Number(l.dayRateCents) || 0)),
                          optional: !!l.optional,
                        }));
                        try {
                          await updateBudget(id, { version: b.version, lines, contingencyPct: Number(b.contingencyPct), discountPct: Number(b.discountPct), vatPct: Number(b.vatPct), includeOptional: true });
                          await dispatch(fetchBudget(id));
                          setMsg('Budget updated.');
                        } catch (e) {
                          setMsg(apiErrorMessage(e));
                          dispatch(fetchBudget(id));
                        }
                      } : undefined}
                    />
                    <div className="mt-5 rounded-lg border border-[#E8E6E3] bg-[#F4F4F2] p-4">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Regenerate proposal</div>
                      <textarea
                        data-testid="lead-detail-proposal-regen-prompt"
                        value={propPrompt}
                        onChange={(e) => setPropPrompt(e.target.value)}
                        placeholder="Describe a change, e.g. 'tighten the executive summary and add a phased rollout'…"
                        className="min-h-[74px] w-full resize-y rounded-md border border-[#D4D1CC] bg-white px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-[#EA5400]"
                      />
                      <button
                        data-testid="lead-detail-proposal-regenerate"
                        disabled={busy}
                        onClick={regenProposal}
                        className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-md bg-[#EA5400] px-3.5 text-sm font-medium text-white hover:bg-[#CC4900] disabled:opacity-50"
                      >
                        {busy ? <><Loader2 size={15} className="animate-spin" /> Regenerating…</> : <><RefreshCw size={15} /> Regenerate proposal</>}
                      </button>
                      <p className="mt-2 text-[11px] text-[#9A948E]">Regeneration re-drafts the proposal and its budget, grounded in the Riseup database (RAG).</p>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-[#D4D1CC] p-8 text-center">
                    <Sparkles size={22} className="mx-auto mb-2 text-[#EA5400]" />
                    <p className="mb-3 text-[13px] text-[#6B6660]">No proposal yet. Generation drafts the <b>proposal + budget</b> together — grounded in past Riseup projects (RAG).</p>
                    <button data-testid="act-generate" disabled={busy} onClick={() => act(async () => { await generate(id); dispatch(fetchBudget(id)); }, 'Proposal + budget generated')} className={primary + ' mx-auto'}><Sparkles size={15} /> Generate proposal + budget (AI)</button>
                  </div>
                )}
              </div>
            )}

            {/* BUDGET */}
            {activeTab === 'budget' && (
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[15px] font-semibold">Budget</div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[13px] text-[#6B6660]">
                      Currency
                      <select
                        data-testid="budget-currency"
                        value={activeViewCurrency}
                        onChange={(e) => setViewCurrency(e.target.value)}
                        className="h-8 rounded-md border border-[#D4D1CC] bg-white px-2 text-[13px] font-medium outline-none focus:border-[#EA5400]"
                      >
                        {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                      </select>
                    </label>
                    <a href={`/present/${id}/budget`} target="_blank" rel="noreferrer" data-testid="open-budget-view" className="inline-flex items-center gap-1 text-[13px] font-medium text-[#EA5400]"><ExternalLink size={14} /> Open client view</a>
                  </div>
                </div>
                {activeViewCurrency === budgetCurrency
                  ? <BudgetEditor leadId={id} />
                  : <BudgetConvertedView leadId={id} currency={activeViewCurrency} budgetCurrency={budgetCurrency} />}
              </div>
            )}

            {/* SALES BRIEF — internal pitch pack generated from the proposal */}
            {activeTab === 'brief' && (
              <div data-testid="brief-tab">
                <div className="mb-4">
                  <div className="text-[15px] font-semibold">Sales Brief</div>
                  <p className="text-[13px] text-[#6B6660]">Internal-only pitch pack. Generate it when you're ready to prep the meeting.</p>
                </div>
                {sections.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#D4D1CC] p-8 text-center text-sm text-[#6B6660]">Generate the proposal first — the sales brief is built from it.</div>
                ) : (
                  <SalesBriefView brief={proposal?.salesBrief} onGenerate={genBrief} generating={busy} />
                )}
              </div>
            )}

            {/* PITCH DECK — slide deck generated from the proposal */}
            {activeTab === 'pitch' && (
              <div data-testid="pitch-tab">
                <div className="mb-4">
                  <div className="text-[15px] font-semibold">Pitch Deck</div>
                  <p className="text-[13px] text-[#6B6660]">A presentation-ready slide deck generated from the proposal.</p>
                </div>
                {sections.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[#D4D1CC] p-8 text-center text-sm text-[#6B6660]">Generate the proposal first — the pitch deck is built from it.</div>
                ) : (
                  <PitchDeckView slides={proposal?.pitchDeck?.slides} onGenerate={genPitch} generating={busy} />
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <aside className="flex flex-col gap-4">
          {/* STATUS */}
          <div className="rounded-xl border border-[#E8E6E3] bg-white p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Status</div>
            <div className="mb-3 flex flex-wrap gap-2">
              <StatusPill status={lead.status} size="md" suffix={lead.status === LeadStatus.LOST ? lead.lossReason : null} />
              {archived && <span data-testid="lead-detail-badge-db" className="inline-flex items-center gap-1.5 rounded-md border border-[#C6DBF5] bg-[#EFF5FD] px-2 py-1 text-[13px] font-medium text-[#175CD3]"><Database size={13} /> Archived to Database</span>}
            </div>

            <div className="flex flex-col gap-2">
              {/* generated + sales owner → send into the approval queue */}
              {s === LeadStatus.GENERATED && !isAdmin && (
                <button data-testid="act-submit" disabled={busy} onClick={() => act(() => submitLead(id), 'Sent for approval')} className={primary}><Check size={15} /> Send for approval</button>
              )}
              {/* generated + admin owner → skip the queue, mark sent directly (documents auto-archived) */}
              {s === LeadStatus.GENERATED && adminDirect && (
                <button data-testid="act-mark-sent-direct" disabled={busy} onClick={() => act(() => markSent(id), 'Marked as sent')} className={primary}><Check size={15} /> Mark as sent</button>
              )}
              {/* generated + admin, NOT owner → no action (hint explains it must go through the queue) */}

              {/* pending + sales → no action, disabled-style hint */}
              {s === LeadStatus.PENDING_APPROVAL && !isAdmin && (
                <div data-testid="rail-pending-sales" className="inline-flex h-9 items-center justify-center rounded-md border border-[#E8E6E3] bg-[#F4F4F2] px-3 text-sm font-medium text-[#9A948E]">
                  Awaiting admin verification
                </div>
              )}
              {/* pending + admin → Approve / Reject handled by the decision bar above */}

              {/* approved → download deliverables + mark sent (both roles) */}
              {s === LeadStatus.APPROVED && (
                <>
                  {sections.length > 0 && <a data-testid="lead-detail-download-proposal-pdf" href={`/present/${id}/proposal`} target="_blank" rel="noreferrer" className={primary}><FileText size={16} /> Download proposal (PDF)</a>}
                  <a data-testid="lead-detail-download-budget-xlsx" href={`${API_BASE}/leads/${id}/budget/xlsx`} className={secondary}><Sheet size={16} /> Download budget (Excel)</a>
                  <button data-testid="lead-detail-mark-sent" disabled={busy} onClick={() => act(() => markSent(id), 'Marked as sent')} className={secondary}><Check size={16} /> Mark as sent</button>
                </>
              )}

              {/* rejected + sales owner → revise and resubmit into the queue */}
              {s === LeadStatus.REJECTED && !isAdmin && (
                <button data-testid="act-resubmit" disabled={busy} onClick={() => act(() => submitLead(id), 'Sent for approval')} className={primary}><Send size={15} /> Send for approval</button>
              )}
              {/* rejected + admin → no action (only comments) */}

              {/* sent → close the lead (both roles) */}
              {s === LeadStatus.SENT && (
                <>
                  <button data-testid="act-locked" disabled={busy} onClick={() => act(() => markLocked(id), 'Locked — added to Projects')} className={primary}>Mark Locked (won)</button>
                  <button data-testid="act-lost" disabled={busy} onClick={() => setLostOpen(true)} className="inline-flex h-9 items-center justify-center rounded-md border border-[#B42318] px-3 text-sm font-medium text-[#B42318] hover:bg-[#FDF3F2] disabled:opacity-50">Mark Lost</button>
                </>
              )}
            </div>

            {/* Rejected: echo the admin's rejection note (from the thread) so the rep sees why. */}
            {s === LeadStatus.REJECTED && rejectionNote && (
              <div data-testid="rail-rejection-note" className="mt-3 rounded-md border border-[#B42318]/30 bg-[#FEF3F2] px-3 py-2 text-[13px] leading-relaxed text-[#B42318]">
                <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide">Admin note</div>
                {rejectionNote}
              </div>
            )}

            {/* Lost: the recorded loss reason + optional note. */}
            {s === LeadStatus.LOST && (
              <div data-testid="rail-loss-details" className="mt-3 rounded-md border border-[#E8E6E3] bg-[#FAF9F8] px-3 py-2 text-[13px] leading-relaxed text-[#6B6660]">
                <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Loss reason</div>
                <div className="font-medium text-[#0F0F0F]">{lossReasonLabel}</div>
                {lead.lossNote && <p className="mt-1">{lead.lossNote}</p>}
              </div>
            )}

            <p className="mt-3 flex gap-1.5 text-[12px] text-[#9A948E]"><Info size={13} className="mt-0.5 shrink-0 text-[#EA5400]" />{railHint}</p>

            {/* Timeline — admin-direct leads skip the two approval steps; a rejected lead shows a red
                "Returned for revision" step in place of "Verified by admin". */}
            <div className="mt-4 flex flex-col gap-3 border-t border-[#E8E6E3] pt-4">
              <TimelineRow done label="Created" sub={lead.title} />
              {adminDirect ? (
                <TimelineRow done={deliveredDone} pending label="Sent to client" />
              ) : (
                <>
                  <TimelineRow done={submittedDone} label="Submitted for approval" />
                  {s === LeadStatus.REJECTED
                    ? <TimelineRow rejected label="Returned for revision" />
                    : <TimelineRow done={verifiedDone} label="Verified by admin" />}
                  <TimelineRow done={deliveredDone} pending label="Delivered to client" />
                </>
              )}
            </div>
          </div>

          {/* CLIENT */}
          <div className="rounded-xl border border-[#E8E6E3] bg-white p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Client</div>
            <div className="flex flex-col gap-3 text-[13px]">
              <KV k="Company" v={lead.company} />
              {lead.contactName && <KV k="Contact" v={lead.contactName} />}
              {lead.contactEmail && <KV k="Email" v={<a href={`mailto:${lead.contactEmail}`} className="text-[#175CD3]">{lead.contactEmail}</a>} />}
              {lead.website && <KV k="Website" v={<a href={lead.website} target="_blank" rel="noreferrer" className="text-[#175CD3]">{lead.website}</a>} />}
            </div>
          </div>

          {/* COMMENTS — shared thread; both Sales/PM and Admin read + post here. */}
          <div className="rounded-xl border border-[#E8E6E3] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Comments</div>
              <span data-testid="comment-count" className="inline-grid h-5 min-w-[20px] place-items-center rounded-full bg-[#F4F4F2] px-1.5 text-[11px] font-semibold text-[#6B6660]">
                {comments.length}
              </span>
            </div>

            <CommentThread comments={comments} loading={commentsLoading} error={commentsError} testId="lead-comment-thread" />

            <div className="mt-3 border-t border-[#E8E6E3] pt-3">
              <textarea
                data-testid="comment-input"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void sendComment(); }
                }}
                placeholder="Add a comment…"
                className="min-h-[64px] w-full resize-y rounded-md border border-[#D4D1CC] bg-white px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-[#EA5400]"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-[#9A948E]">⌘/Ctrl + Enter to send</span>
                <button
                  data-testid="comment-send"
                  disabled={posting || !commentDraft.trim()}
                  onClick={() => void sendComment()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#EA5400] px-3.5 text-sm font-medium text-white hover:bg-[#CC4900] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {posting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Admin decision modal — approve (optional note) / reject (required note). The note is
          posted to the comment thread by the backend, so we refresh the thread afterwards. */}
      {decision && (
        <div
          data-testid={decision === 'approve' ? 'approve-modal' : 'reject-modal'}
          className="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4"
          onClick={() => !busy && setDecision(null)}
        >
          <div className="w-full max-w-[460px] rounded-xl border border-[#E8E6E3] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
              {decision === 'approve'
                ? <><Check size={17} className="text-[#0E7C5A]" /> Approve lead?</>
                : <><X size={17} className="text-[#B42318]" /> Reject lead?</>}
            </div>
            <p className="text-[13px] leading-relaxed text-[#6B6660]">
              {decision === 'approve'
                ? 'Approving files the deliverables into Projects → Database. Add an optional note — it’s posted to the comment thread.'
                : 'Rejecting returns the lead to Sales. A note is required and is posted to the comment thread.'}
            </p>
            <textarea
              data-testid="decision-note"
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder={decision === 'approve' ? 'Optional note (posted as a comment)…' : 'Reason for rejection (posted as a comment)…'}
              className="mt-3 min-h-[84px] w-full resize-y rounded-md border border-[#D4D1CC] bg-white px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-[#EA5400]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                data-testid="decision-cancel"
                disabled={busy}
                onClick={() => setDecision(null)}
                className="h-9 rounded-md border border-[#D4D1CC] px-4 text-sm font-medium hover:bg-[#F4F4F2] disabled:opacity-50"
              >
                Cancel
              </button>
              {decision === 'approve' ? (
                <button data-testid="approve-confirm" disabled={busy} onClick={() => void confirmDecision()} className={primary}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Approve
                </button>
              ) : (
                <button
                  data-testid="reject-confirm"
                  disabled={busy || !decisionNote.trim()}
                  onClick={() => void confirmDecision()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#B42318] px-4 text-sm font-medium text-white hover:bg-[#912018] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />} Reject lead
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mark-lost modal — captures a validated LossReason (+ note). onConfirm must THROW on failure so
          the modal can surface the error and stay open; on success we refresh the lead like act() does. */}
      {lostOpen && (
        <MarkLostModal
          leadTitle={lead.title}
          onCancel={() => setLostOpen(false)}
          onConfirm={async (reason: LossReason, note?: string) => {
            await markLost(id, reason, note);
            dispatch(fetchLead(id));
            setMsg('Marked lost');
            setLostOpen(false);
          }}
        />
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: ReactNode }) {
  return <div><div className="text-[11px] uppercase tracking-wide text-[#9A948E]">{k}</div><div className="mt-0.5 font-medium">{v}</div></div>;
}

function TimelineRow({ done, label, sub, pending, rejected }: { done?: boolean; label: string; sub?: string; pending?: boolean; rejected?: boolean }) {
  const Icon = rejected ? XCircle : done ? CheckCircle2 : Clock;
  const iconCls = rejected ? 'text-[#B42318]' : done ? 'text-[#0E7C5A]' : 'text-[#C4C0BB]';
  const labelCls = rejected ? 'font-medium text-[#B42318]' : done ? 'font-medium text-[#0F0F0F]' : 'text-[#9A948E]';
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={17} className={`mt-0.5 shrink-0 ${iconCls}`} />
      <div><div className={`text-[13px] ${labelCls}`}>{label}</div>{sub && <div className="text-[12px] text-[#9A948E]">{sub}</div>}{pending && !done && !rejected && <div className="text-[12px] text-[#9A948E]">Pending</div>}</div>
    </div>
  );
}

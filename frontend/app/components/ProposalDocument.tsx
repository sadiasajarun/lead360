import { Fragment, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { RefreshCw, Loader2, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { ProposalSectionEditor } from '~/components/ProposalSectionEditor';
import { DiagramIcon, accentFor } from '~/components/diagramIcons';
import { formatMoney, formatMoneyWhole } from '~/enums/currency.enum';

// Branded Riseup proposal document, matching design/html/client/proposal-view.page.html:
// dark hero, sticky section nav (TOC), eyebrow-numbered sections, and — where the generator emits
// structured data — warm cards, requirement/response tables, a tech-stack table, a milestone timeline,
// comparable-work cards, an investment total and a CTA. Falls back to prose for plain-string sections.
// Shared by the Lead Detail Proposal tab and the standalone client proposal-view.

const SECTIONS: { key: string; title: string }[] = [
  { key: 'executiveSummary', title: 'Executive Summary' },
  { key: 'projectUnderstanding', title: 'Project Understanding' },
  { key: 'proposedScope', title: 'Proposed Scope' },
  { key: 'domainTables', title: 'Scope & Inventory Tables' },
  { key: 'technicalApproach', title: 'Proposed Technical Approach' },
  { key: 'architecture', title: 'High-Level Architecture' },
  { key: 'architectureDiagram', title: 'System Architecture' },
  { key: 'workflowDiagram', title: 'Key Workflow' },
  { key: 'controlFlowDiagram', title: 'Control Flow' },
  { key: 'technicalStack', title: 'Proposed Technical Stack' },
  { key: 'developmentMethodology', title: 'Development Methodology' },
  { key: 'timeline', title: 'Suggested Timeline' },
  { key: 'deliverables', title: 'Deliverables' },
  { key: 'paymentTerms', title: 'Payment Terms' },
  { key: 'changeRequest', title: 'Change Request' },
  { key: 'testingQa', title: 'Testing & Quality Assurance' },
  { key: 'assumptions', title: 'Assumptions & Dependencies' },
  { key: 'conclusion', title: 'Conclusion' },
];
// Keys consumed by other blocks (hero/cards), not rendered as their own numbered section.
const NON_SECTION = new Set(['outcome', 'approach', 'comparableProjects', 'coverTagline']);

const humanize = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
const paras = (t: unknown) => String(t ?? '').split(/\n{1,}/).map((s) => s.trim()).filter(Boolean);
const num2 = (n: number) => String(n).padStart(2, '0');
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isObjArr = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => x != null && typeof x === 'object' && !Array.isArray(x));
const present = (v: unknown) => isStr(v) || (Array.isArray(v) ? v.length > 0 : false);

// ---- Diagram/table sections (structured generator output). Old proposals may lack these keys or emit
// ---- malformed shapes — validators return null/[] so the section is silently skipped, never crashes.
// ---- All of these are JSON-shaped and NOT hand-editable (pencil hidden; Regenerate/Delete stay).
const DIAGRAM_KEYS = new Set(['architectureDiagram', 'workflowDiagram', 'controlFlowDiagram', 'domainTables']);

// Model titles sometimes already start with "Figure N:" / "Table:" — strip it so captions don't double up.
const stripCaption = (t: string) => t.replace(/^(figure|fig\.?|table)\s*\d*\s*[:.\-]\s*/i, '');

// Fallback target for comparable-work cards whose project isn't on the scraped portfolio.
const PORTFOLIO_INDEX = 'https://riseuplabs.com/portfolio/';

// A tinted panel at the bottom of a figure — `focus` (architecture) / `footer` (workflow). Optional.
interface FigureStrip { text: string; chips: string[] }
const asFigureStrip = (v: unknown): FigureStrip | null => {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.text)) return null;
  return { text: o.text, chips: isStrArr(o.chips) ? o.chips : [] };
};

interface ArchGroup { label: string; items: string[]; icon?: string }
const asArchDiagram = (v: unknown): { title: string; subtitle?: string; groups: ArchGroup[]; focus: FigureStrip | null } | null => {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.title) || !Array.isArray(o.groups)) return null;
  const groups = (o.groups as unknown[])
    .filter((g): g is Record<string, unknown> => g != null && typeof g === 'object' && isStr((g as Record<string, unknown>).label) && isStrArr((g as Record<string, unknown>).items))
    .map((g) => ({ label: String(g.label), items: g.items as string[], icon: isStr(g.icon) ? g.icon : undefined }));
  return groups.length ? { title: o.title, subtitle: isStr(o.subtitle) ? o.subtitle : undefined, groups, focus: asFigureStrip(o.focus) } : null;
};

interface WorkflowStep { title: string; detail: string; icon?: string }
const asWorkflowDiagram = (v: unknown): { title: string; subtitle?: string; steps: WorkflowStep[]; footer: FigureStrip | null } | null => {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.title) || !Array.isArray(o.steps)) return null;
  const steps = (o.steps as unknown[])
    .filter((s): s is Record<string, unknown> => s != null && typeof s === 'object' && isStr((s as Record<string, unknown>).title))
    .map((s) => ({ title: String(s.title), detail: isStr(s.detail) ? s.detail : '', icon: isStr(s.icon) ? s.icon : undefined }));
  return steps.length ? { title: o.title, subtitle: isStr(o.subtitle) ? o.subtitle : undefined, steps, footer: asFigureStrip(o.footer) } : null;
};

interface DomainTable { title: string; headers: string[]; rows: string[][] }
const asDomainTables = (v: unknown): DomainTable[] => {
  if (!Array.isArray(v)) return [];
  return (v as unknown[])
    .filter((t): t is Record<string, unknown> =>
      t != null && typeof t === 'object' && isStr((t as Record<string, unknown>).title) &&
      isStrArr((t as Record<string, unknown>).headers) && ((t as Record<string, unknown>).headers as string[]).length > 0 &&
      Array.isArray((t as Record<string, unknown>).rows))
    .map((t) => ({
      title: String(t.title),
      headers: t.headers as string[],
      rows: (t.rows as unknown[]).filter((r): r is unknown[] => Array.isArray(r)).map((r) => r.map((c) => String(c ?? ''))),
    }));
};

// Structured sections only render when the shape is well-formed; everything else keeps the plain check.
const sectionPresent = (key: string, v: unknown) =>
  key === 'architectureDiagram' ? asArchDiagram(v) != null
  : key === 'workflowDiagram' || key === 'controlFlowDiagram' ? asWorkflowDiagram(v) != null
  : key === 'domainTables' ? asDomainTables(v).length > 0
  : present(v);

// Figure heading band: orange accent bar + bold title + optional grey subtitle (skipped when absent).
function FigureHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4 flex items-stretch gap-3">
      <div className="w-1 shrink-0 rounded-full bg-[#EA5400]" />
      <div>
        <div className="text-[21px] font-extrabold leading-tight tracking-[-0.01em] text-[#1A1715]">{stripCaption(title)}</div>
        {subtitle && <div className="mt-0.5 text-[12.5px] text-[#6B6660]">{stripCaption(subtitle)}</div>}
      </div>
    </div>
  );
}

// Bottom focus/footer strip: orange shield icon + text on the left, accent-tinted chip pills on the right.
function FigureStripBlock({ strip }: { strip: FigureStrip | null }) {
  if (!strip) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-[10px] border border-[#E8E6E3] bg-[#F8FAFC] px-3 py-2.5">
      <DiagramIcon name="shield" color="#EA5400" size={15} />
      <span className="text-[12.5px] font-medium text-[#39332e]">{strip.text}</span>
      {strip.chips.length > 0 && (
        <span className="ml-auto flex flex-wrap gap-1.5">
          {strip.chips.map((c, i) => (
            <span key={i} className="rounded-full border border-[#E8E6E3] bg-white px-2 py-0.5 text-[11px] font-semibold" style={{ color: accentFor(i).fg }}>{c}</span>
          ))}
        </span>
      )}
    </div>
  );
}

// Illustrated architecture figure (mirrors Riseup's real figures): heading band, coloured icon nodes in
// a wrapping flex row joined by orange arrows, optional focus strip. Layout order of `groups` IS the
// flow order (the payload's `flows` pairs are informational only).
function ArchitectureDiagramBlock({ value }: { value: unknown }) {
  const d = asArchDiagram(value);
  if (!d) return null;
  return (
    <div data-testid="architecture-diagram" className="rounded-xl border border-[#E8E6E3] bg-white p-5">
      <FigureHead title={d.title} subtitle={d.subtitle} />
      <div className="flex flex-wrap items-stretch gap-2.5">
        {d.groups.map((g, i) => {
          const a = accentFor(i);
          return (
            <Fragment key={i}>
              {i > 0 && <div className="self-center text-[18px] font-bold text-[#EA5400]">→</div>}
              <div className="min-w-[150px] flex-1 rounded-[10px] border bg-white p-3.5" style={{ borderColor: a.bd }}>
                <div className="mb-2 flex items-center gap-1.5">
                  <DiagramIcon name={g.icon} color={a.fg} size={18} />
                  <span className="grid h-[18px] w-[18px] place-items-center rounded-full text-[10.5px] font-extrabold" style={{ background: a.bg, color: a.fg }}>{i + 1}</span>
                  <span className="text-[13px] font-extrabold text-[#1A1715]">{g.label}</span>
                </div>
                {g.items.map((it, j) => (
                  <div key={j} className="mt-1 flex items-center gap-1.5 text-[12px] leading-[1.4] text-[#5c554e]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.fg }} />
                    {it}
                  </div>
                ))}
              </div>
            </Fragment>
          );
        })}
      </div>
      <FigureStripBlock strip={d.focus} />
    </div>
  );
}

// Illustrated workflow/control-flow figure (shared by workflowDiagram & controlFlowDiagram): heading
// band, numbered icon step cards in a wrapping flex row joined by orange arrows, optional footer strip.
function WorkflowDiagramBlock({ value, testId = 'workflow-diagram' }: { value: unknown; testId?: string }) {
  const d = asWorkflowDiagram(value);
  if (!d) return null;
  return (
    <div data-testid={testId} className="rounded-xl border border-[#E8E6E3] bg-white p-5">
      <FigureHead title={d.title} subtitle={d.subtitle} />
      <div className="flex flex-wrap items-stretch gap-2.5">
        {d.steps.map((st, i) => {
          const a = accentFor(i);
          return (
            <Fragment key={i}>
              {i > 0 && <div className="self-center text-[18px] font-bold text-[#EA5400]">→</div>}
              <div className="min-w-[150px] max-w-[220px] flex-1 rounded-[10px] border bg-white p-3.5" style={{ borderColor: a.bd }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="grid h-[22px] w-[22px] place-items-center rounded-full text-[11.5px] font-extrabold text-white" style={{ background: a.fg }}>{i + 1}</span>
                  <DiagramIcon name={st.icon} color={a.fg} size={17} />
                </div>
                <div className="text-[13px] font-bold text-[#1A1715]">{st.title}</div>
                {st.detail && <p className="mt-1 text-[12px] leading-[1.5] text-[#5c554e]">{st.detail}</p>}
              </div>
            </Fragment>
          );
        })}
      </div>
      <FigureStripBlock strip={d.footer} />
    </div>
  );
}

// Inventory/option tables (0-3 per proposal, e.g. Game Inventory): bold title + a table per item.
function DomainTablesBlock({ value }: { value: unknown }) {
  const tables = asDomainTables(value);
  if (!tables.length) return null;
  return (
    <div data-testid="domain-tables" className="flex flex-col gap-5">
      {tables.map((t, i) => (
        <div key={i}>
          <div className="mb-2 text-[15px] font-bold text-[#1A1715]">{stripCaption(t.title)}</div>
          <div className="overflow-x-auto rounded-xl border border-[#EAE4DE]">
            <table className="w-full text-[14px]">
              <thead className="bg-[#FBF7F3] text-left text-[11px] uppercase tracking-wide text-[#9A948E]">
                <tr>{t.headers.map((h, j) => <th key={j} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {t.rows.map((r, ri) => (
                  <tr key={ri} className="border-t border-[#EAE4DE] align-top">
                    {t.headers.map((_, ci) => (
                      <td key={ci} className={`px-4 py-3 leading-[1.55] ${ci === 0 ? 'font-medium text-[#1A1715]' : 'text-[#5c554e]'}`}>{r[ci] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export interface Pricing {
  totalCents: number;
  milestones: { name: string; amountCents: number }[];
  indicative?: boolean;
  budgetHref?: string;
}

/** Agency & Design-Portfolio deliver ONE combined document — the budget lives inside the proposal
 *  as the Financial Proposal section (Generation-Engine spec §5, §3.3 / §3.4). Payment Terms and
 *  Change Request now come from the generator's paymentTerms / changeRequest sections. */
export interface FinancialProposal {
  currency: string;
  lines: { department: string; role: string; seniority: string; units: number; days: number; dayRateCents: number | string; optional?: boolean }[];
  subtotalCents: number;
  contingencyCents: number;
  discountCents: number;
  vatCents: number;
  totalCents: number;
}

export interface ProposalDocumentProps {
  title: string;
  company: string;
  template: string;
  valueLabel?: string;
  pricing?: Pricing;
  sections: Record<string, unknown>;
  contactName?: string;
  withNav?: boolean;
  /** The lead's own budget currency (ISO-4217) — formats the hero Investment + Pricing Summary. Never
   *  the Budget-tab view currency; the hero must stay in the authored currency. Defaults to USD. */
  currency?: string;
  /** When provided (internal view), each section gets a prompt-driven regenerate control. */
  onRegenerateSection?: (key: string, instruction: string) => Promise<void>;
  /** When provided, each section is editable inline (per point / per table row). */
  onSaveSection?: (key: string, value: unknown) => Promise<void>;
  /** When provided, each section can be deleted. */
  onDeleteSection?: (key: string) => Promise<void>;
  /** Agency / Design Portfolio only: renders the budget INSIDE the proposal as the Financial Proposal
   *  section, and suppresses the lightweight Pricing Summary (spec §5). */
  financial?: FinancialProposal;
  /** When provided (internal view), Units/Days in the Financial Proposal are editable; called with
   *  EVERY row's current values so the parent can PUT the full budget via the Budget-tab plumbing. */
  onSaveLines?: (lines: { index: number; units: number; days: number }[]) => Promise<void>;
  /** When provided (internal view), the hero project name is inline-editable (persists to the lead). */
  onSaveTitle?: (title: string) => Promise<void>;
}

// Per-section regenerate: a small control that takes a plain-English prompt and rewrites just that section.
function RegenSection({ sectionKey, onRegenerate }: { sectionKey: string; onRegenerate: (key: string, instruction: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try { await onRegenerate(sectionKey, prompt.trim()); setOpen(false); setPrompt(''); }
    finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button data-testid={`regen-${sectionKey}`} onClick={() => setOpen(true)}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[#EAE4DE] bg-white px-2.5 text-[12px] font-medium text-[#6B6660] hover:border-[#EA5400] hover:text-[#EA5400]">
        <RefreshCw size={13} /> Regenerate
      </button>
    );
  }
  return (
    <div data-testid={`regen-box-${sectionKey}`} className="mt-2 w-full rounded-xl border border-[#EAE4DE] bg-[#FBF7F3] p-3">
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={busy}
        placeholder="Describe the change, e.g. 'tighten this and emphasise the SAP integration'…"
        className="min-h-[64px] w-full rounded-md border border-[#EAE4DE] bg-white p-2.5 text-[13px] outline-none focus:border-[#EA5400]" />
      <div className="mt-2 flex items-center gap-2">
        <button data-testid={`regen-run-${sectionKey}`} onClick={run} disabled={busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#EA5400] px-3 text-[13px] font-medium text-white hover:bg-[#CC4900] disabled:opacity-50">
          {busy ? <><Loader2 size={13} className="animate-spin" /> Regenerating…</> : <><RefreshCw size={13} /> Regenerate section</>}
        </button>
        <button onClick={() => setOpen(false)} disabled={busy} className="h-8 rounded-md px-2.5 text-[13px] font-medium text-[#6B6660] hover:bg-[#F4F4F2]">Cancel</button>
      </div>
    </div>
  );
}

// §11 (Agency) / §10 (Design Portfolio) Financial Proposal: cost breakdown. With onSaveLines (internal
// view) Units/Days are editable and the row cost + subtotal/total recompute live; Per-Day stays
// read-only (the rate card is the source). Payment Terms & Change Request render as their own sections.
function FinancialProposalBlock({ fp, onSaveLines }: { fp: FinancialProposal; onSaveLines?: ProposalDocumentProps['onSaveLines'] }) {
  const [rows, setRows] = useState(fp.lines.map((l) => ({ units: Number(l.units), days: Number(l.days) })));
  const [saving, setSaving] = useState(false);
  // Re-baseline only when the server values actually change (a parent re-render must not wipe in-progress edits).
  const baseline = fp.lines.map((l) => `${l.units}x${l.days}`).join('|');
  useEffect(() => { setRows(fp.lines.map((l) => ({ units: Number(l.units), days: Number(l.days) }))); }, [baseline]);

  const row = (i: number) => rows[i] ?? { units: Number(fp.lines[i].units), days: Number(fp.lines[i].days) };
  const setRow = (i: number, patch: Partial<{ units: number; days: number }>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const cost = (i: number) => Math.round(row(i).units * row(i).days * Number(fp.lines[i].dayRateCents));
  const origCost = (l: FinancialProposal['lines'][number]) => Math.round(Number(l.units) * Number(l.days) * Number(l.dayRateCents));
  const dirty = fp.lines.some((l, i) => row(i).units !== Number(l.units) || row(i).days !== Number(l.days));
  // Live subtotal/total: apply the edit delta on top of the server figures (optional lines are excluded server-side).
  const delta = fp.lines.reduce((s, l, i) => s + (l.optional ? 0 : cost(i) - origCost(l)), 0);
  const adj: [string, number][] = [
    ['Contingency', fp.contingencyCents],
    ['Discount', -fp.discountCents],
    ['VAT / Tax', fp.vatCents],
  ];

  const save = async () => {
    if (!onSaveLines) return;
    setSaving(true);
    try { await onSaveLines(fp.lines.map((_, i) => ({ index: i, units: Math.max(0, Math.round(row(i).units)), days: Math.max(0, Math.round(row(i).days)) }))); }
    finally { setSaving(false); }
  };

  const fmt = (c: number) => formatMoney(c, fp.currency);
  const inp = 'h-7 w-14 rounded border border-[#E8E6E3] px-1.5 text-right text-[13px] tabular-nums focus:border-[#EA5400] focus:outline-none';
  return (
    <div data-testid="financial-proposal">
      <h3 className="mb-2 mt-1 text-[17px] font-bold text-[#1A1715]">Estimated Cost Breakdown</h3>
      <div className="overflow-x-auto rounded-xl border border-[#EAE4DE]">
        <table className="w-full text-[13.5px]">
          <thead className="bg-[#FBF7F3] text-left text-[11px] uppercase tracking-wide text-[#9A948E]">
            <tr>{['Department', 'Role', 'Type', 'Units', 'Days', 'Per-Day', 'Unit Cost'].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {fp.lines.map((l, i) => (
              <tr key={i} className="border-t border-[#EAE4DE]">
                <td className="px-3 py-2 font-medium text-[#1A1715]">{l.department}</td>
                <td className="px-3 py-2 text-[#5c554e]">{l.role}</td>
                <td className="px-3 py-2 capitalize text-[#5c554e]">{l.seniority}</td>
                <td className="px-3 py-2 tabular-nums text-[#5c554e]">
                  {onSaveLines ? <input data-testid={`fp-units-${i}`} type="number" min={0} value={row(i).units} onChange={(e) => setRow(i, { units: Number(e.target.value) || 0 })} className={inp} /> : l.units}
                </td>
                <td className="px-3 py-2 tabular-nums text-[#5c554e]">
                  {onSaveLines ? <input data-testid={`fp-days-${i}`} type="number" min={0} value={row(i).days} onChange={(e) => setRow(i, { days: Number(e.target.value) || 0 })} className={inp} /> : l.days}
                </td>
                <td className="px-3 py-2 tabular-nums text-[#5c554e]">{fmt(Number(l.dayRateCents))}</td>
                <td className="px-3 py-2 tabular-nums font-medium text-[#1A1715]">{fmt(cost(i))}</td>
              </tr>
            ))}
            <tr className="border-t border-[#D4D1CC] bg-[#FBF7F3]"><td colSpan={6} className="px-3 py-2 font-semibold">Subtotal</td><td className="px-3 py-2 tabular-nums font-semibold">{fmt(fp.subtotalCents + delta)}</td></tr>
            {adj.filter(([, v]) => v !== 0).map(([label, v]) => (
              <tr key={label} className="bg-[#FBF7F3]"><td colSpan={6} className="px-3 py-1.5 text-[#5c554e]">{label}</td><td className="px-3 py-1.5 tabular-nums text-[#5c554e]">{v < 0 ? '−' : '+'}{fmt(Math.abs(v))}</td></tr>
            ))}
            <tr className="border-t border-[#D4D1CC] bg-[#1A1715] text-white"><td colSpan={6} className="px-3 py-2.5 font-bold">Total ({fp.currency})</td><td className="px-3 py-2.5 tabular-nums font-bold text-[#FF8A3D]">{fmt(fp.totalCents + delta)}</td></tr>
          </tbody>
        </table>
      </div>
      {onSaveLines && dirty && (
        <div className="mt-3 flex justify-end">
          <button data-testid="fp-save-lines" onClick={save} disabled={saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#EA5400] px-3 text-[13px] font-medium text-white hover:bg-[#CC4900] disabled:opacity-50">
            {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  );
}

// Build the pricing summary: real per-milestone amounts from the budget when it has milestones,
// else an INDICATIVE split of the real total across the proposal's timeline (weighted by week span).
export function buildPricing(
  totalCents: number,
  lines: { milestoneName?: string; units: number; days: number; dayRateCents: number | string; optional?: boolean }[],
  timeline: unknown,
  budgetHref?: string,
): Pricing {
  const cost = (l: { units: number; days: number; dayRateCents: number | string }) =>
    Math.round((Number(l.units) || 0) * (Number(l.days) || 0) * (Number(l.dayRateCents) || 0));
  const byMs = new Map<string, number>();
  lines.forEach((l) => { if (l.milestoneName && !l.optional) byMs.set(l.milestoneName, (byMs.get(l.milestoneName) ?? 0) + cost(l)); });
  if (byMs.size >= 2) {
    return { totalCents, milestones: [...byMs].map(([name, amountCents]) => ({ name, amountCents })), budgetHref };
  }
  const ms = Array.isArray(timeline) ? (timeline as Record<string, unknown>[]).filter((t) => t && (t.milestone || t.name)) : [];
  if (ms.length >= 2 && totalCents > 0) {
    const weeksOf = (w: unknown) => { const m = String(w ?? '').match(/(\d+)\s*[-–]\s*(\d+)/); return m ? Math.max(1, +m[2] - +m[1] + 1) : 1; };
    const weights = ms.map((t) => weeksOf(t.weeks));
    const sum = weights.reduce((a, b) => a + b, 0) || ms.length;
    let acc = 0;
    const milestones = ms.map((t, i) => {
      const amountCents = i === ms.length - 1 ? totalCents - acc : Math.round((totalCents * weights[i]) / sum);
      acc += amountCents;
      return { name: String(t.milestone ?? t.name), amountCents };
    });
    return { totalCents, milestones, indicative: true, budgetHref };
  }
  return { totalCents, milestones: [{ name: 'Full engagement', amountCents: totalCents }], budgetHref };
}

// Renders a section body by value shape: prose, bullet list, or an object-array table.
/** { stage, detail }[] → numbered subsections (4.1, 4.2 …) with prose, matching how Riseup's real
 *  proposals present the technical approach. Falls back to the generic body for other shapes. */
function SubsectionsBlock({ value, secNo }: { value: unknown; secNo: number }) {
  if (!isObjArr(value) || !value.every((r) => typeof r.stage === 'string')) return <SectionBody value={value} />;
  return (
    <div data-testid="technical-approach-subsections" className="flex flex-col gap-6">
      {value.map((r, i) => (
        <div key={i}>
          <h3 className="mb-1.5 text-[17px] font-bold text-[#1A1715]">
            <span className="mr-2 text-[#EA5400]">{secNo}.{i + 1}</span>{String(r.stage)}
          </h3>
          <p className="text-[15px] leading-[1.75] text-[#5c554e]">{String(r.detail ?? '')}</p>
        </div>
      ))}
    </div>
  );
}

function SectionBody({ value, highlight }: { value: unknown; highlight?: boolean }) {
  if (isObjArr(value)) {
    const cols = Array.from(value.reduce((set, row) => { Object.keys(row).forEach((k) => set.add(k)); return set; }, new Set<string>()));
    return (
      <div className="overflow-x-auto rounded-xl border border-[#EAE4DE]">
        <table className="w-full text-[14px]">
          <thead className="bg-[#FBF7F3] text-left text-[11px] uppercase tracking-wide text-[#9A948E]">
            <tr>{cols.map((c) => <th key={c} className="px-4 py-2.5 font-semibold">{humanize(c)}</th>)}</tr>
          </thead>
          <tbody>
            {value.map((row, i) => (
              <tr key={i} className="border-t border-[#EAE4DE] align-top">
                {cols.map((c, j) => (
                  <td key={c} className={`px-4 py-3 leading-[1.55] ${j === 0 ? 'font-medium text-[#1A1715]' : 'text-[#5c554e]'}`}>{String(row[c] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (isStrArr(value)) {
    return <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-[1.65] text-[#39332e]">{value.map((t, i) => <li key={i}>{t}</li>)}</ul>;
  }
  return (
    <div className={`text-[15px] leading-[1.7] text-[#39332e] ${highlight ? 'rounded-2xl border border-[#EAE4DE] bg-[#FBF7F3] p-6' : ''}`}>
      {paras(value).map((p, j) => <p key={j} className={`${j > 0 ? 'mt-3' : ''} ${highlight ? 'text-[17px] text-[#2a2521]' : ''}`}>{p}</p>)}
    </div>
  );
}

export function ProposalDocument({ title, company, template, valueLabel, pricing, sections, withNav = true, currency = 'USD', onRegenerateSection, onSaveSection, onDeleteSection, financial, onSaveLines, onSaveTitle }: ProposalDocumentProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // Hero inline editing: project name (persists to the lead) and cover tagline (a proposal section).
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingTagline, setEditingTagline] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [taglineDraft, setTaglineDraft] = useState('');
  const [heroBusy, setHeroBusy] = useState(false);
  // Hero "Investment" + Pricing Summary total are client HEADLINE figures → whole units (no cents).
  // The detailed cost breakdown (FinancialProposalBlock, below) keeps its cents via formatMoney.
  const investLabel = financial ? formatMoneyWhole(financial.totalCents, financial.currency) : pricing && pricing.totalCents > 0 ? formatMoneyWhole(pricing.totalCents, currency) : valueLabel;
  // Combined templates carry the full Financial Proposal instead of the lightweight Pricing Summary.
  const showPricing = !financial && ((pricing && pricing.totalCents > 0) || !!valueLabel);
  const known = SECTIONS.filter((s) => sectionPresent(s.key, sections[s.key]));
  const extras = Object.keys(sections)
    .filter((k) => !SECTIONS.some((s) => s.key === k) && !NON_SECTION.has(k) && present(sections[k]))
    .map((k) => ({ key: k, title: humanize(k) }));
  const ordered = [...known, ...extras];

  const [active, setActive] = useState(ordered[0]?.key ?? '');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!withNav) return;
    const root = rootRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id.replace('sec-', ''));
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
    );
    ordered.forEach((s) => { const el = root.querySelector(`#sec-${s.key}`); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [withNav, ordered.length]);

  // Cover summary: the generator's short `coverTagline` first; older proposals fall back to `outcome`,
  // then to the first sentence (not paragraph) of the executive summary — never the whole thing.
  const firstSentence = (t: unknown) => String(t ?? '').split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').trim();
  const heroTagline =
    (isStr(sections.coverTagline) ? sections.coverTagline.trim() : '') ||
    (isStr(sections.outcome) ? sections.outcome.trim() : '') ||
    firstSentence(sections.executiveSummary) ||
    `A tailored engagement for ${company}.`;

  const saveTitle = async () => {
    const t = titleDraft.trim();
    if (!onSaveTitle || !t || t === title) { setEditingTitle(false); return; }
    setHeroBusy(true);
    try { await onSaveTitle(t); setEditingTitle(false); } finally { setHeroBusy(false); }
  };
  const saveTagline = async () => {
    const t = taglineDraft.trim();
    if (!onSaveSection || !t) { setEditingTagline(false); return; }
    setHeroBusy(true);
    try { await onSaveSection('coverTagline', t); setEditingTagline(false); } finally { setHeroBusy(false); }
  };
  const docDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  // Up to 6 tech keywords from the technicalStack table (guarded — the stack may be missing or malformed).
  const stackKeywords = (Array.isArray(sections.technicalStack) ? (sections.technicalStack as unknown[]) : [])
    .map((r) => (r != null && typeof r === 'object' && !Array.isArray(r) && isStr((r as Record<string, unknown>).tech) ? String((r as Record<string, unknown>).tech) : ''))
    .filter(Boolean)
    .slice(0, 6)
    .join(' · ');
  const outcome = isStr(sections.outcome) ? sections.outcome : '';
  const approach = isStr(sections.approach) ? sections.approach : '';
  const comparable = isObjArr(sections.comparableProjects) ? sections.comparableProjects : [];

  // Edit / Regenerate / Delete controls for a section (only in the internal, editable view).
  const sectionActions = (key: string): ReactNode => {
    if (!onSaveSection && !onRegenerateSection && !onDeleteSection) return undefined;
    if (editingKey === key) return undefined; // editor shows its own Save/Cancel
    const btn = 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[#EAE4DE] bg-white px-2.5 text-[12px] font-medium';
    return (
      <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
        {/* Diagram sections are JSON-shaped — hand-editing makes no sense, so hide the pencil (Regenerate/Delete stay). */}
        {onSaveSection && !DIAGRAM_KEYS.has(key) && (
          <button data-testid={`edit-${key}`} onClick={() => setEditingKey(key)}
            className={`${btn} text-[#6B6660] hover:border-[#EA5400] hover:text-[#EA5400]`}><Pencil size={13} /> Edit</button>
        )}
        {onRegenerateSection && <RegenSection sectionKey={key} onRegenerate={onRegenerateSection} />}
        {onDeleteSection && (
          <button data-testid={`delete-${key}`}
            onClick={() => { if (window.confirm(`Delete the "${SECTIONS.find((s) => s.key === key)?.title ?? humanize(key)}" section?`)) void onDeleteSection(key); }}
            className={`${btn} text-[#B42318] hover:border-[#B42318] hover:bg-[#FDF3F2]`}><Trash2 size={13} /> Delete</button>
        )}
      </div>
    );
  };

  // Big, bold section heading with a filled number badge (and an optional trailing action).
  const sectionBadge = (label: ReactNode, title: string, action?: ReactNode) => (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EA5400] text-[15px] font-extrabold text-white">{label}</span>
      <h2 className="text-[26px] font-extrabold leading-tight tracking-[-0.015em] text-[#1A1715] sm:text-[28px]">{title}</h2>
      {action}
    </div>
  );

  const article = (
    <article className="min-w-0" ref={rootRef}>
      {/* AI-REVIEW WARNING — internal-only guidance for Sales/PM & Admin before the proposal goes out */}
      <div data-testid="ai-review-warning" className="mb-6 flex items-start gap-2.5 rounded-xl border border-[#F79009]/40 bg-[#FFFAEB] px-4 py-3 text-[13px] leading-[1.6] text-[#B54708]">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div><b>AI-generated draft — review before sending.</b> Double-check: budget figures & day rates · technical requirements coverage · timeline commitments · client names and terminology.</div>
      </div>

      {/* HERO */}
      <div className="relative mb-12 overflow-hidden rounded-[24px] px-8 py-12 text-white shadow-[0_8px_30px_rgba(26,23,21,0.18)] sm:px-12"
        style={{ background: 'radial-gradient(120% 140% at 0% 0%, #2a2420 0%, #1A1715 55%)' }}>
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-50 blur-3xl" style={{ background: 'linear-gradient(120deg,#EA5400,#FF8A3D)' }} />
        <div className="relative mb-5 flex items-center gap-2.5">
          <img src="/riseup-logo.png" alt="Riseup Labs" className="h-10 w-auto"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        </div>
        <div className="relative text-[13px] font-semibold uppercase tracking-[0.14em] text-[#FFB27E]">Technical Proposal · Riseup Labs</div>

        {/* Project name — inline-editable when the parent supplies onSaveTitle (internal view only). */}
        {editingTitle ? (
          <div className="relative mb-3 mt-3.5 flex max-w-[640px] flex-wrap items-center gap-2">
            <input
              data-testid="hero-title-input"
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
              className="min-w-0 flex-1 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-[30px] font-extrabold text-white outline-none focus:border-[#EA5400]"
            />
            <button data-testid="hero-title-save" onClick={() => void saveTitle()} disabled={heroBusy}
              className="rounded-md bg-[#EA5400] px-3 py-2 text-[13px] font-semibold disabled:opacity-50">{heroBusy ? '…' : 'Save'}</button>
            <button onClick={() => setEditingTitle(false)} className="rounded-md border border-white/25 px-3 py-2 text-[13px] font-medium">Cancel</button>
          </div>
        ) : (
          <h1 className="group relative mb-3 mt-3.5 flex max-w-[680px] items-start gap-2 text-[38px] font-extrabold leading-[1.08] sm:text-[44px]">
            {title}
            {onSaveTitle && (
              <button data-testid="hero-title-edit" title="Edit project name" onClick={() => { setTitleDraft(title); setEditingTitle(true); }}
                className="mt-2 shrink-0 rounded-md p-1.5 text-white/40 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white">
                <Pencil size={16} />
              </button>
            )}
          </h1>
        )}

        {/* Cover tagline — 1-2 lines, NOT the executive summary. Editable like any other section. */}
        {editingTagline ? (
          <div className="relative flex max-w-[600px] flex-col gap-2">
            <textarea
              data-testid="hero-tagline-input"
              autoFocus
              value={taglineDraft}
              onChange={(e) => setTaglineDraft(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-[15px] leading-relaxed text-white outline-none focus:border-[#EA5400]"
            />
            <div className="flex gap-2">
              <button data-testid="hero-tagline-save" onClick={() => void saveTagline()} disabled={heroBusy}
                className="rounded-md bg-[#EA5400] px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50">{heroBusy ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditingTagline(false)} className="rounded-md border border-white/25 px-3 py-1.5 text-[13px] font-medium">Cancel</button>
            </div>
          </div>
        ) : (
          <p className="group relative flex max-w-[600px] items-start gap-2 text-[16px] leading-relaxed text-[#d9cfc7]">
            {heroTagline}
            {onSaveSection && (
              <button data-testid="hero-tagline-edit" title="Edit cover summary" onClick={() => { setTaglineDraft(heroTagline); setEditingTagline(true); }}
                className="shrink-0 rounded-md p-1 text-white/40 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white">
                <Pencil size={13} />
              </button>
            )}
          </p>
        )}

        <div className="relative mt-3 text-[13px] font-medium text-[#b8aca3]">Version 1.0 · {docDate}</div>
        {stackKeywords && <div className="relative mt-1.5 text-[12.5px] tracking-[0.02em] text-[#9A948E]">{stackKeywords}</div>}
        {/* "Engagement" (template name) removed — internal jargon, per user decision 2026-07-10. */}
        <div className="relative mt-8 flex flex-wrap gap-7">
          {[['Prepared for', company], ['Timeline', '~12 weeks'], ['Investment', investLabel || '—']].map(([k, v]) => (
            <div key={k} className="text-[13px] text-[#b8aca3]">{k}<b className="mt-0.5 block text-[15px] font-semibold capitalize text-white">{v}</b></div>
          ))}
        </div>
      </div>

      {/* SECTIONS */}
      {ordered.map((s, i) => (
        <section key={s.key} id={`sec-${s.key}`} className="scroll-mt-24 pt-10">
          {sectionBadge(num2(i + 1), s.title, sectionActions(s.key))}
          {editingKey === s.key && onSaveSection ? (
            <ProposalSectionEditor
              value={sections[s.key]}
              onCancel={() => setEditingKey(null)}
              onSave={async (v) => { await onSaveSection(s.key, v); setEditingKey(null); }}
            />
          ) : s.key === 'architectureDiagram' ? (
            <ArchitectureDiagramBlock value={sections[s.key]} />
          ) : s.key === 'workflowDiagram' || s.key === 'controlFlowDiagram' ? (
            <WorkflowDiagramBlock value={sections[s.key]} testId={s.key === 'controlFlowDiagram' ? 'control-flow-diagram' : 'workflow-diagram'} />
          ) : s.key === 'domainTables' ? (
            <DomainTablesBlock value={sections[s.key]} />
          ) : s.key === 'technicalApproach' ? (
            <SubsectionsBlock value={sections[s.key]} secNo={i + 1} />
          ) : (
            <SectionBody value={sections[s.key]} highlight={s.key === 'executiveSummary'} />
          )}
          {/* Executive summary → Outcome / Approach mini-cards */}
          {s.key === 'executiveSummary' && (outcome || approach) && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {outcome && <div className="rounded-xl border border-[#EAE4DE] bg-[#FBF7F3] p-4"><div className="text-[13px] font-bold text-[#1A1715]">Outcome</div><p className="mt-1 text-[14px] leading-[1.6] text-[#5c554e]">{outcome}</p></div>}
              {approach && <div className="rounded-xl border border-[#EAE4DE] bg-[#FBF7F3] p-4"><div className="text-[13px] font-bold text-[#1A1715]">Approach</div><p className="mt-1 text-[14px] leading-[1.6] text-[#5c554e]">{approach}</p></div>}
            </div>
          )}
        </section>
      ))}

      {/* FINANCIAL PROPOSAL — Agency & Design Portfolio: the budget lives inside the proposal (§5) */}
      {financial && (
        <section id="sec-financial" className="scroll-mt-24 pt-10">
          {sectionBadge('＄', 'Financial Proposal')}
          <FinancialProposalBlock fp={financial} onSaveLines={onSaveLines} />
        </section>
      )}

      {/* PRICING SUMMARY — indicative milestone split + fixed total (detailed budget is separate) */}
      {showPricing && (
        <section id="sec-pricing" className="scroll-mt-24 pt-10">
          {sectionBadge('＄', 'Pricing Summary')}
          <h3 className="mb-2 text-[24px] font-extrabold tracking-[-0.01em] text-[#1A1715]">Investment</h3>
          <p className="mb-4 max-w-[620px] text-[14px] leading-[1.6] text-[#6B6660]">
            {pricing?.indicative ? 'Indicative milestone split shown below. ' : ''}The detailed budget — breakdown by role, rate and department — is delivered as a <b>separate document</b>.
          </p>
          <div className="rounded-2xl border border-[#EAE4DE] bg-white p-6">
            {pricing && pricing.milestones.length > 0 && (
              <div className="mb-5 flex flex-col gap-4">
                {pricing.milestones.map((m, i) => {
                  const pct = pricing.totalCents > 0 ? Math.max(4, Math.round((m.amountCents / pricing.totalCents) * 100)) : 0;
                  return (
                    <div key={i}>
                      <div className="mb-1.5 flex items-baseline justify-between">
                        <span className="text-[14px] font-semibold text-[#1A1715]">{`Milestone ${i + 1} · ${m.name}`}</span>
                        <span className="text-[14px] font-semibold tabular-nums text-[#1A1715]">{formatMoneyWhole(m.amountCents, currency)}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#F3ECE6]">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#EA5400,#FF8A3D)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex items-end justify-between border-t border-[#EAE4DE] pt-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9A948E]">Total (fixed)</div>
              <div className="text-[40px] font-extrabold leading-none tracking-[-0.02em] text-[#1A1715]">{investLabel || '—'}</div>
            </div>
            {pricing?.budgetHref && (
              <div className="mt-3 flex justify-end">
                <a href={pricing.budgetHref} target="_blank" rel="noreferrer" data-testid="proposal-view-budget"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-[#D4D1CC] bg-white px-3.5 text-[13px] font-medium text-[#1A1715] hover:bg-[#FBF7F3]">
                  View budget document
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* COMPARABLE RISEUP WORK */}
      {comparable.length > 0 && (
        <section id="sec-comparable" className="scroll-mt-24 pt-10">
          {sectionBadge('★', "Comparable Riseup Work")}
          <div className="grid gap-3 sm:grid-cols-2">
            {comparable.map((p, i) => (
              <div key={i} className="rounded-xl border border-[#EAE4DE] bg-white p-5">
                {/* Matched portfolio work links to its riseuplabs.com page; unmatched work falls back
                    to the portfolio index so every comparable card is clickable. */}
                <a
                  href={isStr(p.url) ? p.url : PORTFOLIO_INDEX}
                  target="_blank"
                  rel="noreferrer"
                  data-testid={`comparable-link-${i}`}
                  className="text-[15px] font-bold text-[#EA5400] hover:underline"
                >
                  {String(p.name ?? '')}
                </a>
                <p className="mt-1.5 text-[14px] leading-[1.6] text-[#5c554e]">{String(p.blurb ?? '')}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="mt-10">
        <div className="relative overflow-hidden rounded-[20px] bg-[#1A1715] p-10 text-center text-white">
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-60 w-60 rounded-full opacity-40 blur-3xl" style={{ background: 'linear-gradient(120deg,#EA5400,#FF8A3D)' }} />
          <h2 className="relative text-[26px] font-bold">Let's build.</h2>
          <p className="relative mx-auto mt-2 max-w-[440px] text-[15px] text-[#cfc7bf]">A proven team, fixed milestones, and weekly demos — grounded in Riseup Labs' delivery track record.</p>
        </div>
      </section>
    </article>
  );

  const navItems = [
    ...ordered,
    ...(financial ? [{ key: 'financial', title: 'Financial Proposal' }] : []),
    ...(showPricing ? [{ key: 'pricing', title: 'Investment' }] : []),
    ...(comparable.length ? [{ key: 'comparable', title: 'Comparable Work' }] : []),
  ];

  return (
    <div data-testid="proposal-document" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {withNav ? (
        <div className="grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav className="sticky top-6 hidden h-max self-start lg:block" aria-label="Sections">
            <ol className="flex flex-col gap-px">
              {navItems.map((s, i) => (
                <li key={s.key}>
                  <a href={`#sec-${s.key}`} onClick={() => setActive(s.key)}
                    className={`block border-l-2 px-3 py-[7px] text-[13px] transition-colors ${active === s.key ? 'border-[#EA5400] bg-[#FBF7F3] font-semibold text-[#EA5400]' : 'border-[#EAE4DE] text-[#9A948E] hover:text-[#1A1715]'}`}>
                    {s.key === 'pricing' || s.key === 'financial' ? '＄' : s.key === 'comparable' ? '★' : num2(i + 1)} · {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          {article}
        </div>
      ) : article}
    </div>
  );
}

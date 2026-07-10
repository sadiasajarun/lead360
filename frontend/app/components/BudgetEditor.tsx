import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Sparkles, Sheet, CalendarClock, Plus, RefreshCw, RotateCcw, Loader2, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '~/redux/store/hooks';
import { fetchBudget, updateBudget, suggestRate } from '~/services/httpServices/budgetService';
import { regenerateBudget } from '~/services/httpServices/leadDetailService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import { formatMoney } from '~/enums/currency.enum';
import type { BudgetLine } from '~/types/budget';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
const SENIORITIES = ['senior', 'mid', 'junior'];
const DEFAULT_MS = 'Delivery';

const uniq = (xs: string[]) => Array.from(new Set(xs));
const clampPct = (v: number, max = 1000) => Math.min(max, Math.max(0, v || 0));
const lineCost = (l: BudgetLine) => Math.round((Number(l.units) || 0) * (Number(l.days) || 0) * (Number(l.dayRateCents) || 0));

// Global adjustment math (contingency/discount/VAT are budget-wide, applied to the non-optional subtotal).
function computeTotals(lines: BudgetLine[], adj: { c: number; d: number; v: number }) {
  const sub = lines.reduce((s, l) => s + (l.optional ? 0 : lineCost(l)), 0);
  const cont = Math.round((sub * clampPct(adj.c)) / 100);
  const disc = Math.round((sub * clampPct(adj.d, 100)) / 100);
  const afterD = sub + cont - disc;
  const vat = Math.round((afterD * clampPct(adj.v)) / 100);
  return { sub, cont, disc, vat, total: afterD + vat };
}

export function BudgetEditor({ leadId }: { leadId: string }) {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((s) => s.budget);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [adj, setAdj] = useState({ c: 0, d: 0, v: 0 });
  const [version, setVersion] = useState(0);
  const [activeMs, setActiveMs] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [showOptional, setShowOptional] = useState(true);
  const [regenPrompt, setRegenPrompt] = useState('');
  const [regenBusy, setRegenBusy] = useState(false);

  useEffect(() => { dispatch(fetchBudget(leadId)); }, [dispatch, leadId]);
  useEffect(() => {
    if (data) {
      setLines(data.budget.lines.map((l) => ({ ...l })));
      setAdj({ c: Number(data.budget.contingencyPct), d: Number(data.budget.discountPct), v: Number(data.budget.vatPct) });
      setVersion(data.budget.version);
    }
  }, [data]);

  if (status === 'loading') return <div className="text-sm text-[#6B6660]">Loading budget…</div>;
  if (status === 'failed') return <div className="text-sm text-[#B42318]" data-testid="budget-error">{error}</div>;
  if (!data) return null;

  // Figures render in the budget's OWN authored currency (this editor is only shown for that currency;
  // display-only conversions go through the read-only BudgetConvertedView instead).
  const fmt = (cents: number) => formatMoney(cents, data.budget.currency);

  // ---- milestone + department hierarchy (presentation) ----
  const msNames = uniq(lines.map((l) => l.milestoneName || '').filter(Boolean));
  const milestones = msNames.length ? msNames : [DEFAULT_MS];
  const effMs = (l: BudgetLine) => l.milestoneName || milestones[0];
  const active = activeMs && milestones.includes(activeMs) ? activeMs : milestones[0];
  // rows of the active milestone, keeping each line's index into the master `lines` array
  const msRows = lines.map((l, i) => ({ l, i })).filter(({ l }) => effMs(l) === active);
  const depts = uniq(msRows.map(({ l }) => l.department || 'Development'));

  const totals = computeTotals(lines, adj);
  const msSubtotal = msRows.reduce((s, { l }) => s + (l.optional ? 0 : lineCost(l)), 0);

  const num = (v: string) => (v === '' ? 0 : Number(v));
  const setLine = (i: number, patch: Partial<BudgetLine>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  // On role/seniority change, auto-fill the day-rate from the maintained rate card (if found).
  const applyRate = async (i: number, role: string, seniority: string) => {
    try {
      const cents = await suggestRate(role, seniority);
      if (cents != null) setLine(i, { dayRateCents: cents });
    } catch { /* no matching rate — keep the current value */ }
  };

  const newLine = (department: string): BudgetLine => ({
    milestoneName: active === DEFAULT_MS && !msNames.length ? undefined : active,
    department, role: 'Backend Engineer', seniority: 'mid', units: 1, days: 5, dayRateCents: 32000, optional: false,
  });
  const addRole = (department: string) => setLines((ls) => [...ls, newLine(department)]);
  const addDept = () => {
    const name = window.prompt('New department name:', 'New Department');
    if (name?.trim()) setLines((ls) => [...ls, newLine(name.trim())]);
  };
  const addMilestone = () => {
    const name = window.prompt('New milestone name:', `Milestone ${milestones.length + 1}`);
    if (name?.trim()) { setActiveMs(name.trim()); setLines((ls) => [...ls, { ...newLine('Development'), milestoneName: name.trim() }]); }
  };

  // Strip entity-only fields (id/createdAt/budgetId/…) and coerce numeric types to match the backend
  // BudgetLineInput DTO (whitelist + forbidNonWhitelisted). dayRateCents comes back as a bigint string.
  const toInput = (ls: BudgetLine[]) =>
    ls.map((l) => ({
      milestoneName: l.milestoneName || undefined,
      department: l.department,
      role: l.role,
      seniority: l.seniority,
      units: Math.max(0, Math.round(Number(l.units) || 0)),
      days: Math.max(0, Math.round(Number(l.days) || 0)),
      dayRateCents: Math.max(0, Math.round(Number(l.dayRateCents) || 0)),
      optional: !!l.optional,
    }));

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const res = await updateBudget(leadId, { version, lines: toInput(lines), contingencyPct: adj.c, discountPct: adj.d, vatPct: adj.v, includeOptional: true });
      setVersion(res.budget.version);
      dispatch(fetchBudget(leadId));
      setMsg('Saved.');
    } catch (e) {
      setMsg(apiErrorMessage(e));
      dispatch(fetchBudget(leadId));
    } finally { setSaving(false); }
  };

  const resetToAI = () => {
    if (!data) return;
    setLines(data.budget.lines.map((l) => ({ ...l })));
    setAdj({ c: Number(data.budget.contingencyPct), d: Number(data.budget.discountPct), v: Number(data.budget.vatPct) });
    setMsg('Reset to the AI estimate.');
  };

  const regen = async () => {
    setRegenBusy(true); setMsg('');
    try {
      await regenerateBudget(leadId, regenPrompt.trim() || undefined);
      dispatch(fetchBudget(leadId));
      setRegenPrompt('');
      setMsg('Budget regenerated.');
    } catch (e) {
      setMsg(apiErrorMessage(e));
    } finally { setRegenBusy(false); }
  };

  const cell = 'h-8 w-16 rounded border border-transparent px-1.5 text-right text-sm tabular-nums hover:border-[#D4D1CC] focus:border-[#EA5400] focus:bg-[#FDF0E9] focus:outline-none';
  const roleCell = 'h-8 w-40 rounded border border-transparent px-1.5 text-sm hover:border-[#D4D1CC] focus:border-[#EA5400] focus:outline-none';
  const sel = 'h-8 rounded border border-[#E8E6E3] bg-white px-1.5 text-[13px] capitalize';
  let sl = 0;

  return (
    <div data-testid="budget-editor">
      {/* Controls row */}
      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-[#6B6660]">
          <input data-testid="budget-optional-toggle" type="checkbox" checked={showOptional} onChange={(e) => setShowOptional(e.target.checked)} className="accent-[#EA5400]" />
          Optional lines
        </label>
        <button data-testid="budget-reset" onClick={resetToAI} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-[#6B6660] hover:bg-[#F4F4F2] hover:text-[#0F0F0F]">
          <RotateCcw size={14} /> Reset to AI estimate
        </button>
      </div>

      {/* AI note */}
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#F3D9C7] bg-[#FDF6F0] px-3.5 py-2.5 text-[13px] text-[#6B6660]">
        <Sparkles size={16} className="mt-0.5 shrink-0 text-[#EA5400]" />
        <span><b className="text-[#0F0F0F]">How this was built:</b> the AI maps scope to roles &amp; day-estimates — grounded first in Riseup's past budgets &amp; proposals — and the app computes every total in code (rates come from the rate card). Grouped by milestone → department. Change role, seniority (auto-fills the card rate), units, days or rate; add/remove roles, departments or milestones; totals recompute live.</span>
      </div>

      {/* Milestone tabs */}
      <div data-testid="budget-milestones" className="mb-3 flex flex-wrap items-center gap-2">
        {milestones.map((m) => (
          <button key={m} data-testid={`budget-milestone-${m}`} onClick={() => setActiveMs(m)}
            className={`inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-semibold ${m === active ? 'border-[#141310] bg-[#141310] text-white' : 'border-[#D4D1CC] bg-white text-[#6B6660] hover:bg-[#F4F4F2]'}`}>
            {m}
          </button>
        ))}
        <button data-testid="budget-add-milestone" onClick={addMilestone} className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed border-[#D4D1CC] px-3 text-[13px] font-medium text-[#9A948E] hover:bg-[#F4F4F2]">
          <Plus size={13} /> Add milestone
        </button>
      </div>

      {/* Cost-breakdown header + engagement total */}
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-[#E8E6E3] bg-[#141310] px-4 py-2.5 text-white">
        <span className="text-[13px] font-semibold">Cost Breakdown · {active}</span>
        <span data-testid="budget-grand" className="text-[15px] font-bold tabular-nums text-[#EA5400]">{fmt(totals.total)}</span>
      </div>

      <div className="overflow-x-auto border-x border-[#E8E6E3]">
        <table className="w-full text-sm">
          <thead className="bg-[#F4F4F2] text-left text-xs uppercase tracking-wide text-[#9A948E]">
            <tr>
              <th className="w-10 px-3 py-2">Sl.</th><th className="px-3">Department</th><th className="px-3">Role / Head</th>
              <th className="px-3">Type</th><th className="px-3 text-right">Unit</th><th className="px-3 text-right">Days</th>
              <th className="px-3 text-right">Rate ({data.budget.currency})</th><th className="px-3 text-right">Unit Cost</th><th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {depts.map((dept) => {
              const rows = msRows.filter(({ l }) => (l.department || 'Development') === dept);
              const deptSubtotal = rows.reduce((s, { l }) => s + (l.optional ? 0 : lineCost(l)), 0);
              sl += 1;
              const deptSl = sl;
              return (
                <FragmentRows key={dept}>
                  {rows.map(({ l, i }, idx) => (!showOptional && l.optional) ? null : (
                    <tr key={i} data-testid={`budget-line-${i}`} className={`border-t border-[#E8E6E3] ${l.optional ? 'bg-[#FBF4EA]' : ''}`}>
                      <td className="px-3 py-1.5 align-top text-[#9A948E] tabular-nums">{idx === 0 ? deptSl : ''}</td>
                      <td className="px-3 align-top font-medium">{idx === 0 ? dept : ''}</td>
                      <td className="px-3"><input value={l.role} onChange={(e) => setLine(i, { role: e.target.value })} onBlur={(e) => applyRate(i, e.target.value, l.seniority)} className={roleCell} /></td>
                      <td className="px-3">
                        <select data-testid={`budget-seniority-${i}`} value={l.seniority} onChange={(e) => { setLine(i, { seniority: e.target.value }); applyRate(i, l.role, e.target.value); }} className={sel}>
                          {SENIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-3 text-right"><input type="number" min={0} value={l.units} onChange={(e) => setLine(i, { units: num(e.target.value) })} className={cell} /></td>
                      <td className="px-3 text-right"><input type="number" min={0} value={l.days} onChange={(e) => setLine(i, { days: num(e.target.value) })} className={cell} /></td>
                      <td className="px-3 text-right"><input type="number" min={0} value={Math.round(Number(l.dayRateCents) / 100)} onChange={(e) => setLine(i, { dayRateCents: num(e.target.value) * 100 })} className={cell} /></td>
                      <td className="px-3 text-right tabular-nums">{fmt(lineCost(l))}</td>
                      <td className="px-2 text-right align-top"><button data-testid={`budget-line-del-${i}`} onClick={() => removeLine(i)} className="text-[#9A948E] hover:text-[#B42318]"><X size={15} /></button></td>
                    </tr>
                  ))}
                  <tr className="border-t border-[#F0EEEB]">
                    <td colSpan={9} className="px-3 py-1.5">
                      <button data-testid={`budget-add-role-${dept}`} onClick={() => addRole(dept)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#EA5400] hover:underline"><Plus size={14} /> Add role</button>
                    </td>
                  </tr>
                  <tr className="border-t border-[#E8E6E3] bg-[#F9F8F6]">
                    <td /><td colSpan={6} className="px-3 py-2 font-semibold text-[#6B6660]">{dept} — subtotal</td>
                    <td className="px-3 text-right font-semibold tabular-nums">{fmt(deptSubtotal)}</td><td />
                  </tr>
                </FragmentRows>
              );
            })}

            <tr className="border-t border-[#D4D1CC] bg-[#F4F4F2]"><td /><td colSpan={6} className="px-3 py-2 font-medium text-[#6B6660]">Subtotal · {active}</td><td data-testid="budget-ms-subtotal" className="px-3 text-right font-semibold tabular-nums">{fmt(msSubtotal)}</td><td /></tr>
            <tr className="bg-[#F4F4F2]"><td /><td colSpan={6} className="px-3 py-1 text-[#6B6660]">Contingency <input type="number" min={0} value={adj.c} onChange={(e) => setAdj({ ...adj, c: num(e.target.value) })} data-testid="budget-contingency" className="ml-2 h-7 w-14 rounded border border-[#D4D1CC] px-1.5 text-right text-xs" />%</td><td className="px-3 text-right tabular-nums">+{fmt(totals.cont)}</td><td /></tr>
            <tr className="bg-[#F4F4F2]"><td /><td colSpan={6} className="px-3 py-1 text-[#6B6660]">Discount <input type="number" min={0} value={adj.d} onChange={(e) => setAdj({ ...adj, d: num(e.target.value) })} data-testid="budget-discount" className="ml-2 h-7 w-14 rounded border border-[#D4D1CC] px-1.5 text-right text-xs" />%</td><td className="px-3 text-right tabular-nums">−{fmt(totals.disc)}</td><td /></tr>
            <tr className="bg-[#F4F4F2]"><td /><td colSpan={6} className="px-3 py-1 text-[#6B6660]">VAT / Tax <input type="number" min={0} value={adj.v} onChange={(e) => setAdj({ ...adj, v: num(e.target.value) })} data-testid="budget-vat" className="ml-2 h-7 w-14 rounded border border-[#D4D1CC] px-1.5 text-right text-xs" />%</td><td className="px-3 text-right tabular-nums">+{fmt(totals.vat)}</td><td /></tr>
            <tr className="border-t border-[#D4D1CC] bg-[#141310] text-white"><td /><td colSpan={6} className="px-3 py-2.5 font-semibold">Total (engagement)</td><td data-testid="budget-total" className="px-3 text-right font-semibold tabular-nums text-[#EA5400]">{fmt(totals.total)}</td><td /></tr>
          </tbody>
        </table>
      </div>

      <button data-testid="budget-add-dept" onClick={addDept} className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-semibold text-[#EA5400] hover:underline"><Plus size={14} /> Add department</button>

      {/* Timeline note */}
      <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-[#E8E6E3] bg-[#FBFAF9] px-4 py-2.5 text-[13px] text-[#6B6660]">
        <CalendarClock size={15} className="shrink-0 text-[#EA5400]" />
        <span>Delivery timeline scales with total days. Full engagement total <b className="text-[#0F0F0F]">{fmt(totals.total)}</b> across all milestones.</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button data-testid="budget-save" onClick={save} disabled={saving} className="h-9 rounded-md bg-[#EA5400] px-4 text-sm font-medium text-white hover:bg-[#CC4900] disabled:opacity-50">{saving ? 'Saving…' : 'Save budget'}</button>
        <a data-testid="budget-export" href={`${API_BASE}/leads/${leadId}/budget/xlsx`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-3.5 text-sm font-medium hover:bg-[#F4F4F2]"><Sheet size={15} /> Export .xlsx</a>
        {msg && <span data-testid="budget-msg" className="text-[13px] text-[#6B6660]">{msg}</span>}
      </div>

      {/* Regenerate budget with AI */}
      <div className="mt-5 rounded-lg border border-[#E8E6E3] bg-[#F4F4F2] p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Regenerate budget with AI</div>
        <textarea
          data-testid="budget-regen-prompt"
          value={regenPrompt}
          onChange={(e) => setRegenPrompt(e.target.value)}
          placeholder="Describe a change in plain English, e.g. 'reduce DevOps to 4 days, add a senior QA lead, apply 10% contingency'…"
          className="min-h-[64px] w-full resize-y rounded-md border border-[#D4D1CC] bg-white px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:border-[#EA5400]"
        />
        <button
          data-testid="budget-regenerate"
          disabled={regenBusy}
          onClick={regen}
          className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-md bg-[#EA5400] px-3.5 text-sm font-medium text-white hover:bg-[#CC4900] disabled:opacity-50"
        >
          {regenBusy ? <><Loader2 size={15} className="animate-spin" /> Regenerating…</> : <><RefreshCw size={15} /> Regenerate budget</>}
        </button>
        <p className="mt-2 text-[11px] text-[#9A948E]">Re-runs the AI resource plan grounded in the Riseup database (past budgets + proposals). Rates come from the rate card; the app computes every total.</p>
      </div>
    </div>
  );
}

// Small helper so each department can emit multiple sibling rows without an extra DOM wrapper.
function FragmentRows({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

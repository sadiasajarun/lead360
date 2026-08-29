import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Sparkles, Sheet, CalendarClock, Plus, RefreshCw, RotateCcw, Loader2, X, ChevronDown, Check, Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '~/redux/store/hooks';
import { fetchBudget, updateBudget, suggestRate, getRateCards } from '~/services/httpServices/budgetService';
import { regenerateBudget } from '~/services/httpServices/leadDetailService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import { formatMoney } from '~/enums/currency.enum';
import { ChangeLogPanel } from '~/components/proposal/ChangeLogPanel';
import type { BudgetEquipment, BudgetLine, RateCardRow } from '~/types/budget';
import type { ChangeEntry } from '~/types/leadDetail';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
const SENIORITIES = ['senior', 'mid', 'junior'];

const HOURS_PER_DAY = 8;
const uniq = (xs: string[]) => Array.from(new Set(xs));
const clampPct = (v: number, max = 1000) => Math.min(max, Math.max(0, v || 0));
const round2 = (v: number) => Math.round(v * 100) / 100;
// Working days a role is staffed (falls back to legacy `days` when the part-time fields are absent).
const workDaysOf = (l: BudgetLine) => Math.max(0, Number(l.workingDays) || Math.round(Number(l.days) || 0));
const hoursOf = (l: BudgetLine) => { const h = Number(l.hoursPerDay); return h > 0 ? h : HOURS_PER_DAY; };
// EFFECTIVE man-days = hoursPerDay × workingDays / 8 — the cost driver (per-day rate is the reference).
const effDays = (l: BudgetLine) => round2((hoursOf(l) * workDaysOf(l)) / HOURS_PER_DAY);
const lineCost = (l: BudgetLine) => Math.round((Number(l.units) || 0) * effDays(l) * (Number(l.dayRateCents) || 0));
// A line is "complete" once role, type, unit, hours/day, working days and rate are all filled. New rows start
// blank, so Save warns until they are. Optional lines are exempt (they can be zeroed intentionally).
const lineComplete = (l: BudgetLine) =>
  !!l.role?.trim() && !!l.seniority && (Number(l.units) || 0) > 0 && hoursOf(l) > 0 && workDaysOf(l) > 0 && (Number(l.dayRateCents) || 0) > 0;
const lineIncomplete = (l: BudgetLine) => !l.optional && !lineComplete(l);

// Collapse the budget into ONE consolidated table (matches Riseup's global/local sheets): merge duplicate
// department+role+seniority+rate lines that a phase-wise plan produced into a single row — peak units, summed
// working days + effective person-days, hours/day back-solved so days = hours × workingDays / 8. Optional kept.
function consolidateLines(ls: BudgetLine[]): BudgetLine[] {
  const out: BudgetLine[] = [];
  const idxOf = new Map<string, number>();
  const acc: { personDaysEff: number; workingDays: number }[] = [];
  for (const l of ls) {
    const units = Math.max(0, Number(l.units) || 0);
    const wd = workDaysOf(l);
    const effPerUnit = effDays(l);
    const key = `${l.department}|${l.role}|${l.seniority}|${l.dayRateCents}`;
    const at = l.optional ? undefined : idxOf.get(key);
    if (at == null) {
      const i = out.length;
      out.push({ ...l, milestoneName: undefined, units, hoursPerDay: hoursOf(l), workingDays: wd, days: effPerUnit });
      if (!l.optional) idxOf.set(key, i);
      acc[i] = { personDaysEff: units * effPerUnit, workingDays: wd };
    } else {
      out[at].units = Math.max(out[at].units, units);
      acc[at].personDaysEff += units * effPerUnit;
      acc[at].workingDays += wd;
    }
  }
  return out.map((l, i) => {
    if (l.optional) return l;
    const units = Math.max(1, l.units);
    const workingDays = Math.max(1, Math.round(acc[i].workingDays));
    const days = round2(acc[i].personDaysEff / units);
    const hoursPerDay = round2((days * HOURS_PER_DAY) / workingDays);
    return { ...l, units, workingDays, hoursPerDay, days };
  });
}

// Global adjustment math (contingency/discount/VAT are budget-wide, applied to the non-optional subtotal).
const equipCost = (e: BudgetEquipment) => Math.round((Number(e.qty) || 0) * (Number(e.unitPriceCents) || 0));

function computeTotals(lines: BudgetLine[], adj: { c: number; d: number; v: number }, equipment: BudgetEquipment[] = []) {
  const sub = lines.reduce((s, l) => s + (l.optional ? 0 : lineCost(l)), 0)
    + equipment.reduce((s, e) => s + equipCost(e), 0);
  const cont = Math.round((sub * clampPct(adj.c)) / 100);
  const disc = Math.round((sub * clampPct(adj.d, 100)) / 100);
  const afterD = sub + cont - disc;
  const vat = Math.round((afterD * clampPct(adj.v)) / 100);
  return { sub, cont, disc, vat, total: afterD + vat };
}

export function BudgetEditor({ leadId, changeLog, onRegenerated }: { leadId: string; changeLog?: ChangeEntry[]; onRegenerated?: () => void }) {
  const dispatch = useAppDispatch();
  const { data, status, error } = useAppSelector((s) => s.budget);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [equipment, setEquipment] = useState<BudgetEquipment[]>([]);
  const [adj, setAdj] = useState({ c: 0, d: 0, v: 0 });
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [showOptional, setShowOptional] = useState(true);
  const [regenPrompt, setRegenPrompt] = useState('');
  const [regenBusy, setRegenBusy] = useState(false);
  const [rateCard, setRateCard] = useState<RateCardRow[]>([]);
  const [focusIdx, setFocusIdx] = useState<number | null>(null); // newly-added row → auto-open its role picker

  useEffect(() => { dispatch(fetchBudget(leadId)); }, [dispatch, leadId]);
  useEffect(() => { getRateCards().then(setRateCard).catch(() => setRateCard([])); }, []);
  useEffect(() => {
    if (data) {
      setLines(consolidateLines(data.budget.lines));
    setEquipment((data.budget.equipment ?? []).map((e) => ({ ...e })));
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

  // ---- ONE consolidated cost breakdown, grouped by DEPARTMENT only (matches Riseup's global/local budget
  //      sheets — no phase/milestone tabs). Each row keeps its index into the master `lines` array. ----
  const allRows = lines.map((l, i) => ({ l, i }));
  const depts = uniq(allRows.map(({ l }) => l.department || 'Development'));

  const setEquip = (i: number, patch: Partial<BudgetEquipment>) =>
    setEquipment((prev) => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const totals = computeTotals(lines, adj, equipment);

  const num = (v: string) => (v === '' ? 0 : Number(v));
  const setLine = (i: number, patch: Partial<BudgetLine>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  // Role/Head dropdown options + rate lookup, sourced from the maintained rate card (like Excel data validation).
  const normRole = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const roleOptions = uniq(rateCard.map((r) => r.role)).sort((a, b) => a.localeCompare(b));
  // Rate + department for a role at a seniority, in the budget's OWN currency (exact seniority → any tier).
  const rateFor = (role: string, seniority: string): { dayRateCents: number; department: string } | null => {
    const rows = rateCard.filter((r) => normRole(r.role) === normRole(role));
    if (!rows.length) return null;
    const row = rows.find((r) => r.seniority.toLowerCase() === seniority.toLowerCase()) ?? rows[0];
    const cents = Number(data.budget.currency === 'BDT' ? row.dailyBdtCents : row.dailyUsdCents) || 0;
    return { dayRateCents: cents, department: row.department };
  };

  // On role/seniority change, auto-fill the day-rate from the rate card (local card first, else the API).
  const applyRate = async (i: number, role: string, seniority: string) => {
    const hit = rateFor(role, seniority);
    if (hit && hit.dayRateCents > 0) { setLine(i, { dayRateCents: hit.dayRateCents }); return; }
    try {
      const cents = await suggestRate(role, seniority, data.budget.currency);
      if (cents != null) setLine(i, { dayRateCents: cents });
    } catch { /* no matching rate — keep the current value */ }
  };

  // A fresh line starts BLANK (no role, no rate) so the user picks from the rate-card dropdown; picking one
  // auto-fills the rate. `focusIdx` is set to the new row so its picker opens automatically.
  const newLine = (department: string): BudgetLine => ({
    department, role: '', seniority: '', units: 0, days: 0, hoursPerDay: HOURS_PER_DAY, workingDays: 0, dayRateCents: 0, optional: false,
  });
  const addRole = (department: string) => { setFocusIdx(lines.length); setLines((ls) => [...ls, newLine(department)]); };
  const addDept = () => {
    const name = window.prompt('New department name:', 'New Department');
    if (name?.trim()) { setFocusIdx(lines.length); setLines((ls) => [...ls, newLine(name.trim())]); }
  };

  // Strip entity-only fields (id/createdAt/budgetId/…) and coerce numeric types to match the backend
  // BudgetLineInput DTO (whitelist + forbidNonWhitelisted). dayRateCents comes back as a bigint string.
  const toInput = (ls: BudgetLine[]) =>
    ls.map((l) => ({
      milestoneName: undefined, // consolidated single-table budget — no phase/milestone grouping
      department: l.department,
      role: l.role,
      seniority: l.seniority,
      units: Math.max(0, Math.round(Number(l.units) || 0)),
      // days is DERIVED (effective) — hours/day × working days ÷ 8; the backend re-derives cost from it.
      days: Math.max(0, effDays(l)),
      hoursPerDay: Math.max(0, round2(hoursOf(l))),
      workingDays: Math.max(0, Math.round(workDaysOf(l))),
      dayRateCents: Math.max(0, Math.round(Number(l.dayRateCents) || 0)),
      optional: !!l.optional,
    }));

  const save = async () => {
    const bad = lines.filter(lineIncomplete);
    if (bad.length) {
      setMsg(`Fill in role, type, unit, days and rate for ${bad.length} line${bad.length === 1 ? '' : 's'} before saving.`);
      return;
    }
    setSaving(true); setMsg('');
    try {
      const res = await updateBudget(leadId, { version, lines: toInput(lines), equipment: equipment.map((e) => ({ item: e.item, brand: e.brand || undefined, uom: e.uom || undefined, qty: Math.max(0, Math.round(Number(e.qty) || 0)), unitPriceCents: Math.max(0, Math.round(Number(e.unitPriceCents) || 0)), note: e.note || undefined })), contingencyPct: adj.c, discountPct: adj.d, vatPct: adj.v, includeOptional: true });
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
    setLines(consolidateLines(data.budget.lines));
    setEquipment((data.budget.equipment ?? []).map((e) => ({ ...e })));
    setAdj({ c: Number(data.budget.contingencyPct), d: Number(data.budget.discountPct), v: Number(data.budget.vatPct) });
    setMsg('Reset to the AI estimate.');
  };

  const regen = async () => {
    setRegenBusy(true); setMsg('');
    try {
      await regenerateBudget(leadId, regenPrompt.trim() || undefined);
      dispatch(fetchBudget(leadId));
      onRegenerated?.(); // refresh the proposal so the change log + money blocks update
      setRegenPrompt('');
      setMsg('Budget regenerated.');
    } catch (e) {
      setMsg(apiErrorMessage(e));
    } finally { setRegenBusy(false); }
  };

  const cell = 'h-8 w-16 rounded border border-transparent px-1.5 text-right text-sm tabular-nums hover:border-[#D4D1CC] focus:border-[#EA5400] focus:bg-[#FDF0E9] focus:outline-none';
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
        <span><b className="text-[#0F0F0F]">How this was built:</b> the AI maps scope to roles and part-time effort — grounded first in Riseup's past budgets &amp; proposals — and the app computes every total in code (rates come from the rate card). Each role's <b className="text-[#0F0F0F]">Days = Hrs/Day × Work Days ÷ 8</b> (effective man-days), and cost = Unit × Days × Rate. One consolidated breakdown, grouped by department. Pick a role from the rate card (auto-fills its rate) or type a new one; change seniority, units, hours/day, working days or rate; totals recompute live.</span>
      </div>

      {/* Cost-breakdown header + engagement total */}
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-[#E8E6E3] bg-[#141310] px-4 py-2.5 text-white">
        <span className="text-[13px] font-semibold">Cost Breakdown</span>
        <span data-testid="budget-grand" className="text-[15px] font-bold tabular-nums text-[#EA5400]">{fmt(totals.total)}</span>
      </div>

      <div className="overflow-x-auto border-x border-[#E8E6E3]">
        <table className="w-full text-sm">
          <thead className="bg-[#F4F4F2] text-left text-xs uppercase tracking-wide text-[#9A948E]">
            <tr>
              <th className="w-10 px-3 py-2">Sl.</th><th className="px-3">Department</th><th className="px-3">Role / Head</th>
              <th className="px-3">Type</th><th className="px-3 text-right">Unit</th><th className="px-3 text-right">Hrs/Day</th>
              <th className="px-3 text-right">Work Days</th><th className="px-3 text-right">Days</th>
              <th className="px-3 text-right">Rate ({data.budget.currency})</th><th className="px-3 text-right">Unit Cost</th><th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {depts.map((dept) => {
              const rows = allRows.filter(({ l }) => (l.department || 'Development') === dept);
              const deptSubtotal = rows.reduce((s, { l }) => s + (l.optional ? 0 : lineCost(l)), 0);
              sl += 1;
              const deptSl = sl;
              return (
                <FragmentRows key={dept}>
                  {rows.map(({ l, i }, idx) => (!showOptional && l.optional) ? null : (
                    <tr key={i} data-testid={`budget-line-${i}`} className={`border-t border-[#E8E6E3] ${l.optional ? 'bg-[#FBF4EA]' : lineIncomplete(l) ? 'bg-[#FEF3F2]' : ''}`}>
                      <td className="px-3 py-1.5 align-top text-[#9A948E] tabular-nums">{idx === 0 ? deptSl : ''}</td>
                      <td className="px-3 align-top font-medium">{idx === 0 ? dept : ''}</td>
                      <td className="px-3">
                        <RoleCombobox
                          value={l.role}
                          options={roleOptions}
                          testId={`budget-role-${i}`}
                          autoFocus={i === focusIdx}
                          onAutoFocused={() => setFocusIdx(null)}
                          rateLabel={(role) => { const h = rateFor(role, l.seniority); return h && h.dayRateCents > 0 ? fmt(h.dayRateCents) : ''; }}
                          onPick={(role) => { const h = rateFor(role, l.seniority); setLine(i, { role, ...(h && h.dayRateCents > 0 ? { dayRateCents: h.dayRateCents } : {}) }); }}
                          onCustom={(role) => setLine(i, { role })}
                        />
                      </td>
                      <td className="px-3">
                        <select data-testid={`budget-seniority-${i}`} value={l.seniority} onChange={(e) => { setLine(i, { seniority: e.target.value }); applyRate(i, l.role, e.target.value); }} className={`${sel} ${l.seniority ? '' : 'text-[#9A948E]'}`}>
                          <option value="" disabled>Type…</option>
                          {SENIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-3 text-right"><input type="number" min={0} value={l.units || ''} placeholder="0" onChange={(e) => setLine(i, { units: num(e.target.value) })} className={cell} data-testid={`budget-units-${i}`} /></td>
                      <td className="px-3 text-right"><input type="number" min={0} max={8} step={0.5} value={l.hoursPerDay ?? ''} placeholder="8" onChange={(e) => setLine(i, { hoursPerDay: num(e.target.value) })} className={cell} data-testid={`budget-hours-${i}`} /></td>
                      <td className="px-3 text-right"><input type="number" min={0} value={workDaysOf(l) || ''} placeholder="0" onChange={(e) => setLine(i, { workingDays: num(e.target.value) })} className={cell} data-testid={`budget-workdays-${i}`} /></td>
                      <td className="px-3 text-right align-middle tabular-nums text-[#6B6660]" title="Effective man-days = hours/day × working days ÷ 8">{effDays(l) > 0 ? effDays(l) : <span className="text-[#C9C4BE]">—</span>}</td>
                      <td className="px-3 text-right"><input type="number" min={0} value={l.dayRateCents ? Math.round(Number(l.dayRateCents) / 100) : ''} placeholder="0" onChange={(e) => setLine(i, { dayRateCents: num(e.target.value) * 100 })} className={cell} /></td>
                      <td className="px-3 text-right tabular-nums">{lineCost(l) > 0 ? fmt(lineCost(l)) : <span className="text-[#C9C4BE]">—</span>}</td>
                      <td className="px-2 text-right align-top"><button data-testid={`budget-line-del-${i}`} onClick={() => removeLine(i)} className="text-[#9A948E] hover:text-[#B42318]"><X size={15} /></button></td>
                    </tr>
                  ))}
                  <tr className="border-t border-[#F0EEEB]">
                    <td colSpan={11} className="px-3 py-1.5">
                      <button data-testid={`budget-add-role-${dept}`} onClick={() => addRole(dept)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#EA5400] hover:underline"><Plus size={14} /> Add role</button>
                    </td>
                  </tr>
                  <tr className="border-t border-[#E8E6E3] bg-[#F9F8F6]">
                    <td /><td colSpan={8} className="px-3 py-2 font-semibold text-[#6B6660]">{dept} — subtotal</td>
                    <td className="px-3 text-right font-semibold tabular-nums">{fmt(deptSubtotal)}</td><td />
                  </tr>
                </FragmentRows>
              );
            })}

            {/* Hardware / equipment — bought by quantity x unit price, so it gets its own columns
                rather than borrowing the resource ones (seniority, hours/day and man-days do not apply). */}
            <tr className="border-t border-[#D4D1CC] bg-[#FBF3EE]">
              <td /><td colSpan={9} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#B24B12]">Hardware, equipment &amp; installation</td>
            </tr>
            {equipment.length > 0 && (
              <tr className="bg-[#FBFAF9] text-[11px] uppercase tracking-wide text-[#9A948E]">
                <td /><td className="px-3 py-1.5">Item</td><td className="px-3">Brand / model</td><td className="px-3">UoM</td>
                <td className="px-3 text-right">Qty</td><td className="px-3 text-right">Unit price</td>
                <td colSpan={2} className="px-3">Remarks</td><td className="px-3 text-right">Total</td><td />
              </tr>
            )}
            {equipment.map((e, i) => (
              <tr key={i} className="border-t border-[#EFEDEA]" data-testid={`budget-equip-row-${i}`}>
                <td />
                <td className="px-3 py-1.5"><input value={e.item} placeholder="Item name" onChange={(ev) => setEquip(i, { item: ev.target.value })} className={cell} /></td>
                <td className="px-3"><input value={e.brand ?? ''} placeholder="Brand / model" onChange={(ev) => setEquip(i, { brand: ev.target.value })} className={cell} /></td>
                <td className="px-3"><input value={e.uom ?? ''} placeholder="pcs" onChange={(ev) => setEquip(i, { uom: ev.target.value })} className={cell} /></td>
                <td className="px-3 text-right"><input type="number" min={0} value={e.qty} onChange={(ev) => setEquip(i, { qty: num(ev.target.value) })} className={cell} /></td>
                <td className="px-3 text-right"><input type="number" min={0} value={e.unitPriceCents ? Math.round(Number(e.unitPriceCents) / 100) : ''} placeholder="0" onChange={(ev) => setEquip(i, { unitPriceCents: num(ev.target.value) * 100 })} className={cell} /></td>
                <td colSpan={2} className="px-3"><input value={e.note ?? ''} placeholder="—" onChange={(ev) => setEquip(i, { note: ev.target.value })} className={cell} /></td>
                <td className="px-3 text-right tabular-nums">{fmt(equipCost(e))}</td>
                <td className="px-2 text-right"><button type="button" title="Remove item" onClick={() => setEquipment(equipment.filter((_, j) => j !== i))} className="text-[#B42318] hover:underline"><Trash2 size={14} /></button></td>
              </tr>
            ))}
            <tr>
              <td /><td colSpan={9} className="px-3 py-1.5">
                <button type="button" data-testid="budget-add-equipment" onClick={() => setEquipment([...equipment, { item: '', brand: '', uom: 'pcs', qty: 1, unitPriceCents: 0, note: '' }])} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#EA5400] hover:underline"><Plus size={14} /> Add hardware item</button>
              </td>
            </tr>
            {equipment.length > 0 && (
              <tr className="bg-[#FBF3EE]">
                <td /><td colSpan={8} className="px-3 py-2 font-semibold text-[#6B6660]">Hardware, equipment &amp; installation — subtotal</td>
                <td data-testid="budget-equipment-subtotal" className="px-3 text-right font-semibold tabular-nums">{fmt(equipment.reduce((s, e) => s + equipCost(e), 0))}</td><td />
              </tr>
            )}

            <tr className="border-t border-[#D4D1CC] bg-[#F4F4F2]"><td /><td colSpan={8} className="px-3 py-2 font-medium text-[#6B6660]">Subtotal</td><td data-testid="budget-ms-subtotal" className="px-3 text-right font-semibold tabular-nums">{fmt(totals.sub)}</td><td /></tr>
            <tr className="bg-[#F4F4F2]"><td /><td colSpan={8} className="px-3 py-1 text-[#6B6660]">Contingency <input type="number" min={0} value={adj.c} onChange={(e) => setAdj({ ...adj, c: num(e.target.value) })} data-testid="budget-contingency" className="ml-2 h-7 w-14 rounded border border-[#D4D1CC] px-1.5 text-right text-xs" />%</td><td className="px-3 text-right tabular-nums">+{fmt(totals.cont)}</td><td /></tr>
            <tr className="bg-[#F4F4F2]"><td /><td colSpan={8} className="px-3 py-1 text-[#6B6660]">Discount <input type="number" min={0} value={adj.d} onChange={(e) => setAdj({ ...adj, d: num(e.target.value) })} data-testid="budget-discount" className="ml-2 h-7 w-14 rounded border border-[#D4D1CC] px-1.5 text-right text-xs" />%</td><td className="px-3 text-right tabular-nums">−{fmt(totals.disc)}</td><td /></tr>
            <tr className="bg-[#F4F4F2]"><td /><td colSpan={8} className="px-3 py-1 text-[#6B6660]">VAT / Tax <input type="number" min={0} value={adj.v} onChange={(e) => setAdj({ ...adj, v: num(e.target.value) })} data-testid="budget-vat" className="ml-2 h-7 w-14 rounded border border-[#D4D1CC] px-1.5 text-right text-xs" />%</td><td className="px-3 text-right tabular-nums">+{fmt(totals.vat)}</td><td /></tr>
            <tr className="border-t border-[#D4D1CC] bg-[#141310] text-white"><td /><td colSpan={8} className="px-3 py-2.5 font-semibold">Total (engagement)</td><td data-testid="budget-total" className="px-3 text-right font-semibold tabular-nums text-[#EA5400]">{fmt(totals.total)}</td><td /></tr>
          </tbody>
        </table>
      </div>

      <button data-testid="budget-add-dept" onClick={addDept} className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-semibold text-[#EA5400] hover:underline"><Plus size={14} /> Add department</button>

      {/* Timeline note */}
      <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-[#E8E6E3] bg-[#FBFAF9] px-4 py-2.5 text-[13px] text-[#6B6660]">
        <CalendarClock size={15} className="shrink-0 text-[#EA5400]" />
        <span>Delivery timeline scales with working days (a part-time role still spans its full calendar). Full engagement total <b className="text-[#0F0F0F]">{fmt(totals.total)}</b>.</span>
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
        <p className="mt-2 text-[11px] text-[#9A948E]">Applies your change to the plan — a weeks target, an exact budget target, or add/remove roles — and recomputes <span className="font-medium text-[#6B6660]">both</span> the sheet and the proposal. Rates come from the rate card; the app computes every total.</p>
        <ChangeLogPanel entries={changeLog?.filter((e) => e.kind === 'budget')} testId="budget-change-log" />
      </div>
    </div>
  );
}

// Small helper so each department can emit multiple sibling rows without an extra DOM wrapper.
function FragmentRows({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/**
 * Excel-like Role/Head picker: a real dropdown. The TRIGGER is a button showing the current role (read-only,
 * not typeable). Clicking it opens a panel with a SEARCH box at the top, the roles below (the current one
 * pre-selected & highlighted), and a "+ Add" row to use a role that isn't on the rate card. Picking a known
 * role auto-fills its rate (onPick). The panel is fixed-positioned so the table's horizontal scroll can't clip
 * it, and re-anchored on scroll/resize so it stays glued to the cell.
 */
function RoleCombobox({
  value, options, onPick, onCustom, rateLabel, testId, autoFocus, onAutoFocused,
}: {
  value: string;
  options: string[];
  onPick: (role: string) => void;
  onCustom: (role: string) => void;
  rateLabel?: (role: string) => string;
  testId?: string;
  autoFocus?: boolean;
  onAutoFocused?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const place = () => { if (btnRef.current) setRect(btnRef.current.getBoundingClientRect()); };
  const openList = () => { place(); setQuery(''); setOpen(true); };
  const close = () => setOpen(false);

  // While open: focus the search, re-anchor the panel to the button on scroll/resize, and close on outside click.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    const onMove = () => place();
    const onDown = (e: MouseEvent) => {
      const el = e.target as Node;
      if (!popRef.current?.contains(el) && !btnRef.current?.contains(el)) close();
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    document.addEventListener('mousedown', onDown);
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  // A newly-added blank row opens its picker so the user just chooses.
  useEffect(() => {
    if (autoFocus) { openList(); onAutoFocused?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  const q = query.trim().toLowerCase();
  const filtered = (q ? options.filter((o) => o.toLowerCase().includes(q)) : options).slice(0, 100);
  const exact = options.some((o) => o.toLowerCase() === q);
  const pick = (o: string) => { onPick(o); close(); };
  const addCustom = () => { if (query.trim()) { onCustom(query.trim()); close(); } };

  return (
    <div className="relative w-40">
      <button
        type="button"
        ref={btnRef}
        data-testid={testId}
        onClick={() => (open ? close() : openList())}
        className="flex h-8 w-full items-center justify-between gap-1 rounded-md border border-[#D4D1CC] bg-white pl-2 pr-1.5 text-left text-sm hover:border-[#B7B2AC] focus:border-[#EA5400] focus:outline-none"
      >
        <span className={`truncate ${value ? '' : 'text-[#9A948E]'}`}>{value || 'Select a role…'}</span>
        <ChevronDown size={14} className="shrink-0 text-[#9A948E]" />
      </button>
      {open && rect ? (
        <div
          ref={popRef}
          style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280), zIndex: 50 }}
          className="rounded-md border border-[#D4D1CC] bg-white text-[13px] shadow-xl"
        >
          <div className="border-b border-[#F0EEEB] p-1.5">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or type a role…"
              className="h-7 w-full rounded border border-[#E8E6E3] px-2 text-[13px] outline-none focus:border-[#EA5400]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); if (filtered.length) pick(filtered[0]); else addCustom(); }
                else if (e.key === 'Escape') close();
              }}
            />
          </div>
          <div className="max-h-56 overflow-auto py-1">
            {filtered.map((o) => {
              const selected = o.toLowerCase() === value.toLowerCase();
              return (
                <button
                  type="button"
                  key={o}
                  onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-[#FDF0E9] ${selected ? 'bg-[#FDF0E9] font-semibold text-[#EA5400]' : ''}`}
                >
                  <span className="flex items-center gap-1.5 truncate">{selected ? <Check size={13} className="shrink-0" /> : null}{o}</span>
                  {rateLabel && rateLabel(o) ? <span className="shrink-0 tabular-nums text-[#9A948E]">{rateLabel(o)}</span> : null}
                </button>
              );
            })}
            {!filtered.length && !query.trim() ? <div className="px-3 py-2 text-[#9A948E]">No roles on the rate card</div> : null}
          </div>
          {!exact && query.trim() ? (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addCustom(); }}
              className="flex w-full items-center gap-1.5 border-t border-[#F0EEEB] px-3 py-2 text-left font-medium text-[#EA5400] hover:bg-[#FDF0E9]"
            >
              <Plus size={13} /> Add &ldquo;{query.trim()}&rdquo;
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

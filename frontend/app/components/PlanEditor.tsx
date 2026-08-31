import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Merge, Pin, Plus, RotateCcw, Scissors, Trash2 } from 'lucide-react';
import { getPlan, savePlan } from '~/services/httpServices/generationService';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import { formatMoney } from '~/enums/currency.enum';
import type { DeliveryPlan, PlanMember, PlanPhase } from '~/types/generation';

/**
 * PlanEditor — direct editing of the delivery plan that the timeline, team allocation and budget all derive
 * from.
 *
 * Saving is deterministic on the server: no AI call, no replan. Changing a phase's duration here PINS it, so a
 * later regeneration refreshes the wording around it without undoing the change. This is the path that removes
 * the need to phrase an instruction the parser happens to understand.
 */

const SENIORITIES = ['senior', 'mid', 'junior'];
const DAYS_PER_WEEK = 5;
const HOURS_PER_DAY = 8;

/** Mirrors the server's costing: units x (weeks x 5 days) x (hours per day / 8) x day rate. */
const memberCost = (m: PlanMember, weeks: number) =>
  Math.round(
    (m.units || 0) * weeks * DAYS_PER_WEEK * ((m.hoursPerDay || HOURS_PER_DAY) / HOURS_PER_DAY) * (m.dayRateCents || 0),
  );
const phaseCost = (p: PlanPhase) => p.team.reduce((s, m) => s + memberCost(m, p.weeks), 0);

const blankMember = (): PlanMember => ({
  role: '', seniority: 'mid', units: 1, hoursPerDay: HOURS_PER_DAY, department: 'Engineering',
});
const blankPhase = (): PlanPhase => ({ name: '', focus: '', weeks: 1, pinnedWeeks: true, team: [] });

const field = 'w-full rounded-md border border-[#E5E1DA] bg-white px-2 py-1.5 text-[13px] outline-none focus:border-[#8B7355]';
const iconBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#E5E1DA] text-[#6B6660] hover:bg-[#F7F5F1] disabled:opacity-30 cursor-pointer';
const labelCls = 'mb-1 block text-[11px] uppercase tracking-wide text-[#8B8680]';

interface PlanEditorProps {
  /** Lead whose plan is being edited. */
  leadId: string;
  /** Called after a successful save so the surrounding page can refresh the proposal and budget. */
  onSaved?: () => void;
}

export default function PlanEditor({ leadId, onSaved }: PlanEditorProps) {
  const [plan, setPlan] = useState<DeliveryPlan | null>(null);
  const [phases, setPhases] = useState<PlanPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await getPlan(leadId);
      setPlan(p);
      setPhases(p.phases.map((x) => ({ ...x, team: x.team.map((m) => ({ ...m })) })));
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  const totalWeeks = useMemo(() => phases.reduce((s, p) => s + (Number(p.weeks) || 0), 0), [phases]);
  const totalCost = useMemo(() => phases.reduce((s, p) => s + phaseCost(p), 0), [phases]);
  const dirty = useMemo(() => !!plan && JSON.stringify(phases) !== JSON.stringify(plan.phases), [phases, plan]);
  const peakHeads = useMemo(
    () => phases.reduce((peak, p) => Math.max(peak, p.team.reduce((s, m) => s + (Number(m.units) || 0), 0)), 0),
    [phases],
  );
  const unpriced = useMemo(
    () => Array.from(new Set(phases.flatMap((p) => p.team.filter((m) => !m.dayRateCents && m.role.trim()).map((m) => m.role)))),
    [phases],
  );
  const incomplete = phases.some((p) => !p.name.trim() || p.team.some((m) => !m.role.trim()));

  const mutate = (i: number, patch: Partial<PlanPhase>) =>
    setPhases((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const mutateMember = (i: number, j: number, patch: Partial<PlanMember>) =>
    setPhases((ps) => ps.map((p, idx) => (idx === i ? { ...p, team: p.team.map((m, k) => (k === j ? { ...m, ...patch } : m)) } : p)));

  const move = (i: number, by: number) =>
    setPhases((ps) => {
      const to = i + by;
      if (to < 0 || to >= ps.length) return ps;
      const next = [...ps];
      [next[i], next[to]] = [next[to], next[i]];
      return next;
    });

  /** Merge a phase into the one after it: durations add, teams union by role at peak head count. */
  const mergeDown = (i: number) =>
    setPhases((ps) => {
      if (i >= ps.length - 1) return ps;
      const a = ps[i];
      const b = ps[i + 1];
      const byRole = new Map<string, PlanMember>();
      for (const m of [...a.team, ...b.team]) {
        const key = (m.role + '|' + m.seniority).toLowerCase();
        const ex = byRole.get(key);
        if (!ex) byRole.set(key, { ...m });
        else {
          ex.units = Math.max(ex.units, m.units);
          ex.hoursPerDay = Math.max(ex.hoursPerDay, m.hoursPerDay);
        }
      }
      const merged: PlanPhase = {
        name: a.name + ' & ' + b.name,
        focus: [a.focus, b.focus].filter(Boolean).join(' '),
        weeks: a.weeks + b.weeks,
        pinnedWeeks: true,
        team: [...byRole.values()],
      };
      return [...ps.slice(0, i), merged, ...ps.slice(i + 2)];
    });

  /** Split a phase in two, dividing its weeks and copying the team into both halves. */
  const split = (i: number) =>
    setPhases((ps) => {
      const p = ps[i];
      if (p.weeks < 2) return ps;
      const first = Math.floor(p.weeks / 2);
      const clone = (weeks: number, suffix: string): PlanPhase => ({
        ...p, name: p.name + ' ' + suffix, weeks, pinnedWeeks: true, team: p.team.map((m) => ({ ...m })),
      });
      return [...ps.slice(0, i), clone(first, '(part 1)'), clone(p.weeks - first, '(part 2)'), ...ps.slice(i + 1)];
    });

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await savePlan(leadId, phases);
      setPlan(next);
      setPhases(next.phases.map((x) => ({ ...x, team: x.team.map((m) => ({ ...m })) })));
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-[13px] text-[#6B6660]" data-testid="plan-loading">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the delivery plan…
      </div>
    );
  }

  if (!plan || !phases.length) {
    return (
      <div className="rounded-lg border border-[#E5E1DA] bg-[#FAF9F7] px-4 py-10 text-center" data-testid="plan-empty">
        <p className="text-[14px] text-[#3D3A36]">No delivery plan yet.</p>
        <p className="mt-1 text-[13px] text-[#6B6660]">Generate the proposal first — the plan is created with it.</p>
        {error && <p className="mt-3 text-[13px] text-[#B4413C]">{error}</p>}
      </div>
    );
  }

  const currency = plan.currency;

  return (
    <div data-testid="plan-editor">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-medium text-[#3D3A36]">Delivery plan</h3>
          <p className="mt-0.5 text-[13px] text-[#6B6660]">
            The timeline, team and budget are all calculated from this. Saving recomputes them immediately — no regeneration.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button" onClick={() => void load()} disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#E5E1DA] px-3 py-1.5 text-[13px] text-[#6B6660] hover:bg-[#F7F5F1] disabled:opacity-40 cursor-pointer"
            data-testid="plan-reset"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Discard changes
          </button>
          <button
            type="button" onClick={() => void onSave()} disabled={saving || !dirty || incomplete}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#8B7355] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#7A6549] disabled:opacity-40 cursor-pointer"
            data-testid="plan-save"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      </div>

      <div
        className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-[#E5E1DA] bg-[#FAF9F7] px-4 py-3 text-[13px]"
        data-testid="plan-summary"
      >
        <span className="text-[#6B6660]">Total <strong className="text-[#3D3A36]">{totalWeeks} {totalWeeks === 1 ? 'week' : 'weeks'}</strong></span>
        <span className="text-[#6B6660]">Phases <strong className="text-[#3D3A36]">{phases.length}</strong></span>
        <span className="text-[#6B6660]">Peak team <strong className="text-[#3D3A36]">{peakHeads}</strong></span>
        <span className="text-[#6B6660]">Resource cost <strong className="text-[#3D3A36]">{formatMoney(totalCost, currency)}</strong></span>
      </div>

      {error && <p className="mb-3 text-[13px] text-[#B4413C]" data-testid="plan-error">{error}</p>}
      {saved && !dirty && (
        <p className="mb-3 text-[13px] text-[#4A7C59]" data-testid="plan-saved">
          Saved. The budget and proposal now match this plan.
        </p>
      )}
      {incomplete && (
        <p className="mb-3 text-[13px] text-[#B4413C]" data-testid="plan-incomplete">
          Every phase needs a name, and every team row needs a role.
        </p>
      )}
      {!!unpriced.length && (
        <p className="mb-3 text-[13px] text-[#8A6D3B]" data-testid="plan-unpriced">
          Not on the rate card, so priced at zero: {unpriced.join(', ')}.
        </p>
      )}

      <div className="space-y-3">
        {phases.map((p, i) => (
          <div key={i} className="rounded-lg border border-[#E5E1DA] bg-white p-4" data-testid={`plan-phase-${i}`}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-[220px] flex-1">
                <label className={labelCls} htmlFor={`phase-name-${i}`}>Phase</label>
                <input
                  id={`phase-name-${i}`} className={field} value={p.name} placeholder="Phase name"
                  onChange={(e) => mutate(i, { name: e.target.value })} data-testid={`plan-phase-name-${i}`}
                />
              </div>
              <div className="w-[110px]">
                <label className={labelCls} htmlFor={`phase-weeks-${i}`}>Weeks</label>
                <input
                  id={`phase-weeks-${i}`} className={field} type="number" min={1} max={52} value={p.weeks}
                  onChange={(e) => mutate(i, { weeks: Math.max(1, Number(e.target.value) || 1), pinnedWeeks: true })}
                  data-testid={`plan-phase-weeks-${i}`}
                />
              </div>
              <div className="w-[130px]">
                <span className={labelCls}>Cost</span>
                <p className="py-1.5 text-[13px] text-[#3D3A36]" data-testid={`plan-phase-cost-${i}`}>
                  {formatMoney(phaseCost(p), currency)}
                </p>
              </div>
              <div className="flex items-center gap-1 pt-[22px]">
                <button
                  type="button" title={p.pinnedWeeks ? 'Duration is held through regenerations' : 'Hold this duration through regenerations'}
                  onClick={() => mutate(i, { pinnedWeeks: !p.pinnedWeeks })}
                  className={`${iconBtn} ${p.pinnedWeeks ? 'border-[#8B7355] text-[#8B7355]' : ''}`}
                  data-testid={`plan-phase-pin-${i}`}
                >
                  <Pin className="h-3.5 w-3.5" />
                </button>
                <button type="button" title="Move up" onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn} data-testid={`plan-phase-up-${i}`}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" title="Move down" onClick={() => move(i, 1)} disabled={i === phases.length - 1} className={iconBtn} data-testid={`plan-phase-down-${i}`}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" title="Merge with the phase below" onClick={() => mergeDown(i)} disabled={i === phases.length - 1} className={iconBtn} data-testid={`plan-phase-merge-${i}`}>
                  <Merge className="h-3.5 w-3.5" />
                </button>
                <button type="button" title="Split into two phases" onClick={() => split(i)} disabled={p.weeks < 2} className={iconBtn} data-testid={`plan-phase-split-${i}`}>
                  <Scissors className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button" title="Remove phase"
                  onClick={() => setPhases((ps) => ps.filter((_, idx) => idx !== i))}
                  disabled={phases.length === 1} className={iconBtn} data-testid={`plan-phase-remove-${i}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-3">
              <label className={labelCls} htmlFor={`phase-focus-${i}`}>Focus</label>
              <input
                id={`phase-focus-${i}`} className={field} value={p.focus} placeholder="What this phase delivers"
                onChange={(e) => mutate(i, { focus: e.target.value })} data-testid={`plan-phase-focus-${i}`}
              />
            </div>

            <div className="mt-4 border-t border-[#F0EDE7] pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-[#8B8680]">Team</span>
                <button
                  type="button" onClick={() => mutate(i, { team: [...p.team, blankMember()] })}
                  className="inline-flex items-center gap-1 text-[13px] text-[#8B7355] hover:underline cursor-pointer"
                  data-testid={`plan-member-add-${i}`}
                >
                  <Plus className="h-3.5 w-3.5" /> Add role
                </button>
              </div>
              {!p.team.length && (
                <p className="py-2 text-[13px] text-[#8B8680]" data-testid={`plan-team-empty-${i}`}>
                  No one staffed on this phase yet.
                </p>
              )}
              {p.team.map((m, j) => (
                <div key={j} className="mb-2 flex flex-wrap items-center gap-2" data-testid={`plan-member-${i}-${j}`}>
                  <input
                    className={`${field} min-w-[180px] flex-1`} value={m.role} placeholder="Role"
                    onChange={(e) => mutateMember(i, j, { role: e.target.value })} data-testid={`plan-member-role-${i}-${j}`}
                  />
                  <select
                    className={`${field} w-[100px]`} value={m.seniority} aria-label="Seniority"
                    onChange={(e) => mutateMember(i, j, { seniority: e.target.value })} data-testid={`plan-member-seniority-${i}-${j}`}
                  >
                    {SENIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input
                    className={`${field} w-[90px]`} value={m.department} placeholder="Dept" aria-label="Department"
                    onChange={(e) => mutateMember(i, j, { department: e.target.value })} data-testid={`plan-member-dept-${i}-${j}`}
                  />
                  <input
                    className={`${field} w-[70px]`} type="number" min={1} max={50} value={m.units} title="Head count" aria-label="Head count"
                    onChange={(e) => mutateMember(i, j, { units: Math.max(1, Number(e.target.value) || 1) })}
                    data-testid={`plan-member-units-${i}-${j}`}
                  />
                  <input
                    className={`${field} w-[80px]`} type="number" min={0.5} max={12} step={0.5} value={m.hoursPerDay}
                    title="Hours per day" aria-label="Hours per day"
                    onChange={(e) => mutateMember(i, j, { hoursPerDay: Math.min(12, Math.max(0.5, Number(e.target.value) || HOURS_PER_DAY)) })}
                    data-testid={`plan-member-hours-${i}-${j}`}
                  />
                  <span className="w-[110px] text-right text-[13px] text-[#6B6660]" data-testid={`plan-member-cost-${i}-${j}`}>
                    {formatMoney(memberCost(m, p.weeks), currency)}
                  </span>
                  <button
                    type="button" title="Remove role"
                    onClick={() => mutate(i, { team: p.team.filter((_, k) => k !== j) })}
                    className={iconBtn} data-testid={`plan-member-remove-${i}-${j}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button" onClick={() => setPhases((ps) => [...ps, blankPhase()])}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#D5D0C8] px-3 py-2 text-[13px] text-[#6B6660] hover:bg-[#F7F5F1] cursor-pointer"
        data-testid="plan-phase-add"
      >
        <Plus className="h-3.5 w-3.5" /> Add phase
      </button>
    </div>
  );
}

import type { DeepPartial } from 'typeorm';
import { ProjectCase } from './project-case.entity';
import { baseModuleDays, guessComplexity, guessType } from '../generation/engine/module-taxonomy';

/**
 * Deterministic extraction of a structured ProjectCase from a delivered proposal (Learning Engine).
 * Pure: no AI, no DB. Learns the DECISIONS (team, phases, timeline, budget, stack, modules) — never prose.
 *
 * Team / timeline / budget are read in priority order, so proposals in ANY format are salvaged:
 *   1) the BUDGET sheet lines (the real costed plan — present for most leads, both formats)
 *   2) the canonical Plan (internalCalc.plan)
 *   3) the proposal money BLOCKS (teamAllocation + timeline)
 * Returns null only when none of the three yields a team or a timeline.
 */

const WORK_DAYS_PER_WEEK = 5;

interface PlanPhase { name?: string; focus?: string; weeks?: number; team?: { role?: string; seniority?: string; units?: number; hoursPerDay?: number }[] }
interface Calc { plan?: { currency?: string; phases?: PlanPhase[] }; financial?: { totalCents?: number; currency?: string } }
interface Block { type?: string; [k: string]: unknown }
interface BudgetLineLite { role?: string; seniority?: string; units?: number; days?: number; dayRateCents?: string | number; optional?: boolean; milestoneId?: string | null }
export interface BudgetLite { currency?: string; lines?: BudgetLineLite[]; milestones?: { id: string; name: string }[] }

export interface CaseDraft {
  fields: DeepPartial<ProjectCase>;
  embedText: string;
}

const STOP = new Set(['the', 'and', 'for', 'app', 'platform', 'system', 'project', 'with', 'your', 'our', 'from', 'into', 'a', 'an', 'of', 'to', 'in', 'on']);
function keywords(...parts: string[]): string[] {
  const set = new Set<string>();
  for (const p of parts) for (const w of (p || '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length > 2 && !STOP.has(w)) set.add(w);
  }
  return [...set];
}

export function extractCaseFromLead(
  lead: { id: string; template: string; title?: string; budgetCurrency?: string },
  sections: Record<string, unknown> | null | undefined,
  internalCalc: Record<string, unknown> | null | undefined,
  budget?: BudgetLite | null,
): CaseDraft | null {
  const calc = (internalCalc ?? {}) as Calc;
  const blocks: Block[] = Array.isArray((sections as { blocks?: unknown } | null)?.blocks)
    ? ((sections as { blocks: Block[] }).blocks)
    : [];

  let team: { role: string; seniority: string; units: number; days?: number }[] = [];
  let phases: { name: string; weeks: number; focus?: string }[] = [];
  let totalCents = 0;
  let currency = '';

  const activeLines = (budget?.lines ?? []).filter((l) => !l.optional && (l.role || '').trim());

  if (activeLines.length) {
    // 1) BUDGET SHEET — the real costed plan (universal, both formats).
    const peak = new Map<string, { seniority: string; units: number; days: number }>();
    for (const l of activeLines) {
      const role = (l.role || '').trim();
      const units = Number(l.units) || 0;
      const cur = peak.get(role);
      // days = effective man-days (the budget line already carries the part-time discount); sum across phases.
      if (!cur) peak.set(role, { seniority: String(l.seniority || 'mid'), units, days: Number(l.days) || 0 });
      else { cur.days += Number(l.days) || 0; if (units > cur.units) { cur.units = units; cur.seniority = String(l.seniority || 'mid'); } }
    }
    team = [...peak.entries()].map(([role, v]) => ({ role, seniority: v.seniority, units: v.units, days: v.days > 0 ? Math.round(v.days) : undefined }));

    // Timeline = per-milestone duration (longest-serving line ÷ 5), summed. No milestones → one phase.
    const msName = new Map((budget?.milestones ?? []).map((m) => [m.id, m.name]));
    const byMs = new Map<string, number[]>();
    const order: string[] = [];
    for (const l of activeLines) {
      const key = l.milestoneId || '__none';
      if (!byMs.has(key)) { byMs.set(key, []); order.push(key); }
      byMs.get(key)!.push(Number(l.days) || 0);
    }
    phases = order.map((key) => ({
      name: (key !== '__none' && msName.get(key)) || 'Delivery',
      weeks: Math.max(1, Math.round(Math.max(0, ...byMs.get(key)!) / WORK_DAYS_PER_WEEK)),
    }));
    totalCents = activeLines.reduce((s, l) => s + (Number(l.units) || 0) * (Number(l.days) || 0) * (Number(l.dayRateCents) || 0), 0);
    currency = String(budget?.currency || '');
  } else if (Array.isArray(calc.plan?.phases) && calc.plan!.phases!.length) {
    // 2) Canonical Plan.
    const phasesRaw = calc.plan!.phases as PlanPhase[];
    const peak = new Map<string, { seniority: string; units: number; days: number }>();
    for (const p of phasesRaw) {
      const cal = Math.max(1, Math.round(Number(p.weeks) || 1)) * WORK_DAYS_PER_WEEK;
      for (const m of p.team ?? []) {
        const role = (m.role || '').trim();
        if (!role) continue;
        const units = Number(m.units) || 0;
        const eff = cal * ((Number(m.hoursPerDay) || 8) / 8); // effective man-days for this phase
        const cur = peak.get(role);
        if (!cur) peak.set(role, { seniority: String(m.seniority || 'mid'), units, days: eff });
        else { cur.days += eff; if (units > cur.units) { cur.units = units; cur.seniority = String(m.seniority || 'mid'); } }
      }
    }
    team = [...peak.entries()].map(([role, v]) => ({ role, seniority: v.seniority, units: v.units, days: v.days > 0 ? Math.round(v.days) : undefined }));
    phases = phasesRaw.map((p) => ({ name: String(p.name || 'Phase'), weeks: Math.max(1, Math.round(Number(p.weeks) || 1)), focus: p.focus ? String(p.focus) : undefined }));
  } else {
    // 3) Proposal money BLOCKS (team allocation + timeline).
    const teamBlock = blocks.find((b) => b.type === 'teamAllocation') as { members?: { role?: string; seniority?: string; units?: number }[] } | undefined;
    team = (teamBlock?.members ?? [])
      .map((m) => ({ role: String(m.role || '').trim(), seniority: String(m.seniority || 'mid'), units: Number(m.units) || 1 }))
      .filter((t) => t.role);
    const timelineBlock = blocks.find((b) => b.type === 'timeline') as { rows?: { label?: string; startWeek?: number; endWeek?: number; deliverable?: string }[] } | undefined;
    phases = (timelineBlock?.rows ?? []).map((r) => ({
      name: String(r.label || 'Phase'),
      weeks: Math.max(1, (Number(r.endWeek) || 1) - (Number(r.startWeek) || 1) + 1),
      focus: r.deliverable ? String(r.deliverable) : undefined,
    }));
  }

  if (!team.length && !phases.length) return null; // nothing structured to learn from
  const timelineWeeks = phases.reduce((s, p) => s + p.weeks, 0);

  // Stack / modules / integrations — from blocks when present (flat proposals just carry fewer tags).
  const techBlock = blocks.find((b) => b.type === 'techStack') as { rows?: { choice?: string }[] } | undefined;
  const stack = (techBlock?.rows ?? []).map((r) => String(r.choice || '').trim()).filter(Boolean);
  const scopeBlock = blocks.find((b) => b.type === 'scope') as { modules?: { title?: string }[] } | undefined;
  const modules = (scopeBlock?.modules ?? []).map((m) => String(m.title || '').trim()).filter(Boolean);
  const archBlock = blocks.find((b) => b.type === 'solutionArchitecture') as { groups?: { key?: string; label?: string; nodes?: { title?: string }[] }[] } | undefined;
  const integGroup = (archBlock?.groups ?? []).find((g) => /integration/i.test(String(g.label || '')) || g.key === 'ai');
  const integrations = (integGroup?.nodes ?? []).map((n) => String(n.title || '').trim()).filter(Boolean);

  // Budget/currency fallbacks (Agency financial block, else the lead's currency).
  const finBlock = blocks.find((b) => b.type === 'financial') as { totalCents?: number; currency?: string } | undefined;
  if (!currency) currency = String(calc.plan?.currency || calc.financial?.currency || finBlock?.currency || lead.budgetCurrency || 'USD');
  if (!totalCents) totalCents = Math.max(0, Math.round(Number(calc.financial?.totalCents ?? finBlock?.totalCents) || 0));

  // Scope size from TEAM headcount + timeline (robust for both formats; module count alone misses flat ones).
  const headcount = team.reduce((s, t) => s + t.units, 0);
  const scopeSize = headcount >= 10 || timelineWeeks >= 16 ? 'large' : headcount <= 4 && timelineWeeks <= 6 ? 'small' : 'medium';

  // Module profiles — no AI in this path, so classify by keyword heuristic and attribute the project's real
  // total man-days across the modules by base weight (module-intelligence layer). Empty when no modules.
  const classified = modules.map((name) => ({ name, type: guessType(name), complexity: guessComplexity(name) }));
  const projectDevDays = team.reduce((s, t) => s + (Number(t.units) || 1) * (Number(t.days) || 0), 0);
  const mWeights = classified.map((c) => baseModuleDays(c.type, c.complexity));
  const mSumW = mWeights.reduce((s, w) => s + w, 0) || 1;
  const moduleProfiles = classified.map((c, i) => ({
    name: c.name,
    type: c.type,
    complexity: c.complexity,
    days: projectDevDays > 0 ? Math.max(1, Math.round((projectDevDays * mWeights[i]) / mSumW)) : mWeights[i],
  }));

  const tags = keywords(lead.title || '', modules.join(' '), stack.join(' '), integrations.join(' '));
  const embedText = [
    lead.title || '',
    modules.length ? `modules: ${modules.join(', ')}` : '',
    stack.length ? `stack: ${stack.join(', ')}` : '',
    integrations.length ? `integrations: ${integrations.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  return {
    fields: {
      title: lead.title || '',
      template: lead.template,
      tags,
      scopeSize,
      moduleCount: modules.length,
      integrationCount: integrations.length,
      modules,
      moduleProfiles,
      stack,
      team,
      phases,
      timelineWeeks: timelineWeeks || undefined,
      budgetTotalCents: String(Math.max(0, Math.round(totalCents))),
      currency,
      sectionStructure: blocks.map((b) => String(b.type || '')).filter(Boolean),
      sourceLeadId: lead.id,
    },
    embedText,
  };
}

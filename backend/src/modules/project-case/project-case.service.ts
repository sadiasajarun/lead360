import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BaseService } from '../../core/base/base.service';
import { AiService, EMBED_DIM } from '../../infrastructure/ai/ai.service';
import { ProjectCase } from './project-case.entity';
import { ProjectCaseRepository } from './project-case.repository';

/** Minimum comparable cases before a size-norm is trusted; below it we fall back to analogs, then heuristic. */
const MIN_NORM_SAMPLES = 5;
const ANALOG_K = 5;

/**
 * Cosine distance below which a same-template analog is treated as a NEAR-IDENTICAL match and its real
 * delivery numbers are REUSED as the plan baseline (0 = identical, ~2 = opposite). Tunable via env; the
 * default is deliberately permissive because the query and case embeddings are built from different fields.
 */
const STRONG_MATCH_MAX_DIST = Number(process.env.CASE_STRONG_MATCH_MAX_DIST ?? 0.35);
/**
 * Minimum requirement COVERAGE before a past project's plan is reused. Vector distance answers "does this
 * read like the same kind of project"; it does not answer "does it cover what this client is asking for".
 * Two wellness apps embed close together while one has offline sync, subscriptions and three integrations
 * the other never had - reusing its timeline and team would under-scope the new job. Coverage is the second
 * gate, and the one the "80% match" rule actually means.
 */
const STRONG_MATCH_MIN_COVERAGE = Number(process.env.CASE_STRONG_MATCH_MIN_COVERAGE ?? 0.8);

/** Loose token overlap - "Push notifications" and "push notification service" are the same module. */
const overlapScore = (want: string[], have: string[]): number => {
  if (!want.length) return 1; // nothing asked for cannot be uncovered
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
  const haveTokens = new Set(have.flatMap(norm));
  let covered = 0;
  for (const w of want) {
    const tokens = norm(w);
    if (tokens.length && tokens.some((t) => haveTokens.has(t))) covered++;
  }
  return covered / want.length;
};

/**
 * How much of THIS requirement a past case actually covers, in [0,1]. Modules carry the most weight (they
 * are the work), then integrations (each one is real effort), then the coarse shape signals.
 */
export function requirementCoverage(q: CaseQuery, c: { modules?: string[]; integrations?: string[]; scopeSize?: string; template?: string }): number {
  // Only dimensions the case actually carries data for can be judged, and the weights are renormalised over
  // those. A case with no stored integrations has UNKNOWN integration coverage, not zero - scoring it as zero
  // caps every case below the threshold and silently disables reuse entirely. (Every case extracted so far
  // stores modules but no integrations, so this is the normal shape of the data, not an edge case.)
  const dims: { weight: number; score: number }[] = [];
  if (c.modules?.length) dims.push({ weight: 0.5, score: overlapScore(q.modules, c.modules) });
  if (c.integrations?.length) dims.push({ weight: 0.3, score: overlapScore(q.integrations, c.integrations) });
  if (c.scopeSize) dims.push({ weight: 0.1, score: c.scopeSize === q.scopeSize ? 1 : 0 });
  if (c.template) dims.push({ weight: 0.1, score: c.template === q.template ? 1 : 0 });
  const totalWeight = dims.reduce((s, d) => s + d.weight, 0);
  if (!totalWeight) return 0; // nothing structured to compare - the vector distance alone must not be enough
  return dims.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight;
}


/** All four template categories — used for the cross-template timeline/shape fallback. */
const ALL_TEMPLATES = ['global', 'local', 'agency', 'design_portfolio'];

/** What the current requirement needs matched — a minimal read of the Intent (no engine coupling). */
export interface CaseQuery {
  template: string;
  currency: string; // the lead's budget currency — budget norms are scoped to it (BDT ≠ USD)
  domain?: string;
  summary?: string;
  modules: string[];
  integrations: string[];
  scopeSize: string;
}

/**
 * A near-identical past project whose ACTUAL delivery numbers are reused as the plan baseline (hard reuse).
 * Present only when the closest same-template case is within STRONG_MATCH_MAX_DIST and carries real numbers.
 */
export interface StrongMatch {
  title: string;
  template: string;
  currency: string;
  scopeSize: string;
  timelineWeeks: number;
  budgetCents: number;
  team: { role: string; seniority: string; units: number }[];
  stack: string[];
  distance: number;
  /** Requirement coverage in [0,1] - the "80% match" gate that decides whether this plan is reusable. */
  coverage: number;
}

/** Learned anchors for one generation — the "Channel A" decisions, structured (never prose). */
export interface DecisionBrief {
  confidence: 'high' | 'low';
  /** True when timeline/shape were borrowed from OTHER templates (same-template data was thin). Budget is
   *  NEVER cross-template, so its number stays currency-safe regardless. */
  crossTemplate: boolean;
  sampleCount: number;
  /** Set when a near-identical past project was found — Decide REUSES its timeline/team/budget as the
   *  baseline instead of re-deriving them (the fix for "known input must give known output"). */
  strongMatch: StrongMatch | null;
  weeks?: { p25?: number; p50?: number; p75?: number };
  budgetCents?: { p25?: number; p50?: number; p75?: number };
  /** How many same-template + same-currency cases carry a real budget — gates whether the budget norm is
   *  trustworthy enough to bind a plan to (a 3-sample p75 is just the max of 3, not a percentile). */
  budgetSampleCount: number;
  typicalTeam: { role: string; units: number }[];
  /** Median effective man-days per role across the analogs (from the source budgets' "No. of Days") — the
   *  anchor Decide uses to size each role's part-time effort (Workstream A). Empty for legacy/unseeded data. */
  typicalEffort: { role: string; days: number }[];
  /** Median attributed effective man-days per module (type × complexity) across the analogs — the anchor the
   *  module-intelligence layer uses to estimate per-module effort. Empty for legacy/unclassified data. */
  typicalModuleEffort: { type: string; complexity: string; days: number }[];
  commonStack: string[];
  analogs: { title: string; template: string; currency: string; timelineWeeks?: number; team: { role: string; units: number }[]; stack: string[]; budgetCents: number }[];
}

const STOP = new Set(['the', 'and', 'for', 'app', 'platform', 'system', 'project', 'with', 'your', 'our', 'a', 'an', 'of', 'to', 'in', 'on']);
const kw = (...parts: string[]): string[] => {
  const s = new Set<string>();
  for (const p of parts) for (const w of (p || '').toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2 && !STOP.has(w)) s.add(w);
  return [...s];
};
const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
};

/**
 * ProjectCaseService — the learned Project Case store (Learning Engine, Phase 2).
 * 2a = data layer + boot-time vector self-heal; 2b = ingestion; 2c = `decisionBrief` — the learned anchors
 * Decide consumes (Norm baseline + nearest Analogs), structured, never prose.
 */
@Injectable()
export class ProjectCaseService extends BaseService<ProjectCase> implements OnModuleInit {
  private readonly logger = new Logger(ProjectCaseService.name);

  constructor(
    private readonly cases: ProjectCaseRepository,
    private readonly ai: AiService,
  ) {
    super(cases, 'ProjectCase');
  }

  // Self-heal the raw pgvector column on boot — survives a synchronize-driven drop (DATABASE_SYNCHRONIZE=true).
  async onModuleInit(): Promise<void> {
    try {
      await this.cases.ensureVectorColumn(EMBED_DIM);
    } catch (e) {
      this.logger.warn(`project_cases vector column ensure skipped: ${String(e)}`);
    }
    // Additive gold-corpus columns (nullable) — ensured at boot so the entity never queries a missing column.
    try {
      await this.cases.ensureGoldColumns();
    } catch (e) {
      this.logger.warn(`project_cases gold columns ensure skipped: ${String(e)}`);
    }
  }

  /**
   * Build the learned Decision Brief for a new requirement: the size-bucket NORM (stable baseline) + the
   * nearest ANALOG cases (this-kind-of-project shape). Returns null when there is no comparable data — the
   * caller then falls back to the model's own knowledge (graceful degradation).
   */
  async decisionBrief(q: CaseQuery): Promise<DecisionBrief | null> {
    const tags = kw(q.domain ?? '', q.modules.join(' '), q.integrations.join(' '));
    const embedText = [q.domain ?? '', q.summary ?? '', `modules: ${q.modules.join(', ')}`, `integrations: ${q.integrations.join(', ')}`]
      .filter(Boolean).join('\n');
    let vec: number[] | undefined;
    if (this.ai.enabled && embedText.trim()) {
      try { [vec] = await this.ai.embed([embedText]); } catch (e) { this.logger.warn(`Case analog embed failed: ${String(e)}`); }
    }

    // ── Analogs: SAME TEMPLATE first (prioritised). Only if thin, borrow CROSS-TEMPLATE (shape/approach). ──
    const vecSame = vec ? await this.cases.hybridSearch(vec, tags, q.template, ANALOG_K) : [];
    let analogs: Array<ProjectCase & { distance?: number }> = vecSame;
    if (analogs.length < 2) analogs = (await this.cases.casesInBucket(q.template, q.scopeSize)).slice(0, ANALOG_K);

    // ── Strong match: the closest same-template vector hit within threshold, carrying real numbers. Its
    //    ACTUAL timeline/team/budget become the plan baseline (hard reuse) — not just a prompt hint. ──
    const normRoleName = (r: string) => (r.includes('·') ? r.split('·').pop()! : r).trim();
    const top = vecSame[0];
    let strongMatch: StrongMatch | null = null;
    if (top) {
      const dist = Number(top.distance);
      const team = (top.team ?? [])
        .filter((t) => t && typeof t.role === 'string' && t.role.trim())
        .map((t) => ({ role: normRoleName(t.role), seniority: t.seniority || 'mid', units: Number(t.units) || 1 }));
      const budget = Number(top.budgetTotalCents) || 0;
      const coverage = requirementCoverage(q, top);
      if (Number.isFinite(dist) && dist <= STRONG_MATCH_MAX_DIST && coverage >= STRONG_MATCH_MIN_COVERAGE && top.timelineWeeks && team.length) {
        strongMatch = {
          title: top.title,
          template: top.template,
          currency: top.currency,
          scopeSize: top.scopeSize,
          timelineWeeks: top.timelineWeeks,
          budgetCents: budget,
          team,
          stack: top.stack ?? [],
          distance: dist,
          coverage,
        };
      }
    }
    let crossTemplate = false;
    if (analogs.length < 2) {
      const cross = vec
        ? await this.cases.hybridSearchExcluding(vec, tags, q.template, ANALOG_K)
        : await this.cases.casesInScopeExcluding(q.scopeSize, q.template, ANALOG_K);
      if (cross.length) { analogs = cross.slice(0, ANALOG_K); crossTemplate = true; }
    }
    analogs = analogs.slice(0, ANALOG_K);

    // ── Budget norm: same template + currency (NEVER cross-template). Prefer the size bucket; widen to
    //    any-scope when the exact bucket is thin, so budget is reliably served from the corpus. ──
    let budget = await this.cases.budgetNormStats(q.template, q.scopeSize, q.currency);
    if (budget.sampleCount < MIN_NORM_SAMPLES) budget = await this.cases.budgetNormStats(q.template, '', q.currency);

    // ── Timeline norm: size bucket → same-template any-scope → cross-template (currency-independent). ──
    let timeline = await this.cases.timelineNormStats([q.template], q.scopeSize);
    if (timeline.sampleCount < MIN_NORM_SAMPLES) timeline = await this.cases.timelineNormStats([q.template], '');
    if (timeline.sampleCount < MIN_NORM_SAMPLES) {
      const wide = await this.cases.timelineNormStats(ALL_TEMPLATES, '');
      if (wide.sampleCount > timeline.sampleCount) { timeline = wide; crossTemplate = true; }
    }

    if (!analogs.length && budget.sampleCount === 0 && timeline.sampleCount === 0) return null; // no learned data

    // Typical team = median units per role across analogs — but only roles that appear in a MAJORITY of
    // analogs (so one-off roles from unrelated projects don't pollute), with names normalised (strip the
    // "Department · Role" prefix so the same role aggregates instead of splitting).
    const normRole = (r: string) => (r.includes('·') ? r.split('·').pop()! : r).trim();
    const roleUnits = new Map<string, number[]>(); // normalized role → its peak units in each analog that had it
    for (const r of analogs) {
      const perAnalog = new Map<string, number>();
      for (const m of r.team ?? []) {
        const role = normRole(m.role);
        if (!role) continue;
        perAnalog.set(role, Math.max(perAnalog.get(role) ?? 0, Number(m.units) || 0));
      }
      for (const [role, units] of perAnalog) {
        if (!roleUnits.has(role)) roleUnits.set(role, []);
        roleUnits.get(role)!.push(units);
      }
    }
    const majority = Math.max(1, Math.ceil(analogs.length / 2));
    const typicalTeam = [...roleUnits.entries()]
      .filter(([, list]) => list.length >= majority) // present in ≥ half the analogs
      .map(([role, list]) => ({ role, units: median(list) }))
      .filter((t) => t.units > 0)
      .sort((a, b) => b.units - a.units)
      .slice(0, 12);

    // Per-role EFFORT anchor: median effective man-days each role carried across the analogs (from the source
    // budgets' "No. of Days"). Drives Decide's hoursPerDay so effort tracks the real budgets, not full-time.
    const roleDays = new Map<string, number[]>();
    for (const r of analogs) {
      for (const m of r.team ?? []) {
        const role = normRole(m.role);
        const days = Number((m as { days?: number }).days) || 0;
        if (!role || days <= 0) continue;
        if (!roleDays.has(role)) roleDays.set(role, []);
        roleDays.get(role)!.push(days);
      }
    }
    const typicalEffort = [...roleDays.entries()]
      .map(([role, list]) => ({ role, days: median(list) }))
      .filter((e) => e.days > 0)
      .sort((a, b) => b.days - a.days)
      .slice(0, 12);

    // Per-MODULE effort anchor: median attributed man-days per (type × complexity) across the analogs'
    // moduleProfiles. Mirrors typicalEffort; drives the module-intelligence per-module estimate.
    const moduleDays = new Map<string, number[]>();
    for (const r of analogs) {
      for (const m of (r as { moduleProfiles?: { type?: string; complexity?: string; days?: number }[] }).moduleProfiles ?? []) {
        const type = String(m.type || '').trim();
        const complexity = String(m.complexity || '').trim();
        const days = Number(m.days) || 0;
        if (!type || !complexity || days <= 0) continue;
        const key = `${type}|${complexity}`;
        if (!moduleDays.has(key)) moduleDays.set(key, []);
        moduleDays.get(key)!.push(days);
      }
    }
    const typicalModuleEffort = [...moduleDays.entries()]
      .map(([key, list]) => { const [type, complexity] = key.split('|'); return { type, complexity, days: median(list) }; })
      .filter((e) => e.days > 0)
      .sort((a, b) => b.days - a.days);

    const stackFreq = new Map<string, number>();
    for (const r of analogs) for (const s of r.stack ?? []) stackFreq.set(s, (stackFreq.get(s) ?? 0) + 1);
    const commonStack = [...stackFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);

    // Confidence is HIGH only when the trusted, same-template signals are strong.
    const highConfidence =
      budget.sampleCount >= MIN_NORM_SAMPLES ||
      (!crossTemplate && (timeline.sampleCount >= MIN_NORM_SAMPLES || analogs.length >= 3));

    return {
      confidence: highConfidence ? 'high' : 'low',
      crossTemplate,
      strongMatch,
      sampleCount: Math.max(budget.sampleCount, timeline.sampleCount, analogs.length),
      weeks: timeline.sampleCount ? { p25: timeline.weeksP25, p50: timeline.weeksP50, p75: timeline.weeksP75 } : undefined,
      budgetCents: budget.sampleCount ? { p25: budget.p25Cents, p50: budget.p50Cents, p75: budget.p75Cents } : undefined,
      budgetSampleCount: budget.sampleCount,
      typicalTeam,
      typicalEffort,
      typicalModuleEffort,
      commonStack,
      analogs: analogs.map((r) => ({
        title: r.title,
        template: r.template,
        currency: r.currency,
        timelineWeeks: r.timelineWeeks,
        team: (r.team ?? []).map((m) => ({ role: m.role, units: Number(m.units) || 0 })),
        stack: r.stack ?? [],
        budgetCents: Number(r.budgetTotalCents) || 0,
      })),
    };
  }
}

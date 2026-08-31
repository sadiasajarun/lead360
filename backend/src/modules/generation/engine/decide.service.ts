import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../../infrastructure/ai/ai.service';
import { RateCardService } from '../../rate-card/rate-card.service';
import { KbService } from '../../kb/kb.service';
import { EstimateService } from '../../estimate/estimate.service';
import { PortfolioService } from '../../portfolio/portfolio.service';
import { ProjectCaseService, type DecisionBrief } from '../../project-case/project-case.service';
import { ModuleService, type ModuleAnalysis } from './module.service';
import { crashPlanToWeeks } from './plan-crash.util';
import { DECIDE_SYSTEM } from './system-prompts';
import { BudgetCurrency } from '../../../common/enums/budget-currency.enum';
import { Seniority } from '../../../common/enums/seniority.enum';
import { DAYS_PER_WEEK, HOURS_PER_DAY } from '../../../common/constants/time.constants';
import type { TemplateCategory } from '../blocks/block.types';
import type { Intent, Usage } from './intent.types';

// hoursPerDay = this role's part-time daily commitment on this phase (1..8; 8 = full-time). Effective effort
// = workingDays × hoursPerDay / 8, and cost is always priced off the DAILY rate (Workstream A).
export interface PhaseMember { role: string; seniority: string; units: number; dayRateCents: number; department: string; hoursPerDay: number }
export interface DecisionPhase {
  name: string;
  focus: string;
  weeks: number;
  team: PhaseMember[];
  /** Set when a human fixed this phase's duration (a phaseWeeks directive or the plan editor). Scaling,
   *  crashing and regeneration all leave a pinned phase alone — this is what stops an agreed 7-week plan
   *  coming back as 24. */
  pinnedWeeks?: boolean;
}

export interface Decisions {
  structureMode: 'phase' | 'milestone' | 'scope' | 'module';
  stack: { layer: string; choice: string; why: string; value?: string }[];
  /** Union (peak) team across all phases — powers the Team Allocation card. `days` = EFFECTIVE man-days
   *  (hoursPerDay × workingDays / 8); `workingDays` = calendar days staffed; `hoursPerDay` = blended daily commitment. */
  resources: { role: string; seniority: string; units: number; days: number; hoursPerDay: number; workingDays: number; dayRateCents: number }[];
  /** Phases each carry their OWN team (ramp up/down) — cost = per-phase team weekly × weeks. */
  phases: DecisionPhase[];
  timelineWeeks: number;
  comparables: { name: string; blurb: string; url?: string }[];
  /** Template-scoped KB excerpts (half reserved for this category) — reused to ground composed prose. */
  grounding: string[];
  /** Exact technologies drawn from the most comparable past portfolio projects — grounded the tech stack. */
  portfolioTech: string[];
  /** KB retrieval category used for grounding (Global/Local/Agency/Design Portfolio). */
  kbCategory: string;
  budget: {
    currency: string;
    rows: { label: string; focus: string; timeline: string; amountCents: number; rationale?: string }[];
    totalCents: number;
    /**
     * Set ONLY when the total is a reused real quote from a strong comparable rather than a roll-up of
     * this plan's own team x rate card. The two are different numbers, so the Budget sheet must be FITTED
     * to this anchor (generation.service.fitPlanToAnchor) - otherwise the proposal quotes the comparable's
     * price while the sheet and lead value show the rate-card cost of an unrelated roster.
     */
    anchoredCents?: number;
    /**
     * A budget the CLIENT stated in the brief (Riseup's intake template has the field, so it usually
     * arrives in the uploaded document - nothing extra is collected). `hard` means it is a cap and the
     * plan must be FITTED to it; `soft` means it is an aspiration and only sanity-checks the number.
     */
    clientBudgetCents?: number;
    clientBudgetHardness?: 'hard' | 'soft';
    /** True when the plan was CRASHED to a hard deadline (cost inflated to hold effort). The crashed cost is
     *  authoritative — if it exceeds a stated budget, the honest crashed number is shown and flagged, not faked
     *  down to the budget. */
    timelineCrashed?: boolean;
    note: string;
    explanation: { byStack?: string; byRole?: string; byTimeline?: string; rationale?: string; band?: string };
  };
  paymentTerms: { percent: number; label: string }[];
  /** Per-module classification + effort estimate (module-intelligence layer) — INFORMS phase/team sizing and
   *  the internal breakdown; it never sets the price (the rate-card role plan stays authoritative). */
  moduleAnalysis: ModuleAnalysis[];
  moduleTotalEstDays: number;
  /** Sanity findings on the finished plan. Provably-wrong values are corrected in place and reported here
   *  as "corrected"; judgement calls are reported as "check" for a human to accept or override. */
  warnings: string[];
}

const CATEGORY: Record<TemplateCategory, string> = { global: 'Global', local: 'Local', agency: 'Agency', design_portfolio: 'Design Portfolio' };
const clamp = (n: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(n) || lo)));
const SENIORITIES = new Set(['senior', 'mid', 'junior']);

/**
 * Comparable titles come from KB document names, which are file names ("Humm_Technical_and_Financial_
 * Proposal_iOS_Development.pdf"). This paragraph is read by the client, so strip the extension and the
 * separators rather than quoting a file off our own drive.
 */
const prettyTitle = (title: string): string =>
  title
    .replace(/\.(pdf|docx?|xlsx?|pptx?)$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

/**
 * Decide pass — turns Intent into grounded decisions: structure mode, tech stack
 * (with why), a resource plan priced by the rate card (never the LLM), phases,
 * a phase-wise budget, payment terms, and comparable projects.
 */
@Injectable()
export class DecideService {
  private readonly logger = new Logger(DecideService.name);

  constructor(
    private readonly ai: AiService,
    private readonly rateCards: RateCardService,
    private readonly kb: KbService,
    private readonly estimate: EstimateService,
    private readonly portfolio: PortfolioService,
    private readonly cases: ProjectCaseService,
    private readonly modules: ModuleService,
  ) {}

  // Format the learned Decision Brief (norm baseline + nearest analogs) into a structured prompt anchor —
  // decisions, not prose. The client's stated timeline (timelineBlock) still overrides these.
  private formatBrief(brief: DecisionBrief, currency: string): string {
    const fmt = (cents?: number) =>
      cents == null ? '—' : new Intl.NumberFormat(currency === 'BDT' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
    const w = brief.weeks ?? {};
    const b = brief.budgetCents ?? {};
    const lines: string[] = [];
    lines.push(
      brief.confidence === 'high'
        ? `\nLEARNED FROM ${brief.sampleCount} COMPARABLE PAST RISEUP PROJECTS — anchor your DECISIONS to these real deliveries (adapt to THIS project's size; the client's stated timeline above OVERRIDES on conflict):`
        : `\nLEARNED FROM LIMITED PAST DATA (${brief.sampleCount} comparable project(s)) — use as a loose guide, lean on your own judgement where it's thin:`,
    );
    // Cross-template borrowing is transparent: timeline/shape may come from other categories; budget never does.
    if (brief.crossTemplate) {
      lines.push('- (Few same-category matches — timeline & team SHAPE are sized from comparable projects in OTHER categories; the budget figure is same-category + same-currency only, else use the rate card.)');
    }
    if (w.p50) lines.push(`- Typical timeline: ~${w.p50} weeks (range ${w.p25 ?? '?'}–${w.p75 ?? '?'}). Size scope/team so the plan lands near this unless the requirement clearly differs.`);
    if (b.p50) lines.push(`- Typical total budget (same category, ${currency}): ${fmt(b.p50)} (range ${fmt(b.p25)}–${fmt(b.p75)}).`);
    if (brief.typicalTeam.length) lines.push(`- Typical team shape: ${brief.typicalTeam.map((t) => `${t.role} ×${t.units}`).join(', ')}.`);
    if (brief.commonStack.length) lines.push(`- Commonly-used stack: ${brief.commonStack.join(', ')} (prefer where it fits).`);
    for (const a of brief.analogs.slice(0, 3)) {
      const team = a.team.map((t) => `${t.role}×${t.units}`).join(', ');
      // Only show an analog's budget when its currency matches this lead's — never present a BDT total as USD.
      const budgetStr = a.currency === currency ? ` · ${fmt(a.budgetCents)}` : '';
      lines.push(`- Analog "${a.title}" (${a.template}): ${a.timelineWeeks ?? '?'}w · team ${team || '—'}${budgetStr}${a.stack.length ? ` · ${a.stack.slice(0, 4).join('/')}` : ''}.`);
    }
    return lines.join('\n');
  }

  async decide(
    intent: Intent,
    template: TemplateCategory,
    currency: BudgetCurrency,
    structureModeOverride?: Decisions['structureMode'],
    /** Hardware delivery + installation window (weeks). ADDED to the plan as an on-site phase. */
    hardwareInstallWeeks?: number,
  ): Promise<{ decisions: Decisions; usage: Usage }> {
    const query = `${intent.domain}\n${intent.summary}\n${intent.modules.join(', ')}\n${intent.integrations.join(', ')}\n${intent.platforms.join(', ')}`;
    const [rolesPrompt, grounding, comps, learned, brief] = await Promise.all([
      this.rateCards.rolesForPrompt(currency),
      this.kb.retrieveContext(query, 6, CATEGORY[template]),
      this.portfolio.comparable(query, 5).catch(() => []),
      // Learned role-day baselines from comparable past projects (Phase 1: previously recorded but never
      // read in the main path — now fed back as a sanity baseline for team/effort sizing).
      this.rateCards.learnedDays(template).catch(() => ({} as Record<string, number>)),
      // Learned Decision Brief (Phase 2c): size-bucket NORM + nearest ANALOG cases — the structured
      // anchors for timeline/team/budget. Null when there is no comparable data (fall back to the model).
      this.cases
        .decisionBrief({ template, currency, domain: intent.domain, summary: intent.summary, modules: intent.modules, integrations: intent.integrations, scopeSize: intent.scopeSize })
        .catch(() => null),
    ]);
    // Dev-console trace: WHICH past projects/knowledge the system found similar and is grounding this decision on.
    this.logger.log(
      `Decide ▸ Matched learning for grounding (category=${CATEGORY[template]}):\n` +
        `        · KB proposal/budget excerpts: ${grounding.length}\n` +
        `        · Portfolio projects matched:  ${comps.length ? comps.map((c) => c.title).slice(0, 5).join(' | ') : '(none)'}\n` +
        `        · Learned role-day baselines:  ${Object.keys(learned).length} role(s)\n` +
        `        · Project-case Decision Brief: ${
          brief
            ? `${brief.confidence} confidence, ${brief.sampleCount} sample(s)${brief.crossTemplate ? ' [CROSS-TEMPLATE fallback]' : ''}\n          analogs: ${brief.analogs.map((a) => `"${a.title}"[${a.template}]`).slice(0, 3).join(' | ') || '(none)'}\n          norm: timeline ~${brief.weeks?.p50 ?? '?'}w · budget p50 ${brief.budgetCents?.p50 ? Math.round(brief.budgetCents.p50 / 100).toLocaleString() : '—'}`
            : '(no comparable cases yet — table not migrated / no data → model falls back to its own knowledge)'
        }`,
    );
    // Hard reuse: a near-identical past delivery drives the plan's timeline/team/budget (below). Its scope
    // size also OVERRIDES the freshly-classified size — so the same project can't flip medium↔large between
    // runs (the misclassification that let a $5k/7-week job balloon to $19k/10 weeks).
    const strong = brief?.strongMatch ?? null;
    const effectiveScope: Intent['scopeSize'] =
      strong && ['small', 'medium', 'large'].includes(strong.scopeSize) ? (strong.scopeSize as Intent['scopeSize']) : intent.scopeSize;
    if (strong) {
      const fmtM = (c: number) => new Intl.NumberFormat(currency === 'BDT' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(c / 100);
      const heads = strong.team.reduce((s, t) => s + t.units, 0);
      this.logger.log(
        `Decide ▸ STRONG MATCH (dist=${strong.distance.toFixed(3)}) → reusing "${strong.title}" as baseline: ` +
          `${strong.timelineWeeks}w · ${heads} ppl · ${strong.budgetCents > 0 ? fmtM(strong.budgetCents) : '—'} (${strong.currency}) · scope=${strong.scopeSize}`,
      );
    }

    // Module intelligence — classify each module (type + complexity) and estimate its effort from learned
    // per-module history. INFORMS phase/team sizing (below) + drives the internal breakdown; never the price.
    const moduleRes = await this.modules.analyze(intent, brief?.typicalModuleEffort);
    // In module mode each module is its own phase, so the per-module effort below is the PRIMARY driver of
    // that phase's size — make weeks/team scale with it (clearly larger for very-complex modules, small for
    // simple/integration ones) rather than treating it as a loose aggregate.
    const moduleSizingLine = structureModeOverride === 'module'
      ? `Because this project is delivered module-by-module (one phase per module), make EACH module phase's weeks and team scale directly with ITS listed effort below — a ~${Math.max(...moduleRes.modules.map((m) => m.estDays), 1)}d module must be visibly larger than a ~${Math.min(...moduleRes.modules.map((m) => m.estDays), 1)}d one; do not flatten them.`
      : `Size the phase weeks and team so the delivery effort roughly tracks the modules' combined ~${moduleRes.totalEstDays}d (heavier modules get more; do not blow past it without a concrete reason).`;
    const moduleBlock = moduleRes.modules.length
      ? `\nMODULE INTELLIGENCE — this project's modules with their type, complexity and expected effort (effective man-days) from comparable past work. ${moduleSizingLine}\n${moduleRes.modules.map((m) => `- ${m.name} [${m.type} · ${m.complexity}] ≈ ${m.estDays}d`).join('\n')}`
      : '';

    // Grounding excerpts come from COMPARABLE PAST RISEUP PROPOSALS (Proposal-section KB) — anchor
    // timeline, team composition, structure and tech to how those real projects were delivered.
    const groundingBlock = grounding.length
      ? '\nThese are excerpts from COMPARABLE PAST RISEUP PROPOSALS for similar projects. Anchor your decisions to them: the TIMELINE (weeks per phase), the TEAM (which roles and how many, per phase), the phase STRUCTURE, and the technology should resemble how these comparable projects were actually delivered. Adapt to THIS project; never copy prose:\n' + grounding.map((g, i) => `[${i + 1}] ${g}`).join('\n')
      : '';
    // Exact technologies Riseup actually used in the most similar past portfolio projects.
    const portfolioTech = [...new Set(comps.flatMap((c) => c.techStack ?? []).map((t) => t.trim()).filter(Boolean))];
    const stackBlock = portfolioTech.length
      ? `\nExact technologies used in comparable past Riseup projects — name specific technologies like these, preferring them where they fit (add standard complements as needed):\n${portfolioTech.join(', ')}`
      : '';
    // Learned role-day baselines (Phase 1) — a sanity anchor for team/effort sizing from past projects.
    const learnedBlock = Object.keys(learned).length
      ? `\nLearned role-day baselines from comparable past ${template} projects (use as a sanity baseline for effort/team sizing — adapt to THIS project, do not copy blindly):\n${Object.entries(learned).map(([r, d]) => `${r} ≈ ${d}d`).join(', ')}`
      : '';
    // Per-role EFFECTIVE-EFFORT anchor (Workstream A): the median effective man-days each role actually
    // contributed in comparable past budgets. This is the PRIMARY target for `hoursPerDay` — most roles are
    // part-time (a PM/architect gives an hour or two a day; hands-on developers work most of the day). Keep
    // each role's effective days close to these figures; the AI estimates any role not listed.
    const effort = brief?.typicalEffort ?? [];
    const effortBlock = effort.length
      ? `\nLEARNED PER-ROLE EFFORT (effective man-days) from comparable past budgets — the ANCHOR for effort. For each role choose hoursPerDay so that (its working days × hoursPerDay ÷ 8) lands close to these; do NOT inflate:\n${effort.map((e) => `${e.role} ≈ ${e.days}d`).join(', ')}`
      : '';
    // Learned Decision Brief (Phase 2c) — the norm baseline + nearest analogs, as a structured anchor block.
    const briefBlock = brief ? this.formatBrief(brief, currency) : '';
    // Stated timeline (Phase 1) — the client's expected delivery window is a hard sizing signal: size scope,
    // team and phases to FIT it (add parallel team to compress; never pad the schedule). Closes the leak
    // where a stated "4 weeks" was ignored and the plan drifted to ~20 weeks.
    const timelineBlock = intent.timelineWeeks && intent.timelineWeeks > 0
      ? `\nSTATED ${intent.timelineHard ? 'DEADLINE' : 'TIMELINE'} — the client requires delivery in ${intent.timelineWeeks} week(s)${intent.deadlineDate ? ` (by ${intent.deadlineDate})` : ''}. Plan the TEAM and EFFORT this scope genuinely needs — do NOT shrink the work to fit. The app will pin the calendar to ${intent.timelineWeeks} week(s) deterministically and, if that is tighter than the natural schedule, compress it by adding parallel resources and overtime hours (crashing) — so size the real effort honestly and let the app crash it.`
      : '';
    // Strong-match reuse (Phase: hard reuse) — a near-identical past delivery is the baseline. The
    // timeline/team/budget are also RECONCILED deterministically after this call; the prompt keeps the
    // narrative (phases, stack, framing) aligned to that real delivery so prose and numbers agree.
    const fmtCur = (c: number) => new Intl.NumberFormat(currency === 'BDT' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(c / 100);
    const reuseTimeline = intent.timelineWeeks && intent.timelineWeeks > 0 ? '' : ` plan the SAME overall timeline (~${strong?.timelineWeeks} weeks total across your phases),`;
    const reuseBlock = strong
      ? `\nSTRONG MATCH — this requirement closely matches a past DELIVERED Riseup project: "${strong.title}" (${strong.template}). It was delivered in ${strong.timelineWeeks} weeks with a ${strong.team.reduce((s, t) => s + t.units, 0)}-person team (${strong.team.map((t) => `${t.role}×${t.units}`).join(', ')})${strong.currency === currency && strong.budgetCents > 0 ? ` for a total of ${fmtCur(strong.budgetCents)}` : ''}. REUSE this delivery as the baseline:${reuseTimeline} use the SAME team size and composition, and a similar stack. Adjust ONLY where THIS requirement clearly differs from that project. Do NOT inflate the team, timeline, or budget beyond that matched delivery.`
      : '';
    // Advisory engagement (Task 4) — an assessment/recommendation ask, NOT a build. Keep it small and framed
    // as options + a recommendation, so a 1,777-char "assess VR vs AR" brief can't become a 41-week build.
    const advisoryBlock = intent.projectType === 'assessment'
      ? '\nADVISORY ENGAGEMENT — this is an assessment / recommendation project, NOT a full build. Plan a SMALL, short engagement (typically 1–4 weeks with a lean team of analysts/architects) whose output is analysis, option comparisons and a recommendation — never a full delivery squad building the whole system. Do NOT staff a multi-month build or a large team.'
      : '';
    // Structure: honor an explicit override; otherwise the LLM decides from requirements + comparables.
    const structHint = structureModeOverride
      ? `- structureMode: MUST be "${structureModeOverride}" (chosen by the sales team).${structureModeOverride === 'module' ? ' In "module" mode, produce ONE phase per FEATURE MODULE (named after that module, drawn from the project\'s modules) — plus an initiation/foundation phase and a delivery/handover phase when the brief calls for them — and SIZE EACH MODULE INDEPENDENTLY from its own scope and complexity. Do NOT give the modules uniform weeks or a uniform team: a genuinely complex module runs several times longer and larger than a simple one. There may therefore be MORE than 6 phases here — one per module is correct.' : ''}\n`
      : '- structureMode: one of "phase" | "milestone" | "scope" | "module" — pick what best fits THIS project\'s requirements and how comparable past proposals were structured. Default "phase". Use "milestone" only for a very large, segmented programme; "scope" for a small or deploy-only engagement; "module" to deliver feature-module-by-feature-module (each phase named after a feature module).\n';

    // Multi-department PLATFORM guidance — only for an engagement that actually is one. Sent on every
    // project it fought DECIDE_SYSTEM's "most engagements deliver in about 4–12 weeks" policy, and the same
    // brief came back as 11, 22, 24 or 31 weeks depending on which instruction the model happened to follow.
    // Signals: the sales team pinned module-by-module delivery, or the brief marks departments already built.
    const prebuiltNoted = intent.constraints.some((c) => /already built/i.test(c));
    // A long module list is NOT the signal — an ordinary system easily has 8 features. A platform is either
    // declared (sales pinned module-by-module delivery) or evidenced (the brief marks departments already built).
    const isPlatform = prebuiltNoted || (structureModeOverride === 'module' && intent.modules.length >= 6);
    const platformHint = isPlatform
      ? ' Any module the brief marks as ALREADY BUILT or needing only hosting, ERP connection, or role-based access is INTEGRATION work:' +
        ' size it ~1-2 weeks with a minimal team (typically one developer plus a little PM/DevOps), regardless of its intrinsic complexity.' +
        ' This applies to EVERY module belonging to a department the brief marks as already built — even when that module\'s own requirement' +
        ' document describes rich, complex features. Those features already exist; your scope is only to host it, connect its ERP, or add' +
        ' role-based access, so do NOT size it as a fresh build. A shared platform/admin/auth/hosting layer is built ONCE in the initiation' +
        ' phase and reused, so each module phase covers only its own incremental build on top of it. Any per-department duration stated in the' +
        ' brief is a STANDALONE estimate assuming that team rebuilds its own platform, auth and hosting — DISCOUNT it to the incremental build' +
        ' (roughly half) and CAP any single module at ~12 weeks. A genuine multi-department platform may legitimately run longer than the usual' +
        ' 4–12 week engagement: size it from the modules\' own effort rather than from that norm.'
      : '';

    const { data, tokensIn, tokensOut } = await this.ai.json<{
      stack?: { layer: string; choice: string; why: string; value?: string }[];
      structureMode?: string;
      phases?: { name: string; focus: string; weeks: number; team?: { role: string; seniority: string; units: number; hoursPerDay?: number }[] }[];
      comparables?: { name: string; blurb: string }[];
    }>({
      label: 'decide',
      system: DECIDE_SYSTEM,
      maxTokens: 4200,
      prompt:
        'Produce delivery decisions for this project as JSON with EXACTLY these keys:\n' +
        `- stack: array of { layer, choice, why, value? } (5-8 rows; "choice" = the EXACT technology/technologies — specific names/versions (e.g. "React 18 + TypeScript", "NestJS + PostgreSQL 15", "Flutter", "Redis"), NEVER a vague category; "why" = ONE short concrete sentence (max ~18 words); "value" = a brief value-for-money note, max ~8 words)\n` +
        structHint +
        '- phases: array of { name, focus, weeks, team }, foundation → launch (2-4 for small/medium, up to 6 for large — but in "module" structureMode use ONE phase per module plus initiation and delivery, so the count matches the module list). Each phase\'s `team` is an array of { role, seniority (senior|mid|junior), units, hoursPerDay } listing ONLY the roles ACTIVE in that phase at the counts that phase needs. RAMP the team: a light foundation phase, a heavier build phase, a lighter hardening/launch phase — do NOT repeat the full team on every phase. SIZE EACH PHASE FROM ITS OWN WORK: heavier modules get more weeks AND a bigger team; light ones get fewer — never a uniform 1-2 weeks across every module.' +
        platformHint +
        ' Pick roles ONLY from the rate card below.\n' +
        '  hoursPerDay = how many hours PER WORKING DAY this role actually spends on THIS project in this phase (1-8; 8 = full day). Most roles are PART-TIME: a Project Manager / Architect / Tech Lead is typically 1-3, QA 2-4, a hands-on developer/designer 5-8. Pick hoursPerDay so each role\'s effective man-days (weeks×5×hoursPerDay÷8, summed across phases) stays CLOSE to the LEARNED PER-ROLE EFFORT below — do not inflate; when a role is not listed there, estimate it from similar roles/projects.\n' +
        '- comparables: array of { name, blurb } — 2-3 genuinely comparable past Riseup projects from the grounding (omit if none; never invent clients)\n' +
        `Valid roles & rates:\n${rolesPrompt}${groundingBlock}${stackBlock}${learnedBlock}${effortBlock}${moduleBlock}${briefBlock}\n\n` +
        // Full requirement facts (Phase 1) — previously only summary/domain/modules/integrations/platforms
        // reached Decide; the dropped facts (user roles, surfaces, goals, constraints, out-of-scope, timeline)
        // are what made decisions generic and let the timeline drift. Pass them all.
        `Project: ${intent.summary}\nDomain: ${intent.domain}\n` +
        `Modules: ${intent.modules.join(', ') || '—'}\n` +
        `User roles: ${intent.userRoles.join(', ') || '—'}\n` +
        `Surfaces: ${intent.surfaces.map((s) => s.name).join(', ') || '—'}\n` +
        `Integrations: ${intent.integrations.join(', ') || '—'}\nPlatforms: ${intent.platforms.join(', ') || '—'}\n` +
        `Client goals / pains: ${intent.pains.join('; ') || '—'}\nDesired outcome: ${intent.desiredOutcome || '—'}\n` +
        `Constraints: ${intent.constraints.join('; ') || '—'}\nOut of scope: ${intent.outOfScope.join('; ') || '—'}\n` +
        `Size: ${effectiveScope}. Project type: ${intent.projectType}.${timelineBlock}${reuseBlock}${advisoryBlock}`,
    });

    // Structure: override wins; else the LLM's choice; else the heuristic fallback.
    const llmStruct = ['phase', 'milestone', 'scope', 'module'].includes(String(data.structureMode)) ? (data.structureMode as Decisions['structureMode']) : undefined;
    const structureMode = structureModeOverride ?? llmStruct ?? this.structureMode(intent);

    // Per-phase teams, each resolved against the rate card (never the LLM) → canonical role name + real
    // department + DAILY rate. Unknown roles kept in the team at 0 (§10).
    const rateCache = new Map<string, { dayRateCents: number; department: string; role: string }>();
    const resolveOf = async (role: string, seniority: string) => {
      const key = `${role}|${seniority}`;
      if (rateCache.has(key)) return rateCache.get(key)!;
      const r = await this.rateCards.resolveRole(role, seniority as Seniority, currency);
      if (r == null) this.logger.warn(`Role "${role}" not on the rate card — shown in the team, priced at 0.`);
      const v = r ?? { dayRateCents: 0, department: 'Other', role };
      rateCache.set(key, v);
      return v;
    };
    const phases: DecisionPhase[] = [];
    for (const p of data.phases ?? []) {
      const team: PhaseMember[] = [];
      for (const m of p.team ?? []) {
        const role0 = (m.role || '').trim();
        if (!role0) continue;
        const seniority = SENIORITIES.has(String(m.seniority)) ? String(m.seniority) : 'mid';
        const units = clamp(m.units, 1, 10);
        // Part-time daily commitment (1..8). Missing → full-time (8), the legacy behaviour.
        const hoursPerDay = Math.min(HOURS_PER_DAY, Math.max(0.5, Number(m.hoursPerDay) || HOURS_PER_DAY));
        const r = await resolveOf(role0, seniority);
        team.push({ role: r.role, seniority, units, dayRateCents: r.dayRateCents, department: r.department, hoursPerDay });
      }
      phases.push({ name: String(p.name || 'Phase'), focus: String(p.focus || ''), weeks: clamp(p.weeks, 1, 26), team });
    }
    if (!phases.length) phases.push({ name: 'Delivery', focus: intent.summary, weeks: 8, team: [] });

    // Module-by-module delivery: the initiation/foundation and delivery/handover phases are LEAN bookends
    // around the module builds — pin them to 1 week so the timeline weight sits on the modules themselves
    // (the shared platform/admin/auth/hosting is set up once and reused; wrap-up is a short handover).
    if (structureMode === 'module' && phases.length >= 3) {
      phases[0].weeks = 1;
      phases[phases.length - 1].weeks = 1;
    }

    // Hardware installation ADDS to the schedule — the software is built, THEN the devices are applied and
    // integrated. Done deterministically so the window is exactly the one the rep confirmed off the supplier
    // quotation. (The opposite reading — treating a supplier's delivery SLA as the WHOLE project timeline —
    // is what once crashed a four-phase plan into a single week with 61 people.)
    if (hardwareInstallWeeks && hardwareInstallWeeks > 0) {
      // Ranked, because a wrap-up phase often says "Go-Live" too — pinning THAT to the install window
      // leaves the real commissioning phase untouched (it once stayed at 6 weeks while UAT took the pin).
      const score = (n: string) =>
        /install|commission/i.test(n) ? 2 : /deploy|roll.?out|on.?site|on.?premis/i.test(n) ? 1 : 0;
      const ranked = phases
        .map((p, i) => ({ p, i, s: score(p.name) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.i - b.i);
      if (ranked.length) {
        // Already planned for on-site work — pin it to the confirmed window instead of adding a duplicate.
        ranked[0].p.weeks = hardwareInstallWeeks;
      } else {
        // Slot it before any final handover/UAT phase, else append.
        const tailIdx = phases.findIndex((p) => /handover|uat|delivery|closure|support/i.test(p.name));
        const at = tailIdx > 0 ? tailIdx : phases.length;
        const crew = (phases[Math.max(0, at - 1)]?.team ?? []).filter((m) =>
          /devops|support|qa|quality|engineer|technician/i.test(m.role));
        phases.splice(at, 0, {
          name: 'On-site Installation, Commissioning & Go-live',
          focus: 'Install and commission the supplied hardware on site, integrate it with the platform, and verify end to end before go-live.',
          weeks: hardwareInstallWeeks,
          team: crew.length ? crew.map((m) => ({ ...m })) : (phases[Math.max(0, at - 1)]?.team ?? []).slice(0, 2).map((m) => ({ ...m })),
        });
      }
    }

    // ── Size envelope. The module model already estimates this project's effort in man-days; until now that
    //    was only a sentence in the prompt, so the calendar was whatever the model felt like — the same brief
    //    came back as 11, 22, 24 and 31 weeks. Convert effort → weeks against the build heads actually
    //    planned, and use it as the fallback target so the SAME machinery that honours a client deadline also
    //    keeps an unstated timeline honest. Only ever a fallback: a stated deadline and a strong match win. ──
    const envelopeWeeks = ((): number => {
      const estDays = moduleRes.totalEstDays;
      if (!estDays || estDays <= 0) return 0;
      // Weekly EFFECTIVE capacity of the build roles. Roles are staffed part-time, so a head is worth
      // units x (hoursPerDay/8) x 5 days a week — counting heads as full-time made the envelope far too
      // short and collapsed real plans to one week per phase.
      const weekly = phases.reduce((peak, ph) => {
        const cap = ph.team
          .filter((m) => /developer|engineer|designer|architect/i.test(m.role) && !/manager|\bqa\b|quality|support|proof|tester/i.test(m.role))
          .reduce((sum, m) => sum + m.units * ((m.hoursPerDay || HOURS_PER_DAY) / HOURS_PER_DAY) * DAYS_PER_WEEK, 0);
        return Math.max(peak, cap);
      }, 0);
      if (weekly <= 0) return 0;
      return Math.max(1, Math.round(estDays / weekly));
    })();

    // ── Deterministic timeline pin. A client-stated timeline/DEADLINE (or a strong match's real weeks) sets
    //    the calendar. Stretching just scales weeks; COMPRESSING a tight deadline CRASHES the plan — conserve
    //    the scope's effort by adding overtime + parallel heads rather than silently shrinking the work. ──
    const statedWeeks = intent.timelineWeeks && intent.timelineWeeks > 0 ? intent.timelineWeeks : strong ? strong.timelineWeeks : 0;
    // The envelope is an OUTLIER GUARD, not a shaper: it only steps in when the plan is wildly out of line
    // with the effort the modules imply, and it never times a plan below one week per phase.
    const naturalTotal = phases.reduce((s, p) => s + p.weeks, 0);
    const envelopeTarget =
      envelopeWeeks > 0 && (naturalTotal > envelopeWeeks * 1.8 || naturalTotal * 1.8 < envelopeWeeks)
        ? Math.max(phases.length, Math.round(Math.min(Math.max(naturalTotal, envelopeWeeks * 0.6), envelopeWeeks * 1.8)))
        : 0;
    // The module taxonomy is a synthetic estimate; comparable REAL deliveries are better evidence. Where we
    // have genuine samples, they cap the envelope so the default lands on how Riseup actually delivers
    // rather than on a theoretical effort roll-up.
    const normP75 = brief?.weeks?.p75;
    const normCapped =
      envelopeTarget && normP75 && (brief?.sampleCount ?? 0) >= 5
        ? Math.max(phases.length, Math.min(envelopeTarget, Math.round(normP75 * 1.25)))
        : envelopeTarget;
    const targetWeeks = statedWeeks || normCapped;
    if (!statedWeeks && normCapped) {
      this.logger.log(`Decide ▸ SIZE ENVELOPE — ${moduleRes.totalEstDays}d effort ≈ ${envelopeWeeks}w; plan was ${naturalTotal}w; norm p75 ${normP75 ?? '—'}w → retimed to ${normCapped}w.`);
    }
    let crashNote = '';
    if (targetWeeks > 0) {
      const naturalWeeks = phases.reduce((s, p) => s + p.weeks, 0);
      if (naturalWeeks > 0 && Math.abs(naturalWeeks - targetWeeks) >= 1) {
        if (targetWeeks < naturalWeeks) {
          crashNote = crashPlanToWeeks(phases, targetWeeks, naturalWeeks, intent.timelineHard === true);
        } else {
          const k = targetWeeks / naturalWeeks;
          for (const p of phases) p.weeks = Math.max(1, Math.round(p.weeks * k));
          const drift = targetWeeks - phases.reduce((s, p) => s + p.weeks, 0);
          const big = [...phases].sort((a, b) => b.weeks - a.weeks)[0];
          if (big) big.weeks = Math.max(1, big.weeks + drift);
        }
      }
    }
    const timelineWeeks = phases.reduce((s, p) => s + p.weeks, 0);

    // Peak team + per-role cost. Strong match → the TEAM is the matched delivery's REAL roster (priced by
    // the rate card), never the model's inflated per-phase teams. Otherwise → union of the model's phases.
    // Cost per role for the "where it goes" breakdown. Built from the PHASES - the plan that becomes the
    // Budget sheet - so the percentages always describe the money being quoted. (Deriving it from a strong
    // match's real roster instead reported "PM 100% / Mobile 0% / Backend 0%" whenever that roster's roles
    // had no rate-card entry and priced to zero.)
    const roleCost = new Map<string, number>();
    let resources: Decisions['resources'];
    let rosterWeeklyCents = 0;
    if (strong) {
      const totalDays = timelineWeeks * DAYS_PER_WEEK;
      resources = [];
      for (const m of strong.team) {
        const r = await resolveOf(m.role, m.seniority);
        // Reused real roster: no per-role hours to reuse → full-time. The BUDGET is the real quote (reuseBudget)
        // and the sheet is fitted to it downstream, so this card is illustrative.
        resources.push({ role: r.role, seniority: m.seniority, units: m.units, days: totalDays, hoursPerDay: HOURS_PER_DAY, workingDays: totalDays, dayRateCents: r.dayRateCents });
        rosterWeeklyCents += m.units * r.dayRateCents * DAYS_PER_WEEK;
      }
      for (const p of phases) {
        for (const m of p.team) {
          roleCost.set(m.role, (roleCost.get(m.role) ?? 0) + m.units * m.dayRateCents * DAYS_PER_WEEK * p.weeks * (m.hoursPerDay / HOURS_PER_DAY));
        }
      }
    } else {
      const union = new Map<string, { seniority: string; units: number; workingDays: number; effDays: number; dayRateCents: number }>();
      for (const p of phases) {
        const pWorkDays = p.weeks * DAYS_PER_WEEK;
        for (const m of p.team) {
          const factor = m.hoursPerDay / HOURS_PER_DAY;
          const u = union.get(m.role);
          union.set(m.role, {
            seniority: m.seniority,
            units: Math.max(u?.units ?? 0, m.units),
            workingDays: (u?.workingDays ?? 0) + pWorkDays,
            effDays: (u?.effDays ?? 0) + pWorkDays * factor,
            dayRateCents: m.dayRateCents,
          });
          roleCost.set(m.role, (roleCost.get(m.role) ?? 0) + m.units * m.dayRateCents * DAYS_PER_WEEK * p.weeks * factor);
        }
      }
      resources = [...union.entries()].map(([role, v]) => {
        const days = Math.round(v.effDays * 100) / 100;
        const workingDays = Math.round(v.workingDays);
        const hoursPerDay = workingDays > 0 ? Math.round((days * HOURS_PER_DAY / workingDays) * 100) / 100 : HOURS_PER_DAY;
        return { role, seniority: v.seniority, units: v.units, days, hoursPerDay, workingDays, dayRateCents: v.dayRateCents };
      });
    }
    this.rateCards.recordSamples(template, resources.filter((r) => r.dayRateCents > 0).map((r) => ({ role: r.role, days: r.days }))).catch(() => undefined);

    // Phase-wise budget. Default: each phase = its own team's weekly burn × weeks (rate-card priced).
    // Strong-match reuse: when the matched delivery is the SAME currency, the TOTAL is its real quote, split
    // across phases by their weeks — the budget FOLLOWS THE SHEET instead of being rebuilt from team×weeks.
    // (Different currency: price the real roster across the timeline instead of inventing a bigger team.)
    // Phase weekly burn now reflects PART-TIME effort: each member is billed for hoursPerDay/8 of the week.
    const phaseWeekly = (p: DecisionPhase) => p.team.reduce((s, m) => s + m.units * m.dayRateCents * DAYS_PER_WEEK * (m.hoursPerDay / HOURS_PER_DAY), 0);
    const reuseBudget = !!strong && strong.currency === currency && strong.budgetCents > 0;
    const wsum = phases.reduce((s, p) => s + p.weeks, 0) || 1;
    let rows: Decisions['budget']['rows'];
    if (reuseBudget) {
      const total = Math.round(strong!.budgetCents);
      let acc = 0;
      rows = phases.map((p, i) => {
        const amount = i === phases.length - 1 ? total - acc : Math.round((total * p.weeks) / wsum);
        acc += amount;
        return { label: p.name.split('·')[0].trim() || p.name, focus: p.focus, timeline: `${p.weeks} wks`, amountCents: amount, rationale: `Share of the fixed project investment (${p.weeks} of ${wsum} wks)` };
      });
    } else if (strong) {
      const heads = strong.team.reduce((s, m) => s + m.units, 0);
      rows = phases.map((p) => ({ label: p.name.split('·')[0].trim() || p.name, focus: p.focus, timeline: `${p.weeks} wks`, amountCents: rosterWeeklyCents * p.weeks, rationale: `${heads}-person team weekly × ${p.weeks} wk${p.weeks === 1 ? '' : 's'}` }));
    } else {
      rows = phases.map((p) => {
        const heads = p.team.reduce((s, m) => s + m.units, 0);
        return {
          label: p.name.split('·')[0].trim() || p.name,
          focus: p.focus,
          timeline: `${p.weeks} wks`,
          amountCents: phaseWeekly(p) * p.weeks,
          rationale: `${heads}-person phase team weekly × ${p.weeks} wk${p.weeks === 1 ? '' : 's'}`,
        };
      });
    }
    const totalCents = rows.reduce((s, r) => s + r.amountCents, 0);

    // Budget-first sanity band: the range comparable Riseup projects of this size land in. The
    // grounded rate-card total is kept as the number; the band explains where it sits and flags
    // under/over-scoping. Uses mined historical estimates when available, else a heuristic.
    // Sanity band = the range comparable projects of this size actually land in. Prefer the LEARNED norm
    // (real p25–p75 from past cases in the same currency); fall back to the mined/heuristic band only when
    // there is no norm. This kills the old bug where a $19k plan was called "lean" against a $35k–130k
    // large-project band that never applied to this medium job.
    const band2 = this.resolveBand(brief) ?? (await this.estimateBand(intent, template, currency, effectiveScope));
    const fmt = (cents: number) =>
      new Intl.NumberFormat(currency === 'BDT' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
    const bandRange = `${fmt(band2.loCents)}–${fmt(band2.hiCents)}`;
    // When no resources priced (no matching rate-card roles), the total is 0 — say so plainly instead
    // of narrating a $0 plan as a "lean, fast-track scope".
    const rationale =
      totalCents === 0
        ? `No rate-card roles matched this ${effectiveScope} ${intent.domain} scope, so line pricing is pending — load the rate card to price this plan. Comparable Riseup projects typically land at ${bandRange}.`
        : reuseBudget
          ? `Based on Riseup's delivered "${prettyTitle(strong!.title)}" — a directly comparable ${effectiveScope} ${intent.domain} project delivered for ${fmt(strong!.budgetCents)} over ${strong!.timelineWeeks} weeks. This estimate reuses that real investment, adjusted to this scope; comparable projects land at ${bandRange}.`
          : `Priced from a rate-card resource plan for a ${effectiveScope} ${intent.domain} build; ${
              totalCents < band2.loCents
                ? `below the typical ${bandRange} range — a lean, fast-track scope`
                : totalCents > band2.hiCents
                  ? `above the typical ${bandRange} range, reflecting the breadth of scope`
                  : `within the typical ${bandRange} range for a ${effectiveScope} ${intent.domain} build`
            }. Sanity-checked against comparable Riseup projects.`;

    const budget: Decisions['budget'] = {
      currency,
      rows,
      totalCents,
      ...(reuseBudget ? { anchoredCents: totalCents } : {}),
      // Only honour a stated budget written in the SAME currency as the plan - converting a client's
      // "5 lakh" into USD at today's FX and treating the result as a hard cap would be a fabricated number.
      ...(intent.budgetCents && (!intent.budgetCurrency || intent.budgetCurrency === currency)
        ? { clientBudgetCents: intent.budgetCents, clientBudgetHardness: intent.budgetHardness ?? 'soft' }
        : {}),
      ...(crashNote ? { timelineCrashed: true } : {}),
      note: 'Total (excl. third-party & certification costs)',
      explanation: {
        byStack: this.byStack(roleCost),
        byRole: this.byRole(roleCost),
        byTimeline: `${timelineWeeks} weeks across ${phases.length} ${structureMode}${phases.length === 1 ? '' : 's'}`,
        band: `${bandRange} typical`,
        rationale: crashNote ? `${rationale} ${crashNote}` : rationale,
      },
    };

    // Task 2 — bind the plan to the learned NORM. When nothing stronger anchors the number (no strong-match
    // reuse, no stated budget) and the un-anchored roll-up overshoots the norm, mark a norm-derived anchor so
    // the budget sheet is fitted DOWN to a realistic figure instead of shipping a 3× over-scoped plan. The
    // deterministic backstop for the "novel lead → 20 weeks / big budget" case. SKIPPED after a deadline CRASH:
    // the crash deliberately inflated cost to hold effort, so norming it down would undo the requested deadline.
    if (!crashNote) this.bindToNorm(budget, timelineWeeks, brief, currency, effectiveScope, intent.domain);

    // Dev-console trace: the DECISIONS taken — timeline, phase plan, stack, team, budget (priced by rate card).
    this.logger.log(
      `Decide ▸ Decisions: structure=${structureMode} · timeline=${timelineWeeks}w across ${phases.length} phase(s) · budget=${fmt(budget.totalCents)} (anchor ${budget.anchoredCents ? fmt(budget.anchoredCents) : '—'})\n` +
        `        phases: ${phases.map((p) => `${p.name.split('·')[0].trim()}(${p.weeks}w, ${p.team.length} roles)`).join(' | ')}\n` +
        `        stack:  ${(data.stack ?? []).map((s) => s.choice).slice(0, 6).join(' | ') || '—'}\n` +
        `        team(peak ${resources.reduce((s, r) => s + r.units, 0)} ppl): ${resources.map((r) => `${r.role}×${r.units}`).join(', ') || '—'}`,
    );

    // Sanity pass — corrects the provably wrong in place, flags the rest for a human.
    const warnings = this.validatePlan({
      phases, resources, timelineWeeks,
      budgetTotalCents: budget.totalCents,
      currency,
      structureMode,
      moduleCount: intent.modules.length,
      moduleTotalEstDays: moduleRes.totalEstDays,
      brief,
      envelopeWeeks,
      crashed: !!crashNote,
    });
    if (warnings.length) this.logger.warn(`Decide ▸ PLAN CHECK\n        ${warnings.join('\n        ')}`);

    return {
      decisions: {
        warnings,
        structureMode,
        stack: (data.stack ?? []).map((s) => ({ layer: String(s.layer), choice: String(s.choice), why: String(s.why), value: s.value ? String(s.value) : undefined })),
        resources,
        phases,
        timelineWeeks,
        comparables: (data.comparables ?? []).slice(0, 3).map((c) => ({ name: String(c.name), blurb: String(c.blurb), url: 'https://riseuplabs.com/portfolio/' })),
        grounding,
        portfolioTech,
        kbCategory: CATEGORY[template],
        budget,
        paymentTerms: this.payment(structureMode),
        moduleAnalysis: moduleRes.modules,
        moduleTotalEstDays: moduleRes.totalEstDays,
      },
      usage: { tokensIn: tokensIn + moduleRes.usage.tokensIn, tokensOut: tokensOut + moduleRes.usage.tokensOut },
    };
  }

  /**
   * Sanity-check the finished plan. Nothing here re-plans — it corrects the provably wrong (a team no one
   * would staff, a phase count that contradicts the chosen structure) and flags the judgement calls against
   * what comparable Riseup projects actually did, so an implausible plan is visible instead of shipped.
   *
   * Every one of these fired for real: a 1-week/61-person crash, a 31-week attendance system, roles priced
   * at 0 because they were off the rate card.
   */
  private validatePlan(args: {
    phases: DecisionPhase[];
    resources: Decisions['resources'];
    timelineWeeks: number;
    budgetTotalCents: number;
    currency: string;
    structureMode: Decisions['structureMode'];
    moduleCount: number;
    moduleTotalEstDays: number;
    brief?: DecisionBrief | null;
    envelopeWeeks: number;
    crashed: boolean;
  }): string[] {
    const w: string[] = [];
    const fmt = (c: number) => new Intl.NumberFormat(args.currency === 'BDT' ? 'en-IN' : 'en-US', { style: 'currency', currency: args.currency, maximumFractionDigits: 0 }).format(c / 100);

    // --- corrected: nobody staffs this many people on one engagement ---------------------------------
    // Applies even under a crash: compressing to a deadline is legitimate, staffing 76 people is not — that
    // is the shape of the original 61-person incident.
    const PEAK_CAP = args.crashed ? 40 : 25;
    const peak = args.resources.reduce((s, r) => s + r.units, 0);
    if (peak > PEAK_CAP) {
      const k = PEAK_CAP / peak;
      for (const ph of args.phases) for (const m of ph.team) m.units = Math.max(1, Math.floor(m.units * k));
      for (const r of args.resources) r.units = Math.max(1, Math.floor(r.units * k));
      w.push(
        args.crashed
          ? `Corrected: hitting this deadline implied ${peak} people — capped at about ${PEAK_CAP}. The date is likely not achievable as scoped.`
          : `Corrected: peak team was ${peak} people — scaled back to about ${PEAK_CAP}.`,
      );
    }

    // --- checks: judgement calls, surfaced for a human ------------------------------------------------
    const unpriced = args.resources.filter((r) => !r.dayRateCents).map((r) => r.role);
    if (unpriced.length) w.push(`Check: ${unpriced.join(', ')} ${unpriced.length === 1 ? 'is' : 'are'} not on the rate card, so ${unpriced.length === 1 ? 'it is' : 'they are'} priced at 0 — add ${unpriced.length === 1 ? 'it' : 'them'} or drop ${unpriced.length === 1 ? 'it' : 'them'}.`);

    const expected = args.structureMode === 'module' ? args.moduleCount + 2 : 6;
    if (args.structureMode === 'module' && args.moduleCount > 0 && Math.abs(args.phases.length - expected) > 2) {
      w.push(`Check: ${args.phases.length} phases for ${args.moduleCount} modules — module-by-module delivery normally gives about ${expected}.`);
    }
    if (args.structureMode !== 'module' && args.phases.length > 8) {
      w.push(`Check: ${args.phases.length} phases is unusually many for ${args.structureMode}-based delivery.`);
    }

    // Learned norms. Gated on real sample support — DecisionBrief.sampleCount is a max() across sources and
    // overstates how much data actually backs the figure.
    const wp75 = args.brief?.weeks?.p75;
    if (wp75 && (args.brief?.sampleCount ?? 0) >= 5 && !args.crashed) {
      if (args.timelineWeeks > wp75 * 1.6) w.push(`Check: ${args.timelineWeeks} weeks is well above comparable Riseup projects (typically up to ${wp75}).`);
      if (args.timelineWeeks * 2 < (args.brief?.weeks?.p25 ?? 0)) w.push(`Check: ${args.timelineWeeks} weeks is well below comparable projects (typically from ${args.brief?.weeks?.p25}).`);
    }
    const bp75 = args.brief?.budgetCents?.p75;
    if (bp75 && (args.brief?.budgetSampleCount ?? 0) >= 5 && args.budgetTotalCents > bp75 * 2) {
      w.push(`Check: ${fmt(args.budgetTotalCents)} is more than double comparable projects (typically up to ${fmt(bp75)}).`);
    }
    if (args.envelopeWeeks > 0 && args.timelineWeeks > args.envelopeWeeks * 2) {
      w.push(`Check: the modules estimate about ${args.moduleTotalEstDays} days of work (~${args.envelopeWeeks} weeks) but the plan runs ${args.timelineWeeks} weeks.`);
    }
    return w;
  }

  /** phase = default; milestone = large + segmented; scope = small / deploy. */
  private structureMode(intent: Intent): Decisions['structureMode'] {
    if (intent.projectType === 'assessment' || intent.projectType === 'deploy' || intent.scopeSize === 'small') return 'scope';
    if (intent.scopeSize === 'large' && (intent.userRoles.length >= 3 || intent.modules.length >= 10)) return 'milestone';
    return 'phase';
  }

  private payment(mode: Decisions['structureMode']): Decisions['paymentTerms'] {
    if (mode === 'scope') return [{ percent: 30, label: 'Advance' }, { percent: 70, label: 'On delivery' }];
    return [{ percent: 30, label: 'On signing' }, { percent: 30, label: 'Phase 1 acceptance' }, { percent: 30, label: 'Phase 2 acceptance' }, { percent: 10, label: 'On go-live' }];
  }

  private phaseWeekly(p: DecisionPhase): number {
    return p.team.reduce((s, m) => s + m.units * m.dayRateCents * DAYS_PER_WEEK * (m.hoursPerDay / HOURS_PER_DAY), 0);
  }

  /**
   * Bind an un-anchored plan to the learned norm (Task 2). The Decide pass can over-scope a novel lead — a
   * 20-week / big-budget plan against a norm that says 7 weeks / $6.5k. Nothing else pulls it back, so here we
   * set `anchoredCents` to a norm-derived ceiling; the budget sheet's fit solver then reduces team/seniority/
   * allocation to reach it (the same mechanism a stated budget or a strong match uses). No-op when something
   * stronger already anchors the number, or when the plan is already within the norm.
   */
  private bindToNorm(
    budget: Decisions['budget'],
    timelineWeeks: number,
    brief: DecisionBrief | null,
    currency: BudgetCurrency,
    scope: Intent['scopeSize'],
    domain: string,
  ): void {
    if (!brief) return;
    if (budget.anchoredCents) return; // a strong-match reuse quote already anchors
    if (budget.clientBudgetCents) return; // ANY stated client budget wins downstream — learning must not override it
    const total = budget.totalCents;
    if (total <= 0) return;
    const OVERSHOOT = 1.25;
    const MIN_BUDGET_SAMPLES = 5;
    let target: number | undefined;
    let why = '';
    // BUDGET norm bind — ONLY when the same-currency budget norm is well-sampled (a 3-case p75 is just the max
    // of 3, not a percentile), and as a SOFT PULL that trims only the excess ABOVE the ceiling. Never snap every
    // over-scoped plan to a flat p75 — that made three different Local briefs all quote the identical BDT 772,479.
    const bp75 = brief.budgetCents?.p75;
    if (bp75 && brief.budgetSampleCount >= MIN_BUDGET_SAMPLES && total > bp75 * OVERSHOOT) {
      const ceil = bp75 * OVERSHOOT;
      target = Math.round(ceil + (total - ceil) * 0.25); // pass 25% of the overage through → distinct plans stay distinct
      why = 'budget';
    } else {
      // Fallback for thin budget data (Global/Local): a robust TIMELINE norm. Scale to the timeline ceiling —
      // per-plan by construction (uses THIS plan's own total & weeks), so different projects land differently.
      const wp75 = brief.weeks?.p75;
      if (wp75 && timelineWeeks > wp75 * 1.4) {
        target = Math.round(total * (wp75 / timelineWeeks));
        why = 'timeline';
      }
    }
    if (!target || target >= total) return;
    budget.anchoredCents = target;
    const fmt = (c: number) => new Intl.NumberFormat(currency === 'BDT' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(c / 100);
    budget.explanation.rationale = `Sized to the range comparable Riseup ${scope} ${domain} projects land in — the resource plan is fitted to ${fmt(target)} (the learned ${why} norm) rather than the un-anchored roll-up of ${fmt(total)}.`;
    this.logger.log(`Decide ▸ NORM BIND (${why}) → anchoring budget to ${fmt(target)} (was ${fmt(total)}).`);
  }

  /**
   * Deterministically scale a priced plan to hit a budget target (minor units). Keeps each phase's team
   * and scales phase WEEKS by the required factor (compressing/extending the timeline), then fine-tunes
   * the heaviest phase to close the rounding gap and lands within one phase-week of the target. Rewrites
   * budget rows/total/timeline and records the trade-off transparently. No-op if the plan is unpriced.
   */
  retargetBudget(decisions: Decisions, targetCents: number): void {
    const current = decisions.budget.totalCents;
    if (current <= 0 || targetCents <= 0) return;
    const k = targetCents / current;
    for (const p of decisions.phases) p.weeks = Math.max(1, Math.round(p.weeks * k));
    const recompute = () => decisions.phases.reduce((s, p) => s + this.phaseWeekly(p) * p.weeks, 0);
    let total = recompute();
    const heaviest = [...decisions.phases].sort((a, b) => this.phaseWeekly(b) - this.phaseWeekly(a))[0];
    for (let i = 0; heaviest && i < 40; i++) {
      const diff = targetCents - total;
      const step = this.phaseWeekly(heaviest);
      if (step <= 0 || Math.abs(diff) < step / 2) break;
      const next = heaviest.weeks + (diff > 0 ? 1 : -1);
      if (next < 1) break;
      heaviest.weeks = next;
      total = recompute();
    }
    decisions.timelineWeeks = decisions.phases.reduce((s, p) => s + p.weeks, 0);
    decisions.budget.rows = decisions.phases.map((p) => {
      const heads = p.team.reduce((s, m) => s + m.units, 0);
      return { label: p.name.split('·')[0].trim() || p.name, focus: p.focus, timeline: `${p.weeks} wks`, amountCents: this.phaseWeekly(p) * p.weeks, rationale: `${heads}-person phase team weekly × ${p.weeks} wk${p.weeks === 1 ? '' : 's'}` };
    });
    decisions.budget.totalCents = decisions.budget.rows.reduce((s, r) => s + r.amountCents, 0);
    const fmt = (c: number) => new Intl.NumberFormat(decisions.budget.currency === 'BDT' ? 'en-IN' : 'en-US', { style: 'currency', currency: decisions.budget.currency, maximumFractionDigits: 0 }).format(c / 100);
    decisions.budget.explanation.byTimeline = `${decisions.timelineWeeks} weeks across ${decisions.phases.length} ${decisions.structureMode}${decisions.phases.length === 1 ? '' : 's'}`;
    decisions.budget.explanation.rationale = `Scaled to your ${fmt(targetCents)} target: the timeline was adjusted to ${decisions.timelineWeeks} weeks (same per-phase team), landing at ${fmt(decisions.budget.totalCents)}.`;
    this.logger.log(`Budget retargeted to ${fmt(targetCents)} → ${fmt(decisions.budget.totalCents)} over ${decisions.timelineWeeks} wks.`);
  }

  /** Cost share by role bucket from the accurate per-role cost, e.g. "Backend 42% · Frontend 28% · QA 15%". */
  private byStack(roleCost: Map<string, number>): string | undefined {
    if (!roleCost.size) return undefined;
    const bucket = (role: string) => {
      const r = role.toLowerCase();
      if (/back|api|server|laravel|node|nest/.test(r)) return 'Backend';
      if (/front|web|react|vue|ui/.test(r)) return 'Frontend';
      if (/mobile|flutter|ios|android|swift|kotlin/.test(r)) return 'Mobile';
      if (/qa|test|quality/.test(r)) return 'QA';
      if (/devops|infra|cloud|sre/.test(r)) return 'DevOps';
      if (/manager|pm|delivery|lead|architect/.test(r)) return 'PM & Architecture';
      return 'Other';
    };
    const totals: Record<string, number> = {};
    let sum = 0;
    for (const [role, c] of roleCost) { totals[bucket(role)] = (totals[bucket(role)] || 0) + c; sum += c; }
    if (!sum) return undefined;
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / sum) * 100)}%`).join(' · ');
  }

  /** Cost share by individual role, top 4 — from the accurate per-role cost. */
  private byRole(roleCost: Map<string, number>): string | undefined {
    let sum = 0;
    for (const c of roleCost.values()) sum += c;
    if (!sum) return undefined;
    return [...roleCost.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k} ${Math.round((v / sum) * 100)}%`)
      .join(' · ');
  }

  /**
   * Sanity band straight from the LEARNED norm (real p25–p75 of comparable past cases, already same-currency
   * and same-template). Returns null when there is no usable norm, so the caller falls back to estimateBand.
   */
  private resolveBand(brief: DecisionBrief | null): { loCents: number; hiCents: number } | null {
    const b = brief?.budgetCents;
    if (!b?.p50) return null;
    const lo = b.p25 ?? Math.round(b.p50 * 0.7);
    const hi = b.p75 ?? Math.round(b.p50 * 1.4);
    return hi > lo ? { loCents: lo, hiCents: hi } : null;
  }

  /**
   * Budget-first sanity band — the cost range comparable Riseup projects of this size land in, in the
   * lead's currency. Prefers the MINED band from historical projects (EstimateService, in USD);
   * falls back to heuristic USD reference ranges by scope when history is too thin.
   */
  private async estimateBand(
    intent: Intent,
    template: TemplateCategory,
    currency: BudgetCurrency,
    scope: Intent['scopeSize'] = intent.scopeSize,
  ): Promise<{ loCents: number; hiCents: number }> {
    const fx = currency === BudgetCurrency.BDT ? 120 : 1;
    // 1) Mined history (USD cents) → convert to the lead's currency.
    const mined = await this.estimate.band(CATEGORY[template], scope).catch(() => null);
    if (mined) return { loCents: Math.round(mined.loCents * fx), hiCents: Math.round(mined.hiCents * fx) };
    // 2) Heuristic fallback (USD reference ranges by scope).
    const usd: Record<Intent['scopeSize'], [number, number]> = {
      small: [2000, 9000],
      medium: [9000, 35000],
      large: [35000, 130000],
    };
    const [lo, hi] = usd[scope] ?? usd.medium;
    return { loCents: Math.round(lo * fx * 100), hiCents: Math.round(hi * fx * 100) };
  }
}

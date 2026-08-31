import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiService } from '../../../infrastructure/ai/ai.service';
import { DiagramService } from '../../../infrastructure/diagram/diagram.service';
import { buildIconMap } from '../../../infrastructure/diagram/icon-resolver';
import { BudgetCurrency } from '../../../common/enums/budget-currency.enum';
import { UnderstandService } from './understand.service';
import { DecideService, type Decisions, type DecisionPhase } from './decide.service';
import { UNDERSTAND_SYSTEM, DECIDE_SYSTEM, COMPOSE_SYSTEM } from './system-prompts';
import type { Intent, Usage } from './intent.types';
import type { Block, BlockType, ProposalDocument, ProposalMeta, SolutionArchGroup, SolutionArchNode, SolutionArchitectureBlock, FlowSpec } from '../blocks/block.types';

// Per-lead generation diagnostics — surfaced to the browser console (transparency: what prompts ran,
// what knowledge grounded the output, and the exact token cost). gpt-5.4 pricing: $2.50/1M in · $15/1M out.
export interface GenDiagnostics {
  model: string;
  systemPrompts: { understand: string; decide: string; compose: string };
  knowledge: {
    scopeSize: string;
    structureMode: string;
    timelineWeeks: number;
    stack: string[];
    rolesPriced: string[];
    comparables: string[];
    historicalBand?: string;
    budgetRationale?: string;
    /** KB retrieval category used to ground decisions (Global/Local/Agency/Design Portfolio). */
    kbCategory: string;
    /** The actual KB (RAG) excerpts retrieved from past Riseup work that grounded the Decide pass. */
    grounding: string[];
    /** Exact technologies from comparable past portfolio projects that grounded the tech-stack choices. */
    portfolioTech: string[];
  };
  stages: { understand: Usage; decide: Usage; compose: Usage };
  totals: { tokensIn: number; tokensOut: number; tokens: number };
  costUsd: number;
}

// Internal-only cost breakdown for the 💡 verify panel (confidential head-cost rates — stored in a
// select:false column, never served to the client view or the PDF).
export interface InternalCalc {
  financial: {
    currency: string;
    teamWeeklyCents: number; // peak (heaviest phase) weekly burn
    members: { role: string; seniority: string; units: number; dayRateCents: number; weeklyRateCents: number }[];
    // Each phase carries its OWN team + weekly burn (ramped), so the verify panel shows accurate math.
    phases: { label: string; weeks: number; cents: number; weeklyCents: number; team: { role: string; units: number; weeklyRateCents: number }[] }[];
    totalCents: number;
  };
  /** The canonical Delivery Plan (single source of truth) — the budget sheet + proposal both derive from this.
   *  Persisted (confidential — carries head-cost rates) so a budget regen/edit reuses it without re-planning. */
  plan: { currency: string; phases: DecisionPhase[] };
  /** Module-intelligence breakdown (internal) — per-module type/complexity/weight + estimated effort. Drives
   *  the internal module panel; informational only (the plan above sets the price). */
  modules?: { name: string; type: string; complexity: string; weight: number; keyFeatures: string[]; estDays: number }[];
  moduleTotalEstDays?: number;
}

/** Creative content produced by the single compose call (facts come from Intent/Decisions). */
interface Creative {
  coverProjectName: string;
  coverOneLiner: string;
  overviewLead: string;
  scopeModules: { icon: string; title: string; points: string[] }[];
  scopeExperience: { title: string; detail: string }[];
  scopeOutOfScope: string[];
  featureMatrix: { users: { code: string; label: string }[]; modules: { icon: string; name: string; features: { title: string; sub?: string; users: string[] }[] }[] };
  journey: { icon: string; title: string; sub?: string }[];
  phaseDetail: { deliverables: string[]; acceptance: string }[];
  diagram: { kind: string; engine: string; spec: string } | null;
  whyRiseup: string;
  handover: string[][];
  // Global/Local additions:
  methodology: string;
  qaApproach: string;
  deliverables: { deliverable: string; acceptance: string; phase?: string }[];
  assumptions: string[];
  dependencies: string[];
  /** 1-2 important SYSTEM/technical flows (NOT the user journey) → the processFlow "Diagram 2" block. */
  flows: FlowSpec[];
}

// Week label for phase/timeline rows — singular reads correctly ("1 wk", not "1 wks").
const wkLabel = (w: number): string => `${w} ${w === 1 ? 'wk' : 'wks'}`;

/**
 * Whether the brief actually raises post-launch commercial terms. Clients ask about hosting, maintenance,
 * support windows, backups and ownership routinely, and the proposal had nowhere to answer. Gated on the
 * brief so proposals that never mention them are unchanged.
 */
function wantsCommercialTerms(intent: Intent): boolean {
  const haystack = [
    intent.summary, intent.desiredOutcome,
    ...intent.constraints, ...intent.pains, ...intent.modules, ...intent.outOfScope,
  ].join(' ').toLowerCase();
  // Bare "support" / "server" / "dr" are far too common to gate on — they appear in almost every brief.
  return /\b(hosting|maintenance|sla|uptime|backups?|disaster recovery|warranty|ownership|amc|post-launch|source code|licen[cs]e)\b/.test(haystack)
    || /\b(support|maintain)\b[^.]{0,40}\b(period|window|contract|hours|response|retainer|annual|monthly)\b/.test(haystack)
    || /\bown(s|ing)? the (code|source|ip)\b/.test(haystack);
}

const surfaceIcon = (kind: string) => ({ web: 'globe', mobile: 'smartphone', admin: 'sliders-horizontal', portal: 'user', api: 'server', other: 'layers' } as Record<string, string>)[kind] ?? 'layers';
// Pick a meaningful icon for a module/feature sub-tile from its label — so the architecture figure's chips
// vary (cart, pin, lock, …) instead of all reading the same. Resolved by the diagram's own icon set.
const moduleIcon = (label: string): string => {
  const s = (label || '').toLowerCase();
  if (/book|checkout|order|\bcart\b|purchase/.test(s)) return 'cart';
  if (/catalog|browse|listing|product|search|directory/.test(s)) return 'list';
  if (/location|\bmap\b|address|geo|route|track/.test(s)) return 'pin';
  if (/pay|wallet|billing|invoice|checkout|transaction/.test(s)) return 'card';
  if (/auth|login|sign[- ]?in|account|profile|identity|permission|role/.test(s)) return 'lock';
  if (/notif|alert|remind|\bchat\b|messag|inbox/.test(s)) return 'bell';
  if (/report|analytic|dashboard|insight|metric|stat/.test(s)) return 'gauge';
  if (/schedul|calendar|session|booking.*time|appointment/.test(s)) return 'clock';
  if (/file|upload|document|media|attachment|content/.test(s)) return 'file';
  return 'list';
};
const roleIcon = (role: string) => {
  const r = role.toLowerCase();
  if (/manager|pm|delivery/.test(r)) return 'user';
  if (/architect|lead/.test(r)) return 'settings';
  if (/back|api|server|node|nest|laravel/.test(r)) return 'server';
  if (/front|web|react|vue/.test(r)) return 'layout-dashboard';
  if (/mobile|flutter|ios|android/.test(r)) return 'smartphone';
  if (/qa|test/.test(r)) return 'check';
  if (/devops|infra|cloud/.test(r)) return 'cloud';
  return 'user';
};
const roleResponsibility = (role: string) => {
  const r = role.toLowerCase();
  if (/manager|pm|delivery/.test(r)) return 'Single point of contact, weekly status, risk log.';
  if (/architect/.test(r)) return 'Solution architecture, integration design, code reviews.';
  if (/back|api|server/.test(r)) return 'APIs, business logic, integrations, data layer.';
  if (/front|web/.test(r)) return 'Customer site, portal, responsive UI.';
  if (/mobile|flutter/.test(r)) return 'Mobile apps, store submission.';
  if (/qa|test/.test(r)) return 'Functional, regression and payment-flow testing.';
  if (/devops|infra|cloud/.test(r)) return 'Pipelines, infrastructure, monitoring.';
  return 'Delivery of the assigned scope.';
};
const integrationIcon = (name: string) => {
  const n = name.toLowerCase();
  if (/pay|ssl|stripe|wallet|bkash|nagad/.test(n)) return 'wallet';
  if (/sms|message|whatsapp|email/.test(n)) return 'message-square';
  if (/map|location|geo/.test(n)) return 'map-pin';
  if (/db|database|postgres|mysql|redis|storage/.test(n)) return 'database';
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'plug'; // let devicon try (nginx/redis/…), else placeholder
};

/**
 * EngineService — the full generation pipeline:
 * Understand → Decide → Architect → Compose → assemble blocks[] → fill diagrams → iconMap.
 * Produces a ProposalDocument the locked renderer draws (web + PDF).
 */
@Injectable()
export class EngineService {
  private readonly logger = new Logger(EngineService.name);

  constructor(
    private readonly understandSvc: UnderstandService,
    private readonly decideSvc: DecideService,
    private readonly ai: AiService,
    private readonly diagrams: DiagramService,
  ) {}

  async generate(input: {
    brief: string;
    meta: ProposalMeta;
    structureModeOverride?: 'phase' | 'milestone' | 'scope' | 'module';
    /** Hardware delivery + installation window (weeks) — ADDED to the plan as an on-site phase. */
    hardwareInstallWeeks?: number;
    /** Deterministic budget target (minor units) parsed from a regeneration prompt — the plan is scaled to hit it. */
    budgetTargetCents?: number;
    /** Generation date (ISO) — "today" for measuring a stated calendar deadline. */
    todayISO?: string;
  }): Promise<{ doc: ProposalDocument; usage: Usage; diagnostics: GenDiagnostics; internalCalc: InternalCalc; decisions: Decisions }> {
    const { meta } = input;
    this.logger.log(`Engine ▸ generate START · template=${meta.template} · brief ${input.brief.length} chars${input.budgetTargetCents ? ` · budget target ${(input.budgetTargetCents / 100).toLocaleString()}` : ''}`);
    // 1/4 UNDERSTAND — 1 AI call: brief → structured Intent (domain, modules, roles, integrations, scope size).
    this.logger.log('Engine ▸ [1/4] Understand — parsing the brief into structured intent…');
    const { intent, usage: u1 } = await this.understandSvc.understand({ brief: input.brief, template: meta.template, projectType: meta.projectType, audience: meta.audience, todayISO: input.todayISO });
    this.logger.log(
      `Engine ▸ Understood → Intent: domain="${intent.domain || '—'}" · scope=${intent.scopeSize} · type=${intent.projectType} · audience=${intent.audience} · stated timeline=${intent.timelineWeeks ?? 'none'}\n` +
        `        modules(${intent.modules.length}): ${intent.modules.join(', ') || '—'}\n` +
        `        integrations(${intent.integrations.length}): ${intent.integrations.join(', ') || '—'} · roles: ${intent.userRoles.join(', ') || '—'}` +
        (intent.constraints.length ? `\n        constraints: ${intent.constraints.join('; ')}` : ''),
    );
    const currency = (['USD', 'BDT'].includes(meta.currency) ? meta.currency : 'USD') as BudgetCurrency;
    // 2/4 DECIDE — 1 AI call (+ RAG grounding + rate-card): stack, phases, resource plan, budget.
    this.logger.log('Engine ▸ [2/4] Decide — choosing stack, phases, team & budget (RAG-grounded, rate-card priced)…');
    const { decisions, usage: u2 } = await this.decideSvc.decide(intent, meta.template, currency, input.structureModeOverride, input.hardwareInstallWeeks);
    // Exact budget targeting: if the rep asked for a specific number, deterministically scale to it.
    if (input.budgetTargetCents && input.budgetTargetCents > 0) this.decideSvc.retargetBudget(decisions, input.budgetTargetCents);
    // 3/4 ARCHITECT — deterministic (NO AI): which blocks appear, in what order, for this template.
    this.logger.log('Engine ▸ [3/4] Architect — planning block layout (deterministic, no AI)…');
    const plan = this.architect(intent, meta.template);
    // 4/4 COMPOSE — 1 AI call: the client-facing copy for every content block.
    this.logger.log('Engine ▸ [4/4] Compose — writing client-facing copy…');
    const { creative, usage: u3 } = await this.compose(intent, decisions, meta.template);

    const doc: ProposalDocument = { meta, blocks: this.assemble(plan, intent, decisions, creative, meta) };
    await this.diagrams.fillDocumentDiagrams(doc);
    doc.iconMap = buildIconMap(doc);
    const usage: Usage = { tokensIn: u1.tokensIn + u2.tokensIn + u3.tokensIn, tokensOut: u1.tokensOut + u2.tokensOut + u3.tokensOut };
    const diagnostics: GenDiagnostics = {
      model: this.ai.model,
      systemPrompts: {
        understand: UNDERSTAND_SYSTEM,
        decide: DECIDE_SYSTEM,
        compose: COMPOSE_SYSTEM,
      },
      knowledge: {
        scopeSize: intent.scopeSize,
        structureMode: decisions.structureMode,
        timelineWeeks: decisions.timelineWeeks,
        stack: decisions.stack.map((s) => `${s.layer}: ${s.choice}`),
        rolesPriced: decisions.resources.map((r) => `${r.role} (${r.seniority}) ×${r.units} · ${r.days}d`),
        comparables: decisions.comparables.map((c) => c.name),
        historicalBand: decisions.budget.explanation.band,
        budgetRationale: decisions.budget.explanation.rationale,
        kbCategory: decisions.kbCategory,
        grounding: decisions.grounding,
        portfolioTech: decisions.portfolioTech,
      },
      stages: { understand: u1, decide: u2, compose: u3 },
      totals: { tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, tokens: usage.tokensIn + usage.tokensOut },
      costUsd: this.ai.price(usage.tokensIn, usage.tokensOut),
    };
    // Internal cost breakdown for the 💡 verify panel — accurate per-phase teams (ramped), so the math shown
    // (phase team weekly × weeks) reconciles to the total. Rates are confidential (select:false column).
    const WORK_DAYS_PER_WEEK = 5;
    const HOURS_PER_DAY = 8;
    // Part-time effort: each member is billed hoursPerDay/8 of the week, so the shown phase burn reconciles
    // to the partial budget rows (Workstream A).
    const phaseCalc = decisions.phases.map((p, i) => {
      const weeklyCents = p.team.reduce((s, m) => s + m.units * m.dayRateCents * WORK_DAYS_PER_WEEK * (m.hoursPerDay / HOURS_PER_DAY), 0);
      return {
        label: p.name,
        weeks: p.weeks,
        cents: decisions.budget.rows[i]?.amountCents ?? weeklyCents * p.weeks,
        weeklyCents,
        team: p.team.map((m) => ({ role: m.role, units: m.units, weeklyRateCents: m.dayRateCents * WORK_DAYS_PER_WEEK })),
      };
    });
    const internalCalc: InternalCalc = {
      financial: {
        currency: decisions.budget.currency,
        teamWeeklyCents: phaseCalc.reduce((mx, p) => Math.max(mx, p.weeklyCents), 0), // peak burn
        members: decisions.resources.map((r) => ({ role: r.role, seniority: r.seniority, units: r.units, dayRateCents: r.dayRateCents, weeklyRateCents: r.dayRateCents * WORK_DAYS_PER_WEEK })),
        phases: phaseCalc,
        totalCents: decisions.budget.totalCents,
      },
      plan: { currency: decisions.budget.currency, phases: decisions.phases },
      modules: decisions.moduleAnalysis,
      moduleTotalEstDays: decisions.moduleTotalEstDays,
    };
    const c = (u: Usage) => this.ai.price(u.tokensIn, u.tokensOut);
    this.logger.log(
      `Engine ▸ generate DONE · ${doc.blocks.length} blocks, ${Object.keys(doc.iconMap).length} icons\n` +
        `        · understand ${u1.tokensIn}+${u1.tokensOut} tok ($${c(u1).toFixed(4)})\n` +
        `        · decide     ${u2.tokensIn}+${u2.tokensOut} tok ($${c(u2).toFixed(4)})\n` +
        `        · compose    ${u3.tokensIn}+${u3.tokensOut} tok ($${c(u3).toFixed(4)})\n` +
        `        · TOTAL      ${usage.tokensIn}+${usage.tokensOut} = ${usage.tokensIn + usage.tokensOut} tok · $${diagnostics.costUsd} (3 AI calls)`,
    );
    return { doc, usage, diagnostics, internalCalc, decisions };
  }

  /**
   * Rule-based block plan — which sections appear and in what order, per the intent + template.
   * Global/Local use the formal enterprise spine (methodology/QA work approach, a deliverables &
   * acceptance matrix, a project-timeline Gantt, assumptions & dependencies, NO payment terms).
   * Agency keeps its leaner commercial layout (with payment terms).
   */
  private architect(intent: Intent, template: ProposalMeta['template']): BlockType[] {
    if (template === 'global' || template === 'local') {
      const plan: BlockType[] = ['cover', 'overview', 'scope'];
      if (intent.scopeSize !== 'small') plan.push('featureMatrix');
      // Architecture, then the important SYSTEM flow(s), then the end-user journey.
      plan.push('numberedFlow', 'layeredArchitecture', 'processFlow');
      // Mermaid/Kroki "diagram" block retired (Phase 4) — generic third-party output; the house-style
      // solutionArchitecture (layeredArchitecture) + numberedFlow already render the hero figures on-brand.
      // How we work → what you get & how it's signed off → stack → team → when.
      plan.push('workApproach', 'techStack', 'teamAllocation', 'timeline');
      // LOCAL ONLY: a phase-by-phase FINANCIAL ESTIMATION block in the proposal document (eyebrow
      // "Financial estimation"). Its per-phase rows + total are kept in lock-step with the Budget tab by
      // rederiveMoneyBlocksFromSheet (MONEY_BLOCKS includes 'financial'), so the proposal's financial
      // estimation always equals the budget total. GLOBAL keeps money in the Budget tab only.
      // Money lives in the Budget tab for global/local — only the combined-document templates (agency,
      // design_portfolio) carry a financial section. Local still lists the hardware, but WITHOUT prices.
      plan.push('equipment');
      // …what we assume/rely on → sign-off → handover → comparables. No payment terms; no nextStep.
      plan.push('assumptions', 'outOfScope', 'signoff');
      if (wantsCommercialTerms(intent)) plan.push('commercialTerms');
      plan.push('handover', 'comparables');
      return plan;
    }
    // Agency (default): architecture → system flow(s) → user journey → …
    const plan: BlockType[] = ['cover', 'overview', 'scope', 'layeredArchitecture', 'processFlow', 'numberedFlow'];
    if (intent.audience === 'technical' && intent.scopeSize !== 'small') plan.push('diagram');
    if (intent.scopeSize !== 'small') plan.push('featureMatrix');
    plan.push('workApproach', 'techStack', 'teamAllocation', 'equipment', 'financial', 'paymentTerms');
    if (wantsCommercialTerms(intent)) plan.push('commercialTerms');
    plan.push('handover', 'comparables');
    return plan;
  }

  private async compose(intent: Intent, decisions: Decisions, template: ProposalMeta['template']): Promise<{ creative: Creative; usage: Usage }> {
    // Global/Local proposals carry three extra sections (deliverables & acceptance matrix, assumptions
    // & dependencies) and a methodology/QA-led work approach; Agency keeps its leaner set.
    const wantsFormalSections = template === 'global' || template === 'local';
    const formalKeys = wantsFormalSections
      ? '- methodology: 2-3 sentences on the development methodology — how the team works (e.g. Agile/Scrum, sprint length, ceremonies, Definition of Done). Specific to this engagement.\n' +
        '- qaApproach: 2-3 sentences on the QA approach — testing types (functional, regression, integration, UAT), coverage, and the quality gate before each release.\n' +
        '- assumptions: array of 5-8 strings — what we assume to be true for this estimate/timeline to hold.\n' +
        '- dependencies: array of 4-7 strings — what we rely on the client (or third parties) to provide, and by when.\n'
      : '';
    // Ground the methodology/assumptions/deliverables in how Riseup approached comparable past projects
    // OF THE SAME TEMPLATE (global vs local differ in approach, assumptions and dependencies).
    const groundingBlock = wantsFormalSections && decisions.grounding.length
      ? `\nGround the methodology, assumptions, dependencies and deliverables in how Riseup approached comparable past ${template} projects — adapt to THIS project, never copy prose:\n${decisions.grounding.slice(0, 5).map((g, i) => `[${i + 1}] ${g}`).join('\n')}\n`
      : '';
    const { data, tokensIn, tokensOut } = await this.ai.json<Partial<Creative>>({
      label: 'compose',
      system: COMPOSE_SYSTEM,
      maxTokens: wantsFormalSections ? 7500 : 6000,
      prompt:
        'Write the client-facing copy for a proposal as JSON with EXACTLY these keys:\n' +
        '- coverProjectName: the EXACT project name as stated in the brief/requirement — do NOT add descriptive words, taglines, or invent a product name (e.g. keep "AP Invoice Automation", never expand it to "AP Automation Digital Platform")\n' +
        '- coverOneLiner: a SHORT one-liner for the cover (max ~12 words)\n' +
        '- overviewLead: a concise 2-3 sentence paragraph — what will be built and why it matters (keep it tight)\n' +
        '- scopeModules: array of { icon (a lucide name like plane/globe/file/credit-card/database/user/search/bell/shield), title, points (3 bullets) } — the main build areas\n' +
        '- scopeExperience: array of { title, detail } (3-4) — how the primary user experiences it\n' +
        '- scopeOutOfScope: array of 3-4 strings — what is explicitly NOT included in this engagement (sensible exclusions for this project)\n' +
        '- featureMatrix: { users: [{code (1 letter), label}], modules: [{ icon, name, features: [{ title, sub, users (letter codes present) }] }] }\n' +
        '- journey: array of { icon, title, sub } (4-6 steps) — the primary end-to-end flow\n' +
        `- phaseDetail: array of { deliverables (5-7), acceptance } — EXACTLY ${decisions.phases.length} entries, aligned to these phases in order: ${decisions.phases.map((p) => p.name).join(' | ')}\n` +
        '- whyRiseup: ONE or TWO short sentences — a crisp, to-the-point reason to build this with Riseup Labs (no filler)\n' +
        '- handover: array of exactly 2 arrays of strings — two columns of what the client receives\n' +
        '- flows: array of 1-2 IMPORTANT SYSTEM/TECHNICAL flows (NOT the user journey above — pick the flows that matter MOST in THIS system, e.g. a data/ingestion pipeline, an order → fulfilment flow, a payment/settlement flow, a request → processing → storage flow). Each flow = { heading (short, e.g. "Order → Fulfilment Pipeline"), stages: array of 3-5 { icon (a lucide-ish name: file/funnel/server/gear/brain/cpu/database/search/cart/card/pin/lock/bell/shield/bolt/chart/upload/plug/globe/users), title, desc (one short phrase), footer (2-4 word stage summary), footerIcon }, arrows: array of (stages-1) { label (1-2 words for what moves between stages, e.g. "raw"/"validated"/"queued"/"indexed"), kind: "data"|"processing"|"storage" }, outputs (0-2): array of { icon, title, desc (one phrase), items: array of 2-3 { icon, label } } — the stores/outputs the flow writes to, outputLabel (short, e.g. "persist"/"store") }. Make the flows specific to THIS project; NEVER reuse the user journey.\n' +
        formalKeys +
        groundingBlock +
        `\nProject: ${intent.summary}\nDomain: ${intent.domain}\nModules: ${intent.modules.join(', ')}\nUser roles: ${intent.userRoles.join(', ')}\nIntegrations: ${intent.integrations.join(', ')}\nPains: ${intent.pains.join('; ')}\nOutcome: ${intent.desiredOutcome}\nProject type: ${intent.projectType}. Audience: ${intent.audience}.`,
    });
    const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
    const KIND = new Set(['data', 'processing', 'storage']);
    const sanitizeFlows = (v: unknown): FlowSpec[] => {
      if (!Array.isArray(v)) return [];
      return v
        .filter((f): f is FlowSpec => !!f && Array.isArray((f as FlowSpec).stages) && (f as FlowSpec).stages.length > 0)
        .slice(0, 2)
        .map((f) => ({
          heading: String(f.heading ?? ''),
          stages: f.stages.filter((s) => s && typeof s.title === 'string').slice(0, 6).map((s) => ({
            icon: String(s.icon || 'box'), title: String(s.title), desc: String(s.desc ?? ''),
            footer: s.footer ? String(s.footer) : undefined, footerIcon: s.footerIcon ? String(s.footerIcon) : undefined,
          })),
          arrows: Array.isArray(f.arrows)
            ? f.arrows.map((a) => ({ label: a?.label ? String(a.label) : undefined, kind: (KIND.has(String(a?.kind)) ? a!.kind : 'processing') as 'data' | 'processing' | 'storage' }))
            : [],
          outputs: Array.isArray(f.outputs)
            ? f.outputs.filter((o) => o && typeof o.title === 'string').slice(0, 2).map((o) => ({
                icon: String(o.icon || 'box'), title: String(o.title), desc: o.desc ? String(o.desc) : undefined,
                items: Array.isArray(o.items) ? o.items.filter((it) => it && typeof it.label === 'string').slice(0, 4).map((it) => ({ icon: String(it.icon || 'box'), label: String(it.label) })) : [],
              }))
            : [],
          outputLabel: f.outputLabel ? String(f.outputLabel) : undefined,
        }));
    };
    return {
      creative: {
        coverProjectName: data.coverProjectName || intent.domain || 'Proposed Platform',
        coverOneLiner: data.coverOneLiner || intent.summary,
        overviewLead: data.overviewLead || intent.desiredOutcome || intent.summary,
        scopeModules: Array.isArray(data.scopeModules) ? data.scopeModules : [],
        scopeExperience: Array.isArray(data.scopeExperience) ? data.scopeExperience : [],
        scopeOutOfScope: strList(data.scopeOutOfScope),
        featureMatrix: data.featureMatrix && Array.isArray(data.featureMatrix.modules) ? data.featureMatrix : { users: [], modules: [] },
        journey: Array.isArray(data.journey) ? data.journey : [],
        phaseDetail: Array.isArray(data.phaseDetail) ? data.phaseDetail : [],
        diagram: data.diagram && typeof data.diagram.spec === 'string' ? data.diagram : null,
        whyRiseup: data.whyRiseup || '',
        handover: Array.isArray(data.handover) && data.handover.length ? data.handover : [[], []],
        methodology: typeof data.methodology === 'string' ? data.methodology : '',
        qaApproach: typeof data.qaApproach === 'string' ? data.qaApproach : '',
        deliverables: Array.isArray(data.deliverables)
          ? data.deliverables
              .filter((d): d is { deliverable: string; acceptance: string; phase?: string } => !!d && typeof d.deliverable === 'string' && typeof d.acceptance === 'string')
              .map((d) => ({ deliverable: d.deliverable, acceptance: d.acceptance, phase: typeof d.phase === 'string' ? d.phase : undefined }))
          : [],
        assumptions: strList(data.assumptions),
        dependencies: strList(data.dependencies),
        flows: sanitizeFlows(data.flows),
      },
      usage: { tokensIn, tokensOut },
    };
  }

  private assemble(plan: BlockType[], intent: Intent, d: Decisions, c: Creative, meta: ProposalMeta): Block[] {
    const id = () => randomUUID();
    const make: Partial<Record<BlockType, () => Block | null>> = {
      // Cover name: use the EXACT project title from the lead/requirement verbatim; only fall back to the
      // composed name when no title was entered. Never invent/embellish the name (Issue 5).
      cover: () => ({ id: id(), type: 'cover', kicker: `Technical & Financial Proposal · ${meta.date}`, projectName: meta.projectTitle?.trim() || c.coverProjectName, oneLiner: c.coverOneLiner }),
      // Stats cards (Surfaces / Integrations / Modules / Timeline) removed by request — heading + lead only.
      overview: () => ({
        id: id(), type: 'overview', eyebrow: 'The Solution', heading: c.coverOneLiner, lead: c.overviewLead, stats: [],
      }),
      // Global/Local carry a dedicated "Proposed out of scope" section, so the scope block omits its inline list.
      scope: () => ({ id: id(), type: 'scope', eyebrow: 'Project scope', heading: "What we'll build", modules: c.scopeModules.length ? c.scopeModules : intent.modules.slice(0, 3).map((m) => ({ icon: 'search', title: m, points: [] })), experience: c.scopeExperience, outOfScope: (meta.template === 'global' || meta.template === 'local') ? [] : (intent.outOfScope.length ? intent.outOfScope : c.scopeOutOfScope) }),
      layeredArchitecture: () => this.solutionArch(intent, d, id),
      numberedFlow: () => (c.journey.length ? { id: id(), type: 'numberedFlow', eyebrow: 'User journey', heading: 'How it works, end to end', steps: c.journey } : null),
      // Important SYSTEM/technical flow(s) — the "Diagram 2" pipeline, after the architecture. Omitted if the
      // composer produced no flows (a flow must be genuinely important to the project, never filler).
      processFlow: () => (c.flows?.length ? { id: id(), type: 'processFlow', eyebrow: 'System flow', flows: c.flows } : null),
      diagram: () => (c.diagram ? { id: id(), type: 'diagram', eyebrow: 'Detail', heading: 'Key flow', kind: (['sequence', 'flowchart', 'subgraph', 'tree', 'state', 'erd', 'gantt', 'journey'].includes(c.diagram.kind) ? c.diagram.kind : 'flowchart') as any, engine: (c.diagram.engine === 'd2' ? 'd2' : 'mermaid'), spec: c.diagram.spec } : null),
      featureMatrix: () => (c.featureMatrix.modules.length ? { id: id(), type: 'featureMatrix', heading: 'Features by module', users: c.featureMatrix.users.length ? c.featureMatrix.users : intent.userRoles.slice(0, 3).map((r) => ({ code: r.charAt(0).toUpperCase(), label: r })), modules: c.featureMatrix.modules } : null),
      workApproach: () => ({
        id: id(), type: 'workApproach', heading: `Delivered in ${d.phases.length} ${d.structureMode === 'milestone' ? 'milestones' : d.structureMode === 'scope' ? 'scopes' : d.structureMode === 'module' ? 'modules' : 'phases'}`, unitKind: d.structureMode,
        units: d.phases.map((p, i) => ({ name: p.name, timeline: wkLabel(p.weeks), deliverables: c.phaseDetail[i]?.deliverables ?? [p.focus].filter(Boolean), acceptance: c.phaseDetail[i]?.acceptance ?? 'Delivered on staging, passes QA/regression, formally signed off.' })),
        methodology: c.methodology || undefined,
        qaApproach: c.qaApproach || undefined,
        devTesting: c.methodology || c.qaApproach ? undefined : 'Development & testing: Agile two-week sprints with a weekly demo; Definition of Done per feature; staging mirrors production; functional, regression and integration testing before each release.',
      }),
      deliverables: () => {
        // Prefer the granular composed checklist; else derive one from the phase deliverables.
        const items = c.deliverables.length
          ? c.deliverables
          : d.phases.flatMap((p, i) => (c.phaseDetail[i]?.deliverables ?? []).map((del) => ({ deliverable: del, acceptance: c.phaseDetail[i]?.acceptance ?? 'Signed off on staging.', phase: p.name })));
        return items.length ? { id: id(), type: 'deliverables', eyebrow: 'Scope commitment', heading: 'Deliverables & acceptance criteria', items } : null;
      },
      timeline: () => this.timeline(d, c, id, meta.template),
      assumptions: () => {
        const assumptions = c.assumptions.length ? c.assumptions : ['Requirements as described in this proposal are final at kickoff; material changes follow the change-control process.', 'The client provides timely feedback and sign-off at each phase gate.'];
        const dependencies = c.dependencies.length ? c.dependencies : ['Client provides branding, content and access to any existing systems before the relevant phase.', 'Third-party accounts, licenses and API credentials are supplied by the client.'];
        return { id: id(), type: 'assumptions', eyebrow: 'Ground rules', heading: 'Assumptions & remarks', assumptions, dependencies };
      },
      outOfScope: () => {
        const items = intent.outOfScope.length ? intent.outOfScope
          : c.scopeOutOfScope.length ? c.scopeOutOfScope
          : ['Native mobile apps, unless separately scoped.', 'Content creation, data entry and migration of legacy data.', 'Third-party licence, subscription and infrastructure fees.', 'Ongoing support and maintenance beyond the agreed warranty period.'];
        return { id: id(), type: 'outOfScope', eyebrow: 'Boundaries', heading: 'Proposed out of scope', items };
      },
      signoff: () => {
        // Signatories: client from the brief; Riseup from the brief, else the org-settings default (meta.signatory).
        // The block has no title field, so pack "Name — Title" into the single `name` (renders across web/PDF/Word).
        const packSig = (s?: { name: string; title?: string }) => (s?.name ? (s.title ? `${s.name} — ${s.title}` : s.name) : undefined);
        const clientName = packSig(intent.clientSignatory);
        const providerName = packSig(intent.providerSignatory) ?? packSig(meta.signatory);
        return {
        id: id(), type: 'signoff', eyebrow: 'Acceptance', heading: 'Acceptance & sign-off',
        criteria: [
          'Each deliverable is reviewed against its acceptance criteria and the scope agreed in this proposal.',
          'The client confirms acceptance or raises defects within 5 business days of each release; no response within that window is treated as acceptance.',
          'Defects are triaged by severity — blocker and critical issues are resolved before sign-off; minor issues are logged to the backlog.',
          'Final sign-off confirms the delivered solution meets the agreed scope and marks the start of the warranty period.',
        ],
        parties: [
          { role: 'For the Client', ...(clientName ? { name: clientName } : {}) },
          { role: 'For Riseup Labs', ...(providerName ? { name: providerName } : {}) },
        ],
      };
      },
      techStack: () => (d.stack.length ? { id: id(), type: 'techStack', heading: 'What we chose, and why', rows: d.stack } : null),
      teamAllocation: () => (d.resources.length ? { id: id(), type: 'teamAllocation', heading: 'Who delivers this, and what they own', members: dedupeRoles(d.resources).map((r) => ({ icon: roleIcon(r.role), role: r.role, units: r.units, responsibility: roleResponsibility(r.role) })) } : null),
      // Hardware is human-entered in the Budget tab, so the engine emits an empty shell and
      // rederiveMoneyBlocksFromSheet fills it. Never null — the doc is saved before the budget exists.
      equipment: () => ({ id: id(), type: 'equipment', eyebrow: 'Hardware & equipment', heading: 'Hardware, equipment & installation', currency: d.budget.currency, rows: [], totalCents: 0, showPricing: meta.template === 'agency' || meta.template === 'design_portfolio' }),
      financial: () => ({ id: id(), type: 'financial', heading: 'Financial estimation — phase by phase', currency: d.budget.currency, rows: d.budget.rows, totalCents: d.budget.totalCents, note: d.budget.note, explanation: d.budget.explanation }),
      paymentTerms: () => ({ id: id(), type: 'paymentTerms', heading: 'Payment schedule', terms: d.paymentTerms, note: 'Change requests are billed at the standard man-day rate. Licence and subscription fees are billed at cost.' }),
      // Structural statements only — no invented prices. Support and maintenance pricing needs a commercial
      // basis Riseup sets; a figure made up per proposal would put a number the business never agreed in
      // front of a client. The rep fills the basis column in, and the whole block is editable.
      commercialTerms: () => ({
        id: id(),
        type: 'commercialTerms',
        heading: 'Hosting, support & ownership',
        terms: [
          { label: 'Source code & ownership', detail: 'Full ownership of the delivered source code and its documentation transfers to you.', basis: 'Included' },
          { label: 'Hosting', detail: 'The system is deployed to infrastructure you own and control.', basis: 'Your environment' },
          { label: 'Post-launch support', detail: 'Defects traced to the delivered work are corrected after go-live.', basis: 'Agreed at contract' },
          { label: 'Maintenance & enhancements', detail: 'Changes beyond the agreed scope, once the system is live.', basis: 'Standard man-day rate' },
          { label: 'Backup & recovery', detail: 'A backup schedule and a tested restore procedure are configured before handover.', basis: 'Included' },
        ],
        note: 'Support and maintenance terms are confirmed at contract stage.',
      }),
      handover: () => ({ id: id(), type: 'handover', heading: 'What you receive from us', columns: c.handover.length >= 2 ? c.handover : [['Production system', 'Admin console with roles & reports'], ['Source code + Git ownership', 'Documentation, training, 60 days support']] }),
      comparables: () => (d.comparables.length ? { id: id(), type: 'comparables', heading: "We've built comparable products before", items: d.comparables, whyRiseup: { heading: 'Why build this with Riseup Labs', body: c.whyRiseup || 'We ship products like this and stay on after launch — you own the source code and your team is trained to run it.', points: [{ stat: '200+', label: 'products delivered' }, { stat: '15+ yrs', label: 'in market' }, { stat: 'You own it', label: 'full source + handover' }] } } : null),
      nextStep: () => ({ id: id(), type: 'nextStep', heading: 'Getting started', steps: [{ title: 'Proposal sign-off', sub: 'Confirm scope & commercial terms.' }, { title: 'Kickoff workshop', sub: 'Stakeholders, accounts, go-live target.' }, { title: 'Discovery sprint', sub: 'Research, confirmation, sitemap.' }, { title: 'Build starts', sub: 'Week-by-week status, milestone reviews.' }] }),
    };
    return plan.map((t) => make[t]?.()).filter((b): b is Block => !!b);
  }

  /**
   * Project timeline Gantt — derived deterministically from the phase plan so the bars ALWAYS match
   * the budget/timeline. Phase i spans [cumulative+1 .. cumulative+weeks]; the bar's deliverable hint
   * is the phase focus (or its first composed deliverable).
   */
  private timeline(d: Decisions, c: Creative, id: () => string, template: ProposalMeta['template']): Block | null {
    if (!d.phases.length) return null;
    let cursor = 0;
    const rows = d.phases.map((p, i) => {
      const startWeek = cursor + 1;
      const endWeek = cursor + p.weeks;
      cursor = endWeek;
      const deliverable = p.focus || c.phaseDetail[i]?.deliverables?.[0] || undefined;
      return { label: p.name.split('·')[0].trim() || p.name, startWeek, endWeek, deliverable };
    });
    // Local template shows the timeline as a plain Phase | Duration table (no Gantt).
    const layout: 'gantt' | 'table' = template === 'local' ? 'table' : 'gantt';
    return { id: id(), type: 'timeline', eyebrow: 'Delivery timeline', heading: layout === 'table' ? 'Project timeline' : 'Project timeline — week by week', totalWeeks: d.timelineWeeks, rows, layout };
  }

  /**
   * High-Level Solution Architecture — grouped, colour-coded containers of cards joined by labelled, typed
   * connectors. Built DETERMINISTICALLY from the understood intent + the chosen stack (no extra AI call), so it
   * always matches the proposal. Topology adapts to the project (AI vs integrations, file storage or not).
   */
  private solutionArch(intent: Intent, d: Decisions, id: () => string): Block {
    const stackFor = (re: RegExp) => d.stack.find((s) => re.test(s.layer))?.choice;
    const text = `${intent.summary} ${intent.domain} ${intent.modules.join(' ')} ${intent.integrations.join(' ')}`.toLowerCase();
    const isAI = /\b(ai|ml|llm|gpt|model|embedding|chatbot|nlp|vision|recommend|generat|predict|rag|ocr)\b/.test(text);
    const hasFiles = /\b(upload|document|file|media|image|video|photo|attachment|storage|pdf|asset)\b/.test(text);

    const groups: SolutionArchGroup[] = [];
    const edges: SolutionArchitectureBlock['edges'] = [];

    // 1) CLIENT — the product surfaces (web/mobile/admin…), grounded in the chosen frontend stack.
    const surfaces = intent.surfaces.length ? intent.surfaces.slice(0, 3) : [{ name: 'Web App', kind: 'web' }];
    groups.push({
      key: 'client', label: 'Client', icon: 'users', tone: 'client',
      nodes: surfaces.map((s, i) => ({ icon: surfaceIcon(s.kind), title: s.name, subtitle: i === 0 ? stackFor(/front|web|client|ui|mobile/) : undefined })),
    });

    // 2) APPLICATION CORE — API server + its top modules as sub-tiles.
    const coreItems = (intent.modules.length ? intent.modules : ['Auth', 'Business logic', 'Orchestration']).slice(0, 3).map((m) => ({ icon: moduleIcon(m), label: m }));
    groups.push({
      key: 'core', label: 'Application Core', icon: 'server', tone: 'core',
      nodes: [{ icon: 'braces', title: 'API Server', subtitle: stackFor(/back|api|server|node|nest|laravel|django|rails/) ?? 'REST API · business logic', items: coreItems }],
    });
    edges.push({ from: 'client', to: 'core', label: 'REST / API', kind: 'sync' });

    // 3) AI & DATA SERVICES (AI projects) or INTEGRATIONS & SERVICES (everything else).
    if (isAI) {
      groups.push({
        key: 'ai', label: 'AI & Data Services', icon: 'brain', tone: 'ai',
        nodes: [
          { icon: 'cpu', title: 'LLM / Model Layer', subtitle: stackFor(/ai|ml|model|llm|nlp|vision/) ?? 'Model provider' },
          { icon: 'layers', title: 'Embedding & Vector DB', subtitle: 'Semantic search' },
        ],
      });
      edges.push({ from: 'core', to: 'ai', label: 'inference', kind: 'sync' });
      edges.push({ from: 'core', to: 'ai', label: 'embeddings', kind: 'data' });
      edges.push({ from: 'ai', to: 'data', label: 'vectors', kind: 'vector' });
    } else if (intent.integrations.length) {
      groups.push({
        key: 'ai', label: 'Integrations & Services', icon: 'plug', tone: 'ai',
        nodes: intent.integrations.slice(0, 4).map((i) => ({ icon: integrationIcon(i), title: i })),
      });
      edges.push({ from: 'core', to: 'ai', label: 'API calls', kind: 'sync' });
    }

    // 4) PERSISTENCE — full-width row: relational DB (+ file storage when the brief has uploads/media).
    const persistNodes: SolutionArchNode[] = [];
    if (hasFiles) persistNodes.push({ icon: 'folder', title: 'File Storage', subtitle: 'Documents & uploads' });
    persistNodes.push({
      icon: 'database', title: 'Relational DB', subtitle: stackFor(/data|db|postgres|mysql|storage/) ?? 'PostgreSQL',
      items: [{ icon: 'user', label: 'Users' }, { icon: 'file', label: 'Metadata' }, { icon: 'clock', label: 'Sessions' }, { icon: 'shield', label: 'Audit Logs' }],
    });
    groups.push({ key: 'data', label: 'Persistence', icon: 'database', tone: 'data', span: true, nodes: persistNodes });
    edges.push({ from: 'core', to: 'data', label: 'ORM', kind: 'orm' });

    return { id: id(), type: 'solutionArchitecture', eyebrow: 'Solution architecture', heading: 'High-level solution architecture', groups, edges };
  }

  private layered(intent: Intent, id: () => string): Block {
    const cap = <T>(a: T[], n: number) => a.slice(0, n);
    const layers: { label: string; tone: 'blue' | 'core' | 'grey' | 'amber'; modules: { icon: string; label: string }[] }[] = [];
    if (intent.surfaces.length) layers.push({ label: 'Channels', tone: 'blue', modules: cap(intent.surfaces, 4).map((s) => ({ icon: surfaceIcon(s.kind), label: s.name })) });
    if (intent.modules.length) layers.push({ label: 'Application Core', tone: 'core', modules: cap(intent.modules, 5).map((m) => ({ icon: 'search', label: m })) });
    if (intent.integrations.length) layers.push({ label: 'Integrations', tone: 'grey', modules: cap(intent.integrations, 4).map((i) => ({ icon: integrationIcon(i), label: i })) });
    layers.push({ label: 'Data & Storage', tone: 'amber', modules: [{ icon: 'postgresql', label: 'PostgreSQL' }, { icon: 'redis', label: 'Redis' }] });
    return { id: id(), type: 'layeredArchitecture', eyebrow: 'Solution architecture', heading: 'How the platform is wired together', layers };
  }
}

/** Collapse duplicate roles in the resource plan into a single team card with summed units. */
function dedupeRoles(resources: Decisions['resources']): { role: string; units: number }[] {
  const by = new Map<string, number>();
  for (const r of resources) by.set(r.role, (by.get(r.role) || 0) + r.units);
  return [...by.entries()].map(([role, units]) => ({ role, units }));
}

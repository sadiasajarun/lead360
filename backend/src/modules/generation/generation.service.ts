import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AiService } from '../../infrastructure/ai/ai.service';
import { LeadService } from '../lead/lead.service';
import { RequirementService, formatConfirmedQueries, ClientQuery } from '../requirement/requirement.service';
import { ProposalService } from '../proposal/proposal.service';
import { KbService } from '../kb/kb.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { RateCardService } from '../rate-card/rate-card.service';
import { BudgetService, GeneratedBudgetLine } from '../budget/budget.service';
import { GenerationRepository } from './generation.repository';
import { EngineService } from './engine/engine.service';
import { ClientFeedbackService } from '../client-feedback/client-feedback.service';
import { SettingsService } from '../settings/settings.service';
import { posInt, resolvePhaseWeeks, isTotalWeeksMisread } from './engine/directive-parse.util';
import { crashPlanToWeeks } from './engine/plan-crash.util';
import { COMPOSE_SYSTEM, HOUSE_RULES } from './engine/system-prompts';
import type { DecisionPhase } from './engine/decide.service';
import { DAYS_PER_WEEK, HOURS_PER_DAY } from '../../common/constants/time.constants';
import { buildIconMap } from '../../infrastructure/diagram/icon-resolver';
import type { ProposalMeta, TemplateCategory, ProposalDocument, Block, BlockType, WorkApproachBlock } from './blocks/block.types';
import { BudgetCurrency, Seniority, TemplateType } from '../../common/enums';
import { defaultCurrencyFor } from '../../common/enums/budget-currency.enum';
import { startOfDayInZone } from '../../common/utils/time.util';

/**
 * A tax/VAT line is money, not a thing being supplied. It belongs in the Budget tab; in an unpriced,
 * client-facing hardware list it would read as an item with no price, which says nothing.
 */
const isMoneyOnlyLine = (name: string): boolean => {
  const n = (name || '').toLowerCase();
  return n.includes('vat') || n.includes('tax') || n.includes('duty') || n.includes('levy');
};

/** One purchased item on the Budget sheet — qty x unit price, no man-days involved. */
type EquipmentRow = {
  item: string;
  brand?: string;
  uom?: string;
  qty: number;
  unitPriceCents: string | number;
  note?: string;
};

/** One costed row of the Budget sheet (as returned by BudgetService.getForLead) — the lossless edit surface. */
type SheetLine = {
  milestoneName?: string;
  department: string;
  role: string;
  seniority: string;
  units: number;
  days: number; // EFFECTIVE man-days = hoursPerDay × workingDays / 8
  hoursPerDay?: number;
  workingDays?: number; // calendar days staffed (timeline proxy)
  dayRateCents: string | number;
  optional?: boolean;
};

/** The Budget sheet's computed totals (from computeBudget) — carries the adjustment breakdown for the proposal. */
type BudgetComputed = { subtotalCents: number; contingencyCents: number; discountCents: number; vatCents: number; totalCents: number };

/** A regeneration instruction parsed into a STRUCTURED, deterministically-appliable directive (AI-understood,
 *  math-exact). Any of the fields may be set; `isStructural` is false for pure wording/content changes. */
interface ParsedDirective {
  budgetTargetCents?: number;
  /** 'exact' → hit the number to the cent; 'max' → a ceiling ("under/within X"), never padded up. */
  budgetMode?: 'exact' | 'max';
  totalWeeks?: number;
  /** Per-PHASE week changes ("make Discovery 2 weeks") — matched to the plan's own phase names. Applying
   *  these deterministically is what keeps the rest of the schedule untouched; without them such a prompt
   *  can only be handled by re-planning the whole project, which discards every other agreed number. */
  phaseWeeks?: { phase: string; weeks: number }[];
  /** Hardware/equipment rows the rep asked to drop, by item name. Applied to the BUDGET (the source of
   *  truth); the proposal's equipment section then re-syncs from it. */
  equipmentRemove?: string[];
  removeRoles: string[];
  /** Roles to add. `units` = head count (default 1); `dayRateCents` = an explicit unit price from the prompt
   *  (else the rate-card rate, else the team-average price). */
  addRoles: { role: string; seniority: string; units?: number; dayRateCents?: number }[];
  /** A delivery-structure change ("phase-by-phase → module-by-module", "split into milestones") — triggers a
   *  full re-plan in that mode (Workstream B). Undefined when the instruction is not structural. */
  structureMode?: 'phase' | 'milestone' | 'scope' | 'module';
  isStructural: boolean;
}

/** A universal regeneration prompt split into per-target instructions (Workstream B). `edits` are per-section
 *  content changes (applied in place, preserving untouched sections); `budget` is a money directive; a
 *  `structureMode` or `global` change forces a full re-plan/re-compose instead. */
interface RegenRoute {
  edits: { blockId: string; instruction: string }[];
  budget?: string;
  structureMode?: 'phase' | 'milestone' | 'scope' | 'module';
  global?: string;
}

// Legacy full-proposal composer scaffold — now built on the shared HOUSE_RULES so it carries the same
// grounding + safety guardrails as the block engine. (Single-block regeneration uses COMPOSE_SYSTEM.)
const SCAFFOLD =
  HOUSE_RULES + '\n\nDraft the requested proposal sections as concise, client-ready copy grounded in the brief.';

const SENIORITIES = new Set<string>(['senior', 'mid', 'junior']);

// Riseup Labs' own contact details — shown on the proposal cover ("Contact"), since Riseup is the sender.
const RISEUP_CONTACT = { phone: '+88-0175-974-7387', email: 'contact@riseuplabs.com', website: 'riseuplabs.com' };

/**
 * Parse a budget target (minor units / cents) from a plain-English regeneration prompt, e.g.
 * "change the budget to $95k", "make it 1.2m", "keep it under 80,000", "from 150k to 95k".
 * Returns undefined when the prompt has no clear monetary target (so normal regeneration runs).
 */
/**
 * Outcome of fitting a Plan to a budget target. `feasibility` is part of the answer, not a warning: a hard
 * budget the floor plan cannot reach must be reported as such rather than quietly discounted into shape.
 */
export interface BudgetFit {
  lines: GeneratedBudgetLine[];
  adjustments?: { contingencyPct: number; discountPct: number; vatPct: number };
  /** Human-readable record of which lever moved and by how much - surfaced in the change log. */
  trail: string[];
  feasibility: 'fits' | 'tight' | 'infeasible';
  subtotalCents: number;
}

/** Largest residual the closing adjustment may absorb. Beyond this the plan did not fit - say so. */
const RESIDUAL_MAX_PCT = 0.1;

export function parseBudgetTargetCents(text?: string): number | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (!/(budget|price|cost|invest|quote|total|\$|৳|bdt|usd|taka)/.test(t)) return undefined;
  const scale = (suf: string): number => {
    const s = suf.toLowerCase();
    if (s.startsWith('k') || s === 'thousand') return 1e3;
    if (s === 'm' || s.startsWith('mn') || s.startsWith('mil')) return 1e6;
    if (s.startsWith('la')) return 1e5; // lakh / lac
    if (s.startsWith('cr')) return 1e7; // crore
    return 1;
  };
  const toCents = (numStr: string, suf?: string): number | undefined => {
    const n = parseFloat(numStr.replace(/,/g, ''));
    if (!isFinite(n) || n <= 0) return undefined;
    return Math.round(n * scale(suf ?? '') * 100);
  };
  // Prefer a number anchored by an intent word (to/at/under/around/…) — the actual target.
  const anchored = t.match(/(?:\bto\b|\bat\b|=|under|below|around|about|~|of)\s*(?:\$|usd|bdt|৳)?\s*([0-9][0-9,.]*)\s*(k|thousand|m|mn|mil|million|lakh|lac|cr|crore)?/i);
  const a = anchored ? toCents(anchored[1], anchored[2]) : undefined;
  if (a && a >= 50_000) return a;
  // Else the LAST money-like figure ≥ $500 (handles "from 150k to 95k" → 95k), ignoring stray small numbers.
  let last: number | undefined;
  for (const m of t.matchAll(/(?:\$|usd|bdt|৳)?\s*([0-9][0-9,.]{1,})\s*(k|thousand|m|mn|mil|million|lakh|lac|cr|crore)?/gi)) {
    const c = toCents(m[1], m[2]);
    if (c && c >= 50_000) last = c;
  }
  return last;
}

// Week label for phase/timeline rows — singular reads correctly ("1 wk", not "1 wks").
const wkLabel = (w: number): string => `${w} ${w === 1 ? 'wk' : 'wks'}`;

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly ai: AiService,
    private readonly leads: LeadService,
    private readonly requirements: RequirementService,
    private readonly proposals: ProposalService,
    private readonly kb: KbService,
    private readonly rateCards: RateCardService,
    private readonly budgets: BudgetService,
    private readonly generations: GenerationRepository,
    private readonly portfolio: PortfolioService,
    private readonly engine: EngineService,
    private readonly clientFeedback: ClientFeedbackService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * AI token-usage & cost dashboard (all leads): lifetime total, average per proposal, today and yesterday.
   * Cost is priced from the SAME per-1M rates the dev-console logs use (AiService.price), so the $ figures
   * are consistent everywhere. "Today"/"yesterday" are calendar days in APP_TIMEZONE (the team's working
   * day), NOT the API host's clock - a UTC host would otherwise roll the day over mid-morning. Distinct-lead
   * count is the proposal denominator for the average (all-in tokens per proposal, regenerations included).
   */
  async tokenStats() {
    const startToday = startOfDayInZone(new Date());
    const startYesterday = startOfDayInZone(new Date(startToday.getTime() - 1));
    const [life, today, yesterday] = await Promise.all([
      this.generations.tokenAggregate(),
      this.generations.tokenAggregate(startToday),
      this.generations.tokenAggregate(startYesterday, startToday),
    ]);
    const bucket = (a: { tokensIn: number; tokensOut: number }) => ({
      tokensIn: a.tokensIn,
      tokensOut: a.tokensOut,
      tokens: a.tokensIn + a.tokensOut,
      costUsd: this.ai.price(a.tokensIn, a.tokensOut),
    });
    const lifetime = bucket(life);
    const proposals = life.proposals;
    return {
      lifetime,
      avgPerProposal: {
        tokens: proposals ? Math.round(lifetime.tokens / proposals) : 0,
        costUsd: proposals ? +(lifetime.costUsd / proposals).toFixed(4) : 0,
        proposals,
      },
      today: bucket(today),
      yesterday: bucket(yesterday),
      model: this.ai.model,
    };
  }

  /**
   * AI token usage for ONE lead — the all-in total (every proposal generation, budget, sales brief, pitch
   * deck and regeneration) plus a per-kind breakdown. Priced with the same rates as the dashboard/logs.
   */
  async leadTokenUsage(leadId: string) {
    const rows = await this.generations.leadTokenBreakdown(leadId);
    const tokensIn = rows.reduce((s, r) => s + r.tokensIn, 0);
    const tokensOut = rows.reduce((s, r) => s + r.tokensOut, 0);
    const runs = rows.reduce((s, r) => s + r.runs, 0);
    return {
      tokens: tokensIn + tokensOut,
      tokensIn,
      tokensOut,
      costUsd: this.ai.price(tokensIn, tokensOut),
      runs,
      // Only kinds with a real AI run (tokens > 0) — a pure-deterministic kind ($0 budget re-syncs) is hidden.
      byKind: rows
        .filter((r) => r.runs > 0)
        .map((r) => ({
          kind: r.kind,
          tokens: r.tokensIn + r.tokensOut,
          runs: r.runs,
          costUsd: this.ai.price(r.tokensIn, r.tokensOut),
        })),
      model: this.ai.model,
    };
  }

  // Attach real riseuplabs.com links to the AI's comparable-project picks: exact/substring title
  // match first, then best word-overlap match against the scraped portfolio. Anything still
  // unmatched falls back to the public portfolio index so every card is clickable.
  private static readonly PORTFOLIO_INDEX = 'https://riseuplabs.com/portfolio/';
  // Template → KB category, so grounding retrieves the SAME template's past proposals/budgets.
  private static readonly CATEGORY: Record<string, string> = { global: 'Global', local: 'Local', agency: 'Agency', design_portfolio: 'Design Portfolio' };

  private async linkComparables(data: Record<string, unknown>) {
    await this.linkComparableItems(data.comparableProjects as { name?: string; blurb?: string; url?: string }[] | undefined);
  }

  // Attach real riseuplabs.com detail links to a comparables items array (shared by the legacy path
  // and the block engine). Each item.url becomes the matched project's detail URL, else the index.
  private async linkComparableItems(items?: { name?: string; blurb?: string; url?: string }[]) {
    if (!Array.isArray(items) || !items.length) return;
    const all = await this.portfolio.list().catch(() => []);
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const STOP = new Set(['the', 'and', 'for', 'app', 'platform', 'system', 'project', 'riseup', 'labs', 'ios', 'android']);
    const words = (t: string) => new Set(norm(t).split(' ').filter((w) => w.length > 2 && !STOP.has(w)));

    for (const item of items) {
      const n = norm(item.name ?? '');
      if (!n) continue;
      let hit = all.find((p) => {
        const t = norm(p.title);
        return t === n || t.includes(n) || n.includes(t);
      });
      if (!hit) {
        // Best word overlap — needs at least 2 shared significant words to count as the same project.
        const nw = words(item.name ?? '');
        let best = 0;
        for (const p of all) {
          const overlap = [...words(p.title)].filter((w) => nw.has(w)).length;
          if (overlap > best) { best = overlap; hit = p; }
        }
        if (best < 2) hit = undefined;
      }
      item.url = hit ? hit.detailUrl : GenerationService.PORTFOLIO_INDEX;
    }
  }

  // RAG: retrieve grounding passages from Riseup's own corpus for a lead's brief. `category`
  // (Global/Local/Agency/Design Portfolio) reserves half the budget for that template's REAL
  // delivered proposals so the output mirrors their structure and voice.
  private async groundingFor(title: string, brief: string, category?: string) {
    const grounding = await this.kb.retrieveContext(`${title}\n${brief}`, 8, category);
    return grounding.length
      ? "\n\nGround your writing in these excerpts from Riseup Labs' own past proposals/budgets:\n" +
          grounding.map((g, i) => `[${i + 1}] ${g}`).join('\n')
      : '';
  }

  // Optional plain-English revision instructions from the sales rep, formatted for the prompt.
  private revisionBlock(instructions?: string) {
    const t = instructions?.trim();
    return t ? `\n\nRevision instructions from the sales rep — apply these changes to the draft:\n${t}` : '';
  }

  /**
   * Block-based generation — runs the full engine (Understand → Decide → Architect → Compose)
   * and stores a ProposalDocument (blocks[] + meta + iconMap) in proposal.sections.
   *
   * The EFFECTIVE brief is the pasted/extracted brief + the confirmed readiness clarifications +
   * the wizard's project-context notes. Meta (logo, framing, audience) comes from the lead's
   * Client & Brand + Template & Setup steps; the Sales structure-mode override (if set) is honored.
   */
  // Parse a bundled brief (many uploaded files concatenated, each preceded by `--- filename ---`) into a
  // compact, up-front MANIFEST: one line per file with a clean module name, a short content digest and any
  // stated duration. Returns '' for single-file / pasted-text briefs (no manifest needed). This guarantees
  // every uploaded requirement file registers as its own module even when the full document is truncated.
  private buildFileManifest(documentText: string): string {
    if (!documentText) return '';
    const re = /^---\s(.+?)\s---\s*$/gm;
    const marks: { name: string; start: number; bodyStart: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(documentText))) marks.push({ name: m[1].trim(), start: m.index, bodyStart: re.lastIndex });
    if (marks.length < 2) return ''; // not a multi-file bundle
    const clean = (n: string) =>
      n
        .replace(/\.(pdf|docx?|xlsx?|pptx?|txt|md)$/i, '')
        .replace(/\s*\[draft\]\s*/gi, ' ')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const items = marks.map((mk, i) => {
      const bodyEnd = i + 1 < marks.length ? marks[i + 1].start : documentText.length;
      const body = documentText.slice(mk.bodyStart, bodyEnd).replace(/\s+/g, ' ').trim();
      const dur = body.match(/(?:Project\s*)?Duration\s*[:\-]?\s*([0-9]+\s*(?:days?|weeks?|months?))/i);
      const durNote = dur ? ` [stated duration: ${dur[1].replace(/\s+/g, ' ')}]` : '';
      return `${i + 1}. ${clean(mk.name)} — ${body.slice(0, 320)}${durNote}`;
    });
    return (
      `UPLOADED REQUIREMENT FILES (${marks.length}) — the attached brief bundles ${marks.length} separate ` +
      `requirement documents (typically one per department or feature). Unless the priority requirements above ` +
      `say to merge or exclude one, treat EACH file as its OWN top-level module and KEEP ALL of them in scope — ` +
      `do NOT drop or collapse the files that appear later in the document:\n${items.join('\n')}`
    );
  }

  // Build the engine input (effective brief + meta + structure override) from the lead + requirement.
  // Shared by full generation and single-block regeneration.
  private async buildEngineInput(leadId: string, instructions?: string) {
    const lead = await this.leads.findByIdOrFail(leadId);
    const req = await this.requirements.getForLead(leadId);
    const documentText = (req?.sourceText ?? '').trim(); // uploaded brief/RFP — supporting DETAIL
    const additional = (req?.additionalRequirements ?? '').trim(); // rep's typed requirements — TOP PRIORITY
    const context = lead.projectContext?.trim(); // step-3 project context — foundational framing
    if (!documentText && !additional && !(req?.files?.length)) {
      throw new BadRequestException('Add the requirement first — upload the brief/RFP or paste the requirement text.');
    }
    const qna = formatConfirmedQueries(req?.queries as ClientQuery[] | undefined);

    // Client feedback (P5) — captured AFTER the proposal was shared. This is the client's own direction, so it
    // sits ABOVE the rep's requirements and overrides everything on conflict. Consumed items are marked applied.
    const openFeedback = await this.clientFeedback.openForLead(leadId).catch(() => []);
    const feedbackBlock = openFeedback.length
      ? `CLIENT FEEDBACK ON THE SHARED PROPOSAL — the client's own direction. Apply EVERY point; it overrides the requirements and the attached document on any conflict:\n${openFeedback.map((f, i) => `${i + 1}. ${f.text}`).join('\n')}`
      : '';

    // PRIORITY ORDER (Issue 2): the rep's typed requirements + project context are AUTHORITATIVE and shape
    // the proposal/budget; the attached document supplies detail and must NOT be ignored, but the priority
    // inputs win on any conflict.
    // Project CONTEXT (deadline, budget, other framing) comes FIRST — it is short and carries the hard
    // constraints, so it must never be pushed past the model's brief-length cutoff by a very long requirement
    // document (that truncation is exactly what dropped a stated deadline on a 15k-char brief).
    const priorityBody = [
      context ? `Project context (foundational framing — deadlines, budget, constraints):\n${context}` : '',
      additional ? `Priority requirements (from the sales rep):\n${additional}` : '',
        ].filter(Boolean).join('\n')
    // Procurement framing — INTERNAL. It tells the engine what we supply without ever handing it the
    // supplier's identity or terms (the quotation itself never reaches this brief; it is parsed straight
    // into the budget's equipment schedule instead).
    const procurement = lead.hardwareProject || lead.thirdPartyService
      ? [
          'PROCUREMENT (internal): Riseup Labs supplies and installs the hardware for this engagement.',
          lead.hardwareInstallWeeks ? 'On-site installation and commissioning happens AFTER the software build and extends the schedule. Its duration is set by the app — do not infer a project timeline from it.' : '',
          lead.hardwareWarranty ? `Warranty we pass to the client: ${lead.hardwareWarranty}` : '',
          lead.procurementNotes?.trim() ? `Sales note: ${lead.procurementNotes.trim()}` : '',
          'Present all hardware as supplied and installed by Riseup Labs. NEVER mention a reseller, supplier, subcontractor or third party, and never place the hardware out of scope.',
        ].filter(Boolean).join('\n')
      : '';

    const priorityBlock = priorityBody
      ? `TOP-PRIORITY REQUIREMENTS & PROJECT FRAMING — read these FIRST and treat them as authoritative; they shape the proposal and budget. Where the attached client document below conflicts, THESE win:\n${priorityBody}`
      : '';
    // When the attached brief bundles SEVERAL requirement documents (each preceded by a `--- filename ---`
    // header, as happens when a multi-department platform uploads one file per department), the raw document
    // can run past the model's brief-length cutoff and silently drop the files that sort last — so their
    // modules vanish from the plan. This compact manifest lists EVERY file up-front (names + a short digest),
    // ahead of the full document, so all modules are seen and none are collapsed regardless of truncation.
    const manifestBlock = this.buildFileManifest(documentText);
    const docBlock = documentText
      ? `ATTACHED CLIENT BRIEF / DOCUMENT (supporting detail — use it for specifics; do NOT ignore it, but it is subordinate to the priority requirements above on conflict):\n${documentText}`
      : '';
    const brief = [
      feedbackBlock,
      priorityBlock,
      procurement,
      manifestBlock,
      docBlock,
      qna,
      instructions ? `Revision instructions from the sales rep:\n${instructions}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    // Dev-console trace: how the user's inputs (text, context, document, feedback) become the ONE effective
    // brief fed to the AI, in PRIORITY order (higher wins on conflict). This is the "user prompt → system prompt"
    // translation the sales rep should be able to see.
    this.logger.log(
      `Generation ▸ Inputs → effective brief (priority order — higher OVERRIDES lower on conflict):\n` +
        `        1) Client feedback on shared proposal (P5): ${openFeedback.length} item(s)\n` +
        `        2) Rep priority requirements (typed):        ${additional ? `${additional.length} chars` : '(none)'}\n` +
        `        3) Project context (step 3 framing):         ${context ? `${context.length} chars` : '(none)'}\n` +
        `        4) Attached client document (RFP/brief):     ${documentText ? `${documentText.length} chars` : '(none)'}\n` +
        `        5) Confirmed client Q&A:                      ${qna ? 'included' : '(none)'}` +
        (instructions?.trim() ? `\n        6) Regeneration prompt: "${instructions.trim().slice(0, 120)}"` : '') +
        `\n        → assembled effective brief = ${brief.length} chars → fed to Understand + Decide.`,
    );
    // Default Riseup signatory (from org settings) — used on the sign-off when the brief names none.
    const branding = (await this.settings.get('branding').catch(() => null)) as { signatoryName?: string; signatoryTitle?: string } | null;
    const signatory = branding?.signatoryName?.trim()
      ? { name: branding.signatoryName.trim(), title: branding.signatoryTitle?.trim() || undefined }
      : undefined;
    const meta: ProposalMeta = {
      client: { name: lead.company, logoUrl: lead.clientLogoUrl ?? null },
      projectTitle: lead.title?.trim() || undefined, // exact name from the lead — used verbatim on the cover
      preparedBy: 'Riseup Labs',
      contact: { ...RISEUP_CONTACT },
      template: lead.template as unknown as TemplateCategory,
      projectType: (lead.projectType ?? 'new_build') as ProposalMeta['projectType'],
      audience: (lead.audience ?? 'mixed') as ProposalMeta['audience'],
      currency: lead.budgetCurrency,
      date: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      ...(signatory ? { signatory } : {}),
    };
    return {
      lead,
      brief,
      meta,
      structureModeOverride: lead.structureModeOverride as 'phase' | 'milestone' | 'scope' | 'module' | undefined,
      // Hardware install window — ADDED to the schedule as an on-site phase (never replaces the timeline).
      hardwareInstallWeeks: lead.hardwareInstallWeeks ?? undefined,
      appliedFeedback: openFeedback.map((f) => ({ id: f.id, text: f.text })),
      todayISO: new Date().toISOString(), // "today" for a stated calendar deadline → weeks
    };
  }

  // Comparable-work cards must be REAL Riseup PORTFOLIO projects, each with its own detail link — not
  // the client's own KB docs the composer might echo. Source them by similarity to the brief.
  private async linkRealComparables(doc: ProposalDocument, brief: string) {
    const comp = doc.blocks.find((b) => b.type === 'comparables') as { items?: { name?: string; blurb?: string; url?: string }[] } | undefined;
    if (!comp) return;
    const real = await this.portfolio.comparable(brief, 3).catch(() => []);
    if (real.length) comp.items = real.map((p) => ({ name: p.title, blurb: p.summary, url: p.detailUrl }));
    else await this.linkComparableItems(comp.items);
  }

  // A format/template directive in a full-regenerate prompt ("regenerate in global format", "switch to the
  // local template") — the template governs the ENTIRE structure (global/local vs agency), so it must be
  // applied BEFORE the engine runs, not left as free text. Precise adjacent-pair match to avoid false positives.
  private parseTemplateDirective(prompt?: string): TemplateType | undefined {
    const t = (prompt || '').toLowerCase();
    if (!t) return undefined;
    const T = '(global|local|agency|design[- ]?portfolio)';
    const F = '(format|template|version|proposal|style|structure|layout|standard)';
    const m = t.match(new RegExp(`\\b${T}\\s+${F}\\b`)) || t.match(new RegExp(`\\b${F}\\s+(?:of\\s+|to\\s+|as\\s+|:\\s*)?${T}\\b`));
    if (!m) return undefined;
    const name = m[1] && /global|local|agency|portfolio/.test(m[1]) ? m[1] : m[2];
    if (/portfolio/.test(name)) return TemplateType.DESIGN_PORTFOLIO;
    if (/agency/.test(name)) return TemplateType.AGENCY;
    if (/global/.test(name)) return TemplateType.GLOBAL;
    if (/local/.test(name)) return TemplateType.LOCAL;
    return undefined;
  }

  // Switch the lead's template (+ its default currency) when the prompt asks for a different format. Returns the
  // new template if switched (for the change log). Persisted, so the whole regen AND future ones follow it.
  private async applyTemplateDirective(leadId: string, instructions?: string): Promise<TemplateType | undefined> {
    const requested = this.parseTemplateDirective(instructions);
    if (!requested) return undefined;
    const lead = await this.leads.findByIdOrFail(leadId);
    if (String(lead.template) === String(requested)) return undefined;
    await this.leads.update(leadId, { template: requested, budgetCurrency: defaultCurrencyFor(requested) } as never);
    this.logger.log(`Switched lead ${leadId} template ${lead.template} → ${requested} (from regeneration prompt).`);
    return requested;
  }

  // Route a universal (possibly mixed, possibly Bangla) regeneration prompt to the sections it targets, so each
  // instruction lands on its own section instead of re-composing the whole document (Workstream B).
  private async routeRegenInstructions(
    instructions: string,
    blocks: { id: string; type: string; heading?: string }[],
  ): Promise<RegenRoute> {
    const sectionList = blocks.map((b) => `${b.id} · ${b.type}${b.heading ? ` — "${b.heading}"` : ''}`).join('\n');
    try {
      const { data } = await this.ai.json<{
        edits?: { blockId?: string; instruction?: string }[];
        budget?: string | null;
        structureMode?: string | null;
        global?: string | null;
      }>({
        label: 'route-regen',
        system:
          "You route a sales rep's revision request for a proposal to the specific sections it targets. The request may MIX instructions for different sections, and may be written in English, Bangla, or mixed — understand it regardless of language, but write every extracted instruction in ENGLISH. Split it so each section gets ONLY its own instruction. Never invent instructions; route only what is explicitly asked. Output JSON.",
        maxTokens: 900,
        prompt:
          `The proposal has these sections (blockId · type — heading):\n${sectionList}\n\n` +
          `Revision request: "${instructions}"\n\n` +
          `Return ONLY this JSON:\n` +
          `{\n` +
          `  "edits": [{ "blockId": string, "instruction": string }],  // one entry per section the request targets; blockId MUST be copied from the list above; instruction = ONLY the part of the request meant for THAT section, as a clear directive.\n` +
          `  "budget": string|null,        // the part of the request about money/budget/rates/day-counts/team size, if any. null otherwise.\n` +
          `  "structureMode": "phase"|"milestone"|"scope"|"module"|null,  // set ONLY if the request changes how delivery is ORGANISED (phase/milestone/module/scope). null otherwise.\n` +
          `  "global": string|null         // an instruction that applies to the WHOLE proposal (tone/length/"rewrite everything"), if any. null otherwise.\n` +
          `}\n` +
          `A leading "/section-name" or "/budget" marker is an EXPLICIT target — honour it. If the request targets one or a few named sections, do NOT set "global".`,
      });
      const validIds = new Set(blocks.map((b) => b.id));
      const edits = Array.isArray(data.edits)
        ? data.edits
            .filter((e) => e?.blockId && validIds.has(String(e.blockId)) && String(e.instruction || '').trim())
            .map((e) => ({ blockId: String(e.blockId), instruction: String(e.instruction).trim() }))
        : [];
      const structureMode = ['phase', 'milestone', 'scope', 'module'].includes(String(data.structureMode))
        ? (data.structureMode as RegenRoute['structureMode'])
        : undefined;
      return {
        edits,
        budget: data.budget?.trim() ? data.budget.trim() : undefined,
        structureMode,
        global: data.global?.trim() ? data.global.trim() : undefined,
      };
    } catch (e) {
      // Routing is best-effort — on failure, treat the whole prompt as one global instruction (old behaviour).
      this.logger.warn(`Regen routing failed; falling back to a full re-compose: ${String(e)}`);
      return { edits: [], global: instructions };
    }
  }

  // Apply routed per-section edits in place (each via the working single-block/budget paths), preserving every
  // untouched section. Returns the refreshed proposal. Used by the universal-regen router (Workstream B).
  private async applyRoutedEdits(leadId: string, route: RegenRoute, originalPrompt: string) {
    const details: string[] = [];
    for (const e of route.edits) {
      await this.regenerateBlock(leadId, e.blockId, e.instruction).catch((err) =>
        this.logger.warn(`Routed edit failed for block ${e.blockId}: ${String(err)}`),
      );
      details.push(`${e.blockId}: ${e.instruction.slice(0, 100)}`);
    }
    if (route.budget) {
      await this.regenerateBudget(leadId, route.budget).catch((err) => this.logger.warn(`Routed budget edit failed: ${String(err)}`));
      details.push(`budget: ${route.budget.slice(0, 100)}`);
    }
    await this.logChange(leadId, {
      kind: 'proposal',
      title: 'Applied your targeted edits',
      details: [`Prompt: “${originalPrompt.trim().slice(0, 160)}”`, ...details],
    });
    this.logger.log(`━━━ Regenerate ▸ TARGETED edits applied (${route.edits.length} section(s)${route.budget ? ' + budget' : ''}) — untouched sections preserved ━━━`);
    return this.proposals.getForLead(leadId);
  }

  async generateDocument(leadId: string, instructions?: string) {
    // A change-log entry is only meaningful on a REGENERATION — the first generation has nothing to compare to.
    // Detect it BEFORE the upsert creates the proposal.
    const isRegeneration = await this.proposals.existsForLead(leadId).catch(() => false);
    const mode = isRegeneration ? (instructions?.trim() ? 'REGENERATE (prompt)' : 'REGENERATE (full)') : 'GENERATE (first draft)';
    this.logger.log(`━━━ Generation ▸ ${mode} · lead=${leadId}${instructions?.trim() ? ` · prompt="${instructions.trim().slice(0, 120)}"` : ''} ━━━`);
    // Honour a format/template switch FIRST so the whole structure follows it (buildEngineInput re-reads the lead).
    const switchedTemplate = await this.applyTemplateDirective(leadId, instructions);
    // Universal-regen router (Workstream B): split a mixed/Bangla prompt into per-section edits and apply them
    // TARGETED (untouched sections stay identical, ChatGPT-style). Only a global/structural/template change falls
    // through to the full re-compose below. A structure-mode change is persisted so the full engine re-plans in it.
    if (isRegeneration && instructions?.trim() && !switchedTemplate) {
      const existing = await this.proposals.getForLead(leadId).catch(() => null);
      const blocks = (existing?.sections as { blocks?: { id: string; type: string; heading?: string }[] } | undefined)?.blocks;
      if (Array.isArray(blocks) && blocks.length) {
        const route = await this.routeRegenInstructions(
          instructions,
          blocks.map((b) => ({ id: b.id, type: b.type, heading: (b as { heading?: string }).heading })),
        );
        if (route.structureMode) await this.leads.update(leadId, { structureModeOverride: route.structureMode } as never);
        // A prompt that names concrete plan numbers ("make Core Build 2 weeks") is a PLAN edit, even when it
        // also ends with something vague like "readjust the proposal". Without this the vague half sets
        // `global`, the whole project is re-planned from scratch, and the named durations are lost along with
        // every other agreed figure — which is exactly how an 11-week plan came back as 24.
        if (!route.structureMode) {
          const plan = await this.loadPlanForDirectives(leadId).catch(() => null);
          if (plan?.phases?.length) {
            const dir = await this.parseDirectivesAI(instructions, plan, await this.equipmentNames(leadId));
            if (dir.phaseWeeks?.length || dir.totalWeeks || dir.budgetTargetCents || dir.equipmentRemove?.length) {
              this.logger.log(`Regenerate ▸ plan directive detected (${dir.phaseWeeks?.length ?? 0} phase change(s)) — retiming deterministically instead of re-planning.`);
              return this.regenerateBudget(leadId, instructions, dir);
            }
          }
        }
        if ((route.edits.length || route.budget) && !route.global && !route.structureMode) {
          return this.applyRoutedEdits(leadId, route, instructions);
        }
      }
    }
    const { lead, brief, meta, structureModeOverride, hardwareInstallWeeks, appliedFeedback, todayISO } = await this.buildEngineInput(leadId, instructions);
    const before = await this.currentBudgetTotals(leadId, meta.currency);
    const budgetTargetCents = parseBudgetTargetCents(instructions);
    const { doc, usage, diagnostics, internalCalc, decisions } = await this.engine.generate({ brief, meta, structureModeOverride, hardwareInstallWeeks, budgetTargetCents, todayISO });
    await this.linkRealComparables(doc, brief);
    // Carry hand-edited blocks across the regeneration. Block ids are re-minted by the engine, so they are
    // matched by type + ordinal. Without this, every manual edit was silently discarded on every regen.
    if (isRegeneration) {
      const prior = (await this.proposals.getForLead(leadId).catch(() => null))?.sections as unknown as ProposalDocument | undefined;
      const kept = (prior?.blocks ?? []).filter((b) => (b as { locked?: boolean }).locked);
      if (kept.length) {
        const seen = new Map<string, number>();
        const ordinal = (b: Block) => { const n = seen.get(b.type) ?? 0; seen.set(b.type, n + 1); return `${b.type}#${n}`; };
        const byKey = new Map(kept.map((b) => [`${b.type}#${(prior!.blocks.filter((x) => x.type === b.type).indexOf(b))}`, b]));
        doc.blocks = doc.blocks.map((b) => {
          const hit = byKey.get(ordinal(b));
          return hit ? ({ ...hit, id: b.id } as Block) : b;
        });
        this.logger.log(`Regenerate ▸ preserved ${kept.length} hand-edited block(s).`);
      }
    }
    await this.proposals.upsertForLead(leadId, lead.template, doc as unknown as Record<string, unknown>);
    let keptPins = 0;
    // Carry PINNED phase durations across the regeneration. A phase whose weeks a human agreed keeps them;
    // everything else is re-planned freely. Without this the engine's fresh plan silently replaced an
    // agreed schedule (an approved 7-week plan came back as 24 on the next regenerate).
    if (isRegeneration) {
      const priorPlan = this.planFromCalc(await this.loadInternalCalc(leadId))?.phases ?? [];
      const pins = priorPlan.filter((p) => p.pinnedWeeks);
      if (pins.length) {
        const norm = (v: string) => (v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const fresh = (internalCalc as unknown as { plan?: { phases: DecisionPhase[] } }).plan?.phases ?? [];
        let kept = 0;
        for (const pin of pins) {
          const hit =
            fresh.find((f) => norm(f.name) === norm(pin.name)) ??
            fresh.find((f) => norm(f.name).includes(norm(pin.name)) || norm(pin.name).includes(norm(f.name)));
          if (hit) { hit.weeks = pin.weeks; hit.pinnedWeeks = true; kept++; }
        }
        if (kept) { keptPins = kept; this.logger.log(`Regenerate ▸ kept ${kept} agreed phase duration(s).`); }
      }
    }
    // internalCalc also carries the canonical Plan (decisions.phases) — persisted so budget regen/edit reuses it.
    await this.proposals.setInternalCalc(leadId, internalCalc as unknown as Record<string, unknown>);
    // Record the REAL token counts (understand + decide + compose) so the cost/audit trail is truthful.
    await this.generations.create({ leadId, kind: 'proposal', model: this.ai.model, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, versions: {} });
    // Budget tab is DERIVED from the SAME canonical Plan as the proposal (single source of truth) — milestone
    // → department → role, priced from the rate card at the DAILY base (days = phase weeks × 5). No separate
    // AI call: the budget total equals the proposal total by construction. Best-effort.
    let fit: BudgetFit | null = null;
    try {
      // Which number the sheet must land on, in priority order:
      //  1. a budget the client STATED in the brief — the client's own number outranks ours (any hardness);
      //  2. a strong comparable's reused real quote / norm-bound anchor.
      // A HARD/cap budget is a ceiling (fit DOWN only); an approximate/soft budget is FIT UP or down to match it
      // (via sheet manipulation, not a contingency premium) — the constraint-driven planning behaviour.
      const clientBudget = decisions.budget.clientBudgetCents;
      // Timeline vs budget conflict: a HARD deadline crash inflated the cost past the stated budget → show the
      // honest crashed number and flag it over-budget, never fake it down to the budget (per the decision).
      const crashedOverBudget = !!(decisions.budget.timelineCrashed && clientBudget && decisions.budget.totalCents > clientBudget);
      const anchor = crashedOverBudget ? undefined : (clientBudget ?? decisions.budget.anchoredCents);
      const fitMode: 'fit' | 'cap' = clientBudget && decisions.budget.clientBudgetHardness === 'hard' ? 'cap' : 'fit';
      if (crashedOverBudget) this.logger.warn(`Lead ${leadId}: deadline crash cost ${this.fmtCents(decisions.budget.totalCents, meta.currency)} exceeds the stated budget ${this.fmtCents(clientBudget!, meta.currency)} — showing the honest crashed cost.`);
      fit = await this.applyPlanToBudget(leadId, { currency: meta.currency, phases: decisions.phases }, anchor, fitMode);
      // The sheet was fitted, so the proposal's money blocks must follow it or the two views disagree —
      // exactly the split that had a proposal quoting $5,000 while the lead value read $11,085.
      // ALSO sync (even with no fit trail) when the proposal SHOWS money — the local template's per-phase
      // FINANCIAL ESTIMATION block must equal the Budget tab total exactly; without a sync the block keeps the
      // raw per-phase plan sum, which drifts from the sheet's per-line rounded total by a few dollars.
      const showsFinancial = doc.blocks.some((b) => b.type === 'financial' || b.type === 'equipment') || keptPins > 0;
      if (fit && (fit.trail.length || showsFinancial)) await this.syncProposalFromSheet(leadId);
      if (fit) {
        await this.proposals
          .setInternalCalc(leadId, { ...((await this.loadInternalCalc(leadId)) ?? {}), budgetFit: { feasibility: fit.feasibility, trail: fit.trail, anchorCents: anchor ?? null } })
          .catch(() => {});
        if (fit.feasibility === 'infeasible') this.logger.warn(`Lead ${leadId}: budget target not reachable — ${fit.trail.join(' ')}`);
      }
    } catch (e) {
      this.logger.warn(`Budget derivation skipped for lead ${leadId}: ${String(e)}`);
    }
    // P5: the client feedback that shaped this regeneration is now consumed (kept as `applied` for the trail).
    if (appliedFeedback.length) await this.clientFeedback.markApplied(appliedFeedback.map((f) => f.id)).catch(() => {});
    // P6: record what changed (applied feedback + prompt + budget/timeline deltas) — ONLY on a regeneration.
    // The first draft has no "before", so the What-Changed log stays empty until the rep regenerates.
    const after = await this.currentBudgetTotals(leadId, meta.currency);
    // Plan sanity findings reach the rep here rather than only the server log. First drafts get them too —
    // an implausible plan is exactly as wrong on draft one as on a regeneration.
    const planWarnings = decisions.warnings ?? [];
    if (!isRegeneration && planWarnings.length) {
      await this.logChange(leadId, {
        kind: 'proposal',
        title: 'Plan check',
        details: planWarnings,
        budgetAfterCents: after.cents,
        weeksAfter: after.weeks,
        currency: meta.currency,
      }).catch(() => undefined);
    }
    if (isRegeneration) {
      await this.logChange(leadId, {
        kind: 'proposal',
        title: instructions?.trim() ? 'Regenerated the proposal with your prompt' : 'Regenerated the full proposal & budget',
        details: [
          ...(instructions?.trim() ? [`Prompt: “${instructions.trim().slice(0, 160)}”`] : []),
          switchedTemplate ? `Switched the proposal to the ${switchedTemplate} format.` : '',
          ...appliedFeedback.map((f) => `Applied client feedback: “${f.text}”`),
          budgetTargetCents ? `Budget targeted to ${this.fmtCents(budgetTargetCents, meta.currency)}.` : '',
          // Which lever moved to reach the budget, so the rep can defend the number in front of the client.
          ...(fit?.trail ?? []),
          ...planWarnings,
        ].filter(Boolean),
        budgetBeforeCents: before.cents || undefined,
        budgetAfterCents: after.cents,
        weeksBefore: before.weeks || undefined,
        weeksAfter: after.weeks,
        currency: meta.currency,
      });
    }
    this.logger.log(
      `━━━ Generation ▸ ${mode} DONE · lead=${leadId} · proposal ${diagnostics.totals.tokens.toLocaleString()} tok ($${diagnostics.costUsd}) ` +
        `· budget derived from the same Plan (no AI) · total this op: ${diagnostics.totals.tokens.toLocaleString()} tok / $${diagnostics.costUsd} ━━━`,
    );
    // Attach per-lead diagnostics (prompts, knowledge used, token cost) — the frontend logs them to
    // the browser console for transparency. Non-persisted; recomputed on every generation.
    return Object.assign(await this.proposals.getForLead(leadId), { diagnostics });
  }

  /**
   * Regenerate a SINGLE block WITHOUT re-running the whole engine. A content block is refreshed by ONE
   * targeted AI call (grounded in the brief + the block's own current content) — roughly a third of the
   * tokens of a full Understand → Decide → Compose pass. Money blocks are re-derived deterministically from
   * the canonical Plan/sheet (zero AI); only structural/diagram blocks still take the full engine.
   */
  async regenerateBlock(leadId: string, blockId: string, instructions?: string) {
    const proposal = await this.proposals.getForLead(leadId);
    const doc = proposal.sections as unknown as ProposalDocument;
    if (!Array.isArray(doc?.blocks)) throw new BadRequestException('This proposal has no blocks to regenerate.');
    const idx = doc.blocks.findIndex((b) => b.id === blockId);
    if (idx < 0) throw new NotFoundException('Block not found');
    const block = doc.blocks[idx];
    const type = block.type;
    const label = type.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
    this.logger.log(`━━━ Regenerate block ▸ lead=${leadId} · type=${type}${instructions?.trim() ? ` · prompt="${instructions.trim().slice(0, 120)}"` : ''} ━━━`);

    // The money blocks (financial / timeline / team) are PROJECTIONS of the canonical Plan — never AI-drafted
    // in isolation (that ignores exact targets like "10 weeks" and desyncs the budget sheet). A numeric/team
    // directive is applied EXACTLY to the Plan and rippled to the sheet + all money blocks (the Budget-tab
    // path, P3/P4); any other prompt just re-derives them from the current sheet. Neither runs the engine.
    const MONEY_BLOCKS = new Set<BlockType>(['financial', 'equipment', 'timeline', 'teamAllocation']);
    if (MONEY_BLOCKS.has(type)) {
      if (instructions?.trim()) {
        const plan = await this.loadPlanForDirectives(leadId);
        if (plan?.phases?.length) {
          const dir = await this.parseDirectivesAI(instructions, plan, await this.equipmentNames(leadId));
          // A delivery-structure change ("phase-by-phase → module-by-module") is document-wide — persist the
          // mode and run a full re-plan so the timeline, work-approach and budget all follow it (Workstream B).
          if (dir.structureMode) {
            await this.leads.update(leadId, { structureModeOverride: dir.structureMode } as never);
            this.logger.log(`Regenerate block ▸ STRUCTURE change → "${dir.structureMode}": full re-plan.`);
            return this.generateDocument(leadId, instructions);
          }
          // Hardware rows live on the BUDGET; edit them there and let the block re-sync. Without this a
          // "remove that row" instruction was silently swallowed, because the equipment section is only a
          // projection and re-deriving it just restored the row.
          if (dir.equipmentRemove?.length) {
            const { removed } = await this.budgets.removeEquipmentByName(leadId, dir.equipmentRemove);
            await this.syncProposalFromSheet(leadId);
            this.logger.log(`Regenerate block ▸ EQUIPMENT edit — removed ${removed} hardware row(s) from the budget; section re-synced.`);
            await this.proposals.appendChange(leadId, {
              at: new Date().toISOString(), kind: 'section',
              title: removed ? `Removed ${removed} hardware row(s)` : 'No hardware row matched that instruction',
              details: [`Prompt: “${instructions.trim().slice(0, 140)}”`],
            }).catch(() => undefined);
            return this.proposals.getForLead(leadId);
          }
          if (dir.budgetTargetCents || dir.totalWeeks || dir.phaseWeeks?.length || dir.removeRoles.length || dir.addRoles.length) {
            this.logger.log(`Regenerate block ▸ MONEY path (deterministic directive) — 1 small parse-directives call, then Plan→sheet→money blocks. No engine.`);
            await this.regenerateBudget(leadId, instructions, dir); // Plan → sheet → all money blocks
            return this.proposals.getForLead(leadId);
          }
        }
      }
      // Pure-wording / no actionable directive → re-derive the money blocks from the budget sheet (the source
      // of truth for the numbers). Deterministic, no AI call.
      this.logger.log(`Regenerate block ▸ MONEY path (re-derive from budget sheet) — 0 AI calls, $0.`);
      await this.syncProposalFromSheet(leadId).catch(() => {});
      // Deterministic $0 re-sync — NOT an AI generation, so it writes no `generations` row (the change is
      // still recorded in the proposal's change log). This keeps the per-lead run count = real AI runs.
      await this.logChange(leadId, { kind: 'section', title: `Refreshed the ${label} section from the budget`, details: [] });
      this.logger.log(`━━━ Regenerate block ▸ DONE · type=${type} · 0 AI tokens · $0.0000 ━━━`);
      return this.proposals.getForLead(leadId);
    }

    // Structural/diagram blocks carry a strict renderer contract (grouped topology + typed edges, or a
    // Mermaid/D2 spec) that a free-form rewrite could break — these (rarely regenerated) still take the full
    // engine so the figure stays valid and consistent with the rest of the document.
    const STRUCTURAL = new Set<BlockType>(['solutionArchitecture', 'layeredArchitecture', 'diagram']);
    if (STRUCTURAL.has(type)) {
      this.logger.log(`Regenerate block ▸ STRUCTURAL path — full engine (3 AI calls) to keep the figure's renderer contract valid.`);
      return this.regenerateBlockViaEngine(leadId, doc, idx, type, instructions);
    }

    // Content blocks: ONE targeted AI call rewrites just this section in place, keeping its exact JSON shape.
    // The brief + the block's current content are all the grounding a single-section revision needs.
    this.logger.log(`Regenerate block ▸ CONTENT path — 1 targeted AI call (no Understand/Decide/Compose).`);
    const { brief, meta } = await this.buildEngineInput(leadId, instructions);
    const { data, tokensIn, tokensOut } = await this.ai.json<Record<string, unknown>>({
      label: `regenerate:${type}`,
      system: COMPOSE_SYSTEM, // same writer discipline as first-draft compose, so a regenerated section can't drift
      maxTokens: 4000,
      prompt:
        `Rewrite ONLY the "${label}" section of a Riseup Labs proposal. Return JSON {"block": <the SAME JSON shape ` +
        `as the current block below — identical keys, arrays keep the same object fields, and keep "id" and "type" ` +
        `unchanged>}.\n` +
        `Stay specific to THIS project and consistent with the rest of the proposal; never invent clients or facts. ` +
        `Keep every number, week count, date, quantity and monetary value EXACTLY as in the current block — change ` +
        `wording only, never figures. Keep any icon values within the set already used in the current block.\n` +
        `The instruction may be in English, Bangla, or mixed — understand it regardless; keep the section's output language unchanged (English).\n` +
        `Instruction from the sales rep: ${instructions?.trim() || 'improve clarity and tighten it'}.\n` +
        `Current block: ${JSON.stringify(block)}\n` +
        `Project: "${meta.projectTitle ?? ''}" for ${meta.client?.name ?? ''}. Template: ${meta.template}.\n` +
        `Client brief: ${brief}`,
    });
    // The model returns the block EITHER wrapped ({"block":{…}}) OR as the block object directly ({id,type,…}).
    // Accept both, so a section is never silently left unchanged. Null only when there's no usable object.
    const wrapped = (data as { block?: unknown } | null)?.block;
    const raw = wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped) ? (wrapped as Record<string, unknown>) : data;
    const fresh = raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length > 1 ? raw : null;
    if (!fresh) this.logger.warn(`Regenerate block ▸ CONTENT path returned no usable block for "${type}" — section left unchanged (tokens still spent).`);
    if (fresh) {
      // Spread the ORIGINAL block first so any structured field the model omitted (e.g. signoff parties/criteria,
      // matrix users) is backfilled rather than dropped — a dropped array then crashes the renderers. The model's
      // returned fields still win; only entirely-absent keys fall back. id/type/position preserved.
      // Regenerating a section IS the request to replace it, so the lock is released here — otherwise a block
      // hand-edited once could never be refreshed by the engine again.
      doc.blocks[idx] = { ...(block as unknown as Record<string, unknown>), ...(fresh as Record<string, unknown>), id: blockId, type, locked: false } as unknown as Block;
      if (type === 'comparables') await this.linkRealComparables(doc, brief); // items must stay REAL portfolio work
      doc.iconMap = buildIconMap(doc);
      await this.proposals.upsertForLead(leadId, proposal.template, doc as unknown as Record<string, unknown>);
      await this.generations.create({ leadId, kind: 'proposal', model: this.ai.model, tokensIn, tokensOut, versions: {} });
      await this.logChange(leadId, {
        kind: 'section',
        title: `Regenerated the ${label} section`,
        details: instructions?.trim() ? [`Prompt: “${instructions.trim().slice(0, 160)}”`] : [],
      });
    }
    this.logger.log(
      `━━━ Regenerate block ▸ DONE · type=${type} · CONTENT path · ${(tokensIn + tokensOut).toLocaleString()} tok ` +
        `($${this.ai.price(tokensIn, tokensOut).toFixed(4)}) · 1 AI call ━━━`,
    );
    return this.proposals.getForLead(leadId);
  }

  // Full-engine single-block swap — runs Understand → Decide → Compose and swaps in the fresh block of the
  // same type, keeping id + position. Reserved for structural/diagram blocks whose renderer contract a
  // targeted free-form rewrite could break.
  private async regenerateBlockViaEngine(leadId: string, doc: ProposalDocument, idx: number, type: BlockType, instructions?: string) {
    const blockId = doc.blocks[idx].id;
    const { lead, brief, meta, structureModeOverride } = await this.buildEngineInput(leadId, instructions);
    const budgetTargetCents = parseBudgetTargetCents(instructions);
    const { doc: fresh, usage, internalCalc } = await this.engine.generate({ brief, meta, structureModeOverride, budgetTargetCents });
    const replacement = fresh.blocks.find((b) => b.type === type);
    if (replacement) {
      doc.blocks[idx] = { ...replacement, id: blockId }; // keep id + position; swap only content
      if (type === 'comparables') await this.linkRealComparables(doc, brief);
      doc.iconMap = buildIconMap(doc);
      await this.proposals.upsertForLead(leadId, lead.template, doc as unknown as Record<string, unknown>);
      // A regenerated team/budget changes the cost math — refresh the internal breakdown too.
      if (type === 'financial' || type === 'teamAllocation' || type === 'workApproach') {
        await this.proposals.setInternalCalc(leadId, internalCalc as unknown as Record<string, unknown>);
      }
      await this.generations.create({ leadId, kind: 'proposal', model: this.ai.model, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, versions: {} });
      const label = type.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
      await this.logChange(leadId, {
        kind: 'section',
        title: `Regenerated the ${label} section`,
        details: instructions?.trim() ? [`Prompt: “${instructions.trim().slice(0, 160)}”`] : [],
      });
    }
    return this.proposals.getForLead(leadId);
  }

  /**
   * Internal-only "explain" for the 💡 verify panel. Financial → the confidential cost breakdown (team
   * member weekly rates × phase weeks) from the select:false column. Tech stack → why + portfolio
   * references (resolveStack evidence, computed on demand). Others → the block's own rationale.
   */
  async explainBlock(leadId: string, blockId: string) {
    const proposal = await this.proposals.getForLead(leadId);
    const doc = proposal.sections as unknown as ProposalDocument;
    const block = doc?.blocks?.find((b) => b.id === blockId);
    if (!block) throw new NotFoundException('Block not found');

    if (block.type === 'financial') {
      const row = await this.proposals.getInternalCalc(leadId);
      const financial = (row?.internalCalc as { financial?: unknown } | null)?.financial ?? null;
      return { kind: 'financial', financial };
    }

    if (block.type === 'techStack') {
      const { brief } = await this.buildEngineInput(leadId);
      const res = await this.portfolio.resolveStack(brief, 5).catch(() => null);
      const stack = res?.stack ?? [];
      const words = (s: string) => new Set(s.toLowerCase().split(/[\s./+,()]+/).filter((w) => w.length > 2));
      const rows = (block as unknown as { rows: { layer: string; choice: string; why: string }[] }).rows.map((r) => {
        const choiceWords = words(r.choice);
        const refs = new Map<string, { title: string; url: string }>();
        for (const s of stack) {
          if (!s.cited) continue;
          const techWords = words(s.technology);
          // Match on a shared significant word (so "React 18" ↔ "React Native", "Node.js 20" ↔ "Node.js").
          const hit = [...techWords].some((w) => choiceWords.has(w));
          if (hit) for (const e of s.evidence) refs.set(e.detailUrl, { title: e.title, url: e.detailUrl });
        }
        return { layer: r.layer, choice: r.choice, why: r.why, references: [...refs.values()].slice(0, 5) };
      });
      return { kind: 'techStack', rows, matchedRule: res?.matchedRule };
    }

    return { kind: 'generic', heading: block.heading ?? '', note: 'No detailed breakdown for this section.' };
  }

  /**
   * Proposal Q&A (Workstream C) — answer a free-text question about THIS proposal, grounded ONLY in the saved
   * decision record (canonical Plan + confidential cost math), the budget sheet, the change log and client
   * feedback. Read-only: it never regenerates or mutates anything. Understands English or Bangla.
   */
  async answerQuestion(leadId: string, question: string): Promise<{ answer: string }> {
    const q = (question || '').trim();
    if (!q) throw new BadRequestException('Ask a question about the proposal.');
    const lead = await this.leads.findByIdOrFail(leadId);
    const proposal = await this.proposals.getForLead(leadId); // throws 404 if no proposal yet
    const calc = (await this.loadInternalCalc(leadId)) as { plan?: unknown; financial?: unknown } | null;
    const budget = await this.budgets.getForLead(leadId).catch(() => null);
    const openFeedback = await this.clientFeedback.openForLead(leadId).catch(() => []);

    const blocks = (proposal.sections as { blocks?: unknown[] } | undefined)?.blocks ?? [];
    const changeLog = ((proposal as { changeLog?: unknown[] }).changeLog ?? []).slice(0, 12);
    const budgetLines = ((budget?.budget?.lines ?? []) as SheetLine[]).map((l) => ({
      department: l.department, role: l.role, seniority: l.seniority, units: Number(l.units),
      hoursPerDay: Number(l.hoursPerDay), workingDays: Number(l.workingDays), days: Number(l.days),
      dayRateCents: Number(l.dayRateCents),
    }));

    const context = {
      project: { title: lead.title, company: lead.company, template: lead.template, currency: lead.budgetCurrency },
      plan: calc?.plan ?? null,
      financial: calc?.financial ?? null,
      budget: { currency: budget?.budget?.currency, lines: budgetLines, computed: budget?.computed ?? null },
      changeLog,
      clientFeedback: openFeedback.map((f) => f.text),
      proposalBlocks: blocks,
    };
    let ctxStr = JSON.stringify(context);
    const MAX = 24000; // keep the grounding bounded; the rationale-bearing fields come first
    if (ctxStr.length > MAX) ctxStr = ctxStr.slice(0, MAX) + '…(truncated)';

    const { text, tokensIn, tokensOut } = await this.ai.complete({
      label: 'proposal-qa',
      system:
        "You are Riseup Labs' internal proposal assistant. Answer the sales team's question about THIS specific proposal, grounded ONLY in the decision record, budget math, change log and client feedback provided. Explain the reasoning behind the budget, timeline, team and technology when asked — this is INTERNAL, so cost rationale, per-role effort, norms and comparables are fair to reference. NEVER invent facts or numbers; if the answer is not in the provided context, say you don't have that information. The question may be written in English or Bangla — understand it either way, but ALWAYS write your answer in English. Be concise and specific; never mention AI tooling.",
      maxTokens: 900,
      prompt: `Proposal context (JSON):\n${ctxStr}\n\nQuestion: ${q}\n\nAnswer:`,
    });
    await this.generations.create({ leadId, kind: 'qa', model: this.ai.model, tokensIn, tokensOut, versions: {} }).catch(() => undefined);
    return { answer: (text || '').trim() || "I don't have that information in this proposal's record." };
  }

  /**
   * Internal module breakdown (module-intelligence layer) — per-module type/complexity/weight + estimated
   * effort/cost, read from the persisted `internalCalc.modules` (no AI). Prices each module at the plan's
   * blended day-rate purely for a cross-check against the role-based plan (which stays authoritative).
   */
  async getModuleBreakdown(leadId: string): Promise<{
    modules: { name: string; type: string; complexity: string; weight: number; keyFeatures: string[]; estDays: number; estCents: number }[];
    totalEstDays: number; totalEstCents: number; planSubtotalCents: number; currency: string;
  }> {
    const calc = (await this.loadInternalCalc(leadId)) as { modules?: { name: string; type: string; complexity: string; weight: number; keyFeatures?: string[]; estDays: number }[] } | null;
    const modules = calc?.modules ?? [];
    const budget = await this.budgets.getForLead(leadId).catch(() => null);
    const currency = budget?.budget?.currency ?? 'USD';
    const lines = ((budget?.budget?.lines ?? []) as unknown) as SheetLine[];
    const planDays = lines.reduce((s, l) => s + (Number(l.units) || 0) * (Number(l.days) || 0), 0);
    const planCents = lines.reduce((s, l) => s + (Number(l.units) || 0) * (Number(l.days) || 0) * (Number(l.dayRateCents) || 0), 0);
    const blendedRate = planDays > 0 ? planCents / planDays : 0; // cents per effective man-day
    const out = modules.map((m) => ({
      name: m.name, type: m.type, complexity: m.complexity, weight: m.weight, keyFeatures: m.keyFeatures ?? [],
      estDays: m.estDays, estCents: Math.round(m.estDays * blendedRate),
    }));
    const totalEstDays = Math.round(out.reduce((s, m) => s + m.estDays, 0) * 10) / 10;
    const totalEstCents = out.reduce((s, m) => s + m.estCents, 0);
    const planSubtotalCents = Number((budget?.computed as BudgetComputed | undefined)?.subtotalCents ?? planCents);
    return { modules: out, totalEstDays, totalEstCents, planSubtotalCents, currency };
  }

  // Generate BOTH the proposal (sections) and the budget (resource plan), grounded in past Riseup work.
  // `instructions` (optional) lets the rep steer a regeneration in plain English.
  async generateProposal(leadId: string, instructions?: string) {
    const lead = await this.leads.findByIdOrFail(leadId);
    const req = await this.requirements.getForLead(leadId);
    // Everything downstream (readiness, proposal, budget) derives from the brief. Without one there
    // is nothing to ground on, and the model would invent a project — refuse rather than fabricate.
    const brief = (req?.sourceText ?? '').trim();
    if (!brief && !(req?.files?.length)) {
      throw new BadRequestException('Add the requirement first — upload the brief/RFP or paste the requirement text.');
    }
    const groundingBlock = await this.groundingFor(lead.title, brief, GenerationService.CATEGORY[lead.template]);

    const { data, tokensIn, tokensOut } = await this.ai.json<Record<string, unknown>>({
      label: 'proposal-compose (legacy)',
      system: SCAFFOLD,
      maxTokens: 14000,
      prompt:
        'Draft a Riseup Labs technical proposal as a JSON object with EXACTLY these keys, in this order ' +
        "(this mirrors the structure of Riseup's real delivered proposals). Use the STRUCTURED shapes below — the app " +
        'renders them as cards, tables, lists and diagrams, so do not use markdown:\n' +
        '- coverTagline: string (ONE or TWO short sentences, max ~200 characters — the cover-page pitch. ' +
        'NOT the executive summary; a crisp statement of what is being built and for whom)\n' +
        '- executiveSummary: string (a substantial paragraph, 4-6 sentences: what will be built, why it matters to the client, and why Riseup)\n' +
        '- outcome: string (one sentence — the concrete business outcome)\n' +
        '- approach: string (one sentence — the delivery approach in brief)\n' +
        '- projectUnderstanding: array of { area, need, response } (5-8 rows mapping each client need to your response — be exhaustive about what the brief actually asks)\n' +
        '- proposedScope: array of { area, coverage } (5-8 scope areas; coverage = 2-3 full sentences each, the way a real scope section reads)\n' +
        '- technicalApproach: array of { stage, detail } (5-7 NAMED subsections the way Riseup titles them — ' +
        'e.g. "Modular Platform Approach", "Mobile and Game Layer", "Wallet, Payment and Withdrawal Logic"; ' +
        'detail = 2-4 sentences with concrete technologies and methods)\n' +
        '- architecture: array of { layer, detail } (5-7 rows — the HIGH-LEVEL architecture layers and how data flows between them)\n' +
        `- architectureDiagram: { title, subtitle, groups: array of { label, icon, items: array of strings (2-4 component names) }, focus: { text, chips: array of strings (3-5 short labels) } } ` +
        '(a rich system-architecture figure like Riseup\'s "High-Level System Architecture" — 4-6 groups such as Mobile App, API Gateway + Auth, Core Backend Services, Admin Console, Third-Party Services, Data Layer. ' +
        'subtitle = one sentence describing the architecture idea. focus.text = one sentence naming the key architectural principle; focus.chips = the pillars it rests on)\n' +
        `- workflowDiagram: { title, subtitle, steps: array of { title, detail, icon }, footer: { text, chips: array of strings } } ` +
        '(5-9 numbered steps of the key end-to-end flow, like Riseup\'s "Asynchronous Tournament Workflow". subtitle = one sentence on how the flow behaves; footer.text = the trust/quality guarantee it provides; footer.chips = 3-5 short guarantee labels)\n' +
        '- controlFlowDiagram: same shape as workflowDiagram (OPTIONAL third figure — a domain CONTROL flow the brief demands, e.g. "Wallet and Withdrawal Control Flow" or a data-validation flow; omit when the domain has no such flow)\n' +
        `- Every diagram \`icon\` MUST be one of exactly these words: mobile, shield, server, database, wallet, chart, user, game, cloud, lock, card, check, clock, trophy, gear, globe, bell, file, search, upload, key, api, money, review, send.\n` +
        '- domainTables: array of { title, headers: array of strings, rows: array of arrays of strings } (0-3 OPTIONAL inventory/option tables the brief calls for, the way Riseup\'s real proposals tabulate them — e.g. a game inventory with type/complexity, tier options with counts and notes, a device/OS matrix; omit when not applicable)\n' +
        '- technicalStack: array of { layer, tech, purpose } (5-8 rows)\n' +
        '- developmentMethodology: array of { step, description } (5-7 delivery steps titled "Step 1: Scope Confirmation" style, mirroring Riseup\'s methodology tables; description = 1-2 sentences)\n' +
        '- timeline: array of { milestone, weeks, focus } (3-5 milestones, e.g. weeks "1-3"; focus = 1-2 full sentences)\n' +
        '- deliverables: array of { period, title, detail } (4-6 grouped deliverables)\n' +
        '- testingQa: string (2 paragraphs — test levels, tooling, acceptance criteria, UAT)\n' +
        '- paymentTerms: array of strings (milestone-based payment split, e.g. "30% on contract signing")\n' +
        '- changeRequest: string (1 short paragraph on how out-of-scope work is handled — do NOT state any monetary rate; rates come from the rate card)\n' +
        '- assumptions: array of strings (4-8 assumptions/dependencies)\n' +
        '- conclusion: string (3-4 sentences, confident close)\n' +
        '- comparableProjects: array of { name, blurb } (2-3 REAL past Riseup projects from the grounding ' +
        'excerpts below that are genuinely comparable; omit if none are relevant — never invent clients)\n' +
        "WRITING QUALITY (mandatory): write like Riseup's senior proposal writers, matching the depth and register of the " +
        'grounding excerpts. Plain, confident business English; grammatically flawless; varied sentence structure; smooth flow ' +
        'between ideas. Avoid AI-flavoured filler ("delve", "leverage", "seamless", "cutting-edge", "robust solutions", ' +
        '"in today\'s fast-paced world"). Prefer concrete statements with numbers, named technologies and named methods over adjectives. ' +
        'Every claim must be technically accurate and commercially sensible. Diagram/table titles must NOT ' +
        'begin with "Figure N:" or "Table N:" — the renderer adds figure numbering itself.\n' +
        "Be specific to THIS brief and ground every claim in Riseup's own past work.\n" +
        `Lead: "${lead.title}" for ${lead.company}. Template: ${lead.template}.\n` +
        `Client brief: ${brief}${groundingBlock}${this.revisionBlock(instructions)}`,
    });

    await this.linkComparables(data);
    await this.proposals.upsertForLead(leadId, lead.template, data);
    await this.generations.create({ leadId, kind: 'proposal', model: this.ai.model, tokensIn, tokensOut, versions: {} });

    // Auto-generate the budget too (best-effort — a budget failure must not fail the proposal).
    try {
      const used = await this.generateBudget(lead.id, lead.title, lead.company, lead.template, brief, groundingBlock, instructions, lead.budgetCurrency);
      await this.generations.create({ leadId, kind: 'budget', model: this.ai.model, ...used, versions: {} });
    } catch (e) {
      this.logger.warn(`Budget generation skipped for lead ${leadId}: ${String(e)}`);
    }

    return this.proposals.getForLead(leadId);
  }

  // Derive Budget-sheet lines from the canonical Plan (single source of truth). Riseup's global/local budget
  // sheets are ONE consolidated table grouped by department (NOT phase-wise), so collapse the plan's per-phase
  // teams into a single line per department+role+seniority: sum person-days across phases, carry peak units,
  // and set days so units × days ≈ total person-days (preserves both headcount and cost). No milestones.
  private derivePlanBudgetLines(plan: { currency: string; phases: DecisionPhase[] }): GeneratedBudgetLine[] {
    const agg = new Map<string, { department: string; role: string; seniority: Seniority; dayRateCents: number; peakUnits: number; personDaysEff: number; workingDays: number }>();
    for (const p of plan.phases) {
      const phaseCal = Math.max(1, Math.round(p.weeks * DAYS_PER_WEEK)); // calendar working days in this phase
      for (const m of p.team) {
        const factor = (m.hoursPerDay ?? HOURS_PER_DAY) / HOURS_PER_DAY; // part-time discount
        const key = `${m.department || 'Other'}|${m.role}|${m.seniority}`;
        const e = agg.get(key) ?? { department: m.department || 'Other', role: m.role, seniority: m.seniority as Seniority, dayRateCents: m.dayRateCents, peakUnits: 0, personDaysEff: 0, workingDays: 0 };
        e.peakUnits = Math.max(e.peakUnits, m.units);
        e.personDaysEff += m.units * phaseCal * factor; // effective person-days
        e.workingDays += phaseCal; // calendar footprint across the phases the role appears in
        agg.set(key, e);
      }
    }
    // One consolidated line per role. workingDays = calendar footprint; hoursPerDay back-solved so
    // days (effective, per unit) = hoursPerDay × workingDays / 8. Cost stays units × days × dayRate.
    return [...agg.values()].map((e) => {
      const units = Math.max(1, e.peakUnits);
      const workingDays = Math.max(1, Math.round(e.workingDays));
      const effPerUnit = e.personDaysEff / units;
      const hoursPerDay = Math.min(HOURS_PER_DAY, Math.max(0.5, Math.round((effPerUnit * HOURS_PER_DAY / workingDays) * 100) / 100));
      const days = Math.round((hoursPerDay * workingDays / HOURS_PER_DAY) * 100) / 100;
      return { department: e.department, role: e.role, seniority: e.seniority, units, days, hoursPerDay, workingDays, dayRateCents: e.dayRateCents };
    });
  }

  // The Budget sheet is a projection of the Plan — write the Plan into the sheet.
  // `anchorCents` (a strong comparable's reused real quote) makes the sheet land on the SAME number the
  // proposal quotes; without it the sheet would roll up this plan's own team at rate-card cost and the two
  // views would disagree (proposal $5,000 vs lead value $11,085).
  private async applyPlanToBudget(
    leadId: string,
    plan: { currency: string; phases: DecisionPhase[] },
    anchorCents?: number,
    mode: 'fit' | 'cap' = 'fit',
  ): Promise<BudgetFit | null> {
    const fitted = await this.fitPlanToAnchor(plan, anchorCents, mode);
    if (!fitted.lines.length) return null;
    await this.budgets.applyGeneratedPlan(leadId, fitted.lines, plan.currency, fitted.adjustments);
    return fitted;
  }

  // Roles that can be staffed in PARALLEL (multiple heads) when scaling a plan UP to a budget or crashing a
  // deadline. A solo PM / lead / architect / DevOps is never duplicated.
  private isParallelizableRole(role: string): boolean {
    return !/\b(manager|pm|lead|architect|principal|head|director|devops|dev ?ops|scrum)\b/i.test(role || '');
  }

  /**
   * Fit the Plan's effort to an anchored price so the rate-card roll-up EQUALS it.
   *
   * The honest way to sell a $5,000 job is a $5,000 resource plan, not $11,085 of scoped work under a 55%
   * "alignment discount". So the days are scaled to the anchor rather than the price being papered over.
   *
   * The one thing that must not move is the timeline: `phaseWeeks` reads the LONGEST line in a phase, so
   * scaling every line uniformly would silently shorten a 7-week proposal to 3. Each phase therefore keeps
   * its longest line at full duration (weeks x 5) and the rest absorb the reduction as part-time
   * allocations — which is what a smaller engagement over the same calendar actually looks like.
   *
   * Any residual cents left by day rounding are closed with a small exact discount/premium, the same
   * mechanism solveBudgetToTarget uses. Without an anchor this is a pass-through.
   */
  private async fitPlanToAnchor(
    plan: { currency: string; phases: DecisionPhase[] },
    anchorCents?: number,
    mode: 'fit' | 'cap' = 'fit',
  ): Promise<BudgetFit> {
    const lines = this.derivePlanBudgetLines(plan);
    const cost = (l: GeneratedBudgetLine) => l.units * l.days * l.dayRateCents;
    const perUnit = (l: GeneratedBudgetLine) => l.days * l.dayRateCents; // cost of one more head of this line
    const total = (ls: GeneratedBudgetLine[]) => ls.reduce((s, l) => s + cost(l), 0);
    const current = total(lines);
    const trail: string[] = [];
    if (!anchorCents || anchorCents <= 0 || current <= 0) return { lines, trail, feasibility: 'fits', subtotalCents: current };

    const currency = (plan.currency as BudgetCurrency) ?? BudgetCurrency.USD;
    const money = (c: number) => this.fmtCents(c, plan.currency);
    // Cap (hard/max budget): a ceiling — if the plan is already at/under it, leave it (never pad UP to a cap).
    if (mode === 'cap' && current <= anchorCents) return { lines, trail, feasibility: 'fits', subtotalCents: current };
    // Within a rounding whisker of the target already — no lever needs pulling.
    if (Math.abs(current - anchorCents) / anchorCents <= 0.02) {
      return { lines, trail, feasibility: 'fits', subtotalCents: current };
    }

    if (current > anchorCents) {
      // ── LEVER 1 — team size. Extra units of the same role are the cheapest thing to give up: the role
      //    stays in the delivery story, there is just one of them. Never below one head. ──────────────
      let trimmed = 0;
      for (const l of lines) {
        if (l.units > 1 && total(lines) > anchorCents) {
          trimmed += l.units - 1;
          l.units = 1;
        }
      }
      if (trimmed) trail.push(`Reduced team size by ${trimmed} head${trimmed === 1 ? '' : 's'}.`);

      // ── LEVER 2 — seniority. Walk the biggest savings first, but only where the rate card actually
      //    carries a cheaper tier for that role (it does not for PM, Technical Lead or DevOps). ───────
      if (total(lines) > anchorCents) {
        const candidates: { line: GeneratedBudgetLine; to: { role: string; seniority: Seniority; dayRateCents: number; department: string }; saving: number }[] = [];
        for (const l of lines) {
          const ladder = await this.rateCards.downgradeLadder(l.role, l.seniority, currency).catch(() => []);
          const cheapest = ladder[0];
          if (cheapest && cheapest.dayRateCents < l.dayRateCents) {
            candidates.push({ line: l, to: cheapest, saving: (l.dayRateCents - cheapest.dayRateCents) * l.units * l.days });
          }
        }
        candidates.sort((a, b) => b.saving - a.saving);
        const downgraded: string[] = [];
        for (const c of candidates) {
          if (total(lines) <= anchorCents) break;
          downgraded.push(`${c.line.role} to ${c.to.seniority}`);
          c.line.role = c.to.role;
          c.line.seniority = c.to.seniority;
          c.line.dayRateCents = c.to.dayRateCents;
          c.line.department = c.to.department || c.line.department;
        }
        if (downgraded.length) trail.push(`Downgraded ${downgraded.join(', ')}.`);
      }
    }

    // ── LEVER 3 — allocation. Scale part-time effort (hoursPerDay) toward the target. workingDays — the
    //    calendar footprint that phaseWeeks() reads — is left untouched, so the timeline never silently
    //    shrinks; only how much of each day the role gives changes. This is exactly what a smaller
    //    engagement over the same calendar looks like, and it runs in both directions. ─────────────────
    const beforeAllocation = total(lines);
    if (beforeAllocation !== anchorCents && beforeAllocation > 0) {
      const f = anchorCents / beforeAllocation;
      for (const l of lines) {
        const wd = Math.max(1, Number(l.workingDays) || Math.round(l.days));
        const hpd = Math.min(HOURS_PER_DAY, Math.max(0.5, (Number(l.hoursPerDay) || HOURS_PER_DAY) * f));
        l.hoursPerDay = Math.round(hpd * 100) / 100;
        l.workingDays = wd;
        l.days = Math.round((l.hoursPerDay * wd / HOURS_PER_DAY) * 100) / 100;
      }
      const moved = Math.abs(total(lines) - beforeAllocation);
      if (moved > 0) trail.push(`Re-allocated effort (${money(beforeAllocation)} of effort to ${money(total(lines))}).`);
    }

    // ── LEVER 4 (fit only) — once effort is at full-time and the plan is still UNDER the client's budget,
    //    add PARALLEL heads on buildable roles so the sheet MATCHES the number (more people for the budget),
    //    instead of papering the gap with a large contingency premium. Solo PM/lead roles are never doubled.
    if (mode === 'fit' && total(lines) < anchorCents) {
      const beforeHeads = total(lines);
      let guard = 0;
      while (total(lines) < anchorCents && guard++ < 60) {
        const room = anchorCents - total(lines);
        const pick = lines
          .filter((l) => this.isParallelizableRole(l.role) && perUnit(l) > 0)
          .map((l) => ({ l, add: perUnit(l) }))
          .filter((x) => x.add <= room * 1.4) // don't overshoot wildly on the last head
          .sort((a, b) => a.add - b.add)[0];
        if (!pick) break;
        pick.l.units += 1;
      }
      const added = total(lines) - beforeHeads;
      if (added > 0) trail.push(`Added parallel resources to reach ${money(anchorCents)} (from ${money(beforeHeads)}).`);
    }

    // ── Residual — day counts are integers, so a few cents almost always remain. Close them exactly.
    //    A residual above RESIDUAL_MAX_PCT means the levers could not reach the target: that is a real
    //    answer ("this scope does not fit this budget"), not something to paper over with a discount. ──
    const subtotal = total(lines);
    const gap = Math.abs(subtotal - anchorCents);
    const gapPct = subtotal > 0 ? gap / subtotal : 0;
    const adjustments = { contingencyPct: 0, discountPct: 0, vatPct: 0 };
    if (subtotal > anchorCents) adjustments.discountPct = this.pctForExactCents(subtotal, subtotal - anchorCents);
    else if (subtotal < anchorCents) adjustments.contingencyPct = this.pctForExactCents(subtotal, anchorCents - subtotal);

    const feasibility: BudgetFit['feasibility'] =
      gapPct <= 0.02 ? 'fits' : gapPct <= RESIDUAL_MAX_PCT ? 'tight' : 'infeasible';
    if (feasibility === 'infeasible') {
      trail.push(
        `Could not reach ${money(anchorCents)}: the floor plan for this scope costs ${money(subtotal)} ` +
          `(${Math.round(gapPct * 100)}% over) with every role already at one head, its cheapest tier and its minimum days.`,
      );
    } else if (feasibility === 'tight') {
      trail.push(`Closed the last ${money(gap)} with a ${(adjustments.discountPct || adjustments.contingencyPct).toFixed(1)}% adjustment.`);
    }
    return { lines, adjustments, trail, feasibility, subtotalCents: subtotal };
  }

  // ---------------------------------------------------------------------------------------------------------
  // P2 — manual-edit sync. The Budget sheet is the "Excel": when the user edits it (weeks/units/roles/rates)
  // and saves, the proposal's money blocks (timeline, teamAllocation, financial) must follow. The sheet is the
  // lossless source of truth here (it carries each line's exact days), so we re-derive the blocks straight from
  // it — never round-trip through the weeks-based Plan, which would drop non-uniform per-role durations.
  // ---------------------------------------------------------------------------------------------------------

  private static readonly DEFAULT_PHASE = 'Delivery';

  // Group the sheet's costed (non-optional) lines by milestone/phase, preserving first-seen order.
  private groupSheetByPhase(lines: SheetLine[]): { name: string; lines: SheetLine[] }[] {
    const order: string[] = [];
    const byName = new Map<string, SheetLine[]>();
    for (const l of lines) {
      if (l.optional) continue;
      const name = l.milestoneName?.trim() || GenerationService.DEFAULT_PHASE;
      if (!byName.has(name)) { byName.set(name, []); order.push(name); }
      byName.get(name)!.push(l);
    }
    return order.map((name) => ({ name, lines: byName.get(name) as SheetLine[] }));
  }

  // A phase spans as long as its longest-serving line. Timeline reads WORKING days (calendar footprint),
  // not effective days — a part-time role still occupies its full calendar. Excel semantics.
  private phaseWeeks(lines: SheetLine[]): number {
    const maxDays = lines.reduce((mx, l) => Math.max(mx, Number(l.workingDays) || Number(l.days) || 0), 0);
    return Math.max(1, Math.round(maxDays / DAYS_PER_WEEK));
  }

  // Reconstruct the canonical Plan snapshot from the edited sheet (used to keep a later regen/priority-regen
  // starting from the current sheet). Weeks-based, so it approximates non-uniform day edits — that's fine
  // because the proposal blocks below come straight from the sheet, not this snapshot.
  private planFromSheet(currency: string, lines: SheetLine[], focusByPhase?: Map<string, string>): { currency: string; phases: DecisionPhase[] } {
    const phases = this.groupSheetByPhase(lines).map((p) => ({
      name: p.name,
      // The sheet has no focus column — carry the per-phase narrative from the existing Plan (by phase name).
      focus: focusByPhase?.get(p.name) ?? '',
      weeks: this.phaseWeeks(p.lines),
      team: p.lines.map((l) => ({ role: l.role, seniority: l.seniority, units: Number(l.units) || 0, dayRateCents: Number(l.dayRateCents) || 0, department: l.department, hoursPerDay: Number(l.hoursPerDay) || HOURS_PER_DAY })),
    }));
    return { currency, phases };
  }

  // Re-derive the proposal's money blocks from the CURRENT sheet, but drive the phase STRUCTURE (timeline bars,
  // work-approach units, financial phase split) from the canonical Plan phases when they exist — the sheet is a
  // consolidated, milestone-less table, so grouping IT folds every phase into one "Delivery" bar and leaves
  // work-approach stale. The sheet still owns the roll-up NUMBERS (total, team peak); the plan owns the phases.
  private rederiveMoneyBlocksFromSheet(doc: ProposalDocument, currency: string, lines: SheetLine[], computed?: BudgetComputed, planPhases?: DecisionPhase[], equipment: EquipmentRow[] = [], terms?: { warranty?: string }): void {
    const lineCost = (l: SheetLine) => Math.round((Number(l.units) || 0) * (Number(l.days) || 0) * (Number(l.dayRateCents) || 0));
    const sheetSubtotal = lines.filter((l) => !l.optional).reduce((s, l) => s + lineCost(l), 0);

    // Unified phase list: prefer the plan's real phases (structure + weeks), else fall back to the flat sheet.
    type Ph = { name: string; weeks: number; amountCents: number; focus?: string };
    let phaseList: Ph[];
    if (planPhases && planPhases.length) {
      const planCost = (p: DecisionPhase) => this.planPhaseWeekly(p) * (Number(p.weeks) || 0);
      const planTotal = planPhases.reduce((s, p) => s + planCost(p), 0) || 1;
      phaseList = planPhases.map((p) => ({
        name: p.name.split('·')[0].trim() || p.name,
        weeks: Math.max(1, Math.round(Number(p.weeks) || 1)),
        // scale each phase's plan cost to the actual sheet subtotal so the rows sum to the sheet total
        amountCents: Math.round(sheetSubtotal * (planCost(p) / planTotal)),
        focus: p.focus || undefined,
      }));
      const drift = sheetSubtotal - phaseList.reduce((s, p) => s + p.amountCents, 0);
      if (phaseList.length) phaseList[phaseList.length - 1].amountCents += drift;
    } else {
      phaseList = this.groupSheetByPhase(lines).map((g) => ({ name: g.name, weeks: this.phaseWeeks(g.lines), amountCents: g.lines.reduce((s, l) => s + lineCost(l), 0) }));
    }

    for (const b of doc.blocks as Block[]) {
      // A hand-edited money block stays as the rep left it — the sheet still owns everything else.
      if ((b as { locked?: boolean }).locked) continue;
      if (b.type === 'equipment') {
        // Item-level projection of the budget's equipment rows. This is a BREAKDOWN of the hardware line
        // already inside the financial total — never an addition to it.
        b.currency = currency;
        // Without prices a tax/VAT line says nothing to the client — it belongs in the Budget tab, not in a
        // list of what is being supplied. Priced (agency) listings keep it so the schedule still totals.
        const listable = b.showPricing === false
          ? equipment.filter((e) => !isMoneyOnlyLine(e.item))
          : equipment;
        b.rows = listable.map((e) => {
          const unit = Number(e.unitPriceCents) || 0;
          const qty = Number(e.qty) || 0;
          return { item: e.item, brand: e.brand || undefined, uom: e.uom || undefined, qty, unitPriceCents: unit, amountCents: Math.round(qty * unit), note: e.note || undefined };
        });
        // The TOTAL always reflects the full schedule, including any line hidden from the listing above.
        b.totalCents = equipment.reduce((sum, e) => sum + Math.round((Number(e.qty) || 0) * (Number(e.unitPriceCents) || 0)), 0);
        if (terms?.warranty) b.warranty = terms.warranty;
        // Tax is stated as a term (like the warranty) rather than listed as a thing being supplied.
        // Only in the unpriced listing — in a priced (agency) table `note` labels the total row.
        if (b.showPricing === false) {
          const taxed = equipment.some((e) => isMoneyOnlyLine(e.item));
          b.note = taxed ? 'Supplied inclusive of VAT & tax.' : undefined;
        }
      } else if (b.type === 'financial') {
        const prev = new Map((b.rows ?? []).map((r) => [r.label, r]));
        b.currency = currency;
        const rows = phaseList.map((p) => {
          const pr = prev.get(p.name);
          return { label: p.name, focus: p.focus || pr?.focus, timeline: wkLabel(p.weeks), amountCents: p.amountCents, rationale: pr?.rationale };
        });
        // The sheet subtotal that scaled the phase rows above excludes equipment, while totalCents
        // includes it — so hardware needs its own row or the rows will not sum to the total.
        const equipCents = equipment.reduce((sum, e) => sum + Math.round((Number(e.qty) || 0) * (Number(e.unitPriceCents) || 0)), 0);
        if (equipCents > 0) {
          rows.push({ label: 'Hardware, equipment & installation', focus: 'Supplied, installed and commissioned on site.', timeline: '—', amountCents: equipCents } as (typeof rows)[number]);
          // The stock note excludes "third-party & certification costs" — with the hardware now inside this
          // total that is both untrue and a disclosure of the supply arrangement.
          if (!b.note || /third[- ]party|excl\./i.test(b.note)) b.note = 'Total';
        }
        if (computed && (computed.contingencyCents || computed.discountCents || computed.vatCents)) {
          const adjFocus = 'Adjustment to align the investment with the agreed budget.';
          if (computed.contingencyCents) rows.push({ label: 'Budget alignment', focus: adjFocus, timeline: '—', amountCents: computed.contingencyCents } as (typeof rows)[number]);
          if (computed.discountCents) rows.push({ label: 'Budget-alignment discount', focus: adjFocus, timeline: '—', amountCents: -computed.discountCents } as (typeof rows)[number]);
          if (computed.vatCents) rows.push({ label: 'VAT', focus: 'Applicable tax.', timeline: '—', amountCents: computed.vatCents } as (typeof rows)[number]);
          b.totalCents = computed.totalCents;
        } else {
          // `sheetSubtotal` is resource lines only. With a hardware row now present the total must cover it
          // too, or the rows stop summing to the total. computed.subtotalCents already includes equipment.
          b.totalCents = computed?.subtotalCents ?? sheetSubtotal + equipCents;
        }
        b.rows = rows;
      } else if (b.type === 'timeline') {
        let cursor = 0;
        b.rows = phaseList.map((p) => {
          const startWeek = cursor + 1;
          const endWeek = cursor + p.weeks;
          cursor = endWeek;
          return { label: p.name, startWeek, endWeek };
        });
        b.totalWeeks = cursor;
      } else if (b.type === 'workApproach') {
        // Keep the phase count + per-phase weeks in lock-step with the timeline bars (fixes the stale
        // "4 phases / 2wk / 6wk" desync after a targeted budget/timeline regen). Carry over deliverables/
        // acceptance by phase name, else by position.
        const wa = b as WorkApproachBlock;
        const prevUnits = wa.units ?? [];
        const byName = new Map(prevUnits.map((u) => [u.name, u]));
        wa.units = phaseList.map((p, i) => {
          const prevU = byName.get(p.name) ?? prevUnits[i];
          return {
            name: p.name,
            timeline: wkLabel(p.weeks),
            deliverables: prevU?.deliverables ?? [],
            acceptance: prevU?.acceptance ?? 'Delivered on staging, passes QA/regression, formally signed off.',
          };
        });
        wa.heading = `Delivered in ${phaseList.length} ${wa.unitKind === 'milestone' ? 'milestones' : wa.unitKind === 'scope' ? 'scopes' : wa.unitKind === 'module' ? 'modules' : 'phases'}`;
      } else if (b.type === 'teamAllocation') {
        const prev = new Map((b.members ?? []).map((m) => [m.role, m]));
        const peak = new Map<string, { units: number; department: string; seniority: string }>();
        for (const l of lines) {
          if (l.optional) continue;
          const cur = peak.get(l.role);
          const units = Number(l.units) || 0;
          if (!cur || units > cur.units) peak.set(l.role, { units, department: l.department, seniority: l.seniority });
        }
        b.members = [...peak.entries()].map(([role, info]) => {
          const pm = prev.get(role);
          return { icon: pm?.icon, role, units: info.units, responsibility: pm?.responsibility || `${info.seniority} ${info.department}`.trim() };
        });
      }
    }
  }

  // Fired when the user saves an edited Budget sheet. Best-effort: a sync failure must never surface as a save
  // failure (the event is emitted after the save has already committed).
  @OnEvent('budget.edited')
  async onBudgetEdited(payload: { leadId: string }): Promise<void> {
    try {
      await this.syncProposalFromSheet(payload.leadId);
    } catch (e) {
      this.logger.warn(`Proposal sync after budget edit failed for lead ${payload.leadId}: ${String(e)}`);
    }
  }

  // Load the UNWRAPPED internalCalc object. `getInternalCalc` returns the proposal row `{ id, internalCalc }`,
  // so callers must reach through `.internalCalc` — never treat the row itself as the calc (that nests it).
  private async loadInternalCalc(leadId: string): Promise<Record<string, unknown> | null> {
    const row = await this.proposals.getInternalCalc(leadId).catch(() => null);
    return ((row as { internalCalc?: Record<string, unknown> } | null)?.internalCalc ?? null);
  }
  private planFromCalc(calc: Record<string, unknown> | null): { currency: string; phases: DecisionPhase[] } | undefined {
    return (calc as { plan?: { currency: string; phases: DecisionPhase[] } } | null)?.plan;
  }

  // The canonical Plan for directive regens: the persisted one, or — for proposals generated before the Plan
  // was persisted — rebuilt from the current budget sheet (which always exists after a generation).
  private async loadPlanForDirectives(leadId: string): Promise<{ currency: string; phases: DecisionPhase[] } | undefined> {
    const fromCalc = this.planFromCalc(await this.loadInternalCalc(leadId));
    if (fromCalc?.phases?.length) return fromCalc;
    const { budget } = await this.budgets.getForLead(leadId).catch(() => ({ budget: null }) as { budget: null });
    const sheet = ((budget?.lines ?? []) as unknown) as SheetLine[];
    return sheet.length ? this.planFromSheet(budget?.currency || 'USD', sheet) : undefined;
  }

  // Re-derive the proposal's money blocks from the CURRENT sheet + refresh the persisted Plan snapshot. Shared
  // by the manual-edit event (P2) and the deterministic directive regen (P3) so both keep the two views locked.
  private async syncProposalFromSheet(leadId: string): Promise<void> {
    const proposal = await this.proposals.getForLead(leadId).catch(() => null);
    const doc = proposal?.sections as unknown as ProposalDocument | undefined;
    if (!doc || !Array.isArray(doc.blocks)) return; // no proposal generated yet — nothing to sync
    const { budget, computed } = await this.budgets.getForLead(leadId);
    const currency = budget?.currency || 'USD';
    const sheet = (budget?.lines ?? []) as unknown as SheetLine[];
    const equipment = (budget?.equipment ?? []) as unknown as EquipmentRow[];
    // An equipment-only budget (hardware quoted before the resource plan exists) still has money to show.
    if (!sheet.length && !equipment.length) return;
    // The canonical Plan carries the real phase structure (names + weeks); the consolidated sheet does not.
    // Drive timeline/work-approach/financial phases from it; keep it as the persisted Plan (never flatten it
    // to a single "Delivery" phase). Only rebuild the Plan from the sheet when none was ever persisted.
    const calc = await this.loadInternalCalc(leadId);
    const planPhases = this.planFromCalc(calc)?.phases;
    const lead = await this.leads.findByIdOrFail(leadId).catch(() => null);
    this.rederiveMoneyBlocksFromSheet(
      doc, currency, sheet, computed as unknown as BudgetComputed, planPhases, equipment,
      { warranty: lead?.hardwareWarranty ?? undefined },
    );
    await this.proposals.upsertForLead(leadId, proposal!.template, doc as unknown as Record<string, unknown>);
    if (!(planPhases && planPhases.length)) {
      await this.proposals.setInternalCalc(leadId, { ...(calc || {}), plan: this.planFromSheet(currency, sheet) });
    }
    this.logger.log(`Synced proposal money blocks from budget sheet for lead ${leadId}.`);
  }

  // ---------------------------------------------------------------------------------------------------------
  // P3 — deterministic directive regeneration on the Plan. A regen prompt carrying an explicit target (weeks,
  // budget) or a team change is applied EXACTLY to the persisted Plan (no AI guesswork), then rippled to BOTH
  // the sheet and the proposal money blocks. Free-form/content directives (tech stack, narrative) still go
  // through the full Generate, which re-decides stack + roles + budget together.
  // ---------------------------------------------------------------------------------------------------------

  private planPhaseWeekly(p: DecisionPhase): number {
    return p.team.reduce((s, m) => s + (Number(m.units) || 0) * (Number(m.dayRateCents) || 0) * DAYS_PER_WEEK * ((Number(m.hoursPerDay) || HOURS_PER_DAY) / HOURS_PER_DAY), 0);
  }
  private planTotalCents(phases: DecisionPhase[]): number {
    return phases.reduce((s, p) => s + this.planPhaseWeekly(p) * (Number(p.weeks) || 0), 0);
  }
  private planTotalWeeks(phases: DecisionPhase[]): number {
    return phases.reduce((s, p) => s + (Number(p.weeks) || 0), 0);
  }
  private fmtCents(cents: number, currency: string): string {
    return new Intl.NumberFormat(currency === 'BDT' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
  }

  // P6 — append a "what changed" entry to the proposal's rolling log (best-effort; never fails the operation).
  private async logChange(
    leadId: string,
    entry: { kind: 'proposal' | 'budget' | 'section'; title: string; details?: string[]; budgetBeforeCents?: number; budgetAfterCents?: number; weeksBefore?: number; weeksAfter?: number; currency?: string },
  ): Promise<void> {
    await this.proposals.appendChange(leadId, { at: new Date().toISOString(), ...entry, details: entry.details ?? [] }).catch(() => {});
  }

  // The %, at the column's 6-dp precision, that makes computeBudget's round(base × pct/100) equal EXACTLY
  // amountCents — so the discount/premium lands the total on the target to the cent (not just within a few).
  private pctForExactCents(base: number, amountCents: number): number {
    if (base <= 0 || amountCents <= 0) return 0;
    const scale = 1e6; // 6 decimals — matches the numeric(11,6) pct columns
    let pct = Math.round(((amountCents / base) * 100) * scale) / scale;
    for (let i = 0; i < 12 && Math.round((base * pct) / 100) !== amountCents; i++) {
      pct += (Math.round((base * pct) / 100) < amountCents ? 1 : -1) / scale;
    }
    return Math.max(0, pct);
  }

  // Scale phase weeks so the plan total lands on targetCents. Same algorithm as decide.retargetBudget: a global
  // factor, then fine-tune the heaviest phase to close the integer-week rounding gap (lands within ½ phase-week).
  private scalePlanToBudget(phases: DecisionPhase[], targetCents: number): void {
    const current = this.planTotalCents(phases);
    if (current <= 0 || targetCents <= 0) return;
    const k = targetCents / current;
    for (const p of phases) p.weeks = Math.max(1, Math.round(p.weeks * k));
    const heaviest = [...phases].sort((a, b) => this.planPhaseWeekly(b) - this.planPhaseWeekly(a))[0];
    for (let i = 0; heaviest && i < 60; i++) {
      const diff = targetCents - this.planTotalCents(phases);
      const step = this.planPhaseWeekly(heaviest);
      if (step <= 0 || Math.abs(diff) < step / 2) break;
      const next = heaviest.weeks + (diff > 0 ? 1 : -1);
      if (next < 1) break;
      heaviest.weeks = next;
    }
  }

  // Scale phase weeks so the total timeline is EXACTLY targetWeeks (proportional, largest-remainder rounding,
  // min 1 week per phase). Trims from the longest phases if rounding overshoots.
  private scalePlanToWeeks(phases: DecisionPhase[], targetWeeks: number): void {
    // A pinned phase holds its duration; the rest absorb the change. Scaling everything would silently undo
    // a duration a human agreed, which is exactly how a 7-week plan came back re-timed.
    const pinned = phases.filter((p) => p.pinnedWeeks);
    if (pinned.length && pinned.length < phases.length) {
      const held = pinned.reduce((s, p) => s + (Number(p.weeks) || 0), 0);
      const free = phases.filter((p) => !p.pinnedWeeks);
      const remaining = Math.max(free.length, Math.floor(targetWeeks) - held);
      this.scalePlanToWeeks(free, remaining);
      return;
    }
    const total = this.planTotalWeeks(phases);
    const target = Math.max(phases.length, Math.floor(targetWeeks));
    if (total <= 0 || target <= 0 || !phases.length) return;
    const k = target / total;
    const raw = phases.map((p) => Math.max(1, (Number(p.weeks) || 1) * k));
    const weeks = raw.map((v) => Math.max(1, Math.floor(v)));
    let used = weeks.reduce((s, v) => s + v, 0);
    const byFrac = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
    let idx = 0;
    while (used < target && byFrac.length) { weeks[byFrac[idx % byFrac.length].i] += 1; used += 1; idx += 1; }
    while (used > target) {
      let victim = -1, max = 1;
      for (let j = 0; j < weeks.length; j++) if (weeks[j] > max) { max = weeks[j]; victim = j; }
      if (victim < 0) break;
      weeks[victim] -= 1; used -= 1;
    }
    phases.forEach((p, i) => { p.weeks = weeks[i]; });
  }

  private static readonly ROLE_STOP = new Set(['the', 'and', 'for', 'lead', 'role', 'team', 'engineer', 'engineers', 'developer', 'developers', 'specialist', 'manager', 'senior', 'junior', 'mid', 'staff', 'of', 'a', 'an', 'with']);

  // Parse the explicit, deterministic directives we can apply without AI: a total-weeks target, a budget target,
  // and team removals (matched against the Plan's real roles). Everything else is left to the full Generate.
  private parsePlanDirectives(prompt: string, phases: DecisionPhase[]): { targetCents?: number; targetWeeks?: number; removeRoles: string[] } {
    const t = (prompt || '').toLowerCase();
    const targetCents = parseBudgetTargetCents(prompt);
    let targetWeeks: number | undefined;
    const wm = t.match(/(\d{1,3})\s*(?:weeks?|wks?)\b/);
    if (wm) targetWeeks = parseInt(wm[1], 10);
    // Match verb STEMS so tense/inflection all trigger: remove/removing/removed, drop/dropping, delete/deleting,
    // exclude/excluding, omit, cut, without, take out, get rid, no more/need/longer, don't include/need/want.
    const removeRoles: string[] = [];
    const REMOVE_VERB = /(?:\bremov|\bdelet|\bdrop|\bexclud|\bomit|\bcut\b|\bwithout\b|\btake\s*out\b|\bget\s*rid\b|\bno\s+(?:more|need|longer)\b|\bdon'?t\s+(?:include|need|want)\b)/i;
    if (REMOVE_VERB.test(t)) {
      const roles = [...new Set(phases.flatMap((p) => p.team.map((m) => m.role)))];
      for (const r of roles) {
        const tokens = r.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 2 && !GenerationService.ROLE_STOP.has(w));
        if (tokens.some((tok) => new RegExp(`\\b${tok}\\b`).test(t))) removeRoles.push(r);
      }
    }
    return { targetCents, targetWeeks, removeRoles };
  }

  // AI INTENT PARSER — the fix for brittle regex directive matching. Turns ANY phrasing ("in 10,000", "make it
  // 10k", "removing the QA guy", "cut it to 8 weeks", "add a devops engineer") into a STRUCTURED directive
  // against the current Plan. The numbers are then applied by the DETERMINISTIC solver, so the result is
  // exactly what was asked. Falls back to the regex parser only if the AI call fails outright.
  /** Current hardware row names — context for the directive parser so "remove the VAT row" can be matched. */
  private async equipmentNames(leadId: string): Promise<string[]> {
    const { budget } = await this.budgets.getForLead(leadId).catch(() => ({ budget: null } as never));
    return ((budget?.equipment ?? []) as { item: string }[]).map((e) => e.item);
  }

  private async parseDirectivesAI(prompt: string, plan: { currency: string; phases: DecisionPhase[] }, equipmentNames: string[] = []): Promise<ParsedDirective> {
    const roles = [...new Set(plan.phases.flatMap((p) => p.team.map((m) => m.role)))];
    const phaseList = plan.phases.map((p) => `${p.name} (${p.weeks}w)`).join('; ');
    const equipmentList = equipmentNames.join(' | ');
    try {
      const { data } = await this.ai.json<{
        budgetTarget?: number | null;
        budgetMode?: string | null;
        totalWeeks?: number | null;
        phaseWeeks?: { phase?: unknown; weeks?: unknown }[];
        equipmentRemove?: string[];
        removeRoles?: string[];
        addRoles?: { role?: string; seniority?: string; count?: number; unitPrice?: number }[];
        structureMode?: string | null;
        isStructural?: boolean;
      }>({
        label: 'parse-directives',
        system:
          "You convert a sales rep's plain-English instruction about a software project proposal into a STRUCTURED directive. Extract ONLY what the rep explicitly asks for — never invent changes. Interpret money/timeline in any phrasing. The instruction may be in English, Bangla, or mixed — understand it regardless of language.",
        maxTokens: 400,
        prompt:
          `Project currency: ${plan.currency}.\n` +
          `Phases: ${phaseList || '(none)'}.\n` +
          `Team roles (use these EXACT strings in removeRoles): ${roles.join(' | ') || '(none)'}.\n\n` +
          `Hardware rows (use these EXACT strings in equipmentRemove): ${equipmentList || "(none)"}.\n` +
          `Instruction: "${prompt}"\n\n` +
          `Return ONLY this JSON:\n` +
          `{\n` +
          `  "budgetTarget": number|null,  // the TOTAL budget referenced, as a whole number in ${plan.currency} major units (NOT cents). Examples: "$10,000"->10000, "in 10,000"->10000, "make it 10k"->10000, "budget of 2.5 lac"->250000. null if not requested.\n` +
          `  "budgetMode": "exact"|"max",   // "max" if the rep wants a CEILING (under/within/below/at most/no more than/keep it under/cap at). "exact" if they want that precise number (exactly/of/make it/set to/regenerate in/bring it to). Default "exact".\n` +
          `  "totalWeeks": number|null,    // the exact TOTAL timeline in weeks requested. "10 weeks"->10, "cut to 8"->8. null if not requested.\n` +
          `  "phaseWeeks": [{"phase": string, "weeks": number}],  // per-PHASE durations the rep names ("make Core Build 2 weeks", "Discovery should be 1 week").\n` +
          `      Copy the phase name EXACTLY from the Phases list above. One entry per phase named. [] if the instruction names no individual phase.\n` +
          `      Use this INSTEAD of totalWeeks when specific phases are named; only set totalWeeks for a whole-project duration.\n` +
          `  "equipmentRemove": string[],  // HARDWARE/equipment rows the rep asks to delete ("remove the VAT row",\n` +
          `      "drop the door closer line"). Copy the item name from the Hardware list above. [] if none.\n` +
          `  "removeRoles": string[],      // EXACT role strings from the list above to remove. [] if none.\n` +
          `  "addRoles": [{"role": string, "seniority": "senior"|"mid"|"junior", "count": number|null, "unitPrice": number|null}],  // roles to add. count = head count if the rep gives one (e.g. "add 2 QA engineers"->2), else null. unitPrice = an explicit per-day rate in ${plan.currency} MAJOR units if the rep states one (e.g. "at 6000/day"->6000), else null. [] if none.\n` +
          `  "structureMode": "phase"|"milestone"|"scope"|"module"|null,  // set ONLY if the rep asks to change how delivery is ORGANISED — "phase by phase", "by milestones", "module by module / feature by feature", "as one scope". null otherwise.\n` +
          `  "isStructural": boolean       // true if the instruction changes budget/timeline/team/structure; false if it only changes wording/content/focus text.\n` +
          `}`,
      });
      const budgetMajor = posInt(data.budgetTarget);
      // Phase naming and duration attribution are mechanical — settled in directive-parse.util (unit-tested)
      // rather than trusted from the model, which twice read a per-phase duration as the project total.
      const phaseWeeks = resolvePhaseWeeks(prompt, plan.phases.map((ph) => ph.name), data.phaseWeeks);
      const modelTotal = posInt(data.totalWeeks);
      const misread = isTotalWeeksMisread(prompt, modelTotal, phaseWeeks);
      return {
        budgetTargetCents: budgetMajor ? budgetMajor * 100 : undefined,
        budgetMode: data.budgetMode === 'max' ? 'max' : 'exact',
        totalWeeks: misread ? undefined : modelTotal,
        phaseWeeks,
        equipmentRemove: Array.isArray(data.equipmentRemove)
          ? data.equipmentRemove.map((x) => String(x ?? '').trim()).filter(Boolean)
          : [],
        removeRoles: Array.isArray(data.removeRoles) ? data.removeRoles.filter((r) => roles.includes(r)) : [],
        addRoles: Array.isArray(data.addRoles)
          ? data.addRoles.filter((a) => a?.role).map((a) => {
              const priceMajor = posInt(a.unitPrice);
              return { role: String(a.role), seniority: (a.seniority as string) || 'mid', units: posInt(a.count), dayRateCents: priceMajor ? priceMajor * 100 : undefined };
            })
          : [],
        structureMode: ['phase', 'milestone', 'scope', 'module'].includes(String(data.structureMode)) ? (data.structureMode as ParsedDirective['structureMode']) : undefined,
        isStructural: !!data.isStructural || (Array.isArray(data.phaseWeeks) && data.phaseWeeks.length > 0),
      };
    } catch (e) {
      this.logger.warn(`AI directive parse failed; using regex fallback: ${String(e)}`);
      const d = this.parsePlanDirectives(prompt, plan.phases);
      return { budgetTargetCents: d.targetCents, budgetMode: 'exact', totalWeeks: d.targetWeeks, removeRoles: d.removeRoles, addRoles: [], isStructural: !!(d.targetCents || d.targetWeeks || d.removeRoles.length) };
    }
  }

  // Apply team (remove/add) changes to the Plan in place, and — when `weeks` is set — a total-weeks target.
  // Rates for added roles come from the rate card (never invented); an unmatched role is skipped with a note.
  private async applyPlanChanges(plan: { currency: string; phases: DecisionPhase[] }, dir: ParsedDirective, opts: { weeks: boolean }): Promise<{ notes: string[] }> {
    const notes: string[] = [];
    for (const role of dir.removeRoles) {
      let removed = 0;
      for (const p of plan.phases) { const n = p.team.length; p.team = p.team.filter((m) => m.role !== role); removed += n - p.team.length; }
      if (removed) notes.push(`Removed ${role} from the team.`);
    }
    // Team-average day-rate — the fallback price for a role the rep names that isn't on the rate card and
    // for which they gave no explicit price ("add just a single unit with average price").
    const allRates = plan.phases.flatMap((p) => p.team.map((m) => m.dayRateCents)).filter((c) => c > 0);
    const avgRate = allRates.length ? Math.round(allRates.reduce((s, c) => s + c, 0) / allRates.length) : 0;
    for (const add of dir.addRoles) {
      const units = add.units && add.units > 0 ? add.units : 1; // no head count → a single unit
      const r = await this.rateCards.resolveRole(add.role, add.seniority as Seniority, plan.currency as BudgetCurrency).catch(() => null);
      // Price precedence: an explicit price from the prompt → the rate-card rate → the team average.
      const dayRateCents = add.dayRateCents && add.dayRateCents > 0 ? add.dayRateCents : (r?.dayRateCents || avgRate);
      const role = r?.role || add.role;
      const department = r?.department || 'Other';
      if (!dayRateCents) { notes.push(`Couldn't add “${add.role}” — no price given and no rate-card match.`); continue; }
      let added = 0;
      for (const p of plan.phases) {
        if (p.team.some((m) => m.role === role)) continue;
        // A rep-added role defaults to full-time; they can dial hours in the sheet afterwards.
        p.team.push({ role, seniority: add.seniority, units, dayRateCents, department, hoursPerDay: HOURS_PER_DAY });
        added++;
      }
      if (added) {
        const priced = add.dayRateCents ? ` at ${this.fmtCents(dayRateCents, plan.currency)}/day` : (!r?.dayRateCents ? ` at the average ${this.fmtCents(dayRateCents, plan.currency)}/day` : '');
        notes.push(`Added ${units}× ${role}${priced}.`);
      }
    }
    plan.phases = plan.phases.filter((p) => p.team.length); // drop any phase left empty

    // Per-phase durations first: retime ONLY the named phases and leave every other agreed number alone.
    // Matched loosely (case/punctuation-insensitive, then containment) because a rep types the phase name
    // as they read it on screen, not as it is stored.
    if (opts.weeks && dir.phaseWeeks?.length) {
      const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      for (const req of dir.phaseWeeks) {
        const want = norm(req.phase);
        const hit =
          plan.phases.find((p) => norm(p.name) === want) ??
          plan.phases.find((p) => norm(p.name).includes(want) || want.includes(norm(p.name)));
        if (!hit) { notes.push(`No phase matched "${req.phase}" — left the schedule unchanged for it.`); continue; }
        if (hit.weeks === req.weeks) { hit.pinnedWeeks = true; continue; }
        notes.push(`${hit.name}: ${hit.weeks} → ${req.weeks} week(s).`);
        hit.weeks = req.weeks;
        hit.pinnedWeeks = true; // a human set this — scaling and regeneration must leave it alone
      }
      notes.push(`Delivery timeline is now ${this.planTotalWeeks(plan.phases)} weeks.`);
    }

    if (opts.weeks && dir.totalWeeks && dir.totalWeeks > 0) {
      const natural = this.planTotalWeeks(plan.phases);
      if (dir.totalWeeks < natural) {
        // Compressing → CRASH (add overtime + parallel heads), don't just shrink weeks with the same team.
        const note = crashPlanToWeeks(plan.phases, dir.totalWeeks, natural, true);
        notes.push(note || `Set the delivery timeline to ${this.planTotalWeeks(plan.phases)} weeks.`);
      } else {
        this.scalePlanToWeeks(plan.phases, dir.totalWeeks);
        notes.push(`Set the delivery timeline to ${this.planTotalWeeks(plan.phases)} weeks.`);
      }
    }
    return { notes };
  }

  // P4 — land a budget target EXACTLY. Day-level scaling (5× finer than whole weeks) trims the plan close to
  // the target; a computed discount (over) or premium/contingency (under) closes the final cents so
  // computeBudget lands on the target to the cent. Writes the sheet (with the adjustment); caller syncs after.
  private async solveBudgetToTarget(leadId: string, plan: { currency: string; phases: DecisionPhase[] }, targetCents: number, mode: 'exact' | 'max' = 'exact'): Promise<{ notes: string[] }> {
    const lines = this.derivePlanBudgetLines(plan);
    const cost = (l: GeneratedBudgetLine) => l.units * l.days * l.dayRateCents;
    const totalOf = (ls: GeneratedBudgetLine[]) => ls.reduce((s, l) => s + cost(l), 0);
    const current = totalOf(lines);
    if (current > 0 && targetCents > 0) {
      // Scale part-time effort (hoursPerDay), keeping workingDays/timeline fixed, so days stays consistent
      // with hoursPerDay × workingDays / 8 (Workstream A). A residual is closed exactly below.
      const f = targetCents / current;
      for (const l of lines) {
        const wd = Math.max(1, Number(l.workingDays) || Math.round(l.days));
        const hpd = Math.min(HOURS_PER_DAY, Math.max(0.5, (Number(l.hoursPerDay) || HOURS_PER_DAY) * f));
        l.hoursPerDay = Math.round(hpd * 100) / 100;
        l.workingDays = wd;
        l.days = Math.round((l.hoursPerDay * wd / HOURS_PER_DAY) * 100) / 100;
      }
    }
    const subtotal = totalOf(lines);
    const scoped = this.fmtCents(subtotal, plan.currency);
    const target = this.fmtCents(targetCents, plan.currency);
    const adj = { contingencyPct: 0, discountPct: 0, vatPct: 0 };
    let note: string;
    if (mode === 'max') {
      // Ceiling ("under X"): only trim DOWN if over — never pad up with a premium. If already under, leave it.
      if (subtotal > targetCents) {
        adj.discountPct = this.pctForExactCents(subtotal, subtotal - targetCents);
        note = `Trimmed to ${target} to stay within budget (${scoped} of scoped work).`;
      } else {
        note = `Scoped to ${scoped} — within your ${target} budget.`;
      }
    } else if (subtotal > targetCents) {
      adj.discountPct = this.pctForExactCents(subtotal, subtotal - targetCents);
      note = `Solved to exactly ${target}: ${scoped} of scoped work less a ${adj.discountPct.toFixed(1)}% budget-alignment discount.`;
    } else if (subtotal < targetCents) {
      adj.contingencyPct = this.pctForExactCents(subtotal, targetCents - subtotal);
      note = `Solved to exactly ${target}: ${scoped} of scoped work plus a ${adj.contingencyPct.toFixed(1)}% premium.`;
    } else {
      note = `Solved to exactly ${target} — the scoped work matched the target.`;
    }
    await this.budgets.applyGeneratedPlan(leadId, lines, plan.currency, adj);
    return { notes: [note] };
  }

  // The Budget sheet's true totals right now — total INCLUDING adjustments + the timeline weeks it implies.
  private async currentBudgetTotals(leadId: string, currency: string): Promise<{ cents: number; weeks: number }> {
    const res = await this.budgets.getForLead(leadId).catch(() => null);
    const cents = Number((res?.computed as BudgetComputed | undefined)?.totalCents ?? 0);
    const sheet = ((res?.budget?.lines ?? []) as unknown) as SheetLine[];
    const weeks = this.planTotalWeeks(this.planFromSheet(currency, sheet).phases);
    return { cents, weeks };
  }

  async regenerateBudget(leadId: string, instructions?: string, preParsed?: ParsedDirective) {
    const lead = await this.leads.findByIdOrFail(leadId);
    const calc = await this.loadInternalCalc(leadId);
    const plan = await this.loadPlanForDirectives(leadId); // persisted Plan, or rebuilt from the sheet
    if (plan?.phases?.length) {
      const dir: ParsedDirective =
        preParsed ??
        (instructions?.trim()
          ? await this.parseDirectivesAI(instructions, plan, await this.equipmentNames(leadId))
          : { removeRoles: [], addRoles: [], isStructural: false });
      const before = await this.currentBudgetTotals(leadId, plan.currency);
      const notes: string[] = [];
      // Hardware rows are budget data, so a "remove that row" instruction is applied here first, whatever
      // else the same prompt asks for.
      if (dir.equipmentRemove?.length) {
        const { removed } = await this.budgets.removeEquipmentByName(leadId, dir.equipmentRemove);
        notes.push(removed ? `Removed ${removed} hardware row(s) from the equipment schedule.` : 'No hardware row matched that instruction.');
      }
      const hasTarget = !!(dir.budgetTargetCents && dir.budgetTargetCents > 0);
      const hasStructural = !!(dir.totalWeeks || dir.phaseWeeks?.length || dir.removeRoles.length || dir.addRoles.length);
      if (hasTarget) {
        // Re-scope first (team add/remove), persist the plan, then solve to the exact budget target.
        if (dir.removeRoles.length || dir.addRoles.length) notes.push(...(await this.applyPlanChanges(plan, dir, { weeks: false })).notes);
        await this.proposals.setInternalCalc(leadId, { ...(calc || {}), plan });
        notes.push(...(await this.solveBudgetToTarget(leadId, plan, dir.budgetTargetCents as number, dir.budgetMode ?? 'exact')).notes);
        await this.syncProposalFromSheet(leadId);
      } else if (hasStructural) {
        notes.push(...(await this.applyPlanChanges(plan, dir, { weeks: true })).notes);
        await this.proposals.setInternalCalc(leadId, { ...(calc || {}), plan });
        await this.applyPlanToBudget(leadId, plan);
        await this.syncProposalFromSheet(leadId);
      } else {
        // No plan-level directive (or equipment-only) → re-sync the proposal to the CURRENT sheet.
        await this.syncProposalFromSheet(leadId);
        if (!dir.equipmentRemove?.length) notes.push('Re-synced the proposal to the current budget.');
      }
      await this.generations.create({ leadId, kind: 'budget', model: this.ai.model, tokensIn: 0, tokensOut: 0, versions: {} });
      const after = await this.currentBudgetTotals(leadId, plan.currency);
      // P6: record the budget change.
      await this.logChange(leadId, {
        kind: 'budget',
        title: notes[0] ?? 'Updated the budget',
        details: notes.slice(1),
        budgetBeforeCents: before.cents,
        budgetAfterCents: after.cents,
        weeksBefore: before.weeks,
        weeksAfter: after.weeks,
        currency: plan.currency,
      });
      return {
        ok: true,
        summary: {
          changed: notes,
          budgetBeforeCents: before.cents,
          budgetAfterCents: after.cents,
          weeksBefore: before.weeks,
          weeksAfter: after.weeks,
          currency: plan.currency,
        },
      };
    }
    // Legacy fallback (no persisted Plan yet): the original AI resource-plan path.
    const req = await this.requirements.getForLead(leadId);
    const brief = req?.sourceText ?? '(no brief text provided)';
    const groundingBlock = await this.groundingFor(lead.title, brief, GenerationService.CATEGORY[lead.template]);
    const used = await this.generateBudget(lead.id, lead.title, lead.company, lead.template, brief, groundingBlock, instructions, lead.budgetCurrency);
    await this.generations.create({ leadId, kind: 'budget', model: this.ai.model, ...used, versions: {} });
    return { ok: true };
  }

  // Regenerate ONE proposal section, keeping its JSON shape, steered by an optional plain-English prompt.
  async regenerateSection(leadId: string, key: string, instruction?: string) {
    const lead = await this.leads.findByIdOrFail(leadId);
    const proposal = await this.proposals.getForLead(leadId);
    const current = (proposal.sections as Record<string, unknown>)[key];
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
    const grounding = await this.groundingFor(lead.title, typeof current === 'string' ? current : JSON.stringify(current));
    const { data, tokensIn, tokensOut } = await this.ai.json<{ value: unknown }>({
      label: `section:${key}`,
      system: SCAFFOLD,
      maxTokens: 3000,
      prompt:
        `Rewrite ONLY the "${label}" section of a Riseup proposal. Return JSON {"value": <the SAME JSON shape/type ` +
        `as the current value>} — a string stays a string; an array-of-objects keeps the same field names.\n` +
        `The instruction may be in English, Bangla, or mixed — understand it regardless; keep the output language unchanged (English).\n` +
        `Instruction from the sales rep: ${instruction?.trim() || 'improve clarity and tighten it'}.\n` +
        `Current value: ${JSON.stringify(current)}\n` +
        `Lead: "${lead.title}" for ${lead.company}. Template: ${lead.template}.${grounding}`,
    });
    await this.proposals.setSection(leadId, key, data.value);
    await this.generations.create({ leadId, kind: 'section', model: this.ai.model, tokensIn, tokensOut, versions: {} });
    return this.proposals.getForLead(leadId);
  }

  // AI infers the resource plan (department/role/seniority/units/days); rates come from the rate card
  // (never the LLM); the app computes every total. Grounded in RAG + learned role-day patterns.
  private async generateBudget(
    leadId: string, title: string, company: string, template: string, brief: string, groundingBlock: string,
    instructions?: string, currency: BudgetCurrency = BudgetCurrency.USD,
  ): Promise<{ tokensIn: number; tokensOut: number }> {
    const [roles, learned] = await Promise.all([
      this.rateCards.rolesForPrompt(currency),
      this.rateCards.learnedDays(template),
    ]);
    const learnedBlock = Object.keys(learned).length
      ? '\nLearned day-estimates from past Riseup projects (use as a baseline): ' +
        Object.entries(learned).map(([r, d]) => `${r}≈${d}d`).join(', ')
      : '';

    const { data, tokensIn, tokensOut } = await this.ai.json<{ lines?: { department?: string; role?: string; seniority?: string; units?: number; days?: number; hoursPerDay?: number }[] }>({
      label: 'budget-plan',
      maxTokens: 4000,
      prompt:
        'Produce a delivery resource plan for this project as JSON: {"lines":[{department, role, seniority, units, days, hoursPerDay}]}.\n' +
        '- Pick roles from Riseup\'s rate card below (use the closest match). seniority ∈ {senior, mid, junior}.\n' +
        '- units = number of people in that role; days = CALENDAR working days each is staffed; hoursPerDay = hours PER DAY that role actually spends on this project (1-8; 8 = full-time). Most roles are PART-TIME: PM/lead 1-3, QA 2-4, hands-on dev/designer 5-8. Keep it realistic (units 1-10, days 1-180).\n' +
        `- Valid roles & rates:\n${roles}${learnedBlock}\n` +
        `- Ground the plan in past Riseup budgets:${groundingBlock || ' (none retrieved)'}\n` +
        `Project: "${title}" for ${company}. Template: ${template}. Brief: ${brief}${this.revisionBlock(instructions)}`,
    });

    const raw = Array.isArray(data?.lines) ? data.lines : [];
    const planForLearning: { role: string; days: number }[] = [];
    const lines: GeneratedBudgetLine[] = [];
    for (const l of raw) {
      const role = (l.role || '').trim();
      if (!role) continue;
      const seniority = (SENIORITIES.has(String(l.seniority)) ? l.seniority : 'mid') as Seniority;
      const units = Math.min(10, Math.max(1, Math.round(Number(l.units) || 1)));
      const workingDays = Math.min(180, Math.max(1, Math.round(Number(l.days) || 1)));
      const hoursPerDay = Math.min(HOURS_PER_DAY, Math.max(0.5, Number(l.hoursPerDay) || HOURS_PER_DAY));
      const days = Math.round((workingDays * hoursPerDay / HOURS_PER_DAY) * 100) / 100; // effective man-days
      // Resolve against the rate card → canonical role name + real department + rate (never LLM-guessed).
      const resolved = await this.rateCards.resolveRole(role, seniority, currency);
      if (resolved === null) {
        // §10: never invent a price. A role missing from the rate card (built from Riseup's real
        // budget documents) is dropped and logged instead of getting a made-up rate.
        this.logger.warn(`Budget line skipped — "${role}" is not on the rate card (no invented rates).`);
        continue;
      }
      // Use the rate card's department + canonical role so the budget always shows Riseup's real taxonomy
      // (Engineering, Quality Assurance, Product Design & Planning, …), not the AI's free-text guess.
      lines.push({ department: resolved.department, role: resolved.role, seniority, units, days, hoursPerDay, workingDays, dayRateCents: resolved.dayRateCents });
      planForLearning.push({ role: resolved.role, days });
    }
    if (!lines.length) return { tokensIn, tokensOut };

    await this.budgets.applyGeneratedPlan(leadId, lines, currency);
    // Learning loop: record this plan's role-days so future estimates for this template improve.
    await this.rateCards.recordSamples(template, planForLearning);
    return { tokensIn, tokensOut };
  }

  // Internal sales pitch pack (non-technical) — generated on demand from the proposal + RAG.
  async generateSalesBrief(leadId: string) {
    const lead = await this.leads.findByIdOrFail(leadId);
    const proposal = await this.proposals.getForLead(leadId); // requires a generated proposal
    const grounding = await this.kb.retrieveContext(`${lead.title}\n${JSON.stringify(proposal.sections)}`, 5);
    const comparable = grounding.length ? `\nComparable past Riseup work:\n${grounding.join('\n')}` : '';

    const { data, tokensIn, tokensOut } = await this.ai.json<Record<string, unknown>>({
      label: 'sales-brief',
      system: SCAFFOLD,
      maxTokens: 4000,
      prompt:
        'From the proposal below, write an INTERNAL sales pitch pack (plain, non-technical, for the sales rep) as JSON ' +
        'with EXACTLY these keys: proposing (string), whyMatters (string), highlights (string[]), talkingPoints (string[]), ' +
        'objections (array of {objection, response}), comparableProjects (string[]), sixtySecondPitch (string), suggestedClose (string).\n' +
        `Lead: "${lead.title}" for ${lead.company}.\nProposal sections: ${JSON.stringify(proposal.sections)}${comparable}`,
    });
    await this.proposals.saveSalesBrief(leadId, data);
    await this.generations.create({ leadId, kind: 'brief', model: this.ai.model, tokensIn, tokensOut, versions: {} });
    return data;
  }

  // Presentation-ready slide deck — generated from the proposal AND the sales brief so the deck and the
  // brief tell the SAME story (talking points, objections, comparable work). Generates the brief first
  // if it's missing. Slides are branded/rendered by the frontend (Riseup logo, tables, comparable work).
  async generatePitchDeck(leadId: string) {
    const lead = await this.leads.findByIdOrFail(leadId);
    let proposal = await this.proposals.getForLead(leadId);
    if (!proposal.salesBrief || !Object.keys(proposal.salesBrief).length) {
      await this.generateSalesBrief(leadId);
      proposal = await this.proposals.getForLead(leadId);
    }
    const brief = proposal.salesBrief ?? {};

    const { data, tokensIn, tokensOut } = await this.ai.json<Record<string, unknown>>({
      label: 'pitch-deck',
      system: SCAFFOLD,
      maxTokens: 4500,
      prompt:
        'Turn the proposal AND the sales brief below into a branded, presentation-ready pitch deck as JSON: ' +
        '{"slides":[{title, subtitle?, bullets?, table?, cover?}]}. The deck MUST stay aligned with the sales ' +
        'brief — same story, same talking points.\n' +
        '- 10-13 slides covering, in order: cover (cover:true, slide 1 — the project + client), credibility, ' +
        'the problem, the solution, how it works, architecture, delivery phases, PROOF (a slide whose bullets ' +
        'are the comparable past Riseup projects from the brief), the team, the tech stack, an OBJECTION-HANDLING ' +
        'slide (use "table":{"headers":["Objection","Response"],"rows":[["…","…"]]} built from the brief\'s objections), ' +
        'milestone pricing, and a closing next-step slide (use the brief\'s suggestedClose).\n' +
        '- Each slide has a short punchy title, an optional one-line subtitle, and EITHER bullets (2-4 short ' +
        'strings) OR a table (headers + rows) — not both. cover=true only on slide 1.\n' +
        `Lead: "${lead.title}" for ${lead.company}. Template: ${lead.template}.\n` +
        `Proposal sections: ${JSON.stringify(proposal.sections)}\n` +
        `Sales brief: ${JSON.stringify(brief)}`,
    });
    await this.proposals.savePitchDeck(leadId, data);
    await this.generations.create({ leadId, kind: 'pitch', model: this.ai.model, tokensIn, tokensOut, versions: {} });
    return data;
  }
}

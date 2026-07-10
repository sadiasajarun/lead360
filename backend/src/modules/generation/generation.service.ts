import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../infrastructure/ai/ai.service';
import { LeadService } from '../lead/lead.service';
import { RequirementService } from '../requirement/requirement.service';
import { ProposalService } from '../proposal/proposal.service';
import { KbService } from '../kb/kb.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { RateCardService } from '../rate-card/rate-card.service';
import { BudgetService, GeneratedBudgetLine } from '../budget/budget.service';
import { GenerationRepository } from './generation.repository';
import { BudgetCurrency, Seniority } from '../../common/enums';

const SCAFFOLD =
  "You are Riseup Labs' proposal writer. Ground every proposal ONLY in Riseup Labs' own past work — " +
  'never invent clients or reuse any other company\'s sample data. Sections must be concise and client-ready.';

const SENIORITIES = new Set<string>(['senior', 'mid', 'junior']);

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
  ) {}

  // Attach real riseuplabs.com links to the AI's comparable-project picks: exact/substring title
  // match first, then best word-overlap match against the scraped portfolio. Anything still
  // unmatched falls back to the public portfolio index so every card is clickable.
  private static readonly PORTFOLIO_INDEX = 'https://riseuplabs.com/portfolio/';

  private async linkComparables(data: Record<string, unknown>) {
    const items = data.comparableProjects as { name?: string; blurb?: string; url?: string }[] | undefined;
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
    const CATEGORY: Record<string, string> = {
      global: 'Global', local: 'Local', agency: 'Agency', design_portfolio: 'Design Portfolio',
    };
    const groundingBlock = await this.groundingFor(lead.title, brief, CATEGORY[lead.template]);

    const { data, tokensIn, tokensOut } = await this.ai.json<Record<string, unknown>>({
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

  // Regenerate ONLY the budget (resource plan), optionally steered by plain-English instructions.
  async regenerateBudget(leadId: string, instructions?: string) {
    const lead = await this.leads.findByIdOrFail(leadId);
    const req = await this.requirements.getForLead(leadId);
    const brief = req?.sourceText ?? '(no brief text provided)';
    const groundingBlock = await this.groundingFor(lead.title, brief);
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
      system: SCAFFOLD,
      maxTokens: 3000,
      prompt:
        `Rewrite ONLY the "${label}" section of a Riseup proposal. Return JSON {"value": <the SAME JSON shape/type ` +
        `as the current value>} — a string stays a string; an array-of-objects keeps the same field names.\n` +
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

    const { data, tokensIn, tokensOut } = await this.ai.json<{ lines?: { department?: string; role?: string; seniority?: string; units?: number; days?: number }[] }>({
      maxTokens: 4000,
      prompt:
        'Produce a delivery resource plan for this project as JSON: {"lines":[{department, role, seniority, units, days}]}.\n' +
        '- Pick roles from Riseup\'s rate card below (use the closest match). seniority ∈ {senior, mid, junior}.\n' +
        '- units = number of people in that role; days = working days each. Keep it realistic (units 1-10, days 1-180).\n' +
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
      const days = Math.min(180, Math.max(1, Math.round(Number(l.days) || 1)));
      const dayRateCents = await this.rateCards.rateFor(role, seniority, currency); // rate from the card, not the LLM
      if (dayRateCents === null) {
        // §10: never invent a price. A role missing from the rate card (built from Riseup's real
        // budget documents) is dropped and logged instead of getting a made-up rate.
        this.logger.warn(`Budget line skipped — "${role}" is not on the rate card (no invented rates).`);
        continue;
      }
      lines.push({ department: (l.department || 'Development').trim(), role, seniority, units, days, dayRateCents });
      planForLearning.push({ role, days });
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

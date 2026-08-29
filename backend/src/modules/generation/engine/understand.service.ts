import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AiService } from '../../../infrastructure/ai/ai.service';
import { weeksUntilDeadline } from '../../../common/utils/time.util';
import { UNDERSTAND_SYSTEM } from './system-prompts';
import type { Audience, ProjectType, TemplateCategory } from '../blocks/block.types';
import type { Intent, ScopeSize, Surface, SurfaceKind, Usage } from './intent.types';

export { UNDERSTAND_SYSTEM };

export interface UnderstandInput {
  /** Effective brief: pasted brief + confirmed readiness Q&A + extracted upload text. */
  brief: string;
  template: TemplateCategory;
  /** Wizard hints (Project Context step). The model may refine, not ignore. */
  projectType?: ProjectType;
  audience?: Audience;
  /** Generation date (ISO) — the "today" a stated calendar deadline is measured against. */
  todayISO?: string;
}

const PROJECT_TYPES: ProjectType[] = ['new_build', 'enhance', 'issue_fix', 'deploy', 'assessment'];
const AUDIENCES: Audience[] = ['technical', 'business', 'mixed'];
const SURFACE_KINDS: SurfaceKind[] = ['web', 'mobile', 'admin', 'api', 'portal', 'other'];
const SCOPE_SIZES: ScopeSize[] = ['small', 'medium', 'large'];

/**
 * Understand pass — turns the effective brief (+ wizard context) into a structured
 * `Intent`. Pure extraction: never invents; leaves fields empty when the brief
 * doesn't support them. This is the front of the generation engine.
 */
@Injectable()
export class UnderstandService {
  private readonly logger = new Logger(UnderstandService.name);

  constructor(private readonly ai: AiService) {}

  async understand(input: UnderstandInput): Promise<{ intent: Intent; usage: Usage }> {
    if (!this.ai.enabled) throw new ServiceUnavailableException('AI_API_KEY is not configured');
    const brief = (input.brief ?? '').trim();

    const { data, tokensIn, tokensOut } = await this.ai.json<Partial<Intent>>({
      label: 'understand',
      system: UNDERSTAND_SYSTEM,
      maxTokens: 2500,
      prompt:
        'Return a JSON object with EXACTLY these keys:\n' +
        '- projectType: one of new_build | enhance | issue_fix | deploy | assessment (brand-new build / ' +
        'enhancing an existing system / fixing specific issues / deployment or migration / an ADVISORY or ' +
        'feasibility engagement where the client asks Riseup to assess options and RECOMMEND an approach rather ' +
        'than build a full system — e.g. "assess and recommend VR vs AR". Pick assessment only when the ask is ' +
        'clearly advisory, not a build)\n' +
        '- audience: one of technical | business | mixed (the point of contact\'s orientation)\n' +
        '- domain: short phrase for the product domain (e.g. "air ticketing / travel")\n' +
        '- summary: ONE sentence — what is being built and for whom\n' +
        '- surfaces: array of { name, kind (web|mobile|admin|api|portal|other), note? } — the product surfaces\n' +
        '- modules: string[] — the major TOP-LEVEL feature groups (aim for 6–12). Group related screens, toggles, ' +
        'states and settings under their parent module; do NOT list individual screens, toggles, empty/error states, ' +
        'copy/notification tweaks or micro-features as separate modules (that inflates the apparent scope). ' +
        'EXCEPTION: when the brief enumerates uploaded requirement FILES or an explicit set of departments/modules ' +
        '(e.g. an "UPLOADED REQUIREMENT FILES" list), output ONE module per file/department and KEEP THEM ALL — ' +
        'never drop the ones listed last or merge them away.\n' +
        '- userRoles: string[] — the distinct user types in the system (e.g. Customer, Agent, Admin)\n' +
        '- integrations: string[] — third-party services/APIs to integrate\n' +
        '- platforms: string[] — target platforms (iOS, Android, Web, …)\n' +
        '- pains: string[] — the client\'s stated problems/goals\n' +
        '- desiredOutcome: string — the concrete business outcome\n' +
        '- constraints: string[] — hard constraints (mandated stack, compliance, deadline) if any. ALSO, when the ' +
        'brief says some modules/departments are ALREADY BUILT or need only hosting, ERP connection, or role-based ' +
        'access (not a fresh build), record that here verbatim as "Already built (integration only): <module names>" ' +
        'so effort sizing treats those as light integration work.\n' +
        '- outOfScope: string[] — anything explicitly excluded\n' +
        '- scopeSize: one of small | medium | large — your read of overall size\n' +
        '- timelineWeeks: number | null — a stated DURATION for the build, in weeks. Convert working-day durations ÷5 ' +
        '("15 days" → 3, "10 working days" → 2), weeks as-is ("6-8 weeks" → 7), months ×4 ("1 month" → 4). ' +
        'null when the brief gives NO duration — a calendar deadline goes in deadlineDate instead, and you must NOT invent a duration. ' +
        'CRITICAL: only a duration for THIS engagement counts. A duration belonging to a SUPPLIER/VENDOR QUOTATION attached ' +
        'to the brief — hardware delivery lead time ("delivery within 05-07 working days"), offer validity, warranty period, ' +
        'or payment/shipping terms — is that supplier term, NOT the project timeline. The same applies to an on-site installation, commissioning or deployment window: it is one activity inside the plan, never the plan. Ignore those and return null unless the ' +
        'client or sales rep states a delivery window for the work itself.\n' +
        '- deadlineDate: string | null — a stated absolute calendar DEADLINE as ISO yyyy-mm-dd ("by 2 September 2026" → "2026-09-02", ' +
        '"must launch before Sept 2, 2026" → "2026-09-02"). null if no absolute date is given. A date on a supplier quotation (quotation date, offer expiry) is NOT a project deadline. Do NOT compute weeks yourself — the app does that.\n' +
        '- clientSignatory: { "name": string, "title": string } | null — a person the CLIENT will sign as, if the brief names one ' +
        '("Signature — Name: Mohamed Ammi, Title/Designation: Owner"). null otherwise.\n' +
        '- providerSignatory: { "name": string, "title": string } | null — a Riseup Labs signatory if the brief names one ' +
        '("From Riseup Labs: Enamul Hoque Ratul, Head of Operations"). null otherwise.\n' +
        "- budgetCents: number | null - the budget the CLIENT stated, in MINOR units (cents/poisha: $5,000 -> 500000, " +
        "BDT 4,00,000 -> 40000000). Read intake fields such as \"Client Budget\", and plain statements " +
        "(\"our budget is around $10k\", \"we can spend up to 5 lakh\"). null when the brief states no budget - " +
        "\"Not Disclosed\", \"Not Discussed\", \"TBD\" and silence ALL mean null. NEVER estimate or infer a budget " +
        "from the scope: this field is what the CLIENT said, nothing else.\n" +
        "- budgetCurrency: string | null - ISO code the budget was written in (USD, BDT). null if no budget.\n" +
        "- budgetHardness: hard | soft | null - hard when it reads as a cap or fixed price " +
        "(budget is $5,000, maximum, not more than, fixed price); soft when it is a range or " +
        "approximation (around, roughly, $8-12k, estimated). null if no budget.\n" +
        (input.projectType ? `The sales team indicated projectType = ${input.projectType}; respect it unless the brief clearly contradicts.\n` : '') +
        (input.audience ? `The sales team indicated audience = ${input.audience}; respect it unless the brief clearly contradicts.\n` : '') +
        // Cap generous enough to hold a multi-file platform brief (many department documents) without dropping
        // the files that sort last; the up-front manifest guarantees module coverage even beyond this bound.
        `Template category: ${input.template}.\n\nBrief:\n${brief.slice(0, 48000)}`,
    });

    return { intent: this.normalize(data ?? {}, input), usage: { tokensIn, tokensOut } };
  }

  /** Coerce the model output into a clean, fully-typed Intent (defaults where missing). */
  private normalize(d: Partial<Intent>, input: UnderstandInput): Intent {
    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : [];
    const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
      typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const posInt = (v: unknown): number | undefined =>
      typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v) : undefined;
    // A budget only counts when the client actually stated one. Hardness defaults to `soft`: fitting a plan
    // to a number the client merely floated is worse than sanity-checking the plan against it.
    const budgetCents = posInt((d as { budgetCents?: unknown }).budgetCents);
    const budgetHardness = budgetCents
      ? ((d as { budgetHardness?: unknown }).budgetHardness === 'hard' ? 'hard' : 'soft')
      : undefined;
    const budgetCurrency = budgetCents ? str((d as { budgetCurrency?: unknown }).budgetCurrency).toUpperCase() || undefined : undefined;

    // Timeline: a calendar DEADLINE date (hard) wins over a stated duration. Convert the date → working weeks
    // against "today"; that pinned number is what the plan is crashed to (never stretched).
    const rawDeadline = str((d as { deadlineDate?: unknown }).deadlineDate);
    const deadlineDate = /^\d{4}-\d{2}-\d{2}/.test(rawDeadline) ? rawDeadline.slice(0, 10) : undefined;
    const deadlineWeeks = deadlineDate ? weeksUntilDeadline(deadlineDate, input.todayISO) : undefined;
    const timelineWeeks = deadlineWeeks ?? posInt((d as { timelineWeeks?: unknown }).timelineWeeks);
    const timelineHard = !!(deadlineDate && deadlineWeeks);

    const sig = (v: unknown): { name: string; title?: string } | undefined => {
      const o = v as { name?: unknown; title?: unknown } | null;
      const name = str(o?.name);
      return name ? { name, title: str(o?.title) || undefined } : undefined;
    };
    const clientSignatory = sig((d as { clientSignatory?: unknown }).clientSignatory);
    const providerSignatory = sig((d as { providerSignatory?: unknown }).providerSignatory);

    const surfaces: Surface[] = Array.isArray(d.surfaces)
      ? d.surfaces
          .filter((s): s is Surface => !!s && typeof (s as Surface).name === 'string')
          .map((s) => ({
            name: (s.name as string).trim(),
            kind: oneOf<SurfaceKind>((s as Surface).kind, SURFACE_KINDS, 'other'),
            note: typeof (s as Surface).note === 'string' ? (s as Surface).note : undefined,
          }))
      : [];

    // Score scope by SUBSTANCE — distinct surfaces, user roles, integrations, and top-level feature count —
    // NOT raw module count (RC1). A long list of toggles/screens must not read as a bigger project; surfaces
    // and user roles are the strongest signal of true breadth.
    const modules = strArr(d.modules);
    const integrations = strArr(d.integrations);
    const userRoles = strArr(d.userRoles);
    const substance = surfaces.length * 2 + userRoles.length * 1.5 + integrations.length + Math.min(modules.length, 12) * 0.5;
    const inferredScope: ScopeSize =
      surfaces.length >= 3 || userRoles.length >= 4 || substance >= 15
        ? 'large'
        : surfaces.length <= 1 && userRoles.length <= 1 && integrations.length <= 2 && modules.length <= 6
          ? 'small'
          : 'medium';
    // The model's own read may REFINE by one step but must not INFLATE past the substance signal: a brief the
    // substance reads as small/medium can't jump to large just because it enumerated many micro-features.
    const rawModelScope = (d as { scopeSize?: unknown }).scopeSize;
    const modelScope: ScopeSize | undefined =
      typeof rawModelScope === 'string' && (SCOPE_SIZES as readonly string[]).includes(rawModelScope) ? (rawModelScope as ScopeSize) : undefined;
    let scopeSize: ScopeSize = inferredScope;
    if (modelScope === 'large' && inferredScope === 'medium') scopeSize = 'large';
    else if (modelScope === 'small' && inferredScope === 'medium') scopeSize = 'small';

    return {
      projectType: oneOf(d.projectType, PROJECT_TYPES, input.projectType ?? 'new_build'),
      audience: oneOf(d.audience, AUDIENCES, input.audience ?? 'mixed'),
      domain: str(d.domain),
      summary: str(d.summary),
      surfaces,
      modules,
      userRoles,
      integrations,
      platforms: strArr(d.platforms),
      pains: strArr(d.pains),
      desiredOutcome: str(d.desiredOutcome),
      constraints: strArr(d.constraints),
      outOfScope: strArr(d.outOfScope),
      scopeSize,
      timelineWeeks,
      deadlineDate,
      timelineHard,
      clientSignatory,
      providerSignatory,
      budgetCents,
      budgetCurrency,
      budgetHardness,
    };
  }
}

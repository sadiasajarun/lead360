import { Injectable, Logger } from '@nestjs/common';
import { BudgetService } from '../budget/budget.service';
import { ProposalService } from '../proposal/proposal.service';
import { RequirementService } from '../requirement/requirement.service';
import { UserService } from '../user/user.service';
import { PdfService } from '../../infrastructure/pdf/pdf.service';
import { StorageService } from '../../infrastructure/s3/storage.service';
import { KbService } from '../kb/kb.service';
import { SettingsService } from '../settings/settings.service';
import { renderProposalHtml } from '../../common/utils/proposal-html.util';

// Maps a lead's template to the Database category label used by the seeded catalog + filters.
const CATEGORY_LABEL: Record<string, string> = {
  global: 'Global',
  agency: 'Agency',
  local: 'Local',
  design_portfolio: 'Design Portfolio',
};

export interface LeadApprovedEvent {
  leadId: string;
  title: string;
  template: string;
  company?: string;
  submittedById?: string;
}

export type DeliverableStep = 'requirement' | 'budget' | 'proposal';

/**
 * Per-deliverable outcome.
 *  - `saved`   — filed into the Database and indexed into RAG
 *  - `empty`   — nothing to file yet (no brief, no budget lines, no proposal sections)
 *  - `skipped` — not applicable to this template (combined templates have no separate budget)
 *  - `failed`  — threw; see `errors[step]`
 */
export type DeliverableOutcome = 'pending' | 'saved' | 'empty' | 'skipped' | 'failed';

export interface DeliverablesResult {
  leadId: string;
  requirement: DeliverableOutcome;
  budget: DeliverableOutcome;
  proposal: DeliverableOutcome;
  errors: Partial<Record<DeliverableStep, string>>;
}

// On approval, produce the client deliverables (budget .xlsx + proposal .pdf) and file them into
// the Projects > Database library so they are viewable/downloadable.
@Injectable()
export class DeliverablesService {
  private readonly logger = new Logger(DeliverablesService.name);

  constructor(
    private readonly budgets: BudgetService,
    private readonly proposals: ProposalService,
    private readonly requirements: RequirementService,
    private readonly users: UserService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
    private readonly kb: KbService,
    private readonly settings: SettingsService,
  ) {}

  // Combined templates (Agency / Design Portfolio) carry the budget inside the proposal as the
  // Financial Proposal section — the Database has no Budget sub-nav for them, so no budget file.
  private static readonly COMBINED = new Set(['agency', 'design_portfolio']);

  /** Admin-uploaded logo (Settings → Branding) as a data URI, or undefined for the bundled mark. */
  private async brandLogoDataUri(): Promise<string | undefined> {
    const f = await this.settings.getLogo().catch(() => null);
    return f ? `data:${f.mime};base64,${f.buffer.toString('base64')}` : undefined;
  }

  /**
   * File a lead's client requirement, budget and proposal into the Database.
   *
   * Every step is isolated. Previously these ran as a bare sequence, so one failure — a Puppeteer
   * crash while rendering the proposal PDF, say — silently aborted the steps after it. The symptom
   * was a lead whose Budget was archived but whose Requirement and Proposal never appeared, with
   * nothing surfaced to the user because the listener swallows the error.
   *
   * Order runs cheapest-and-most-reliable first: the requirement is already-stored files, the budget
   * is in-process ExcelJS, and the proposal needs a headless browser. A failure late in that order
   * can no longer cost us the work that already succeeded.
   *
   * `addGeneratedDoc` upserts by title, so re-running this is safe and never duplicates.
   */
  async buildForLead(evt: LeadApprovedEvent): Promise<DeliverablesResult> {
    const category = CATEGORY_LABEL[evt.template] ?? 'Global';
    // Owner shown in the Database = the sales user who ran the lead (fallback: company default).
    const owner = evt.submittedById
      ? (await this.users.findByIdOrFail(evt.submittedById).catch(() => null))?.name ?? 'Riseup Labs'
      : 'Riseup Labs';

    // Combined templates carry the budget inside the proposal, so there is no separate budget file.
    const combined = DeliverablesService.COMBINED.has(evt.template);

    const result: DeliverablesResult = {
      leadId: evt.leadId,
      requirement: 'pending',
      budget: combined ? 'skipped' : 'pending',
      proposal: 'pending',
      errors: {},
    };

    const step = async (name: DeliverableStep, fn: () => Promise<'saved' | 'empty'>) => {
      try {
        result[name] = await fn();
      } catch (err) {
        result[name] = 'failed';
        result.errors[name] = err instanceof Error ? err.message : String(err);
        this.logger.error(`Lead ${evt.leadId}: ${name} deliverable failed — ${result.errors[name]}`);
      }
    };

    await step('requirement', () => this.buildRequirement(evt, category, owner));
    if (!combined) await step('budget', () => this.buildBudget(evt, category, owner));
    await step('proposal', () => this.buildProposal(evt, category, owner));

    const failed = Object.keys(result.errors);
    if (failed.length) {
      this.logger.error(
        `Lead ${evt.leadId}: ${failed.length}/${combined ? 2 : 3} deliverables failed (${failed.join(', ')}). ` +
          `The rest were filed. Retry with POST /leads/${evt.leadId}/deliverables/rebuild once the cause is fixed.`,
      );
    }
    return result;
  }

  // File the lead's client requirement into the Database: each uploaded brief attachment becomes a
  // Database entry (referencing its existing stored file); a pasted-text-only brief is stored as .txt.
  // All of it is (re)indexed into RAG so approved deals keep improving future generations.
  private async buildRequirement(evt: LeadApprovedEvent, category: string, owner: string): Promise<'saved' | 'empty'> {
    const req = await this.requirements.getForLead(evt.leadId).catch(() => null);
    if (!req) return 'empty';

    const files = req.files ?? [];
    for (const f of files) {
      await this.kb.addGeneratedDoc({
        title: `${evt.title} - ${f.name}`,
        category,
        section: 'Client requirement',
        fileType: (f.name.split('.').pop() || 'file').toLowerCase(),
        storageKey: f.key,
        leadId: evt.leadId,
        owner,
      });
    }

    if (!files.length && req.sourceText?.trim()) {
      const key = `deliverables/${evt.leadId}/client-requirement.txt`;
      await this.storage.upload(key, Buffer.from(req.sourceText, 'utf8'), 'text/plain');
      await this.kb.addGeneratedDoc({
        title: `${evt.title} - Client requirement.txt`,
        category,
        section: 'Client requirement',
        fileType: 'txt',
        storageKey: key,
        leadId: evt.leadId,
        owner,
      });
      return 'saved';
    }
    return files.length ? 'saved' : 'empty';
  }

  private async buildBudget(evt: LeadApprovedEvent, category: string, owner: string): Promise<'saved' | 'empty'> {
    // A lead with no budget row at all throws NotFound — that is "nothing to file", not a failure.
    const existing = await this.budgets.getForLead(evt.leadId).catch(() => null);
    if (!existing?.budget?.lines?.length) return 'empty';
    const xlsx = await this.budgets.exportXlsx(evt.leadId);
    const key = `deliverables/${evt.leadId}/budget.xlsx`;
    await this.storage.upload(
      key,
      xlsx,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    await this.kb.addGeneratedDoc({
      title: `${evt.title} - Budget.xlsx`,
      category,
      section: 'Budget',
      fileType: 'xlsx',
      storageKey: key,
      leadId: evt.leadId,
      owner,
    });
    return 'saved';
  }

  private async buildProposal(evt: LeadApprovedEvent, category: string, owner: string): Promise<'saved' | 'empty'> {
    // Only "no proposal row yet" is an empty result. A rendering or upload error must propagate so
    // the caller records it as `failed` rather than silently pretending nothing needed filing.
    const proposal = await this.proposals.getForLead(evt.leadId).catch(() => null);
    const sections: Record<string, unknown> = proposal?.sections ?? {};
    if (!Object.keys(sections).length) return 'empty';

    const pdf = await this.pdf.htmlToPdf(
      renderProposalHtml({
        logoDataUri: await this.brandLogoDataUri(),
        title: evt.title, company: evt.company ?? '', template: evt.template, sections,
      }),
    );
    const key = `deliverables/${evt.leadId}/proposal.pdf`;
    await this.storage.upload(key, pdf, 'application/pdf');
    await this.kb.addGeneratedDoc({
      title: `${evt.title} - Proposal.pdf`,
      category,
      section: 'Proposal',
      fileType: 'pdf',
      storageKey: key,
      leadId: evt.leadId,
      owner,
    });
    return 'saved';
  }

  // (proposal HTML rendering moved to common/utils/proposal-html.util.ts — shared with the PDF endpoint)
}

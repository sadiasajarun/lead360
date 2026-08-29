import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../infrastructure/ai/ai.service';
import { ProposalService } from '../proposal/proposal.service';
import type { Proposal } from '../proposal/proposal.entity';
import { BudgetRepository } from '../budget/budget.repository';
import { ProjectCaseRepository } from './project-case.repository';
import { extractCaseFromLead } from './case-extract';

type IngestResult = 'created' | 'updated' | 'skipped';

/**
 * ProjectCaseIngestService (Learning Engine, Phase 2b) — turns delivered proposals into structured, embedded
 * ProjectCases. `ingestFromProposal` is the reusable unit (also called by the Phase 3 learning-loop hook);
 * `backfillAll` runs it over every existing proposal (the ~59 in-app requirement→proposal pairs are the
 * primary fuel, per the Phase 0 findings). Idempotent: re-running upserts by `source_lead_id`.
 */
@Injectable()
export class ProjectCaseIngestService {
  private readonly logger = new Logger(ProjectCaseIngestService.name);

  constructor(
    private readonly cases: ProjectCaseRepository,
    private readonly proposals: ProposalService,
    private readonly budgets: BudgetRepository,
    private readonly ai: AiService,
  ) {}

  /** Extract → embed → upsert a case for one loaded proposal (with `.lead` + `.internalCalc`). */
  async ingestFromProposal(proposal: Proposal): Promise<IngestResult> {
    const lead = proposal.lead;
    if (!lead) return 'skipped';
    // The budget SHEET is the universal source of the costed team + timeline + budget (present for both the
    // block and flat proposal formats), so load it and let the extractor prefer it.
    const budget = await this.budgets.findByLead(lead.id).catch(() => null);
    const draft = extractCaseFromLead(
      { id: lead.id, template: String(lead.template), title: lead.title, budgetCurrency: String(lead.budgetCurrency) },
      proposal.sections,
      proposal.internalCalc ?? null,
      budget ? { currency: budget.currency, lines: budget.lines, milestones: budget.milestones } : null,
    );
    if (!draft) return 'skipped'; // no team/timeline in budget, plan, or blocks — nothing to learn

    const existing = await this.cases.findBySourceLead(lead.id);
    const saved = existing ? await this.cases.update(existing.id, draft.fields) : await this.cases.create(draft.fields);
    if (!saved) return 'skipped';

    // Embed the case's semantic text (domain/modules/stack) for hybrid retrieval. Best-effort.
    if (this.ai.enabled && draft.embedText.trim()) {
      try {
        const [vec] = await this.ai.embed([draft.embedText]);
        if (vec) await this.cases.saveEmbedding(saved.id, vec);
      } catch (e) {
        this.logger.warn(`Case embed skipped for lead ${lead.id}: ${String(e)}`);
      }
    }
    return existing ? 'updated' : 'created';
  }

  /** Phase 3 hook: (re)ingest a single lead by id (e.g. when it is accepted/won). */
  async ingestLead(leadId: string): Promise<IngestResult> {
    const proposals = await this.proposals.listAllWithCalc();
    const p = proposals.find((x) => x.leadId === leadId);
    return p ? this.ingestFromProposal(p) : 'skipped';
  }

  /** One-time / on-demand backfill over every proposal in the DB. */
  async backfillAll(): Promise<{ total: number; created: number; updated: number; skipped: number }> {
    await this.cases.ensureVectorColumn(768); // safe if the migration hasn't run yet
    const proposals = await this.proposals.listAllWithCalc();
    let created = 0, updated = 0, skipped = 0;
    for (const p of proposals) {
      try {
        const r = await this.ingestFromProposal(p);
        if (r === 'created') created++;
        else if (r === 'updated') updated++;
        else skipped++;
      } catch (e) {
        this.logger.warn(`Case ingest failed for lead ${p.leadId}: ${String(e)}`);
        skipped++;
      }
    }
    this.logger.log(`Project Case backfill: ${created} created, ${updated} updated, ${skipped} skipped of ${proposals.length}.`);
    return { total: proposals.length, created, updated, skipped };
  }
}

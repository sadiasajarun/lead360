import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TemplateType } from '../../common/enums';
import { Proposal } from './proposal.entity';
import { ProposalVersion } from './proposal-version.entity';
import { ProposalRepository } from './proposal.repository';
import { RegenerateProposalDto } from './dtos/proposal.dtos';
import { PdfService } from '../../infrastructure/pdf/pdf.service';
import { SettingsService } from '../settings/settings.service';
import { renderProposalHtml } from '../../common/utils/proposal-html.util';

@Injectable()
export class ProposalService {
  /** Admin-uploaded logo (Settings → Branding) as a data URI, or undefined for the bundled mark. */
  private async brandLogoDataUri(): Promise<string | undefined> {
    const f = await this.settings.getLogo().catch(() => null);
    return f ? `data:${f.mime};base64,${f.buffer.toString('base64')}` : undefined;
  }

  constructor(
    private readonly proposals: ProposalRepository,
    @InjectRepository(ProposalVersion)
    private readonly versions: Repository<ProposalVersion>,
    private readonly pdf: PdfService,
    private readonly settings: SettingsService,
  ) {}

  // Render the current proposal to the branded PDF (same format as the on-system deliverable).
  async renderPdf(leadId: string): Promise<{ buffer: Buffer; filename: string }> {
    const proposal = await this.proposals.findWithLead(leadId);
    if (!proposal) throw new NotFoundException(`Proposal for lead ${leadId} not found`);
    const lead = proposal.lead;
    const money = lead ? '$' + (Number(lead.valueCents) / 100).toLocaleString() : undefined;
    const buffer = await this.pdf.htmlToPdf(
      renderProposalHtml({
        logoDataUri: await this.brandLogoDataUri(),
        title: lead?.title ?? 'Proposal',
        company: lead?.company ?? '',
        template: String(proposal.template),
        valueLabel: money,
        contactName: lead?.contactName ?? undefined,
        sections: proposal.sections as Record<string, unknown>,
      }),
    );
    const safe = (lead?.title ?? 'Proposal').replace(/[^\w.\-]+/g, '_');
    return { buffer, filename: `${safe}-Proposal.pdf` };
  }

  // Replace a single section's content (per-section regenerate + manual edit). Value keeps its shape.
  async setSection(leadId: string, key: string, value: unknown) {
    const proposal = await this.getForLead(leadId);
    const sections = { ...(proposal.sections as Record<string, unknown>), [key]: value };
    return this.proposals.update(proposal.id, { sections });
  }

  // Remove a section entirely from the proposal.
  async removeSection(leadId: string, key: string) {
    const proposal = await this.getForLead(leadId);
    const sections = { ...(proposal.sections as Record<string, unknown>) };
    delete sections[key];
    return this.proposals.update(proposal.id, { sections });
  }

  async getForLead(leadId: string): Promise<Proposal> {
    const proposal = await this.proposals.findByLead(leadId);
    if (!proposal) throw new NotFoundException(`Proposal for lead ${leadId} not found`);
    return proposal;
  }

  // Create-or-update the proposal for a lead (used by the AI generation flow).
  async upsertForLead(leadId: string, template: TemplateType, sections: Record<string, unknown>) {
    const existing = await this.proposals.findByLead(leadId);
    if (existing) return this.proposals.update(existing.id, { sections });
    return this.proposals.create({ leadId, template, sections });
  }

  saveSalesBrief(leadId: string, salesBrief: Record<string, unknown>) {
    return this.updateField(leadId, { salesBrief });
  }

  savePitchDeck(leadId: string, pitchDeck: Record<string, unknown>) {
    return this.updateField(leadId, { pitchDeck });
  }

  private async updateField(leadId: string, patch: Partial<Proposal>) {
    const existing = await this.getForLead(leadId);
    return this.proposals.update(existing.id, patch);
  }

  // Snapshots the current sections into a new version and points the proposal at it.
  // NOTE: the actual AI drafting (Claude) that CHANGES the sections is wired in D5 chunk 5;
  // for now this preserves full version history end-to-end (the delta seam).
  async regenerate(leadId: string, _dto: RegenerateProposalDto) {
    const proposal = await this.getForLead(leadId);
    const nextNo = (proposal.versions?.length ?? 0) + 1;
    const version = await this.versions.save(
      this.versions.create({
        proposalId: proposal.id,
        versionNo: nextNo,
        sectionsJson: proposal.sections,
      }),
    );
    return this.proposals.update(proposal.id, { currentVersionId: version.id });
  }

  // Deliverable seams — content assembly + Puppeteer PDF land in chunk 5 / export step.
  async brief(leadId: string) {
    const proposal = await this.getForLead(leadId);
    return { leadId, sections: proposal.sections, kind: 'brief' };
  }

  async pitch(leadId: string) {
    const proposal = await this.getForLead(leadId);
    return { leadId, sections: proposal.sections, kind: 'pitch' };
  }
}

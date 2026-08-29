import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';

// Bump when the proposal renderer or its CSS changes, so cached PDFs re-render on the next download.
const RENDERER_VERSION = '2026-08-29-equipment-block';
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
import { renderProposalDocumentHtml } from '../../common/utils/proposal-render/render-proposal-document';
import { PROPOSAL_CSS } from '../../common/utils/proposal-render/proposal-css';
import { renderProposalDocx } from '../../common/utils/proposal-render/render-proposal-docx';
import type { Block, BlockType, ProposalDocument } from '../generation/blocks/block.types';
import { scaffoldBlock } from './block-edit';
import { buildIconMap } from '../../infrastructure/diagram/icon-resolver';

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
  //
  // The PDF is rendered lazily on the first Download click and cached against a content hash. Repeat
  // downloads reuse the cached bytes; any edit/regenerate changes the hash, so the NEXT download
  // re-renders. (PDF rendering is Puppeteer/Chromium — no AI tokens — so this only saves CPU/latency.)
  async renderPdf(leadId: string): Promise<{ buffer: Buffer; filename: string }> {
    const proposal = await this.proposals.findWithLead(leadId);
    if (!proposal) throw new NotFoundException(`Proposal for lead ${leadId} not found`);
    const lead = proposal.lead;
    const sections = proposal.sections as Record<string, unknown>;
    const safe = (lead?.title ?? 'Proposal').replace(/[^\w.\-]+/g, '_');
    const filename = `${safe}-Proposal.pdf`;

    // Hash the content that drives the PDF (sections + the lead fields the legacy path uses) AND the
    // renderer version — bumping RENDERER_VERSION invalidates every cached PDF after a template/CSS change.
    const hash = createHash('sha256')
      .update(JSON.stringify({ sections, t: lead?.title, c: lead?.company, v: lead?.valueCents, tpl: proposal.template, r: RENDERER_VERSION }))
      .digest('hex');

    const cached = await this.proposals.getPdfCache(proposal.id);
    if (cached?.pdfCache && cached.pdfHash === hash) {
      return { buffer: cached.pdfCache, filename };
    }

    let html: string;
    if (sections && Array.isArray((sections as { blocks?: unknown }).blocks)) {
      // New block-based proposal (ProposalDocument) → the locked Design-2 renderer.
      html = renderProposalDocumentHtml(sections as unknown as ProposalDocument);
    } else {
      // Legacy sections{} proposal → the original renderer (back-compat).
      const money = lead ? '$' + (Number(lead.valueCents) / 100).toLocaleString() : undefined;
      html = renderProposalHtml({
        logoDataUri: await this.brandLogoDataUri(),
        title: lead?.title ?? 'Proposal',
        company: lead?.company ?? '',
        template: String(proposal.template),
        valueLabel: money,
        contactName: lead?.contactName ?? undefined,
        sections,
      });
    }
    const buffer = await this.pdf.htmlToPdf(html);
    await this.proposals.savePdfCache(proposal.id, buffer, hash).catch(() => undefined); // cache is best-effort
    return { buffer, filename };
  }

  /**
   * Render the proposal as an editable Word (.docx) — same content as the PDF, but a clean editable
   * document (Word can't reproduce the locked pixel-perfect design). Block-based proposals only.
   */
  async renderDocx(leadId: string): Promise<{ buffer: Buffer; filename: string }> {
    const proposal = await this.proposals.findWithLead(leadId);
    if (!proposal) throw new NotFoundException(`Proposal for lead ${leadId} not found`);
    const sections = proposal.sections as Record<string, unknown>;
    const safe = (proposal.lead?.title ?? 'Proposal').replace(/[^\w.\-]+/g, '_');
    if (!sections || !Array.isArray((sections as { blocks?: unknown }).blocks)) {
      throw new BadRequestException('This proposal predates the block format — regenerate it to enable Word export.');
    }
    // Rasterise each solution-architecture figure to a PNG (the same HTML/CSS the PDF uses) so Word shows
    // the EXACT PDF design instead of a fallback table.
    const doc = sections as unknown as ProposalDocument;
    const buffer = await renderProposalDocx(doc, async (block) => {
      const mini = { meta: doc.meta, blocks: [block], iconMap: doc.iconMap ?? {} } as ProposalDocument;
      const inner = renderProposalDocumentHtml(mini);
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>${PROPOSAL_CSS}\nhtml,body{margin:0;background:#fff}</style></head><body><div class="pdoc" style="width:900px;padding:14px;background:#fff">${inner}</div></body></html>`;
      const selector = block.type === 'processFlow' ? '.pf' : '.sa';
      const r = await this.pdf.htmlToPng(html, selector).catch(() => null);
      return r && r.width > 0 ? { data: r.png, width: r.width, height: r.height } : null;
    });
    return { buffer, filename: `${safe}-Proposal.docx` };
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

  // ---- Block editing (new block-based proposals) ---------------------------------------------
  // The design stays locked; these only change which blocks appear, their order, and their content.

  private async loadDoc(leadId: string): Promise<{ proposalId: string; doc: ProposalDocument }> {
    const proposal = await this.getForLead(leadId);
    const doc = proposal.sections as unknown as ProposalDocument;
    if (!doc || !Array.isArray(doc.blocks)) {
      throw new BadRequestException('This proposal has no editable blocks — regenerate it with the current engine first.');
    }
    return { proposalId: proposal.id, doc };
  }

  // Persist a mutated document, re-resolving the icon map so any new icon names render inline.
  private async saveDoc(proposalId: string, doc: ProposalDocument) {
    doc.iconMap = buildIconMap(doc);
    return this.proposals.update(proposalId, { sections: doc as unknown as Record<string, unknown> });
  }

  // Reorder blocks by id. Ids omitted from `order` are kept (appended) so a stale client can't drop them.
  async reorderBlocks(leadId: string, order: string[]) {
    const { proposalId, doc } = await this.loadDoc(leadId);
    const byId = new Map(doc.blocks.map((b) => [b.id, b]));
    const next: Block[] = [];
    for (const id of order) { const b = byId.get(id); if (b) { next.push(b); byId.delete(id); } }
    for (const b of byId.values()) next.push(b); // survivors keep their relative order
    doc.blocks = next;
    return this.saveDoc(proposalId, doc);
  }

  async removeBlock(leadId: string, blockId: string) {
    const { proposalId, doc } = await this.loadDoc(leadId);
    const next = doc.blocks.filter((b) => b.id !== blockId);
    if (next.length === doc.blocks.length) throw new NotFoundException('Block not found');
    doc.blocks = next;
    return this.saveDoc(proposalId, doc);
  }

  // Merge a content patch into one block (id/type are never overwritten).
  async updateBlock(leadId: string, blockId: string, patch: Record<string, unknown>) {
    const { proposalId, doc } = await this.loadDoc(leadId);
    const idx = doc.blocks.findIndex((b) => b.id === blockId);
    if (idx < 0) throw new NotFoundException('Block not found');
    const { id: _i, type: _t, ...safe } = patch;
    // A hand-edited block is locked from here on, so the next regeneration refreshes everything around it
    // but leaves this alone. Previously the edit was silently thrown away by the next regen or budget sync.
    // An explicit `locked` in the patch wins, so a lock can be RELEASED and the section handed back to the
    // engine — without this there was no way to ever unlock a block once it had been touched.
    const locked = typeof patch.locked === 'boolean' ? patch.locked : true;
    doc.blocks[idx] = { ...doc.blocks[idx], ...safe, locked } as Block;
    return this.saveDoc(proposalId, doc);
  }

  // Insert a scaffold block of `type` after `afterId` (or at the end when afterId is omitted).
  async insertBlock(leadId: string, type: BlockType, afterId?: string) {
    const { proposalId, doc } = await this.loadDoc(leadId);
    const block = scaffoldBlock(type);
    const at = afterId ? doc.blocks.findIndex((b) => b.id === afterId) : -1;
    if (afterId && at < 0) throw new NotFoundException('Anchor block not found');
    doc.blocks.splice(at < 0 ? doc.blocks.length : at + 1, 0, block);
    await this.saveDoc(proposalId, doc);
    return { block, proposal: await this.getForLead(leadId) };
  }

  // Change a block's type in place: replace it with a fresh scaffold of the new type at the same index.
  async changeBlockType(leadId: string, blockId: string, type: BlockType) {
    const { proposalId, doc } = await this.loadDoc(leadId);
    const idx = doc.blocks.findIndex((b) => b.id === blockId);
    if (idx < 0) throw new NotFoundException('Block not found');
    doc.blocks[idx] = { ...scaffoldBlock(type), id: blockId };
    return this.saveDoc(proposalId, doc);
  }

  async getForLead(leadId: string): Promise<Proposal> {
    const proposal = await this.proposals.findByLead(leadId);
    if (!proposal) throw new NotFoundException(`Proposal for lead ${leadId} not found`);
    return proposal;
  }

  /** True if a proposal already exists for the lead — used to tell a FIRST generation from a regeneration. */
  async existsForLead(leadId: string): Promise<boolean> {
    return !!(await this.proposals.findByLead(leadId));
  }

  // Internal-only cost breakdown (delegates to the repo's select:false column).
  setInternalCalc(leadId: string, calc: Record<string, unknown>) {
    return this.proposals.setInternalCalc(leadId, calc);
  }
  getInternalCalc(leadId: string) {
    return this.proposals.getInternalCalc(leadId);
  }

  // All proposals with lead + internalCalc — consumed by the Project Case backfill (learning engine).
  listAllWithCalc() {
    return this.proposals.findAllWithLeadAndCalc();
  }

  appendChange(leadId: string, entry: Record<string, unknown>) {
    return this.proposals.appendChange(leadId, entry);
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

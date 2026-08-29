import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaseService } from '../../core/base/base.service';
import { LeadStatus, RESUBMITTABLE, UserRole, resolveBudgetCurrency } from '../../common/enums';
import { Lead } from './lead.entity';
import { LeadRepository } from './lead.repository';
import { CreateLeadDto, LeadQueryDto, MarkLostDto } from './dtos/lead.dtos';

@Injectable()
export class LeadService extends BaseService<Lead> {
  constructor(
    private readonly leads: LeadRepository,
    private readonly events: EventEmitter2,
  ) {
    super(leads, 'Lead');
  }

  /**
   * Visibility, enforced in SQL (never in the client):
   *  - sales_pm: ONLY their own leads. Reps cannot see each other's pipelines.
   *  - admin: their own leads (any status) PLUS every lead that has entered the approval pipeline
   *    (i.e. anything not still an un-submitted `generated` draft).
   */
  search(query: LeadQueryDto, viewer?: { id: string; role: string }) {
    if (!viewer) return this.leads.search(query);
    const scope =
      viewer.role === UserRole.ADMIN
        ? { userId: viewer.id, adminView: true }
        : { userId: viewer.id }; // sales: own leads only
    return this.leads.search(query, scope);
  }

  /** Detail with the same visibility rules as `search` — a URL can't leak another rep's lead. */
  async findVisible(id: string, viewer: { id: string; role: string }) {
    const lead = await this.findByIdOrFail(id);
    const own = lead.submittedById === viewer.id;
    // "Entered the pipeline": submitted_at is set, OR the status is past draft. Both are checked —
    // the second covers rows created before submitted_at existed, and a `rejected` lead stays
    // visible to the admin who rejected it.
    const everSubmitted = !!lead.submittedAt || lead.status !== LeadStatus.GENERATED;
    const visible = viewer.role === UserRole.ADMIN ? own || everSubmitted : own;
    if (!visible) throw new ForbiddenException('You do not have access to this lead');
    return lead;
  }

  createFor(dto: CreateLeadDto, userId?: string) {
    return this.leads.create({
      ...dto,
      // BDT is only valid on a Local lead; every other template prices in USD (enforced server-side,
      // so a hand-crafted request can't smuggle a currency the template doesn't support).
      budgetCurrency: resolveBudgetCurrency(dto.template, dto.budgetCurrency),
      valueCents: String(dto.valueCents ?? 0),
      status: LeadStatus.GENERATED,
      submittedById: userId,
    });
  }

  /** Store the client's brand mark (Client & Brand step) as a CSP-safe data URI on the lead. */
  async setClientLogo(id: string, file: { buffer: Buffer; mimetype: string }): Promise<Lead | null> {
    await this.findByIdOrFail(id); // 404 if the lead is gone
    const clientLogoUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    return this.leads.update(id, { clientLogoUrl });
  }

  // Guard the status machine — only valid transitions are allowed.
  private async transition(id: string, from: LeadStatus[], to: LeadStatus, extra: Partial<Lead> = {}) {
    const lead = await this.findByIdOrFail(id);
    if (!from.includes(lead.status)) {
      throw new BadRequestException(`Cannot move a "${lead.status}" lead to "${to}"`);
    }
    return this.leads.update(id, { status: to, ...extra });
  }

  /**
   * Send for approval — Sales/PM only.
   *
   * An admin has nobody to submit to (they ARE the approver), so this rejects an admin caller
   * outright. Previously an admin submission auto-approved, which meant an admin could click
   * "Send for approval" on a lead they had just rejected and silently un-reject it.
   *
   * A rejected lead is resubmittable: the rep revises and sends it back to the queue.
   */
  async submit(id: string, isAdmin = false) {
    if (isAdmin) {
      throw new BadRequestException(
        'Admin leads do not need approval — mark the lead as sent when it is ready for the client.',
      );
    }
    return this.transition(id, RESUBMITTABLE, LeadStatus.PENDING_APPROVAL, { submittedAt: new Date() });
  }

  /**
   * Mark sent to client.
   *
   *  - Anyone: `approved -> sent` (the normal path, after the admin has verified it).
   *  - Admin, on their OWN lead: `generated -> sent` directly. Sending it is the approval, so we
   *    emit `lead.approved` to archive the deliverables — the status just skips `approved`.
   *
   * An admin cannot short-circuit another rep's draft: that must go through the queue.
   */
  async markSent(id: string, viewer: { id: string; role: string }) {
    const lead = await this.findByIdOrFail(id);

    if (lead.status === LeadStatus.APPROVED) {
      return this.transition(id, [LeadStatus.APPROVED], LeadStatus.SENT);
    }

    const adminOwnDraft =
      viewer.role === UserRole.ADMIN &&
      lead.submittedById === viewer.id &&
      lead.status === LeadStatus.GENERATED;

    if (adminOwnDraft) {
      // `submittedAt` is deliberately left null — it means "submitted for approval", and this lead
      // never was. Visibility still holds: the admin owns it, and its status is past `generated`.
      const updated = await this.transition(id, [LeadStatus.GENERATED], LeadStatus.SENT);
      await this.onApproved(id); // archive deliverables exactly as an approval would
      return updated;
    }

    throw new BadRequestException(`Cannot move a "${lead.status}" lead to "sent"`);
  }

  // Admin decisions (called by ApprovalService).
  async approve(id: string) {
    const lead = await this.transition(id, [LeadStatus.PENDING_APPROVAL], LeadStatus.APPROVED);
    await this.onApproved(id);
    return lead;
  }

  // Fired whenever a lead reaches Approved (queue approval OR admin auto-approve). A listener
  // generates the deliverables (budget xlsx + proposal pdf) and files them in the Database.
  private async onApproved(leadId: string) {
    const lead = await this.findByIdOrFail(leadId);
    this.events.emit('lead.approved', {
      leadId,
      title: lead.title,
      template: lead.template,
      company: lead.company,
      submittedById: lead.submittedById,
    });
  }

  /** Returned to Sales to revise. Keeps its own status so it never looks like a fresh draft. */
  reject(id: string) {
    return this.transition(id, [LeadStatus.PENDING_APPROVAL], LeadStatus.REJECTED);
  }

  async markLocked(id: string) {
    const updated = await this.transition(id, [LeadStatus.SENT], LeadStatus.LOCKED);
    // Locked auto-creates a Project — ProjectModule listens for this event (no circular import).
    this.events.emit('lead.locked', { leadId: id });
    return updated;
  }

  markLost(id: string, dto: MarkLostDto) {
    return this.transition(id, [LeadStatus.SENT], LeadStatus.LOST, {
      lossReason: dto.reason,
      lossNote: dto.note,
    });
  }
}

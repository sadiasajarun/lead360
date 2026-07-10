import { Injectable } from '@nestjs/common';
import { ApprovalRepository } from './approval.repository';
import { LeadService } from '../lead/lead.service';
import { LeadCommentService } from '../lead/lead-comment.service';
import { AuditService } from '../audit/audit.service';
import { ApprovalDecision, LeadStatus } from '../../common/enums';
import { ApproveDto, RejectDto } from './dtos/approval.dtos';

@Injectable()
export class ApprovalService {
  constructor(
    private readonly approvals: ApprovalRepository,
    private readonly leads: LeadService,
    private readonly audit: AuditService,
    private readonly comments: LeadCommentService,
  ) {}

  // The queue = leads awaiting verification (oldest first is handled by the list sort).
  queue() {
    return this.leads.search({ status: LeadStatus.PENDING_APPROVAL, limit: 100 });
  }

  async approve(leadId: string, adminId: string, dto: ApproveDto) {
    const lead = await this.leads.approve(leadId); // Pending -> Approved (guarded)
    await this.approvals.create({
      leadId,
      submittedAt: new Date(),
      decidedAt: new Date(),
      decidedById: adminId,
      decision: ApprovalDecision.APPROVED,
      note: dto.note,
    });
    // The decision note lands in the lead's comment thread so the rep sees it in context.
    await this.comments.addDecision(leadId, adminId, ApprovalDecision.APPROVED, dto.note);
    await this.audit.log({ actorId: adminId, action: 'approve', entity: 'Lead', entityId: leadId });
    return lead;
  }

  async reject(leadId: string, adminId: string, dto: RejectDto) {
    const lead = await this.leads.reject(leadId); // Pending -> Generated (back to Sales)
    await this.approvals.create({
      leadId,
      submittedAt: new Date(),
      decidedAt: new Date(),
      decidedById: adminId,
      decision: ApprovalDecision.REJECTED,
      note: dto.note,
    });
    await this.comments.addDecision(leadId, adminId, ApprovalDecision.REJECTED, dto.note);
    await this.audit.log({
      actorId: adminId,
      action: 'reject',
      entity: 'Lead',
      entityId: leadId,
      after: { note: dto.note },
    });
    return lead;
  }
}

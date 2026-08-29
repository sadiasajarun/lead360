import { Injectable } from '@nestjs/common';
import { BaseService } from '../../core/base/base.service';
import { ClientFeedback } from './client-feedback.entity';
import { ClientFeedbackRepository } from './client-feedback.repository';

@Injectable()
export class ClientFeedbackService extends BaseService<ClientFeedback> {
  constructor(private readonly feedbacks: ClientFeedbackRepository) {
    super(feedbacks, 'ClientFeedback');
  }

  addForLead(leadId: string, text: string) {
    return this.feedbacks.create({ leadId, text: text.trim(), status: 'open' });
  }

  listForLead(leadId: string) {
    return this.feedbacks.listForLead(leadId);
  }

  openForLead(leadId: string) {
    return this.feedbacks.openForLead(leadId);
  }

  /** Mark the given feedback items as consumed by a regeneration (kept for the audit trail). */
  async markApplied(ids: string[]) {
    if (ids.length) await this.feedbacks.markApplied(ids);
  }
}

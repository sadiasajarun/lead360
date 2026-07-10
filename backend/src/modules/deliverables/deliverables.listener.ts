import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DeliverablesService, LeadApprovedEvent } from './deliverables.service';

// Reacts to a lead being approved (queue approval OR admin auto-approve) and files its deliverables
// into the Database. Failures are logged, never thrown — approval must not fail if PDF export does.
@Injectable()
export class DeliverablesListener {
  private readonly logger = new Logger(DeliverablesListener.name);

  constructor(private readonly deliverables: DeliverablesService) {}

  @OnEvent('lead.approved')
  async onLeadApproved(evt: LeadApprovedEvent) {
    try {
      await this.deliverables.buildForLead(evt);
    } catch (err) {
      this.logger.error(`Failed to build deliverables for lead ${evt.leadId}: ${String(err)}`);
    }
  }
}

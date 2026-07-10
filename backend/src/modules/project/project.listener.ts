import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ProjectService } from './project.service';

// Auto-creates a Project when a lead is Locked (decoupled from LeadModule via events).
@Injectable()
export class ProjectListener {
  private readonly logger = new Logger(ProjectListener.name);

  constructor(private readonly projects: ProjectService) {}

  @OnEvent('lead.locked')
  async handleLeadLocked(payload: { leadId: string }) {
    try {
      await this.projects.createFromLead(payload.leadId);
    } catch (err) {
      this.logger.error(`Failed to auto-create project for lead ${payload.leadId}`, err as Error);
    }
  }
}

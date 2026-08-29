import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ProjectCaseIngestService } from './project-case-ingest.service';

/**
 * The learning loop (Learning Engine, Phase 3). When a lead is WON (Locked), its proposal is a real, accepted
 * delivery estimate — the highest-signal source of truth. (Re)ingest it into the Project Case store so future
 * comparable proposals learn from it. Decoupled from LeadModule via the existing `lead.locked` event.
 */
@Injectable()
export class ProjectCaseListener {
  private readonly logger = new Logger(ProjectCaseListener.name);

  constructor(private readonly ingest: ProjectCaseIngestService) {}

  @OnEvent('lead.locked')
  async handleLeadWon(payload: { leadId: string }) {
    try {
      const result = await this.ingest.ingestLead(payload.leadId);
      this.logger.log(`Learning loop: won lead ${payload.leadId} → project case ${result}.`);
    } catch (err) {
      // Best-effort — a learning failure must never affect the win/lock flow.
      this.logger.warn(`Learning loop skipped for won lead ${payload.leadId}: ${String(err)}`);
    }
  }
}

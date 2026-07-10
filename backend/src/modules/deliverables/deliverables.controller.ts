import { BadRequestException, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { LeadStatus, UserRole } from '../../common/enums';
import { LeadService } from '../lead/lead.service';
import { DeliverablesService } from './deliverables.service';

/** A lead only has deliverables worth filing once it has been approved (or sent by an admin). */
const ARCHIVABLE: LeadStatus[] = [
  LeadStatus.APPROVED,
  LeadStatus.SENT,
  LeadStatus.LOCKED,
  LeadStatus.LOST,
];

@ApiTags('deliverables')
@Controller('leads/:id/deliverables')
export class DeliverablesController {
  constructor(
    private readonly deliverables: DeliverablesService,
    private readonly leads: LeadService,
  ) {}

  /**
   * Re-file this lead's requirement, budget and proposal into the Database.
   *
   * Archiving happens automatically on approval, but any step can fail (a headless-browser crash
   * while rendering the proposal PDF is the usual culprit). Rather than force a reject/re-approve
   * cycle to retry, this re-runs the same build. `addGeneratedDoc` upserts by title, so re-running
   * replaces the previous file instead of duplicating it.
   */
  @Post('rebuild')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Re-file the requirement, budget and proposal into the Database (idempotent)' })
  @ApiResponse({ status: 201, description: 'Per-step outcome: saved | empty | skipped | failed' })
  @ApiResponse({ status: 400, description: 'Lead has not been approved yet' })
  @ApiResponse({ status: 403, description: 'Not your lead' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  async rebuild(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() viewer: { id: string; role: UserRole },
  ) {
    const lead = await this.leads.findVisible(id, viewer); // 403/404 enforced here
    if (!ARCHIVABLE.includes(lead.status)) {
      throw new BadRequestException(
        `A "${lead.status}" lead has no deliverables to file — approve it first.`,
      );
    }
    return this.deliverables.buildForLead({
      leadId: lead.id,
      title: lead.title,
      template: lead.template,
      company: lead.company,
      submittedById: lead.submittedById,
    });
  }
}

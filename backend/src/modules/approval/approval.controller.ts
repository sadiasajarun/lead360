import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { UserRole } from '../../common/enums';
import { ApprovalService } from './approval.service';
import { ApproveDto, RejectDto } from './dtos/approval.dtos';

@ApiTags('approvals')
@Controller('approvals')
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Pending-approval queue (Admin verifies each)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  queue() {
    return this.approvals.queue();
  }

  @Post(':leadId/approve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve a lead' })
  @ApiResponse({ status: 201, description: 'Approved' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  approve(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ApproveDto,
  ) {
    return this.approvals.approve(leadId, adminId, dto);
  }

  @Post(':leadId/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reject a lead (note required)' })
  @ApiResponse({ status: 201, description: 'Rejected + returned to Sales' })
  @ApiResponse({ status: 400, description: 'Missing note or invalid transition' })
  reject(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: RejectDto,
  ) {
    return this.approvals.reject(leadId, adminId, dto);
  }
}

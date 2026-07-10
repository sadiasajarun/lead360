import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Recent audit entries (approvals, settings changes, imports)' })
  @ApiResponse({ status: 200, description: 'OK' })
  list(@Query('limit') limit?: string) {
    return this.audit.recent(Math.min(Number(limit) || 50, 200));
  }
}

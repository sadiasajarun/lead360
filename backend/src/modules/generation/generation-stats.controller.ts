import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { GenerationService } from './generation.service';

// Global (non per-lead) AI token-usage & cost dashboard, surfaced on the Leads page.
@ApiTags('generation')
@Controller('generations')
export class GenerationStatsController {
  constructor(private readonly generation: GenerationService) {}

  @Get('stats')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'AI token-usage & cost dashboard: lifetime, average per proposal, today, yesterday' })
  @ApiResponse({ status: 200, description: 'Token/cost aggregates across all generations' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  stats() {
    return this.generation.tokenStats();
  }
}

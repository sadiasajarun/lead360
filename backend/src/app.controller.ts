import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from './core/decorators/public.decorator';

@ApiTags('health')
@Controller()
export class AppController {
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness/readiness probe' })
  @ApiResponse({ status: 200, description: 'Service is up' })
  health() {
    return { status: 'ok', service: 'lead360-backend', ts: new Date().toISOString() };
  }
}

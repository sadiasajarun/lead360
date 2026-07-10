import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { DeliveryService } from './delivery.service';

@ApiTags('delivery')
@Controller('leads/:id/delivery')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get()
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delivery status for a lead' })
  @ApiResponse({ status: 200, description: 'OK' })
  status(@Param('id', ParseUUIDPipe) id: string) {
    return this.delivery.getForLead(id);
  }

  @Post('record')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Record that the PDF + Excel were downloaded' })
  @ApiResponse({ status: 201, description: 'Recorded' })
  record(@Param('id', ParseUUIDPipe) id: string) {
    return this.delivery.recordDownload(id);
  }
}

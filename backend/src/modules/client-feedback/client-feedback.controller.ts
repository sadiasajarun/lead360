import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { ClientFeedbackService } from './client-feedback.service';
import { CreateClientFeedbackDto } from './dtos/client-feedback.dtos';

@ApiTags('client-feedback')
@Controller('leads/:id/feedback')
export class ClientFeedbackController {
  constructor(private readonly feedback: ClientFeedbackService) {}

  @Get()
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'List client feedback for a lead (newest first)' })
  @ApiResponse({ status: 200, description: 'Feedback list' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.feedback.listForLead(id);
  }

  @Post()
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Add a client feedback point — applied with top priority on the next regeneration' })
  @ApiResponse({ status: 201, description: 'Created' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  add(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateClientFeedbackDto) {
    return this.feedback.addForLead(id, dto.text);
  }

  @Delete(':feedbackId')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a client feedback item' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Feedback not found' })
  remove(@Param('feedbackId', ParseUUIDPipe) feedbackId: string) {
    return this.feedback.remove(feedbackId);
  }
}

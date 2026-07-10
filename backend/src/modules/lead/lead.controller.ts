import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { UserRole } from '../../common/enums';
import { LeadService } from './lead.service';
import { RequirementService, UploadedBrief } from '../requirement/requirement.service';
import { LeadCommentService } from './lead-comment.service';
import { AddCommentDto, CreateLeadDto, UpdateLeadDto, LeadQueryDto, MarkLostDto } from './dtos/lead.dtos';
import { UpsertRequirementDto, ResolveQueryDto } from '../requirement/dtos/requirement.dtos';

@ApiTags('leads')
@Controller('leads')
export class LeadController {
  constructor(
    private readonly leads: LeadService,
    private readonly requirements: RequirementService,
    private readonly comments: LeadCommentService,
  ) {}

  @Get(':id/comments')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Comment thread for a lead (includes admin approve/reject notes)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Not visible to this user' })
  listComments(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() viewer: { id: string; role: string }) {
    return this.comments.list(id, viewer);
  }

  @Post(':id/comments')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Post a comment on a lead' })
  @ApiResponse({ status: 201, description: 'Posted' })
  @ApiResponse({ status: 400, description: 'Empty comment' })
  @ApiResponse({ status: 403, description: 'Not visible to this user' })
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() viewer: { id: string; role: string },
  ) {
    return this.comments.add(id, viewer.id, dto.body, viewer);
  }

  @Get()
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'List leads (filter: status, template, q, page, limit)' })
  @ApiResponse({ status: 200, description: 'OK' })
  list(@Query() query: LeadQueryDto, @CurrentUser() viewer: { id: string; role: string }) {
    return this.leads.search(query, viewer);
  }

  @Post()
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a lead' })
  @ApiResponse({ status: 201, description: 'Created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  create(@Body() dto: CreateLeadDto, @CurrentUser('id') userId: string) {
    return this.leads.createFor(dto, userId);
  }

  @Delete(':id')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a lead (soft delete)' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.leads.remove(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lead detail (scoped: reps only see their own leads)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Not visible to this user' })
  @ApiResponse({ status: 404, description: 'Not found' })
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() viewer: { id: string; role: string }) {
    return this.leads.findVisible(id, viewer);
  }

  @Patch(':id')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a lead' })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({ status: 404, description: 'Not found' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(id, dto as never);
  }

  @Post(':id/requirement')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Upsert the requirement/brief for a lead' })
  @ApiResponse({ status: 201, description: 'Saved' })
  upsertRequirement(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertRequirementDto) {
    return this.requirements.upsert(id, dto);
  }

  @Post(':id/requirement/attachments')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })) // 10 MB cap
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Attach a brief document (PDF/DOCX/TXT); text is extracted into the brief' })
  @ApiResponse({ status: 201, description: 'Stored + parsed' })
  @ApiResponse({ status: 400, description: 'No file / too large' })
  uploadBriefAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedBrief,
  ) {
    return this.requirements.addAttachment(id, file);
  }

  @Get(':id/requirement')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get the requirement/brief (text + attachments) for a lead' })
  @ApiResponse({ status: 200, description: 'OK' })
  getRequirement(@Param('id', ParseUUIDPipe) id: string) {
    return this.requirements.getForLead(id);
  }

  @Get(':id/readiness')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Readiness score + AI-generated client queries (generated once from the brief)' })
  @ApiResponse({ status: 200, description: 'OK' })
  readiness(@Param('id', ParseUUIDPipe) id: string) {
    return this.requirements.readiness(id);
  }

  @Patch(':id/readiness/queries/:queryId')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Confirm/answer or reopen a client query; recomputes readiness' })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({ status: 404, description: 'Requirement not found' })
  resolveQuery(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('queryId') queryId: string,
    @Body() dto: ResolveQueryDto,
  ) {
    return this.requirements.resolveQuery(id, queryId, dto);
  }

  // ADMIN is allowed through the guard on purpose: the service answers with an explanatory 400
  // rather than a bare "Insufficient role" 403.
  @Post(':id/submit')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Send for approval (Generated | Rejected -> Pending). Sales/PM only.' })
  @ApiResponse({ status: 201, description: 'Submitted' })
  @ApiResponse({ status: 400, description: 'Invalid status transition, or an admin tried to submit' })
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('role') role: UserRole) {
    return this.leads.submit(id, role === UserRole.ADMIN);
  }

  @Post(':id/mark-sent')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Mark sent to client (Approved -> Sent; an admin may send their own Generated lead)' })
  @ApiResponse({ status: 201, description: 'Sent' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  markSent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() viewer: { id: string; role: UserRole },
  ) {
    return this.leads.markSent(id, viewer);
  }

  @Post(':id/mark-locked')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Mark locked / won (Sent -> Locked)' })
  @ApiResponse({ status: 201, description: 'Locked' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  markLocked(@Param('id', ParseUUIDPipe) id: string) {
    return this.leads.markLocked(id);
  }

  @Post(':id/mark-lost')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Mark lost (Sent -> Lost); loss reason required' })
  @ApiResponse({ status: 201, description: 'Lost' })
  @ApiResponse({ status: 400, description: 'Invalid status transition or missing reason' })
  markLost(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MarkLostDto) {
    return this.leads.markLost(id, dto);
  }
}

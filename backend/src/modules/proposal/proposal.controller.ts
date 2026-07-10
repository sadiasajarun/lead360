import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, StreamableFile } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { ProposalService } from './proposal.service';
import { RegenerateProposalDto } from './dtos/proposal.dtos';
import { UpdateSectionDto } from './dtos/update-section.dto';

@ApiTags('proposals')
@Controller('leads/:id/proposal')
export class ProposalController {
  constructor(private readonly proposals: ProposalService) {}

  @Get()
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get the proposal (current sections + versions)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 404, description: 'Not found' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.proposals.getForLead(id);
  }

  @Get('pdf')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Download the proposal as a branded PDF (the actual generated format)' })
  @ApiResponse({ status: 200, description: 'PDF' })
  @ApiResponse({ status: 404, description: 'Not generated yet' })
  async pdf(@Param('id', ParseUUIDPipe) id: string) {
    const { buffer, filename } = await this.proposals.renderPdf(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    });
  }

  @Put('section')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Manually edit a proposal section (keeps its shape)' })
  @ApiResponse({ status: 200, description: 'Saved' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'Proposal not found' })
  updateSection(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSectionDto) {
    return this.proposals.setSection(id, dto.key, dto.value);
  }

  @Delete('section/:key')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a proposal section' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Proposal not found' })
  deleteSection(@Param('id', ParseUUIDPipe) id: string, @Param('key') key: string) {
    return this.proposals.removeSection(id, key);
  }

  @Post('regenerate')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Regenerate (delta) — snapshots a version' })
  @ApiResponse({ status: 201, description: 'Regenerated' })
  regenerate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegenerateProposalDto) {
    return this.proposals.regenerate(id, dto);
  }
}

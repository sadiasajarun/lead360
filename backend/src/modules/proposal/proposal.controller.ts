import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, StreamableFile } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { ProposalService } from './proposal.service';
import { RegenerateProposalDto } from './dtos/proposal.dtos';
import { UpdateSectionDto } from './dtos/update-section.dto';
import { ReorderBlocksDto, InsertBlockDto, ChangeBlockTypeDto } from './dtos/block-edit.dtos';
import { BLOCK_PALETTE } from './block-edit';

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

  @Get('docx')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Download the proposal as an editable Word (.docx) document' })
  @ApiResponse({ status: 200, description: 'DOCX' })
  @ApiResponse({ status: 400, description: 'Legacy proposal — regenerate to enable Word export' })
  @ApiResponse({ status: 404, description: 'Not generated yet' })
  async docx(@Param('id', ParseUUIDPipe) id: string) {
    const { buffer, filename } = await this.proposals.renderDocx(id);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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

  // ---- Block editing (block-based proposals) -------------------------------------------------

  @Get('blocks/palette')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'List the block types that can be inserted (insert-from-palette)' })
  @ApiResponse({ status: 200, description: 'OK' })
  palette() {
    return BLOCK_PALETTE;
  }

  // NOTE: `blocks/order` is declared before `blocks/:blockId` so the literal path wins.
  @Patch('blocks/order')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Reorder proposal blocks by id' })
  @ApiResponse({ status: 200, description: 'Reordered' })
  @ApiResponse({ status: 400, description: 'Not a block-based proposal' })
  reorderBlocks(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderBlocksDto) {
    return this.proposals.reorderBlocks(id, dto.order);
  }

  @Post('blocks')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Insert a scaffold block from the palette (after a block, or at the end)' })
  @ApiResponse({ status: 201, description: 'Inserted' })
  @ApiResponse({ status: 400, description: 'Not a block-based proposal / bad type' })
  insertBlock(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InsertBlockDto) {
    return this.proposals.insertBlock(id, dto.type, dto.afterId);
  }

  @Patch('blocks/:blockId/type')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Change a block’s type (replaces its content with a fresh scaffold)' })
  @ApiResponse({ status: 200, description: 'Changed' })
  @ApiResponse({ status: 404, description: 'Block not found' })
  changeBlockType(@Param('id', ParseUUIDPipe) id: string, @Param('blockId') blockId: string, @Body() dto: ChangeBlockTypeDto) {
    return this.proposals.changeBlockType(id, blockId, dto.type);
  }

  @Patch('blocks/:blockId')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Edit a block’s content (merge patch; id/type preserved)' })
  @ApiResponse({ status: 200, description: 'Saved' })
  @ApiResponse({ status: 404, description: 'Block not found' })
  updateBlock(@Param('id', ParseUUIDPipe) id: string, @Param('blockId') blockId: string, @Body() patch: Record<string, unknown>) {
    return this.proposals.updateBlock(id, blockId, patch);
  }

  @Delete('blocks/:blockId')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a block' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Block not found' })
  removeBlock(@Param('id', ParseUUIDPipe) id: string, @Param('blockId') blockId: string) {
    return this.proposals.removeBlock(id, blockId);
  }
}

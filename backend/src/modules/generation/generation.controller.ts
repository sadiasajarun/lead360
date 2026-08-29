import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { GenerationService } from './generation.service';
import { RegenerateDto } from './dtos/regenerate.dto';
import { RegenerateSectionDto } from './dtos/regenerate-section.dto';
import { AskProposalDto } from './dtos/ask.dto';

@ApiTags('generation')
@Controller('leads/:id/generate')
export class GenerationController {
  constructor(private readonly generation: GenerationService) {}

  @Post()
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Generate/regenerate the proposal + budget (AI drafts, grounded in RAG; optional prompt)' })
  @ApiResponse({ status: 201, description: 'Generated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 503, description: 'AI not configured (AI_API_KEY missing)' })
  generate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegenerateDto) {
    return this.generation.generateDocument(id, dto.prompt);
  }

  @Get('usage')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'AI token usage for THIS lead: all-in total + cost + per-kind breakdown (proposal/budget/brief/pitch/regens)' })
  @ApiResponse({ status: 200, description: 'OK' })
  usage(@Param('id', ParseUUIDPipe) id: string) {
    return this.generation.leadTokenUsage(id);
  }

  @Get('modules')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Internal module breakdown: per-module type/complexity/weight + estimated effort & cost' })
  @ApiResponse({ status: 200, description: 'OK' })
  moduleBreakdown(@Param('id', ParseUUIDPipe) id: string) {
    return this.generation.getModuleBreakdown(id);
  }

  @Get('block/:blockId/explain')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Internal explain for a block: cost breakdown (financial) or tech why+references' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 404, description: 'Block not found' })
  explainBlock(@Param('id', ParseUUIDPipe) id: string, @Param('blockId') blockId: string) {
    return this.generation.explainBlock(id, blockId);
  }

  @Post('ask')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Ask a grounded question about the proposal/budget/rationale — read-only, no regeneration' })
  @ApiResponse({ status: 201, description: 'Answered' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'Proposal not found' })
  ask(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AskProposalDto) {
    return this.generation.answerQuestion(id, dto.question);
  }

  @Post('block/:blockId')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Regenerate a single proposal block (swaps its content, keeps id + position; optional prompt)' })
  @ApiResponse({ status: 201, description: 'Regenerated' })
  @ApiResponse({ status: 404, description: 'Block not found' })
  regenerateBlock(@Param('id', ParseUUIDPipe) id: string, @Param('blockId') blockId: string, @Body() dto: RegenerateDto) {
    return this.generation.regenerateBlock(id, blockId, dto.prompt);
  }

  @Post('budget')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Regenerate only the budget resource plan (optional plain-English prompt)' })
  @ApiResponse({ status: 201, description: 'Regenerated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  regenerateBudget(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegenerateDto) {
    return this.generation.regenerateBudget(id, dto.prompt);
  }

  @Post('section')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Regenerate a single proposal section (keeps its shape; optional prompt)' })
  @ApiResponse({ status: 201, description: 'Regenerated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  regenerateSection(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegenerateSectionDto) {
    return this.generation.regenerateSection(id, dto.key, dto.instruction);
  }

  @Post('brief')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Generate the internal sales brief (pitch pack) from the proposal' })
  @ApiResponse({ status: 201, description: 'Generated' })
  brief(@Param('id', ParseUUIDPipe) id: string) {
    return this.generation.generateSalesBrief(id);
  }

  @Post('pitch')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Generate the pitch deck (slides) from the proposal' })
  @ApiResponse({ status: 201, description: 'Generated' })
  pitch(@Param('id', ParseUUIDPipe) id: string) {
    return this.generation.generatePitchDeck(id);
  }
}

import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { GenerationService } from './generation.service';
import { RegenerateDto } from './dtos/regenerate.dto';
import { RegenerateSectionDto } from './dtos/regenerate-section.dto';

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
    return this.generation.generateProposal(id, dto.prompt);
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

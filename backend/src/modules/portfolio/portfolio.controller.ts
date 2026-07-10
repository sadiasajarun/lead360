import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { PortfolioService } from './portfolio.service';
import { PortfolioScraperService } from './portfolio-scraper.service';
import { ResolveStackDto } from './dtos/portfolio.dtos';

@ApiTags('portfolio')
@Controller('portfolio')
export class PortfolioController {
  constructor(
    private readonly portfolio: PortfolioService,
    private readonly scraper: PortfolioScraperService,
  ) {}

  @Get()
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'List ingested Riseup portfolio projects' })
  @ApiResponse({ status: 200, description: 'OK' })
  list() {
    return this.portfolio.list();
  }

  @Post('ingest')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Scrape riseuplabs.com/portfolio into portfolio_projects (idempotent; embeds for RAG)' })
  @ApiResponse({ status: 201, description: 'Ingested' })
  ingest(@Query('limit') limit?: string) {
    return this.scraper.ingestAll(limit ? Number(limit) : undefined);
  }

  @Post('embed')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Re-embed portfolio projects missing an embedding (no re-scrape)' })
  @ApiResponse({ status: 201, description: 'Embedded' })
  embed() {
    return this.scraper.embedMissing();
  }

  @Post('resolve-stack')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Resolve a tech stack for a brief, citing the portfolio projects that justify it (spec §1)' })
  @ApiResponse({ status: 201, description: 'OK' })
  resolveStack(@Body() dto: ResolveStackDto) {
    return this.portfolio.resolveStack(dto.brief, dto.k ?? 5);
  }
}

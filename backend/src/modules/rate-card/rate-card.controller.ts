import {
  Body, Controller, Get, Post, Put, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { BudgetCurrency, Seniority, UserRole } from '../../common/enums';
import { RateCardService } from './rate-card.service';
import { ImportRow, RateImportService } from './rate-import.service';
import { CreateRateCardDto } from './dtos/rate-card.dtos';

@ApiTags('rate-cards')
@Controller('rate-cards')
export class RateCardController {
  constructor(
    private readonly rateCards: RateCardService,
    private readonly importer: RateImportService,
  ) {}

  @Get()
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'List the maintained day-rate card (seniority-tiered)' })
  @ApiResponse({ status: 200, description: 'OK' })
  list() {
    return this.rateCards.list();
  }

  @Get('suggest')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Suggested day-rate for a role+seniority in a currency (budget editor pre-fill)' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 400, description: 'No FX rate on file for that currency' })
  suggest(
    @Query('role') role: string,
    @Query('seniority') seniority: Seniority,
    @Query('currency') currency?: BudgetCurrency,
  ) {
    return this.rateCards.suggestRate(role, seniority, currency ?? BudgetCurrency.USD);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Add/maintain a rate-card entry (admin)' })
  @ApiResponse({ status: 201, description: 'Created' })
  create(@Body() dto: CreateRateCardDto) {
    return this.rateCards.create(dto);
  }

  @Put()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Save edited rate rows (the Rates table Save button)' })
  @ApiResponse({ status: 200, description: 'Saved; returns the refreshed card' })
  saveMany(@Body() body: { rows: ({ id: string } & Record<string, unknown>)[] }) {
    return this.rateCards.saveMany(body?.rows ?? []);
  }

  @Post('import/preview')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Parse a CSV/XLSX and map its columns (AI maps HEADERS ONLY; values are parsed in code)' })
  @ApiResponse({ status: 201, description: 'Preview of the rows that would be imported' })
  @ApiResponse({ status: 400, description: 'Unreadable file / no usable rows / unmapped required column' })
  preview(@UploadedFile() file: { originalname: string; buffer: Buffer }) {
    return this.importer.preview(file);
  }

  @Post('import/commit')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Replace the whole rate card with previously previewed rows' })
  @ApiResponse({ status: 201, description: 'Imported' })
  @ApiResponse({ status: 400, description: 'Too few rows to replace the card' })
  commit(@Body() body: { rows: ImportRow[] }, @CurrentUser('id') adminId: string) {
    return this.importer.commit(body?.rows ?? [], adminId);
  }
}

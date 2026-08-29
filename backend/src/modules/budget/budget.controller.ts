import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Put,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { BudgetService } from './budget.service';
import { CommitVendorQuoteDto, UpdateBudgetDto } from './dtos/budget.dtos';
import { VendorQuoteService } from './vendor-quote.service';
import type { ExtractableFile } from '../../common/utils/extract-text.util';

@ApiTags('budgets')
@Controller('leads/:id/budget')
export class BudgetController {
  constructor(
    private readonly budgets: BudgetService,
    private readonly quotes: VendorQuoteService,
  ) {}

  @Get()
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get the budget + computed totals' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 404, description: 'Not found' })
  get(@Param('id', ParseUUIDPipe) id: string, @Query('currency') currency?: string) {
    return this.budgets.getForLeadInCurrency(id, currency);
  }

  @Put()
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Replace lines + adjustments (optimistic lock; totals recomputed in code)' })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({ status: 409, description: 'Stale version — reload and reapply' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBudgetDto) {
    return this.budgets.replace(id, dto);
  }

  @Get('xlsx')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Export the budget as .xlsx' })
  async xlsx(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    // Named per lead ("<Project name>_budget.xlsx"), so the disposition is set per request rather than
    // by a static @Header — a rep downloading several budgets gets distinguishable files.
    const [buffer, filename] = await Promise.all([this.budgets.exportXlsx(id), this.budgets.exportFilename(id)]);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    });
  }

  @Post('equipment/import/preview')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Read a supplier quotation (or typed description) into equipment rows — writes NOTHING' })
  @ApiResponse({ status: 201, description: 'Preview: rows, currency, install window, warranty, totals' })
  @ApiResponse({ status: 400, description: 'Nothing to read, or AI not configured' })
  previewQuote(
    @Param('id', ParseUUIDPipe) _id: string,
    @UploadedFile() file?: ExtractableFile,
    @Body('text') text?: string,
  ) {
    return this.quotes.preview({ file, text });
  }

  @Post('equipment/import/commit')
  @Roles(UserRole.SALES_PM, UserRole.ADMIN)
  @ApiOperation({ summary: 'Apply the reviewed equipment rows + install window + warranty to the budget' })
  @ApiResponse({ status: 201, description: 'Budget updated' })
  commitQuote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CommitVendorQuoteDto) {
    return this.quotes.commit(id, dto);
  }
}

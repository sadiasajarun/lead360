import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Put,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../core/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { BudgetService } from './budget.service';
import { UpdateBudgetDto } from './dtos/budget.dtos';

@ApiTags('budgets')
@Controller('leads/:id/budget')
export class BudgetController {
  constructor(private readonly budgets: BudgetService) {}

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
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="budget.xlsx"')
  @ApiOperation({ summary: 'Export the budget as .xlsx' })
  async xlsx(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    return new StreamableFile(await this.budgets.exportXlsx(id));
  }
}

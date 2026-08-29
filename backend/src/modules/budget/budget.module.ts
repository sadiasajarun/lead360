import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Budget } from './budget.entity';
import { Milestone } from './milestone.entity';
import { BudgetLine } from './budget-line.entity';
import { BudgetEquipment } from './budget-equipment.entity';
import { BudgetRepository } from './budget.repository';
import { BudgetService } from './budget.service';
import { BudgetController } from './budget.controller';
import { VendorQuoteService } from './vendor-quote.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule, TypeOrmModule.forFeature([Budget, Milestone, BudgetLine, BudgetEquipment])],
  controllers: [BudgetController],
  providers: [BudgetRepository, BudgetService, VendorQuoteService],
  exports: [BudgetService, BudgetRepository, VendorQuoteService],
})
export class BudgetModule {}

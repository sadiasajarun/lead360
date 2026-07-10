import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateCard } from './rate-card.entity';
import { RoleDaySample } from './role-day-sample.entity';
import { RateCardRepository } from './rate-card.repository';
import { RateCardService } from './rate-card.service';
import { RateImportService } from './rate-import.service';
import { RateCardController } from './rate-card.controller';
import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([RateCard, RoleDaySample]), AuditModule, SettingsModule], // AiModule is @Global
  controllers: [RateCardController],
  providers: [RateCardRepository, RateCardService, RateImportService],
  exports: [RateCardService],
})
export class RateCardModule {}

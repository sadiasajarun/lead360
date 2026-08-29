import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HistoricalProject } from './historical-project.entity';
import { EstimateService } from './estimate.service';

@Module({
  imports: [TypeOrmModule.forFeature([HistoricalProject])],
  providers: [EstimateService],
  exports: [EstimateService],
})
export class EstimateModule {}

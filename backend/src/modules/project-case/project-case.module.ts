import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProposalModule } from '../proposal/proposal.module';
import { BudgetModule } from '../budget/budget.module';
import { ProjectCase } from './project-case.entity';
import { ProjectCaseRepository } from './project-case.repository';
import { ProjectCaseService } from './project-case.service';
import { ProjectCaseIngestService } from './project-case-ingest.service';
import { SeedCaseIngestService } from './seed-case-ingest.service';
import { ProjectCaseListener } from './project-case.listener';
import { ApprovedIngestService } from './approved-ingest.service';
import { CaseFeatureRepository } from './case-feature.repository';
import { FeatureMemoryService } from './feature-memory.service';
import { ConstraintCalibrationService } from './constraint-calibration.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectCase]), ProposalModule, BudgetModule],
  providers: [ProjectCaseRepository, ProjectCaseService, ProjectCaseIngestService, SeedCaseIngestService, ProjectCaseListener, ApprovedIngestService, CaseFeatureRepository, FeatureMemoryService, ConstraintCalibrationService],
  exports: [ProjectCaseService, ProjectCaseRepository, ProjectCaseIngestService, SeedCaseIngestService, ApprovedIngestService, FeatureMemoryService, ConstraintCalibrationService],
})
export class ProjectCaseModule {}

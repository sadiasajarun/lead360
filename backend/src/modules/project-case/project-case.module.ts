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

@Module({
  imports: [TypeOrmModule.forFeature([ProjectCase]), ProposalModule, BudgetModule],
  providers: [ProjectCaseRepository, ProjectCaseService, ProjectCaseIngestService, SeedCaseIngestService, ProjectCaseListener],
  exports: [ProjectCaseService, ProjectCaseRepository, ProjectCaseIngestService, SeedCaseIngestService],
})
export class ProjectCaseModule {}

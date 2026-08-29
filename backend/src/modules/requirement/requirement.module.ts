import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Requirement } from './requirement.entity';
import { Lead } from '../lead/lead.entity';
import { RequirementRepository } from './requirement.repository';
import { RequirementService } from './requirement.service';

@Module({
  // Lead is registered here (not via LeadModule) so the readiness rubric can read the lead's
  // project context without a circular module import.
  imports: [TypeOrmModule.forFeature([Requirement, Lead])],
  providers: [RequirementRepository, RequirementService],
  exports: [RequirementService],
})
export class RequirementModule {}

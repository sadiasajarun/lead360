import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Requirement } from './requirement.entity';
import { RequirementRepository } from './requirement.repository';
import { RequirementService } from './requirement.service';

@Module({
  imports: [TypeOrmModule.forFeature([Requirement])],
  providers: [RequirementRepository, RequirementService],
  exports: [RequirementService],
})
export class RequirementModule {}

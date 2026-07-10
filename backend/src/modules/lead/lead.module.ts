import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from './lead.entity';
import { LeadComment } from './lead-comment.entity';
import { LeadRepository } from './lead.repository';
import { LeadService } from './lead.service';
import { LeadCommentService } from './lead-comment.service';
import { LeadController } from './lead.controller';
import { RequirementModule } from '../requirement/requirement.module';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadComment]), RequirementModule],
  controllers: [LeadController],
  providers: [LeadRepository, LeadService, LeadCommentService],
  exports: [LeadService, LeadCommentService],
})
export class LeadModule {}

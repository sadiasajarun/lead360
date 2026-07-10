import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Approval } from './approval.entity';
import { ApprovalRepository } from './approval.repository';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';
import { LeadModule } from '../lead/lead.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Approval]), LeadModule, AuditModule],
  controllers: [ApprovalController],
  providers: [ApprovalRepository, ApprovalService],
})
export class ApprovalModule {}

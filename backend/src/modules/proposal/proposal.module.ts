import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Proposal } from './proposal.entity';
import { ProposalVersion } from './proposal-version.entity';
import { ProposalRepository } from './proposal.repository';
import { ProposalService } from './proposal.service';
import { SettingsModule } from '../settings/settings.module';
import { ProposalController } from './proposal.controller';

@Module({
  imports: [SettingsModule, TypeOrmModule.forFeature([Proposal, ProposalVersion])],
  controllers: [ProposalController],
  providers: [ProposalRepository, ProposalService],
  exports: [ProposalService],
})
export class ProposalModule {}

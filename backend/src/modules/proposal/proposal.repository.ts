import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../core/base/base.repository';
import { Proposal } from './proposal.entity';

@Injectable()
export class ProposalRepository extends BaseRepository<Proposal> {
  constructor(@InjectRepository(Proposal) repo: Repository<Proposal>) {
    super(repo);
  }

  findByLead(leadId: string) {
    return this.qb.findOne({ where: { leadId }, relations: ['versions'] });
  }

  // Loads the proposal with its lead (title/company/value) for PDF rendering.
  findWithLead(leadId: string) {
    return this.qb.findOne({ where: { leadId }, relations: ['lead'] });
  }
}

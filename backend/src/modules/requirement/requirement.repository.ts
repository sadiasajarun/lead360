import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../core/base/base.repository';
import { Requirement } from './requirement.entity';

@Injectable()
export class RequirementRepository extends BaseRepository<Requirement> {
  constructor(@InjectRepository(Requirement) repo: Repository<Requirement>) {
    super(repo);
  }

  findByLead(leadId: string) {
    return this.qb.findOne({ where: { leadId } });
  }
}

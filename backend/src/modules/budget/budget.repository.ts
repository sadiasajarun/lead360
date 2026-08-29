import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../core/base/base.repository';
import { Budget } from './budget.entity';

@Injectable()
export class BudgetRepository extends BaseRepository<Budget> {
  constructor(@InjectRepository(Budget) repo: Repository<Budget>) {
    super(repo);
  }

  findByLead(leadId: string) {
    return this.qb.findOne({ where: { leadId }, relations: ['milestones', 'lines', 'equipment'] });
  }
}

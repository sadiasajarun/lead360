import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseRepository } from '../../core/base/base.repository';
import { ClientFeedback } from './client-feedback.entity';

@Injectable()
export class ClientFeedbackRepository extends BaseRepository<ClientFeedback> {
  constructor(@InjectRepository(ClientFeedback) repo: Repository<ClientFeedback>) {
    super(repo);
  }

  listForLead(leadId: string) {
    return this.qb.find({ where: { leadId }, order: { createdAt: 'DESC' } });
  }

  openForLead(leadId: string) {
    return this.qb.find({ where: { leadId, status: 'open' }, order: { createdAt: 'ASC' } });
  }

  markApplied(ids: string[]) {
    return this.qb.update({ id: In(ids) }, { status: 'applied', appliedAt: new Date() });
  }
}

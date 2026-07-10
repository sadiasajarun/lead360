import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../core/base/base.repository';
import { DocumentDelivery } from './document-delivery.entity';

@Injectable()
export class DeliveryRepository extends BaseRepository<DocumentDelivery> {
  constructor(@InjectRepository(DocumentDelivery) repo: Repository<DocumentDelivery>) {
    super(repo);
  }

  findByLead(leadId: string) {
    return this.qb.findOne({ where: { leadId } });
  }
}

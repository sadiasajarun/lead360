import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../core/base/base.repository';
import { Approval } from './approval.entity';

@Injectable()
export class ApprovalRepository extends BaseRepository<Approval> {
  constructor(@InjectRepository(Approval) repo: Repository<Approval>) {
    super(repo);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../core/base/base.repository';
import { Generation } from './generation.entity';

@Injectable()
export class GenerationRepository extends BaseRepository<Generation> {
  constructor(@InjectRepository(Generation) repo: Repository<Generation>) {
    super(repo);
  }
}

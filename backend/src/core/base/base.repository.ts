import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { BaseEntity } from './base.entity';

/** Data-access base. Feature repositories inject Repository<T> and pass it to super(). */
export abstract class BaseRepository<T extends BaseEntity> {
  constructor(protected readonly repository: Repository<T>) {}

  findById(id: string, options: FindOneOptions<T> = {}): Promise<T | null> {
    return this.repository.findOne({
      ...options,
      where: { id } as FindOptionsWhere<T>,
    });
  }

  findAll(options: FindManyOptions<T> = {}): Promise<T[]> {
    return this.repository.find(options);
  }

  create(data: DeepPartial<T>): Promise<T> {
    return this.repository.save(this.repository.create(data));
  }

  async update(id: string, data: DeepPartial<T>): Promise<T | null> {
    await this.repository.update(id, data as never);
    return this.findById(id);
  }

  softDelete(id: string) {
    return this.repository.softDelete(id);
  }

  /** Escape hatch for custom QueryBuilder queries in feature repositories. */
  get qb() {
    return this.repository;
  }
}

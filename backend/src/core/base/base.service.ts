import { NotFoundException } from '@nestjs/common';
import { DeepPartial, FindManyOptions } from 'typeorm';
import { BaseEntity } from './base.entity';
import { BaseRepository } from './base.repository';

/** Business-logic base. Services never touch TypeORM directly — only via the repository. */
export abstract class BaseService<T extends BaseEntity> {
  protected defaultRelations: string[] = [];

  constructor(
    protected readonly repository: BaseRepository<T>,
    protected readonly entityName: string = 'Entity',
  ) {}

  findAll(options: FindManyOptions<T> = {}): Promise<T[]> {
    return this.repository.findAll({ relations: this.defaultRelations, ...options });
  }

  async findByIdOrFail(id: string): Promise<T> {
    const found = await this.repository.findById(id, {
      relations: this.defaultRelations,
    } as never);
    if (!found) throw new NotFoundException(`${this.entityName} ${id} not found`);
    return found;
  }

  create(data: DeepPartial<T>): Promise<T> {
    return this.repository.create(data);
  }

  async update(id: string, data: DeepPartial<T>): Promise<T | null> {
    await this.findByIdOrFail(id);
    return this.repository.update(id, data);
  }

  async remove(id: string) {
    await this.findByIdOrFail(id);
    return this.repository.softDelete(id);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../core/base/base.repository';
import { Project } from './project.entity';
import { ProjectQueryDto } from './dtos/project.dtos';

@Injectable()
export class ProjectRepository extends BaseRepository<Project> {
  constructor(@InjectRepository(Project) repo: Repository<Project>) {
    super(repo);
  }

  findById(id: string) {
    return this.qb.findOne({ where: { id } });
  }

  findBySlug(slug: string) {
    return this.qb.findOne({ where: { slug } });
  }

  search(query: ProjectQueryDto) {
    const qb = this.qb.createQueryBuilder('p').orderBy('p.createdAt', 'DESC');
    if (query.q) qb.andWhere('(p.name ILIKE :q OR p.summary ILIKE :q)', { q: `%${query.q}%` });
    if (query.category) qb.andWhere('p.category @> :cat', { cat: JSON.stringify([query.category]) });
    if (query.tech) qb.andWhere('p.tech_stack @> :tech', { tech: JSON.stringify([query.tech]) });
    return qb.getMany();
  }
}

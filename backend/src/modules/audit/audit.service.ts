import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

export interface AuditEntry {
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  log(entry: AuditEntry) {
    return this.repo.save(this.repo.create(entry));
  }

  /** Newest first, with the actor's name resolved for display. */
  async recent(limit = 50) {
    const rows = await this.repo
      .createQueryBuilder('a')
      .leftJoin('users', 'u', 'u.id = a.actor_id')
      .addSelect(['u.name AS actor_name', 'u.email AS actor_email'])
      .orderBy('a.created_at', 'DESC')
      .limit(limit)
      .getRawAndEntities();

    return rows.entities.map((e, i) => ({
      id: e.id,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId ?? null,
      createdAt: e.createdAt,
      actor: rows.raw[i]?.actor_name || rows.raw[i]?.actor_email || null,
    }));
  }
}

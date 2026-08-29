import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { BaseRepository } from '../../core/base/base.repository';
import { Lead } from './lead.entity';
import { LeadQueryDto } from './dtos/lead.dtos';
import { LeadStatus } from '../../common/enums';

@Injectable()
export class LeadRepository extends BaseRepository<Lead> {
  constructor(@InjectRepository(Lead) repo: Repository<Lead>) {
    super(repo);
  }

  /**
   * Filtered + paginated lead list. `scope` (derived from the caller's role) restricts visibility:
   *  - sales_pm (`{ userId }`): own leads only — reps never see each other's pipelines.
   *  - admin (`{ userId, adminView }`): own leads (any status) OR any lead that has EVER been
   *    submitted for approval. Another rep's never-submitted draft stays private. (Keyed on
   *    submitted_at, not status, so a rejected lead — which returns to `generated` — stays visible.)
   *  (user decisions 2026-07-10)
   */
  async search(
    query: LeadQueryDto,
    scope?: { userId: string; adminView?: boolean },
  ): Promise<{ items: Lead[]; total: number }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const qb = this.qb
      .createQueryBuilder('lead')
      .leftJoinAndSelect('lead.submittedBy', 'submittedBy') // Approvals needs the rep's name
      // Newest activity first. createdAt/id break ties: rows sharing an updatedAt (a bulk write, or a
      // restored backup) would otherwise come back in heap order, which reshuffles between page loads
      // and makes pagination drop/repeat rows.
      .orderBy('lead.updatedAt', 'DESC')
      .addOrderBy('lead.createdAt', 'DESC')
      .addOrderBy('lead.id', 'DESC');

    if (scope?.adminView) {
      // "Entered the pipeline" = submitted_at is set (survives a rejection back to `generated`) OR
      // the status is past draft (covers rows created before submitted_at existed). Both clauses are
      // needed: status alone hides rejected leads; submitted_at alone hides legacy pending ones.
      // Must mirror LeadService.findVisible, or the list and the detail page disagree.
      qb.andWhere(
        new Brackets((w) => {
          w.where('lead.submitted_by_id = :userId', { userId: scope.userId })
            .orWhere('lead.submitted_at IS NOT NULL')
            .orWhere('lead.status != :draft', { draft: LeadStatus.GENERATED });
        }),
      );
    } else if (scope) {
      qb.andWhere('lead.submitted_by_id = :userId', { userId: scope.userId });
    }

    if (query.status) qb.andWhere('lead.status = :status', { status: query.status });
    // Date range filters on CREATION time — the one date every lead has (drafts have no submitted_at).
    if (query.from) qb.andWhere('lead.created_at >= :from', { from: query.from });
    if (query.to) qb.andWhere('lead.created_at < :to', { to: query.to });
    if (query.template) qb.andWhere('lead.template = :template', { template: query.template });
    if (query.q) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('lead.title ILIKE :q', { q: `%${query.q}%` }).orWhere('lead.company ILIKE :q', {
            q: `%${query.q}%`,
          });
        }),
      );
    }

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { items, total };
  }
}

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

  /**
   * Sum input/output tokens (and count distinct proposals) across generation rows, optionally within a
   * [from, to) created_at window. Powers the token-usage dashboard. Soft-deleted rows are excluded by
   * TypeORM's default filter. Returns numbers (Postgres SUM/COUNT come back as strings).
   */
  async tokenAggregate(from?: Date, to?: Date): Promise<{ tokensIn: number; tokensOut: number; proposals: number }> {
    const qb = this.repository
      .createQueryBuilder('g')
      .select('COALESCE(SUM(g.tokens_in), 0)', 'tin')
      .addSelect('COALESCE(SUM(g.tokens_out), 0)', 'tout')
      .addSelect('COUNT(DISTINCT g.lead_id)', 'proposals');
    if (from) qb.andWhere('g.created_at >= :from', { from });
    if (to) qb.andWhere('g.created_at < :to', { to });
    const r = await qb.getRawOne<{ tin: string; tout: string; proposals: string }>();
    return { tokensIn: Number(r?.tin ?? 0), tokensOut: Number(r?.tout ?? 0), proposals: Number(r?.proposals ?? 0) };
  }

  /**
   * Per-kind AI token totals + run counts for ONE lead. "runs" counts only rows that actually spent tokens —
   * deterministic $0 operations (budget re-syncs, money-block re-derives, budget target-solves with no AI)
   * are NOT AI runs, so they never inflate the count. Kinds with no token-bearing run are dropped by the
   * service. Powers the per-lead usage line under the regenerate box.
   */
  async leadTokenBreakdown(leadId: string): Promise<{ kind: string; tokensIn: number; tokensOut: number; runs: number }[]> {
    const rows = await this.repository
      .createQueryBuilder('g')
      .select('g.kind', 'kind')
      .addSelect('COALESCE(SUM(g.tokens_in), 0)', 'tin')
      .addSelect('COALESCE(SUM(g.tokens_out), 0)', 'tout')
      .addSelect('COUNT(*) FILTER (WHERE g.tokens_in + g.tokens_out > 0)', 'runs')
      .where('g.lead_id = :leadId', { leadId })
      .groupBy('g.kind')
      .getRawMany<{ kind: string; tin: string; tout: string; runs: string }>();
    return rows.map((r) => ({ kind: r.kind, tokensIn: Number(r.tin), tokensOut: Number(r.tout), runs: Number(r.runs) }));
  }
}

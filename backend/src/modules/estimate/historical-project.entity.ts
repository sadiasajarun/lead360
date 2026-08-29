import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';

/**
 * A delivered Riseup project mined from the corpus (proposal/budget financials). Powers the
 * budget-first "band" — the cost range comparable projects landed in — so the engine can validate
 * its rate-card total against real history instead of a hardcoded heuristic.
 *
 * Project-level only (total + timeline). Deeper per-milestone/role mining can extend this later.
 */
@Entity('historical_projects')
@Index(['category', 'scopeSize'])
export class HistoricalProject extends BaseEntity {
  /** Global | Local | Agency | Design Portfolio (matches KbDocument.category). */
  @Column()
  category: string;

  @Column()
  title: string;

  /** Project total normalized to USD minor units (BDT converted at the ingest FX). Null = not found. */
  @Column({ name: 'total_usd_cents', type: 'bigint', nullable: true })
  totalUsdCents?: string;

  /** Currency the total was authored in (USD | BDT). */
  @Column({ nullable: true })
  currency?: string;

  /** Timeline in weeks, if stated. */
  @Column({ type: 'int', nullable: true })
  weeks?: number;

  /** small | medium | large — bucketed from the USD total at ingest. */
  @Column({ name: 'scope_size', nullable: true })
  scopeSize?: string;

  /** Provenance — the corpus document title/path this was mined from. */
  @Column({ nullable: true })
  source?: string;
}

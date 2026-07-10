import { Column, Entity, JoinColumn, OneToMany, OneToOne, VersionColumn } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { Lead } from '../lead/lead.entity';
import { Milestone } from './milestone.entity';
import { BudgetLine } from './budget-line.entity';

@Entity('budgets')
export class Budget extends BaseEntity {
  @Column({ name: 'lead_id' })
  leadId: string;

  @OneToOne(() => Lead, (lead) => lead.budget, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column({ default: 'USD' })
  currency: string;

  // FX rate captured at save time so a stored budget never silently changes value.
  @Column({ name: 'fx_rate', type: 'numeric', precision: 12, scale: 4, default: 1 })
  fxRate: string;

  @Column({ name: 'contingency_pct', type: 'numeric', precision: 5, scale: 2, default: 0 })
  contingencyPct: string;

  @Column({ name: 'discount_pct', type: 'numeric', precision: 5, scale: 2, default: 0 })
  discountPct: string;

  @Column({ name: 'vat_pct', type: 'numeric', precision: 5, scale: 2, default: 0 })
  vatPct: string;

  // Computed grand total in integer minor units (cents).
  @Column({ name: 'total_cents', type: 'bigint', default: 0 })
  totalCents: string;

  // Optimistic lock: concurrent budget edits cannot silently clobber (stale save yields 409).
  @VersionColumn()
  version: number;

  @OneToMany(() => Milestone, (m) => m.budget)
  milestones: Milestone[];

  @OneToMany(() => BudgetLine, (l) => l.budget)
  lines: BudgetLine[];
}

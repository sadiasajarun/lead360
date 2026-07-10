import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { Seniority } from '../../common/enums';
import { Budget } from './budget.entity';
import { Milestone } from './milestone.entity';

@Entity('budget_lines')
export class BudgetLine extends BaseEntity {
  @Column({ name: 'budget_id' })
  budgetId: string;

  @ManyToOne(() => Budget, (b) => b.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'budget_id' })
  budget: Budget;

  @Column({ name: 'milestone_id', nullable: true })
  milestoneId?: string;

  @ManyToOne(() => Milestone, (m) => m.lines, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'milestone_id' })
  milestone?: Milestone;

  @Column()
  department: string;

  @Column()
  role: string;

  @Column({ type: 'enum', enum: Seniority, default: Seniority.MID })
  seniority: Seniority;

  @Column({ type: 'int', default: 1 })
  units: number;

  @Column({ type: 'int', default: 0 })
  days: number;

  // Day rate in integer minor units (cents). Unit cost = units * days * dayRateCents (computed in code).
  @Column({ name: 'day_rate_cents', type: 'bigint', default: 0 })
  dayRateCents: string;

  @Column({ default: false })
  optional: boolean;
}

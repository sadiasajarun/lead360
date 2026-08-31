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

  // EFFECTIVE man-days (Workstream A) = hoursPerDay × workingDays / 8. Fractional, so `double precision`.
  // Cost = units * days * dayRateCents (computed in code) — days already carries the part-time discount.
  @Column({ type: 'double precision', default: 0 })
  days: number;

  // Part-time inputs that DERIVE `days`. hoursPerDay = daily commitment (1..8; 8 = full-time),
  // workingDays = calendar days the role is staffed (also the timeline proxy). Editable in the sheet.
  @Column({ name: 'hours_per_day', type: 'double precision', default: 8 })
  hoursPerDay: number;

  @Column({ name: 'working_days', type: 'int', default: 0 })
  workingDays: number;

  // Day rate in integer minor units (cents). Unit cost = units * days * dayRateCents (computed in code).
  @Column({ name: 'day_rate_cents', type: 'bigint', default: 0 })
  dayRateCents: string;

  @Column({ default: false })
  optional: boolean;

  /** Hand-tuned by the rep. A regeneration rewrites the derived rows around it but leaves this one alone —
   *  previously every regen wiped the whole sheet, discarding any correction the rep had made. */
  @Column({ default: false })
  pinned: boolean;
}

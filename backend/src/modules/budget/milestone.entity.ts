import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { Budget } from './budget.entity';
import { BudgetLine } from './budget-line.entity';

@Entity('milestones')
export class Milestone extends BaseEntity {
  @Column({ name: 'budget_id' })
  budgetId: string;

  @ManyToOne(() => Budget, (b) => b.milestones, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'budget_id' })
  budget: Budget;

  @Column()
  name: string;

  @Column({ name: 'order_no', type: 'int', default: 0 })
  orderNo: number;

  @OneToMany(() => BudgetLine, (l) => l.milestone)
  lines: BudgetLine[];
}

import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { LeadStatus, TemplateType, LossReason, BudgetCurrency } from '../../common/enums';
import { User } from '../user/user.entity';
import { Requirement } from '../requirement/requirement.entity';
import { Proposal } from '../proposal/proposal.entity';
import { Budget } from '../budget/budget.entity';
import { Approval } from '../approval/approval.entity';

@Entity('leads')
export class Lead extends BaseEntity {
  @Column()
  title: string;

  @Column()
  company: string;

  @Column({ name: 'contact_name', nullable: true })
  contactName?: string;

  @Column({ name: 'contact_email', nullable: true })
  contactEmail?: string;

  @Column({ nullable: true })
  website?: string;

  @Column({ type: 'enum', enum: LeadStatus, default: LeadStatus.GENERATED })
  status: LeadStatus;

  @Column({ type: 'enum', enum: TemplateType })
  template: TemplateType;

  /** Deal value in integer minor units (cents). Never a float. */
  /** Currency this lead's budget is priced in. Only Local leads may be BDT. */
  @Column({ name: 'budget_currency', type: 'enum', enum: BudgetCurrency, default: BudgetCurrency.USD })
  budgetCurrency: BudgetCurrency;

  @Column({ name: 'value_cents', type: 'bigint', default: 0 })
  valueCents: string;

  @Column({ name: 'loss_reason', type: 'enum', enum: LossReason, nullable: true })
  lossReason?: LossReason;

  @Column({ name: 'loss_note', type: 'text', nullable: true })
  lossNote?: string;

  @Column({ name: 'submitted_by_id', nullable: true })
  submittedById?: string;

  /** When the lead entered the approval queue — drives the "waiting" age on the Approvals page. */
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt?: Date;

  @ManyToOne(() => User, (user) => user.leads, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'submitted_by_id' })
  submittedBy?: User;

  @OneToOne(() => Requirement, (r) => r.lead)
  requirement: Requirement;

  @OneToMany(() => Proposal, (p) => p.lead)
  proposals: Proposal[];

  @OneToOne(() => Budget, (b) => b.lead)
  budget: Budget;

  @OneToMany(() => Approval, (a) => a.lead)
  approvals: Approval[];
}

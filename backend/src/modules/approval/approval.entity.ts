import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { ApprovalDecision } from '../../common/enums';
import { Lead } from '../lead/lead.entity';
import { User } from '../user/user.entity';

@Entity('approvals')
export class Approval extends BaseEntity {
  @Column({ name: 'lead_id' })
  leadId: string;

  @ManyToOne(() => Lead, (lead) => lead.approvals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt: Date;

  @Column({ name: 'submitted_by_id', nullable: true })
  submittedById?: string;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt?: Date;

  @Column({ name: 'decided_by_id', nullable: true })
  decidedById?: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'decided_by_id' })
  decidedBy?: User;

  @Column({ type: 'enum', enum: ApprovalDecision, nullable: true })
  decision?: ApprovalDecision;

  @Column({ type: 'text', nullable: true })
  note?: string;
}

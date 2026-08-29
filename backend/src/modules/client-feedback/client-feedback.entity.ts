import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { Lead } from '../lead/lead.entity';

/**
 * Client feedback captured AFTER a proposal is shared with the client. Each open item is injected into the
 * NEXT regeneration with the HIGHEST priority (it is the client's own direction, so it overrides the brief and
 * the rep's requirements on any conflict). Consumed items are kept (status `applied`) for the audit trail.
 */
@Entity('client_feedbacks')
export class ClientFeedback extends BaseEntity {
  @Index()
  @Column({ name: 'lead_id' })
  leadId: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column({ type: 'text' })
  text: string;

  /** `open` → applied to the next regeneration; `applied` → already consumed (kept for the audit trail). */
  @Column({ type: 'varchar', default: 'open' })
  status: string;

  @Column({ name: 'applied_at', type: 'timestamptz', nullable: true })
  appliedAt?: Date | null;
}

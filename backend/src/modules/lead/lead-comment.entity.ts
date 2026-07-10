import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { Lead } from './lead.entity';
import { User } from '../user/user.entity';
import { ApprovalDecision } from '../../common/enums';

/**
 * A message on a lead's thread. Two kinds share one timeline:
 *  - `comment`  — a note anyone on the lead can post (Sales asks, Admin answers).
 *  - `decision` — the note an admin attaches when approving or rejecting; `decision` carries which.
 * Keeping them in one table means the thread reads chronologically, with decisions in context.
 */
@Entity('lead_comments')
export class LeadComment extends BaseEntity {
  @Index()
  @Column({ name: 'lead_id' })
  leadId: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column({ name: 'author_id', nullable: true })
  authorId?: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'author_id' })
  author?: User;

  @Column({ type: 'text' })
  body: string;

  /** Null for a plain comment; set when this message accompanied an approve/reject. */
  @Column({ type: 'enum', enum: ApprovalDecision, nullable: true })
  decision?: ApprovalDecision;
}

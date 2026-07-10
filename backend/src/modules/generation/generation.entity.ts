import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { Lead } from '../lead/lead.entity';
import { Feedback } from './feedback.entity';

// One AI generation run (proposal / budget / brief / pitch) — tracks model + token cost.
@Entity('generations')
export class Generation extends BaseEntity {
  @Column({ name: 'lead_id' })
  leadId: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column()
  kind: string; // proposal | budget | brief | pitch

  @Column({ type: 'jsonb', default: {} })
  versions: Record<string, unknown>;

  @Column({ nullable: true })
  model?: string;

  @Column({ name: 'tokens_in', type: 'int', default: 0 })
  tokensIn: number;

  @Column({ name: 'tokens_out', type: 'int', default: 0 })
  tokensOut: number;

  @OneToMany(() => Feedback, (f) => f.generation)
  feedback: Feedback[];
}

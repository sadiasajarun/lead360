import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { Lead } from '../lead/lead.entity';

@Entity('requirements')
export class Requirement extends BaseEntity {
  @Column({ name: 'lead_id' })
  leadId: string;

  @OneToOne(() => Lead, (lead) => lead.requirement, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column({ name: 'source_text', type: 'text', nullable: true })
  sourceText?: string;

  /** Uploaded files: [{ name, key, mime }] (key = object-storage path). */
  @Column({ type: 'jsonb', default: [] })
  files: { name: string; key: string; mime: string }[];

  @Column({ name: 'readiness_score', type: 'int', nullable: true })
  readinessScore?: number;

  /** Open readiness queries + their resolution. */
  @Column({ type: 'jsonb', default: [] })
  queries: unknown[];
}

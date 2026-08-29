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

  /** Extracted text from the uploaded brief/RFP document(s) — supporting DETAIL. */
  @Column({ name: 'source_text', type: 'text', nullable: true })
  sourceText?: string;

  /** The rep's typed requirements — TOP PRIORITY; shapes the proposal and overrides the document on conflict.
   *  Kept separate from `source_text` so an uploaded document can never overwrite it (and vice versa). */
  @Column({ name: 'additional_requirements', type: 'text', nullable: true })
  additionalRequirements?: string;

  /** Uploaded files: [{ name, key, mime }] (key = object-storage path). */
  @Column({ type: 'jsonb', default: [] })
  files: { name: string; key: string; mime: string }[];

  @Column({ name: 'readiness_score', type: 'int', nullable: true })
  readinessScore?: number;

  /** Open readiness queries + their resolution. */
  @Column({ type: 'jsonb', default: [] })
  queries: unknown[];
}

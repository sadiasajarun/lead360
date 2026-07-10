import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { TemplateType } from '../../common/enums';
import { Lead } from '../lead/lead.entity';
import { ProposalVersion } from './proposal-version.entity';

@Entity('proposals')
export class Proposal extends BaseEntity {
  @Column({ name: 'lead_id' })
  leadId: string;

  @ManyToOne(() => Lead, (lead) => lead.proposals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @Column({ type: 'enum', enum: TemplateType })
  template: TemplateType;

  /** Rendered section content (structured JSON → branded HTML/PDF). */
  @Column({ type: 'jsonb', default: {} })
  sections: Record<string, unknown>;

  @Column({ default: 'light' })
  theme: string;

  /** AI-generated internal sales pitch pack (8 sections). Null until generated on demand. */
  @Column({ name: 'sales_brief', type: 'jsonb', nullable: true })
  salesBrief?: Record<string, unknown> | null;

  /** AI-generated presentation deck (array of slides). Null until generated on demand. */
  @Column({ name: 'pitch_deck', type: 'jsonb', nullable: true })
  pitchDeck?: Record<string, unknown> | null;

  @Column({ name: 'current_version_id', nullable: true })
  currentVersionId?: string;

  @OneToMany(() => ProposalVersion, (v) => v.proposal)
  versions: ProposalVersion[];
}

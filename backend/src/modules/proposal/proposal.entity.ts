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

  /** Rolling "what changed" log (P6) — newest first, capped to the last ~20 regenerations/edits. Each entry:
   *  { at, kind: 'proposal'|'budget'|'section', title, details[], budgetBefore/AfterCents?, weeksBefore/After?,
   *  currency? }. Drives the scrollable change panel under the regenerate prompt. */
  @Column({ name: 'change_log', type: 'jsonb', default: () => "'[]'" })
  changeLog: Record<string, unknown>[];

  /** Cached rendered PDF + the content hash it was rendered from. `select: false` so normal proposal
   *  reads never pull the ~600 KB blob — it's loaded explicitly by the PDF endpoint. Lazily filled on
   *  the first Download click and reused until the content hash changes (edit/regenerate → re-render). */
  @Column({ name: 'pdf_cache', type: 'bytea', nullable: true, select: false })
  pdfCache?: Buffer | null;

  @Column({ name: 'pdf_hash', type: 'varchar', nullable: true, select: false })
  pdfHash?: string | null;

  /** Internal-only cost breakdown (team member day/weekly rates, per-phase math). `select: false` so it
   *  is NEVER returned by the normal proposal read (client `/present` view) — only the authenticated
   *  "explain" endpoint loads it. Head-cost rates are confidential and must not reach the client. */
  @Column({ name: 'internal_calc', type: 'jsonb', nullable: true, select: false })
  internalCalc?: Record<string, unknown> | null;

  @OneToMany(() => ProposalVersion, (v) => v.proposal)
  versions: ProposalVersion[];
}

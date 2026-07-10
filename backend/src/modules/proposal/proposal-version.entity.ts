import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { Proposal } from './proposal.entity';

@Entity('proposal_versions')
export class ProposalVersion extends BaseEntity {
  @Column({ name: 'proposal_id' })
  proposalId: string;

  @ManyToOne(() => Proposal, (p) => p.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proposal_id' })
  proposal: Proposal;

  @Column({ name: 'version_no', type: 'int' })
  versionNo: number;

  @Column({ name: 'sections_json', type: 'jsonb', default: {} })
  sectionsJson: Record<string, unknown>;

  @Column({ nullable: true })
  model?: string;

  @Column({ name: 'tokens_used', type: 'int', default: 0 })
  tokensUsed: number;

  @Column({ name: 'pdf_key', nullable: true })
  pdfKey?: string;
}

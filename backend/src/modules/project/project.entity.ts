import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { Lead } from '../lead/lead.entity';

@Entity('projects')
export class Project extends BaseEntity {
  @Index({ unique: true })
  @Column()
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  summary?: string;

  @Column({ type: 'jsonb', default: [] })
  category: string[];

  @Column({ name: 'tech_stack', type: 'jsonb', default: [] })
  techStack: string[];

  @Column({ name: 'cover_key', nullable: true })
  coverKey?: string;

  /** Live site or riseuplabs.com project page — project cards link here. */
  @Column({ nullable: true })
  link?: string;

  // Set when a Locked lead auto-creates its Project.
  @Column({ name: 'source_lead_id', nullable: true })
  sourceLeadId?: string;

  @ManyToOne(() => Lead, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'source_lead_id' })
  sourceLead?: Lead;
}

import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';

/**
 * Organisation-wide settings, one row per section (branding, approvals, delivery, security,
 * templates). Storing each section as a jsonb blob keeps the schema stable while the shape of a
 * section evolves — the service validates/merges, so a bad client payload can't corrupt a section.
 */
@Entity('org_settings')
export class OrgSetting extends BaseEntity {
  @Index({ unique: true })
  @Column()
  section: string;

  @Column({ type: 'jsonb', default: {} })
  value: Record<string, unknown>;

  @Column({ name: 'updated_by_id', nullable: true })
  updatedById?: string;
}

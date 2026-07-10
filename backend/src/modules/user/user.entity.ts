import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { UserRole } from '../../common/enums';
import { Lead } from '../lead/lead.entity';

@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column()
  email: string;

  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.SALES_PM })
  role: UserRole;

  /** Object-storage key of the profile photo; served through GET /auth/me/avatar. */
  @Column({ name: 'avatar_key', nullable: true })
  avatarKey?: string;

  /** Personal defaults (Settings → Preferences). Free-form, validated on write. */
  @Column({ type: 'jsonb', default: {} })
  preferences: Record<string, unknown>;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => Lead, (lead) => lead.submittedBy)
  leads: Lead[];
}

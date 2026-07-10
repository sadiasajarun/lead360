import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { UserRole } from '../../common/enums';

/**
 * An admin-issued invitation to join Lead360. Only the SHA-256 hash of the token is stored, so a
 * leaked database row can't be used to accept an invite (same pattern as refresh_tokens).
 */
@Entity('invitations')
export class Invitation extends BaseEntity {
  @Index()
  @Column()
  email: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash' })
  tokenHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.SALES_PM })
  role: UserRole;

  @Column({ name: 'invited_by_id', nullable: true })
  invitedById?: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /** Set once the invitee signs up — an invitation is single-use. */
  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt?: Date;
}

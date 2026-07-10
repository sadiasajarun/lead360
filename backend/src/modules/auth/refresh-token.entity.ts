import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';

// Server-side record of issued refresh tokens (SHA-256 hash only — never the raw token). Enables
// rotation + revocation: a refresh token is accepted only if its hash is present here; refresh deletes
// the used hash (rotation) and stores the new one; logout deletes it. A stolen/replayed token fails.
@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash' })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}

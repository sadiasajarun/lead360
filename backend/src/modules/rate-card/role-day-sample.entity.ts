import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { RateCard } from './rate-card.entity';

// Learned scope -> role-days mapping (sharpens future AI budget estimates).
@Entity('role_day_samples')
export class RoleDaySample extends BaseEntity {
  @Index()
  @Column({ name: 'scope_signature' })
  scopeSignature: string;

  @Column()
  role: string;

  @Column({ type: 'int' })
  days: number;

  @Column({ nullable: true })
  source?: string;

  @Column({ name: 'rate_card_id', nullable: true })
  rateCardId?: string;

  @ManyToOne(() => RateCard, (rc) => rc.samples, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'rate_card_id' })
  rateCard?: RateCard;
}

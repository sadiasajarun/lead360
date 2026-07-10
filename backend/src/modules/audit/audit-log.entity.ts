import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { User } from '../user/user.entity';

@Entity('audit_logs')
export class AuditLog extends BaseEntity {
  @Column({ name: 'actor_id', nullable: true })
  actorId?: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor?: User;

  @Column()
  action: string;

  @Index()
  @Column()
  entity: string;

  @Column({ name: 'entity_id', nullable: true })
  entityId?: string;

  @Column({ type: 'jsonb', nullable: true })
  before?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  after?: Record<string, unknown>;
}

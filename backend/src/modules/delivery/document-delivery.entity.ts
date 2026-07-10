import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { Lead } from '../lead/lead.entity';

@Entity('document_deliveries')
export class DocumentDelivery extends BaseEntity {
  @Column({ name: 'lead_id' })
  leadId: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  // [{ name, key, kind: 'pdf' | 'xlsx' }]
  @Column({ type: 'jsonb', default: [] })
  files: unknown[];

  // Deliverables are download-only for launch (email built but disabled).
  @Column({ default: 'download' })
  method: string;

  @Column({ default: 'not_delivered' })
  status: string;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt?: Date;
}

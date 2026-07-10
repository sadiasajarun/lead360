import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { LossReason } from '../../common/enums';
import { Generation } from './generation.entity';

// Human signal on a generation (approval, edit-diff, win/loss) — drives the learning loop.
@Entity('feedbacks')
export class Feedback extends BaseEntity {
  @Column({ name: 'generation_id' })
  generationId: string;

  @ManyToOne(() => Generation, (g) => g.feedback, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'generation_id' })
  generation: Generation;

  @Column({ nullable: true })
  approval?: boolean;

  @Column({ name: 'edit_diff', type: 'jsonb', nullable: true })
  editDiff?: Record<string, unknown>;

  @Column({ nullable: true })
  outcome?: string; // win | loss

  @Column({ name: 'loss_reason', type: 'enum', enum: LossReason, nullable: true })
  lossReason?: LossReason;

  @Column({ type: 'text', nullable: true })
  prompt?: string;
}

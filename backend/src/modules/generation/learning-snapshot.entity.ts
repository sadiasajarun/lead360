import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';

// Distilled scaffold version (the "compress, don't append" step of the learning loop).
// System/config table — intentionally standalone (no FK).
@Entity('learning_snapshots')
export class LearningSnapshot extends BaseEntity {
  @Column({ name: 'scaffold_version' })
  scaffoldVersion: string;

  @Column({ name: 'distilled_json', type: 'jsonb', default: {} })
  distilledJson: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  metrics: Record<string, unknown>;
}

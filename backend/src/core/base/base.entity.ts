import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

/**
 * Every entity extends this: UUID id, timestamps, and soft delete.
 *
 * Timestamps are `timestamptz` - a tz-naive column stores whatever wall clock the DB session runs on
 * (UTC on Neon) and then reads back as if it were the API host's local time, which silently shifts
 * every date by the host offset and mis-buckets day-range queries.
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt?: Date;
}

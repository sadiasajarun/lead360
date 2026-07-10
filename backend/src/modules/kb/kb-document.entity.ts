import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { KbChunk } from './kb-chunk.entity';

// A source document in the RAG corpus (Riseup data only — never template-author sample docs).
@Entity('kb_documents')
export class KbDocument extends BaseEntity {
  @Column()
  title: string;

  @Column({ name: 'source_path' })
  sourcePath: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ nullable: true })
  template?: string;

  @Column({ type: 'jsonb', default: {} })
  meta: Record<string, unknown>;

  @OneToMany(() => KbChunk, (c) => c.document)
  chunks: KbChunk[];
}

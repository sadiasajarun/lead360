import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../core/base/base.entity';
import { KbDocument } from './kb-document.entity';

// A section-level chunk with an AI embedding for similarity search.
// NOTE: the `embedding vector(768)` column + HNSW index are created via raw SQL (KbRepository.
// ensureVectorColumn) because TypeORM doesn't manage the pgvector type. Reads/writes use raw
// pgvector queries in the KB repository. Do not add `embedding` as a managed @Column here.
//
// synchronize:false is REQUIRED — with DATABASE_SYNCHRONIZE=true, schema-sync would treat the
// raw-managed `embedding` column as unknown and DROP it on every boot, wiping all embeddings.
// Excluding this table from sync lets ensureVectorColumn own its schema.
@Entity('kb_chunks', { synchronize: false })
export class KbChunk extends BaseEntity {
  @Column({ name: 'kb_document_id' })
  kbDocumentId: string;

  @ManyToOne(() => KbDocument, (d) => d.chunks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'kb_document_id' })
  document: KbDocument;

  @Column({ type: 'text' })
  text: string;

  // Content hash → never re-embed unchanged text.
  @Index({ unique: true })
  @Column({ name: 'content_hash' })
  contentHash: string;

  @Column({ type: 'jsonb', default: {} })
  meta: Record<string, unknown>;
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, IsNull, LessThan, Not, Repository } from 'typeorm';
import { KbDocument } from './kb-document.entity';
import { KbChunk } from './kb-chunk.entity';

@Injectable()
export class KbRepository {
  constructor(
    @InjectRepository(KbDocument) private readonly docs: Repository<KbDocument>,
    @InjectRepository(KbChunk) private readonly chunks: Repository<KbChunk>,
  ) {}

  saveDoc(data: DeepPartial<KbDocument>) {
    return this.docs.save(this.docs.create(data));
  }

  listDocs() {
    return this.docs.find({ order: { category: 'ASC', createdAt: 'ASC' } });
  }

  findDocByTitle(title: string) {
    return this.docs.findOne({ where: { title } });
  }

  findDocById(id: string) {
    return this.docs.findOne({ where: { id } });
  }

  // --- Trash (soft delete + 30-day retention) ---
  findDocByIdWithDeleted(id: string) {
    return this.docs.findOne({ where: { id }, withDeleted: true });
  }

  listTrash() {
    return this.docs.find({
      withDeleted: true,
      where: { deletedAt: Not(IsNull()) },
      order: { deletedAt: 'DESC' },
    });
  }

  softDeleteDoc(id: string) {
    return this.docs.softDelete(id);
  }

  restoreDoc(id: string) {
    return this.docs.restore(id);
  }

  // Hard delete — the kb_chunks FK is ON DELETE CASCADE, so chunks (and their embeddings) go with it.
  hardDeleteDoc(id: string) {
    return this.docs.delete(id);
  }

  // Docs whose trash retention has expired (for the auto-purge job).
  listExpiredTrash(cutoff: Date) {
    return this.docs.find({
      withDeleted: true,
      where: { deletedAt: LessThan(cutoff) },
    });
  }

  saveChunks(data: DeepPartial<KbChunk>[]) {
    return this.chunks.save(this.chunks.create(data));
  }

  // Trash semantics: knowledge is forgotten the moment a doc is trashed (chunks + embeddings deleted);
  // restore re-indexes from the stored file. Avoids the global content_hash dedupe swallowing re-uploads.
  deleteChunksForDoc(kbDocumentId: string) {
    return this.chunks.delete({ kbDocumentId });
  }

  findChunkByHash(contentHash: string) {
    return this.chunks.findOne({ where: { contentHash } });
  }

  // Keyword fallback retrieval (used when embeddings aren't available yet).
  // Joins kb_documents so trashed (soft-deleted) documents stop feeding RAG immediately.
  textSearch(q: string, limit = 5) {
    return this.chunks
      .createQueryBuilder('c')
      .innerJoin(KbDocument, 'd', 'd.id = c.kb_document_id AND d.deleted_at IS NULL')
      .where('c.text ILIKE :q', { q: `%${q}%` })
      .limit(limit)
      .getMany();
  }

  // --- pgvector (semantic RAG) ---
  // Idempotent: enable the extension, add the embedding column, and build the HNSW cosine index.
  async ensureVectorColumn(dim: number) {
    await this.chunks.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.chunks.query(`ALTER TABLE kb_chunks ADD COLUMN IF NOT EXISTS embedding vector(${dim})`);
    await this.chunks.query(
      'CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx ON kb_chunks USING hnsw (embedding vector_cosine_ops)',
    );
  }

  private toVectorLiteral(vec: number[]) {
    return `[${vec.join(',')}]`;
  }

  setEmbedding(chunkId: string, vec: number[]) {
    return this.chunks.query('UPDATE kb_chunks SET embedding = $1 WHERE id = $2', [
      this.toVectorLiteral(vec),
      chunkId,
    ]);
  }

  // Cosine-distance nearest neighbours (<=> is pgvector cosine distance).
  // Excludes chunks of trashed (soft-deleted) documents — deleted knowledge must not ground generations.
  async semanticSearch(vec: number[], limit: number, category?: string): Promise<{ text: string }[]> {
    if (category) {
      // Same-template grounding: prefer chunks from this category's PROPOSAL documents so the
      // generator mirrors the structure/voice of Riseup's real delivered proposals.
      return this.chunks.query(
        `SELECT c.text FROM kb_chunks c
           JOIN kb_documents d ON d.id = c.kb_document_id AND d.deleted_at IS NULL
          WHERE c.embedding IS NOT NULL AND d.category = $3 AND d.meta->>'section' = 'Proposal'
          ORDER BY c.embedding <=> $1 LIMIT $2`,
        [this.toVectorLiteral(vec), limit, category],
      );
    }
    return this.chunks.query(
      `SELECT c.text FROM kb_chunks c
         JOIN kb_documents d ON d.id = c.kb_document_id AND d.deleted_at IS NULL
        WHERE c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $1 LIMIT $2`,
      [this.toVectorLiteral(vec), limit],
    );
  }
}

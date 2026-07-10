import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the pgvector similarity-search column + HNSW cosine index to kb_chunks (after the base
 * schema exists). TypeORM can't manage the `vector` type, so it lives in a migration + raw queries.
 * Matches AiService EMBED_DIM (768). Idempotent + reversible.
 */
export class AddKbEmbedding1783455900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
    await queryRunner.query('ALTER TABLE "kb_chunks" ADD COLUMN IF NOT EXISTS "embedding" vector(768)');
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "kb_chunks_embedding_idx" ON "kb_chunks" USING hnsw ("embedding" vector_cosine_ops)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "kb_chunks_embedding_idx"');
    await queryRunner.query('ALTER TABLE "kb_chunks" DROP COLUMN IF EXISTS "embedding"');
  }
}

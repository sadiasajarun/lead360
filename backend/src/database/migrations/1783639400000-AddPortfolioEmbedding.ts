import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the pgvector similarity-search column + HNSW cosine index to portfolio_projects.
 *
 * TypeORM cannot manage the `vector` type, so `migration:generate` silently omits this column —
 * a database built purely from migrations was missing it. The app has an `ensureVectorColumn`
 * self-heal that creates it on boot, but production must not depend on a boot-time side effect.
 *
 * Mirrors AddKbEmbedding. Matches AiService EMBED_DIM (768). Idempotent + reversible.
 */
export class AddPortfolioEmbedding1783639400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
    await queryRunner.query('ALTER TABLE "portfolio_projects" ADD COLUMN IF NOT EXISTS "embedding" vector(768)');
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "portfolio_projects_embedding_idx" ON "portfolio_projects" USING hnsw ("embedding" vector_cosine_ops)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "portfolio_projects_embedding_idx"');
    await queryRunner.query('ALTER TABLE "portfolio_projects" DROP COLUMN IF EXISTS "embedding"');
  }
}

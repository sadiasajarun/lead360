import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `project_cases` table for the Learning Engine (Phase 2a).
 *
 * The entity is `{ synchronize: false }` (its raw `embedding vector(768)` column would be dropped by
 * DATABASE_SYNCHRONIZE=true), so this migration owns the schema. Mirrors AddKbEmbedding / AddPortfolioEmbedding:
 * base table via raw SQL, then the pgvector column + HNSW cosine index. Idempotent + reversible. The app also
 * self-heals the embedding column on boot (ProjectCaseService.onModuleInit → ensureVectorColumn).
 */
export class CreateProjectCases1786000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "project_cases" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        "title" varchar NOT NULL DEFAULT '',
        "template" varchar NOT NULL,
        "domain" varchar,
        "tags" text[] NOT NULL DEFAULT '{}',
        "scope_size" varchar NOT NULL DEFAULT 'medium',
        "module_count" int NOT NULL DEFAULT 0,
        "integration_count" int NOT NULL DEFAULT 0,
        "modules" text[] NOT NULL DEFAULT '{}',
        "stack" text[] NOT NULL DEFAULT '{}',
        "team" jsonb NOT NULL DEFAULT '[]',
        "phases" jsonb NOT NULL DEFAULT '[]',
        "timeline_weeks" int,
        "budget_total_cents" bigint NOT NULL DEFAULT 0,
        "currency" varchar NOT NULL DEFAULT 'USD',
        "section_structure" jsonb NOT NULL DEFAULT '[]',
        "source_lead_id" uuid,
        "source_doc_id" uuid
      )`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "project_cases_template_idx" ON "project_cases" ("template")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "project_cases_scope_idx" ON "project_cases" ("scope_size")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "project_cases_tags_idx" ON "project_cases" USING gin ("tags")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "project_cases_source_lead_idx" ON "project_cases" ("source_lead_id")');
    await queryRunner.query('ALTER TABLE "project_cases" ADD COLUMN IF NOT EXISTS "embedding" vector(768)');
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "project_cases_embedding_idx" ON "project_cases" USING hnsw ("embedding" vector_cosine_ops)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "project_cases_embedding_idx"');
    await queryRunner.query('DROP TABLE IF EXISTS "project_cases"');
  }
}

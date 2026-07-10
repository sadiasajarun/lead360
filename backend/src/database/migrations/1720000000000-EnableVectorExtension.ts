import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * First migration — enables the pgvector extension BEFORE any table is created,
 * so the AI similarity-search column can be added to kb_chunks later.
 * Idempotent + reversible.
 */
export class EnableVectorExtension1720000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS vector');
  }
}

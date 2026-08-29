import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
config();

/**
 * One-off: add the `module_profiles` jsonb column to `project_cases` (module-intelligence layer).
 * Stores each scoped module classified by type + complexity with the effective man-days attributed to it
 * from the project's real total. Populated by the seed-case re-ingest (npm run ingest:seed-cases).
 *
 * Script (not a TypeORM migration) because this DB was built by DATABASE_SYNCHRONIZE=true with an empty
 * migrations table (see fix-timestamptz.ts). Own DataSource, synchronize OFF. Idempotent (ADD IF NOT EXISTS).
 *
 * Usage: npx ts-node src/database/add-module-profiles.ts   (or `npm run migrate:module-profiles`)
 */
async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: +(process.env.DATABASE_PORT || 5432),
    username: process.env.DATABASE_USER || 'lead360',
    password: process.env.DATABASE_PASSWORD || 'lead360_dev_pw',
    database: process.env.DATABASE_NAME || 'lead360',
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    synchronize: false,
  });
  await ds.initialize();
  await ds.query(`ALTER TABLE project_cases ADD COLUMN IF NOT EXISTS module_profiles jsonb NOT NULL DEFAULT '[]'::jsonb`);
  const n: { c: string }[] = await ds.query(`SELECT count(*) c FROM project_cases`);
  console.log(`project_cases.module_profiles ready (${n[0].c} cases; re-run ingest:seed-cases to populate).`);
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

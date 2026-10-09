import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
config();

/**
 * One-off, additive: columns that let `project_cases` hold the user-APPROVED ("gold") corpus — proposals and
 * budgets finalised by hand after rounds of feedback — alongside the existing seed / in-app cases.
 * Nullable only; nothing existing changes. Engine V1 ignores gold rows unless ENGINE_V2_GOLD=on.
 *
 * Script (not a TypeORM migration) for the same reason as add-module-profiles.ts: this DB has an empty
 * migrations table. Own DataSource, synchronize OFF, idempotent.
 *
 * Usage: npm run migrate:gold-cases
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
  const cols = [
    `quality varchar(16)`, // 'gold' = user-approved final version; NULL = seed / in-app
    `source_kind varchar(32)`, // 'approved_manual' | NULL
    `source_path text`, // project key (manifest) — idempotent upsert for the approved corpus
    `effort_days numeric`, // Σ units × days from the approved budget (person-days)
    `features_raw jsonb`, // per-feature extraction (capability, sub-features, scale signals) — Phase 2 input
    `final_at timestamptz`, // when the final version was produced (file mtime)
  ];
  for (const c of cols) await ds.query(`ALTER TABLE project_cases ADD COLUMN IF NOT EXISTS ${c}`);
  await ds.query(`CREATE INDEX IF NOT EXISTS project_cases_quality_idx ON project_cases (quality)`);
  await ds.query(`CREATE UNIQUE INDEX IF NOT EXISTS project_cases_source_path_uq ON project_cases (source_path) WHERE source_path IS NOT NULL AND deleted_at IS NULL`);
  const n: { c: string }[] = await ds.query(`SELECT count(*) c FROM project_cases`);
  console.log(`project_cases gold columns ready (${n[0].c} cases). Next: npm run ingest:approved`);
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

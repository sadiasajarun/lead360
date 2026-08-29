import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
config();

/**
 * One-off: add the part-time effort columns to `budget_lines` (Workstream A — hours-based costing).
 *
 *   hours_per_day  double precision  default 8   — daily commitment (8 = full-time)
 *   working_days   int               default 0   — calendar days the role is staffed (timeline proxy)
 *   days           int -> double precision        — now holds EFFECTIVE man-days = hours_per_day × working_days / 8
 *
 * Backfill preserves every existing total: a legacy line was billed full-time (days = full calendar), so we
 * set working_days = days and hours_per_day = 8, which makes effectiveDays = 8 × days / 8 = days (unchanged).
 *
 * It exists as a script (not a TypeORM migration) because this database was built by
 * DATABASE_SYNCHRONIZE=true with an empty `migrations` table (see fix-timestamptz.ts). Uses its own
 * DataSource with synchronize OFF so the pgvector columns are never touched. Idempotent: the ADD COLUMNs
 * are IF NOT EXISTS and the backfill only fills rows still at the working_days default.
 *
 * Usage: npx ts-node src/database/add-budget-line-hours.ts   (or `npm run migrate:budget-hours`)
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

  await ds.query(`ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS hours_per_day double precision NOT NULL DEFAULT 8`);
  await ds.query(`ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS working_days integer NOT NULL DEFAULT 0`);
  // days: int -> double precision (fractional effective days). ALTER TYPE is a no-op if already double precision.
  await ds.query(`ALTER TABLE budget_lines ALTER COLUMN days TYPE double precision USING days::double precision`);
  await ds.query(`ALTER TABLE budget_lines ALTER COLUMN days SET DEFAULT 0`);

  // Backfill legacy rows: full-time (hours=8), working_days = the old full-calendar days -> effectiveDays unchanged.
  const res = await ds.query(
    `UPDATE budget_lines SET working_days = round(days)::int, hours_per_day = 8
       WHERE working_days = 0 AND days > 0`,
  );
  const affected = Array.isArray(res) ? res[1] : (res as { affected?: number })?.affected;
  console.log(`budget_lines: hours_per_day + working_days added; backfilled ${affected ?? '?'} legacy rows.`);

  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Migration — let a proposal version carry the plan it was generated from.
 *
 * proposal_versions stored only `sections_json`, so a restore would bring back the wording while leaving the
 * timeline, team and budget of a completely different plan in place. A version now snapshots both, plus a
 * short label saying what triggered it.
 *
 * Idempotent: safe to re-run.
 */
import 'reflect-metadata';
import { setDefaultResultOrder } from 'dns';
import { setDefaultAutoSelectFamily } from 'net';
setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamily(false);
import { config } from 'dotenv';
config();
import { DataSource } from 'typeorm';

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: +(process.env.DATABASE_PORT || 5432),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: false, // never let entity drift ALTER this DB
});

async function main() {
  await ds.initialize();
  await ds.query(`ALTER TABLE proposal_versions ADD COLUMN IF NOT EXISTS internal_calc_json jsonb;`);
  await ds.query(`ALTER TABLE proposal_versions ADD COLUMN IF NOT EXISTS label varchar;`);
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_proposal_versions_proposal ON proposal_versions (proposal_id, version_no DESC);`);
  const [{ count }] = await ds.query(`SELECT count(*)::int AS count FROM proposal_versions`);
  console.log(`proposal_versions ready — ${count} snapshot(s) stored.`);
  await ds.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });

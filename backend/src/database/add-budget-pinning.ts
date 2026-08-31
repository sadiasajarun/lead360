/**
 * Migration — mark hand-tuned budget rows and adjustments as pinned.
 *
 * A regeneration wiped every budget line and reset contingency/discount/VAT to zero, so any correction the
 * rep had made by hand was silently destroyed. These two flags let a regeneration rewrite only the rows it
 * derived and leave tuned values alone.
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
  await ds.query(`ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;`);
  await ds.query(`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS adjustments_pinned boolean NOT NULL DEFAULT false;`);
  const [{ lines }] = await ds.query(`SELECT count(*)::int AS lines FROM budget_lines WHERE pinned`);
  const [{ budgets }] = await ds.query(`SELECT count(*)::int AS budgets FROM budgets WHERE adjustments_pinned`);
  console.log(`Budget pinning ready — ${lines} pinned line(s), ${budgets} budget(s) with pinned adjustments.`);
  await ds.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });

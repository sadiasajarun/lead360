/**
 * Migration — create `budget_equipment`.
 *
 * Purchased items (hardware, devices, licences, on-site installation) are costed by qty × unit price and
 * have none of the resource concepts (seniority, hours/day, man-days). They previously had to be faked as
 * role rows, which showed "Mid / 8 hrs / 1 day" against things like a power adapter.
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
  await ds.query(`
    CREATE TABLE IF NOT EXISTS budget_equipment (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      budget_id         uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      item              varchar NOT NULL,
      brand             varchar,
      uom               varchar,
      qty               integer NOT NULL DEFAULT 1,
      unit_price_cents  bigint  NOT NULL DEFAULT 0,
      note              varchar,
      order_no          integer NOT NULL DEFAULT 0,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz
    );
  `);
  await ds.query(`CREATE INDEX IF NOT EXISTS idx_budget_equipment_budget ON budget_equipment (budget_id);`);
  const [{ count }] = await ds.query(`SELECT count(*)::int AS count FROM budget_equipment`);
  console.log(`budget_equipment ready — ${count} row(s).`);
  await ds.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });

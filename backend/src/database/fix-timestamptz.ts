import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
config();

/**
 * One-off: convert every tz-naive `timestamp` column to `timestamptz`.
 *
 * Same statement as the TimestampsToTimestamptz migration. It exists as a script because this
 * database was built by DATABASE_SYNCHRONIZE=true and has an empty `migrations` table, so
 * `npm run migration:run` would try to replay InitialSchema against existing tables and abort.
 *
 * Stored values are UTC wall clock (Neon sessions run in GMT, so `now()` wrote UTC), which makes
 * `AT TIME ZONE 'UTC'` the correct reinterpretation - it retypes the column without moving any
 * instant. Idempotent: information_schema drives the loop, so a second run converts nothing.
 *
 * Uses its own DataSource with synchronize OFF - booting AppModule here would let TypeORM's
 * synchroniser drop the raw pgvector columns it does not know about.
 *
 * Usage: npx ts-node src/database/fix-timestamptz.ts
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

  const before: { n: string }[] = await ds.query(
    `SELECT count(*) AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'`,
  );
  console.log(`naive timestamp columns before: ${before[0].n}`);

  await ds.query(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'
      LOOP
        EXECUTE format(
          'ALTER TABLE %I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''',
          r.table_name, r.column_name, r.column_name
        );
      END LOOP;
    END $$;
  `);

  const after: { n: string }[] = await ds.query(
    `SELECT count(*) AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'`,
  );
  console.log(`naive timestamp columns after: ${after[0].n}`);
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Converts every tz-naive `timestamp` column to `timestamptz`.
 *
 * BaseEntity's timestamps defaulted to `timestamp without time zone`, so `now()` wrote the DB session's
 * wall clock (UTC on Neon) while the API compared them against boundaries built from the host's LOCAL
 * clock. On a UTC+6 host that filed every generation made between local midnight and 6am under
 * "yesterday" in the token dashboard, and shifted every rendered date by the same 6 hours.
 *
 * The stored values are UTC wall clock, so `AT TIME ZONE 'UTC'` is the correct reinterpretation - it
 * changes the column type without moving any instant. Driven off information_schema so it converts
 * exactly the columns that still need it and is safe to re-run (project_cases is already timestamptz).
 */
export class TimestampsToTimestamptz1787000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse for the BaseEntity trio only: the columns that were timestamptz before this migration
    // (project_cases.*, leads.submitted_at, approvals.decided_at, ...) must keep their type.
    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public'
            AND data_type = 'timestamp with time zone'
            AND column_name IN ('created_at', 'updated_at', 'deleted_at')
            AND table_name <> 'project_cases'
        LOOP
          EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN %I TYPE timestamp USING %I AT TIME ZONE ''UTC''',
            r.table_name, r.column_name, r.column_name
          );
        END LOOP;
      END $$;
    `);
  }
}

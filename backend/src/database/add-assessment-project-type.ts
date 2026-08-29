import 'reflect-metadata';
import dataSource from './data-source';

/**
 * Idempotent: add 'assessment' to the leads project_type enum. The column is a Postgres enum and the app runs
 * with DATABASE_SYNCHRONIZE=false, so a new ProjectType value must be added to the DB enum explicitly (a fresh
 * database built from the entity WILL already include it; this backfills existing databases). Matches the
 * project's ad-hoc fix-script pattern rather than the unused migrations table.
 *
 * Usage: ts-node src/database/add-assessment-project-type.ts
 */
async function main() {
  const ds = await dataSource.initialize();
  try {
    const col: { udt_name: string }[] = await ds.query(
      "SELECT udt_name FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'project_type'",
    );
    const typ = col[0]?.udt_name;
    if (!typ) throw new Error('leads.project_type column not found');
    await ds.query(`ALTER TYPE ${typ} ADD VALUE IF NOT EXISTS 'assessment'`);
    const after: { enumlabel: string }[] = await ds.query(
      'SELECT enumlabel FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid WHERE ty.typname = $1 ORDER BY e.enumsortorder',
      [typ],
    );
    console.log(`${typ} values:`, after.map((r) => r.enumlabel).join(', '));
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error('add-assessment-project-type failed:', e);
  process.exit(1);
});

import 'reflect-metadata';
import dataSource from './data-source';

/**
 * Idempotent: add the Template & Setup procurement fields to `leads`.
 *
 *   hardware_project        — hardware/devices are supplied as part of the engagement
 *   third_party_service     — a supplier/subcontractor is involved (INTERNAL; never named to the client)
 *   procurement_notes       — internal note shaping the proposal
 *   hardware_install_weeks  — delivery/installation window, ADDED to the software schedule as an on-site
 *                             phase (it must never replace the project timeline — that was the bug where
 *                             a quotation's "05-07 working days" crashed a 4-phase plan into 1 week)
 *
 * The app runs with DATABASE_SYNCHRONIZE=false, so new columns must be added explicitly. Matches the
 * project's ad-hoc fix-script pattern rather than the unused migrations table.
 *
 * Usage: npm run migrate:lead-procurement
 */
async function main() {
  const ds = await dataSource.initialize();
  try {
    await ds.query(`
      ALTER TABLE leads
        ADD COLUMN IF NOT EXISTS hardware_project       boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS third_party_service    boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS procurement_notes      text,
        ADD COLUMN IF NOT EXISTS hardware_install_weeks integer,
        ADD COLUMN IF NOT EXISTS hardware_warranty      text;
    `);
    const cols: { column_name: string; data_type: string }[] = await ds.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'leads'
         AND column_name IN ('hardware_project','third_party_service','procurement_notes','hardware_install_weeks','hardware_warranty')
       ORDER BY column_name`,
    );
    console.log('leads procurement columns:');
    for (const c of cols) console.log(`  ${c.column_name} (${c.data_type})`);
    if (cols.length !== 5) throw new Error(`expected 5 columns, found ${cols.length}`);
  } finally {
    await ds.destroy();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

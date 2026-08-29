import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
config();

/**
 * Recovery: copy created_at / updated_at / deleted_at back from a Neon point-in-time branch.
 *
 * On 2026-08-18 a BaseEntity column-type change under DATABASE_SYNCHRONIZE=true made TypeORM
 * drop+recreate the three timestamp columns on every sync-managed table, so all values were reset to
 * a single `now()`. The row data itself is intact and ids are stable, so a branch taken from before
 * the incident can be joined back by id.
 *
 * Setup: create a Neon branch with data as of a moment BEFORE 2026-08-17T21:06:32Z, then put its
 * connection string in backend/.env as RESTORE_DATABASE_URL.
 *
 * Usage:
 *   npx ts-node src/database/restore-timestamps.ts          # dry run - reports, writes nothing
 *   npx ts-node src/database/restore-timestamps.ts --apply  # performs the restore
 *
 * Notes:
 *   - The branch predates the timestamptz conversion, so its columns are tz-naive values holding UTC
 *     wall clock; they are read back as `AT TIME ZONE 'UTC'` to land on the correct instant.
 *   - Raw SQL on purpose: an ORM save() would re-stamp updated_at via @UpdateDateColumn.
 *   - Rows created after the branch point simply have no source row and are left untouched.
 *   - Idempotent: re-running writes the same values.
 */

const TS_COLUMNS = ['created_at', 'updated_at', 'deleted_at'] as const;
/**
 * The single instant every wiped column was reset to (verified uniform across all tables). Restoring
 * is guarded on it: a row whose created_at/updated_at no longer equals this has been written since the
 * incident, so its current value is real and must win over the branch's older one. Likewise a non-null
 * deleted_at is a deletion made after the incident and is never overwritten by the branch's NULL.
 */
const WIPE_INSTANT = '2026-08-17 21:06:32.665745+00';
// kb_chunks / project_cases are {synchronize:false} entities - they were never wiped. `migrations` has no id.
const SKIP_TABLES = new Set(['migrations', 'kb_chunks', 'project_cases']);
const BATCH = 500;

type ColType = { column_name: string; data_type: string };
type TsRow = { id: string } & Record<string, string | Date | null>;

/** Reads the value as an absolute instant whether the source column is tz-naive (holding UTC) or tz-aware. */
function readExpr(col: string, types: Map<string, string>): string {
  return types.get(col) === 'timestamp without time zone'
    ? `("${col}" AT TIME ZONE 'UTC')`
    : `"${col}"`;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const sourceUrl = process.env.RESTORE_DATABASE_URL;
  if (!sourceUrl) throw new Error('RESTORE_DATABASE_URL is required (the Neon point-in-time branch)');

  const source = new DataSource({
    type: 'postgres',
    url: sourceUrl,
    ssl: { rejectUnauthorized: false },
    synchronize: false,
  });
  const live = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: +(process.env.DATABASE_PORT || 5432),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    synchronize: false,
  });
  await Promise.all([source.initialize(), live.initialize()]);
  console.log(apply ? '=== APPLY ===' : '=== DRY RUN (pass --apply to write) ===');

  const liveTables: { table_name: string }[] = await live.query(
    `SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.column_name = 'created_at'
      ORDER BY c.table_name`,
  );

  let totalUpdated = 0;
  let totalMissing = 0;

  for (const { table_name: table } of liveTables) {
    if (SKIP_TABLES.has(table)) continue;

    const srcCols: ColType[] = await source.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    if (!srcCols.length) {
      console.log(`${table.padEnd(22)} not present in the branch - skipped`);
      continue;
    }
    const types = new Map<string, string>(srcCols.map((c) => [c.column_name, c.data_type]));
    const cols = TS_COLUMNS.filter((c) => types.has(c));
    if (!types.has('id') || !cols.length) {
      console.log(`${table.padEnd(22)} no id/timestamp columns - skipped`);
      continue;
    }

    const select = cols.map((c) => `${readExpr(c, types)} AS "${c}"`).join(', ');
    const src: TsRow[] = await source.query(`SELECT id, ${select} FROM "${table}"`);
    const liveIds: { id: string }[] = await live.query(`SELECT id FROM "${table}"`);
    const liveSet = new Set(liveIds.map((r) => r.id));
    const matched = src.filter((r) => liveSet.has(r.id));
    const missing = liveSet.size - matched.length;

    const sample = matched[0];
    console.log(
      `${table.padEnd(22)} branch ${String(src.length).padEnd(6)} live ${String(liveSet.size).padEnd(6)}` +
        ` restorable ${String(matched.length).padEnd(6)} newer-than-branch ${missing}` +
        (sample?.created_at ? `  e.g. created_at -> ${new Date(sample.created_at).toISOString()}` : ''),
    );
    totalUpdated += matched.length;
    totalMissing += missing;
    if (!apply || !matched.length) continue;

    for (let i = 0; i < matched.length; i += BATCH) {
      const chunk = matched.slice(i, i + BATCH);
      const params: unknown[] = [];
      const values = chunk
        .map((r) => {
          const slot = [`$${params.push(r.id)}::uuid`];
          for (const c of cols) slot.push(`$${params.push(r[c])}::timestamptz`);
          return `(${slot.join(', ')})`;
        })
        .join(', ');
      const wipe = `$${params.push(WIPE_INSTANT)}::timestamptz`;
      const assignments = cols
        .map((c) =>
          c === 'deleted_at'
            ? `"${c}" = CASE WHEN x."${c}" IS NULL THEN v."${c}" ELSE x."${c}" END`
            : `"${c}" = CASE WHEN x."${c}" = ${wipe} THEN v."${c}" ELSE x."${c}" END`,
        )
        .join(', ');
      await live.query(
        `UPDATE "${table}" AS x SET ${assignments}
           FROM (VALUES ${values}) AS v(id, ${cols.map((c) => `"${c}"`).join(', ')})
          WHERE x.id = v.id`,
        params,
      );
    }
    console.log(`${''.padEnd(22)} restored ${matched.length} row(s)`);
  }

  console.log(
    `\n${apply ? 'Restored' : 'Would restore'} ${totalUpdated} row(s); ` +
      `${totalMissing} row(s) are newer than the branch point and keep their current timestamps.`,
  );
  await Promise.all([source.destroy(), live.destroy()]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

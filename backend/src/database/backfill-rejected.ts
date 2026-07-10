import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';

/**
 * One-off: give rejected leads their own status.
 *
 * Before 2026-07-10 a rejection moved the lead back to `generated`, so a rejected lead was
 * indistinguishable from an untouched draft. `LeadStatus.REJECTED` now exists; this backfills the
 * rows that were rejected under the old behaviour.
 *
 * A lead is rejected iff its MOST RECENT decision in `approvals` is `rejected`. We key off the
 * recorded decision rather than `submitted_at`, because `submitted_at` was itself backfilled for an
 * earlier admin-visibility fix and would produce false positives.
 *
 * Idempotent: re-running is a no-op. Safe to run before or after the app has synchronised the enum.
 *
 * Usage: npx ts-node src/database/backfill-rejected.ts
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const ds = app.get(DataSource);

  // `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block, so use a bare query.
  // IF NOT EXISTS makes this safe whether or not TypeORM's synchronize already added it.
  const enumType: { typname: string }[] = await ds.query(
    `SELECT t.typname FROM pg_type t
       JOIN pg_attribute a ON a.atttypid = t.oid
       JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relname = 'leads' AND a.attname = 'status' LIMIT 1`,
  );
  if (!enumType.length) throw new Error('Could not locate the leads.status enum type.');
  const typname = enumType[0].typname;

  await ds.query(`ALTER TYPE "${typname}" ADD VALUE IF NOT EXISTS 'rejected'`);
  console.log(`enum ${typname}: 'rejected' present`);

  // Latest decision per lead; only rows still parked at `generated` are candidates.
  const candidates: { id: string; title: string }[] = await ds.query(`
    SELECT l.id, l.title
      FROM leads l
      JOIN LATERAL (
        SELECT a.decision
          FROM approvals a
         WHERE a.lead_id = l.id AND a.decided_at IS NOT NULL
         ORDER BY a.decided_at DESC
         LIMIT 1
      ) last ON TRUE
     WHERE l.status = 'generated'
       AND l.deleted_at IS NULL
       AND last.decision = 'rejected'
  `);

  if (!candidates.length) {
    console.log('No rows to backfill — nothing was rejected under the old behaviour.');
    await app.close();
    return;
  }

  const ids = candidates.map((c) => c.id);
  await ds.query(`UPDATE leads SET status = 'rejected' WHERE id = ANY($1::uuid[])`, [ids]);

  console.log(`Backfilled ${candidates.length} lead(s) generated -> rejected:`);
  for (const c of candidates) console.log(`  - ${c.title} (${c.id})`);

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

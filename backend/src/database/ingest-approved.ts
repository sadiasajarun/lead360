import 'reflect-metadata';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ApprovedIngestService } from '../modules/project-case/approved-ingest.service';

/**
 * Import the user's approved corpus (final proposal + budget per project) as gold ProjectCases.
 * Reads .claude-project/clients/_approved.yaml (build it with `npm run approved:manifest`).
 * One AI extraction per project (~$0.05 each). Idempotent — upserts by manifest key.
 *
 * Usage: npm run ingest:approved            (all non-excluded projects)
 *        npm run ingest:approved -- kids-football spcki   (only these keys)
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const manifest = path.resolve(__dirname, '..', '..', '..', '.claude-project', 'clients', '_approved.yaml');
    const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
    const result = await app.get(ApprovedIngestService).ingestManifest(manifest, { only });
    console.log(`\nIngested ${result.ingested.length} gold cases, skipped ${result.skipped.length}.`);
    for (const r of result.ingested) console.log(`  ✓ ${r.title.padEnd(60)} ${r.template}/${r.currency} ${String(r.weeks ?? '?').padStart(4)} wks ${String(r.effortDays).padStart(5)} pd  phases:${r.phases} features:${r.features}`);
    for (const s of result.skipped) console.log(`  ✗ ${s.key}: ${s.reason}`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('ingest:approved failed:', e);
  process.exit(1);
});

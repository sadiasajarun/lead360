import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SeedCaseIngestService } from '../modules/project-case/seed-case-ingest.service';

/**
 * Rebuild the Project Case store from Riseup's REAL delivered corpus (KB seed proposals + budgets), so the
 * learned norms/analogs come from actual projects — not junk in-app test leads. Drops the in-app test cases
 * first. One AI extraction per project (~$0.30 total). Idempotent — upserts by source document.
 *
 * Usage: npm run ingest:seed-cases
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const svc = app.get(SeedCaseIngestService);
    const result = await svc.ingestSeedCorpus({ dropInApp: true });
    console.log('Seed-corpus case ingest complete:', result);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('ingest:seed-cases failed:', e);
  process.exit(1);
});

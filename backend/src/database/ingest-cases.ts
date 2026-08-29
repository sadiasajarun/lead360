import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ProjectCaseIngestService } from '../modules/project-case/project-case-ingest.service';

/**
 * Backfill the Project Case store (Learning Engine, Phase 2b) from every delivered proposal in the DB.
 * Extracts the structured decisions (team / phases / timeline / budget / stack / modules) + embeds each case
 * for hybrid retrieval. Idempotent — upserts by source lead, so re-running is safe.
 *
 * Usage: npm run ingest:cases
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const svc = app.get(ProjectCaseIngestService);
    const result = await svc.backfillAll();
    console.log('Project Case backfill complete:', result);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('ingest:cases failed:', e);
  process.exit(1);
});

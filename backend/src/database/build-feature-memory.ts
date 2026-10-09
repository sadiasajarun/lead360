import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FeatureMemoryService } from '../modules/project-case/feature-memory.service';

/**
 * (Re)build the per-feature memory (case_features) from the approved gold cases. Embeddings only (no chat
 * calls) — fractions of a cent. Idempotent: replaces each case's feature rows.
 *
 * Usage: npm run build:feature-memory
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    console.log('Feature memory:', await app.get(FeatureMemoryService).rebuildFromGold());
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('build:feature-memory failed:', e);
  process.exit(1);
});

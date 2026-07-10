import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { AiService } from '../infrastructure/ai/ai.service';
import { KbRepository } from '../modules/kb/kb.repository';

// (Re)embed every kb_chunk whose embedding is currently NULL. Idempotent and safe to re-run.
// Needed after any event that clears embeddings (e.g. a schema-sync that dropped the raw column).
async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const ai = app.get(AiService);
  const repo = app.get(KbRepository);
  const ds = app.get<DataSource>(getDataSourceToken());

  if (!ai.enabled) throw new Error('AI_API_KEY not set — cannot embed.');

  const rows: { id: string; text: string }[] = await ds.query(
    "SELECT id, text FROM kb_chunks WHERE embedding IS NULL AND length(trim(text)) > 0 ORDER BY created_at",
  );
  console.log(`Chunks needing embedding: ${rows.length}`);

  const BATCH = 50;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vectors = await ai.embed(batch.map((r) => r.text));
    await Promise.all(vectors.map((v, j) => repo.setEmbedding(batch[j].id, v)));
    done += batch.length;
    console.log(`  embedded ${done}/${rows.length}`);
  }

  const [{ total, emb }] = await ds.query(
    'SELECT count(*)::int total, count(embedding)::int emb FROM kb_chunks',
  );
  console.log(`\nDone. kb_chunks: ${emb}/${total} now have embeddings.`);
  await app.close();
}

run().catch((e) => {
  console.error('Re-embed failed:', e);
  process.exit(1);
});

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { KbChunk } from '../modules/kb/kb-chunk.entity';
import { KbDocument } from '../modules/kb/kb-document.entity';
import { EstimateService } from '../modules/estimate/estimate.service';
import { usdTotals, weeksOf, projectKey, scopeSizeOf } from '../modules/estimate/estimate.mining';

/**
 * Mine the ingested corpus (kb_chunks text of Proposal/Budget documents) into `historical_projects`
 * — one row per delivered project with its total (normalized to USD) and timeline. Powers the
 * budget-first band (EstimateService.band). Idempotent: upserts by (category, title).
 *
 * Usage:  DATABASE_SYNCHRONIZE=false npm run ingest:estimates
 * (Run with the API up once so the historical_projects table already exists via synchronize, then
 *  this reads/writes without re-syncing the pgvector-managed tables.)
 */

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const ds = app.get(DataSource);
  const estimate = app.get(EstimateService);

  const docs = await ds.getRepository(KbDocument).find();
  const chunks = await ds.getRepository(KbChunk).find();
  const textByDoc = new Map<string, string>();
  for (const c of chunks) textByDoc.set(c.kbDocumentId, (textByDoc.get(c.kbDocumentId) ?? '') + '\n' + c.text);

  type Acc = { category: string; title: string; totalUsd?: number; currency?: string; weeks?: number; fromBudget: boolean; source: string };
  const byProject = new Map<string, Acc>();

  for (const d of docs) {
    const section = String((d.meta as Record<string, unknown>)?.section ?? '');
    if (section !== 'Proposal' && section !== 'Budget') continue; // only priced sections
    const category = d.category ?? 'Uncategorized';
    const text = textByDoc.get(d.id) ?? '';
    if (!text.trim()) continue;

    const totals = usdTotals(text);
    const total = totals.length ? Math.max(...totals) : undefined; // grand total ≈ largest figure
    const bdt = /(?:BDT|Tk\.?|৳|taka)/i.test(text) && !/\$|USD/i.test(text);
    const weeks = weeksOf(text);

    const key = `${category}::${projectKey(d.title)}`;
    const prev = byProject.get(key);
    const isBudget = section === 'Budget';
    if (!prev) {
      byProject.set(key, { category, title: d.title, totalUsd: total, currency: bdt ? 'BDT' : 'USD', weeks, fromBudget: isBudget, source: d.sourcePath });
    } else {
      // Prefer a Budget doc's total; otherwise keep the larger. Fill weeks from whichever has it.
      if (total != null && (isBudget && !prev.fromBudget || (total ?? 0) > (prev.totalUsd ?? 0))) {
        prev.totalUsd = total; prev.currency = bdt ? 'BDT' : 'USD'; prev.fromBudget = prev.fromBudget || isBudget; prev.source = d.sourcePath;
      }
      if (prev.weeks == null && weeks != null) prev.weeks = weeks;
    }
  }

  let saved = 0, skipped = 0;
  for (const a of byProject.values()) {
    if (a.totalUsd == null) { skipped++; continue; }
    await estimate.upsert({
      category: a.category,
      title: a.title.replace(/\.(pdf|docx?|xlsx?|pptx?|txt)$/i, ''),
      totalUsdCents: String(Math.round(a.totalUsd * 100)),
      currency: a.currency,
      weeks: a.weeks,
      scopeSize: scopeSizeOf(a.totalUsd),
      source: a.source,
    });
    saved++;
  }

  console.log(`\nHistorical estimates: ${saved} projects mined, ${skipped} skipped (no total). Corpus docs scanned: ${docs.length}.`);
  for (const cat of ['Global', 'Local', 'Agency', 'Design Portfolio']) {
    const band = await estimate.band(cat).catch(() => null);
    console.log(
      band
        ? `  ${cat.padEnd(16)} band $${Math.round(band.loCents / 100).toLocaleString()}–$${Math.round(band.hiCents / 100).toLocaleString()} (median $${Math.round(band.medianCents / 100).toLocaleString()}, n=${band.n})`
        : `  ${cat.padEnd(16)} band — too few projects`,
    );
  }
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

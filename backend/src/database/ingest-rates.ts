import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import * as ExcelJS from 'exceljs';
import { AppModule } from '../app.module';
import { RateCard } from '../modules/rate-card/rate-card.entity';
import { Seniority } from '../common/enums';
import { DataSource } from 'typeorm';

// Rebuild the rate card from the REAL Riseup budget spreadsheets (the "head cost" documents the
// user provided): every Budget xlsx in data/kb-seed/{Global,Local}/Budget plus data/rate-sources/.
// Sheet shape (FIFA structure): Sl. | Departments | Heads | Type | No. of Unit | No. of Days |
// Per Day Cost | Unit Cost | Total Cost. "Per Day Cost" is in BDT; the spec fixes USD/BDT = 120
// (no live FX). Rate per (role, seniority) = MEDIAN across all sightings -> USD cents.
//
// This REPLACES the previous seeded rates (which were invented placeholders — a §10 violation).
// Idempotent: wipes and reinserts the whole card each run.
//
// Usage: npm run ingest:rates

const USD_BDT = 120;

const SOURCE_DIRS = [
  'data/kb-seed/Global/Budget',
  'data/kb-seed/Local/Budget',
  'data/rate-sources',
];

function normRole(raw: string): string {
  const r = raw.replace(/\s+/g, ' ').trim();
  // Light canonicalization only — keep the document vocabulary (it IS the truth), just fix casing
  // and the couple of obvious spelling variants.
  const map: Record<string, string> = {
    devops: 'DevOps Engineer',
    'devops engineer': 'DevOps Engineer',
    'sqa engineer': 'SQA Engineer',
    sqa: 'SQA Engineer',
  };
  return map[r.toLowerCase()] ?? r;
}

function normSeniority(raw: string): Seniority | null {
  const t = raw.trim().toLowerCase();
  if (t.startsWith('senior') || t === 'sr') return Seniority.SENIOR;
  if (t.startsWith('mid') || t.startsWith('intermediate')) return Seniority.MID;
  if (t.startsWith('junior') || t === 'jr' || t.startsWith('entry')) return Seniority.JUNIOR;
  return null; // headers, blanks, milestone labels
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function run() {
  const sightings = new Map<string, { role: string; seniority: Seniority; dept: string; bdt: number[] }>();
  let files = 0;
  let rows = 0;

  for (const dir of SOURCE_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.xlsx'))) {
      const wb = new ExcelJS.Workbook();
      try {
        await wb.xlsx.readFile(join(dir, name));
      } catch (e) {
        console.warn(`✗ unreadable, skipped: ${name} (${(e as Error).message})`);
        continue;
      }
      files++;
      let fileRows = 0;
      for (const ws of wb.worksheets) {
        ws.eachRow((row) => {
          const cell = (c: number) => {
            const v = row.getCell(c).value as unknown;
            if (v && typeof v === 'object' && 'result' in (v as object)) return (v as { result: unknown }).result;
            return v;
          };
          const role = String(cell(3) ?? '').trim(); // Heads
          const seniority = normSeniority(String(cell(4) ?? ''));
          const perDay = Number(cell(7)); // Per Day Cost (BDT)
          if (!role || role.toLowerCase() === 'heads' || !seniority) return;
          if (!Number.isFinite(perDay) || perDay < 500 || perDay > 50000) return; // sanity: real BDT day rates
          const dept = String(cell(2) ?? '').replace(/\s+/g, ' ').trim() || 'Development';
          const key = `${normRole(role).toLowerCase()}|${seniority}`;
          const e = sightings.get(key) ?? { role: normRole(role), seniority, dept, bdt: [] };
          e.bdt.push(perDay);
          sightings.set(key, e);
          fileRows++;
        });
      }
      rows += fileRows;
      console.log(`✓ ${basename(name)} — ${fileRows} rate row(s)`);
    }
  }

  if (!sightings.size) throw new Error('No rate rows found — refusing to wipe the rate card.');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const ds = app.get(DataSource);
  const repo = ds.getRepository(RateCard);

  await repo.createQueryBuilder().delete().execute(); // full rebuild — the docs are the truth
  for (const e of sightings.values()) {
    const bdt = median(e.bdt);
    const usdCents = Math.round((bdt / USD_BDT) * 100);
    await repo.save(
      repo.create({
        department: e.dept,
        role: e.role,
        seniority: e.seniority,
        dayRateCents: String(usdCents),
        currency: 'USD',
      }),
    );
    console.log(
      `  ${e.role} (${e.seniority}) — median ৳${bdt.toFixed(0)}/day -> $${(usdCents / 100).toFixed(2)}/day  [${e.bdt.length} sighting(s)]`,
    );
  }

  console.log(`\nDone. ${files} budget file(s), ${rows} rows -> ${sightings.size} rate-card entries (BDT→USD @ ${USD_BDT}).`);
  await app.close();
}

run().catch((e) => {
  console.error('Rate ingest failed:', e);
  process.exit(1);
});

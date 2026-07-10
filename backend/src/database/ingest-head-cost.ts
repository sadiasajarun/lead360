import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { RateCard } from '../modules/rate-card/rate-card.entity';
import { Seniority } from '../common/enums';

/**
 * Rebuild the rate card from Riseup's AUTHORED head-cost spreadsheet — the single source of cost
 * (spec §10). This supersedes `ingest:rates`, which derived rates by taking medians out of past
 * budget documents; those numbers happened to match, but the sheet is the truth.
 *
 * Sheet layout (row 2 = headers, data from row 3, blank spacer rows between departments):
 *   A Sl. | B Departments | C Heads | D Monthly BDT | E Daily BDT | F Hourly BDT
 *   G (X) | H Monthly USD | I Daily USD | J Hourly USD        …K/L: "USD>BDT." | 120
 *
 * BDT columns are stored verbatim — never USD × FX (user decision 2026-07-10).
 *
 * Usage: npm run ingest:head-cost [-- "C:\\path\\to\\Head-Cost….xlsx"]
 */

const SOURCE_DIR = 'data/rate-sources';

function findSheet(explicit?: string): string {
  if (explicit) return explicit;
  if (!existsSync(SOURCE_DIR)) throw new Error(`Missing ${SOURCE_DIR}`);
  const hit = readdirSync(SOURCE_DIR).find((f) => /head-cost/i.test(f) && f.endsWith('.xlsx'));
  if (!hit) throw new Error(`No Head-Cost*.xlsx found in ${SOURCE_DIR}`);
  return join(SOURCE_DIR, hit);
}

/** "Sr. UI/UX Designer" → senior · "Jr. …" → junior · anything else → mid. */
function seniorityOf(role: string): Seniority {
  const r = role.toLowerCase();
  if (/^(sr\.?|senior)\b/.test(r) || /\b(lead|architect|director|head)\b/.test(r)) return Seniority.SENIOR;
  if (/^(jr\.?|junior)\b/.test(r) || /\bintern\b/.test(r)) return Seniority.JUNIOR;
  if (/^(mid|intermediate)\b/.test(r)) return Seniority.MID;
  return Seniority.MID;
}

const cents = (n: number) => String(Math.round(n * 100));

async function run() {
  const file = findSheet(process.argv[2]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];

  const raw = (r: number, c: number): unknown => {
    const v = ws.getRow(r).getCell(c).value as unknown;
    if (v && typeof v === 'object') {
      const o = v as { result?: unknown; text?: unknown };
      return o.result ?? o.text ?? null;
    }
    return v;
  };
  const num = (r: number, c: number) => Number(raw(r, c));
  const str = (r: number, c: number) => String(raw(r, c) ?? '').replace(/\s+/g, ' ').trim();

  // FX lives in the header (K1/L1 = "USD>BDT." | 120). Recorded for reference — not used to derive BDT.
  const fx = Number(raw(1, 12)) || Number(raw(2, 12)) || 120;

  const rows: Partial<RateCard>[] = [];
  const seen = new Set<string>();
  for (let r = 3; r <= ws.rowCount; r++) {
    const department = str(r, 2);
    const role = str(r, 3);
    const monthlyBdt = num(r, 4);
    const dailyBdt = num(r, 5);
    const hourlyBdt = num(r, 6);
    const monthlyUsd = num(r, 8);
    const dailyUsd = num(r, 9);
    const hourlyUsd = num(r, 10);

    // Skip spacer rows, headers, and any row without a real monthly cost.
    if (!department || !role || !Number.isFinite(monthlyBdt) || monthlyBdt <= 0) continue;
    if (!Number.isFinite(dailyUsd) || dailyUsd <= 0) continue;

    const key = `${department}|${role}`.toLowerCase();
    if (seen.has(key)) {
      console.warn(`  ! duplicate row skipped: ${department} / ${role}`);
      continue;
    }
    seen.add(key);

    rows.push({
      department,
      role,
      seniority: seniorityOf(role),
      monthlyBdtCents: cents(monthlyBdt),
      dailyBdtCents: cents(dailyBdt),
      hourlyBdtCents: cents(hourlyBdt),
      monthlyUsdCents: cents(monthlyUsd),
      dailyUsdCents: cents(dailyUsd),
      hourlyUsdCents: cents(hourlyUsd),
      dayRateCents: cents(dailyUsd), // deprecated mirror, keeps old budget code resolving
      currency: 'USD',
    });
  }

  if (rows.length < 20) throw new Error(`Only ${rows.length} rate rows parsed — refusing to wipe the card.`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const repo = app.get(DataSource).getRepository(RateCard);
  await repo.createQueryBuilder().delete().execute(); // full rebuild — the sheet is the truth
  await repo.save(rows.map((r) => repo.create(r)));

  const byDept = new Map<string, number>();
  for (const r of rows) byDept.set(r.department!, (byDept.get(r.department!) ?? 0) + 1);
  console.log(`\nSource: ${file}\nFX header: USD>BDT = ${fx} (recorded; BDT columns used verbatim)\n`);
  for (const [d, n] of byDept) console.log(`  ${d.padEnd(32)} ${n} role(s)`);
  console.log(`\nDone. ${rows.length} rate-card entries across ${byDept.size} departments.`);

  const sample = rows[0];
  console.log(
    `  e.g. ${sample.role} — $${(Number(sample.dailyUsdCents) / 100).toFixed(2)}/day · ` +
      `৳${(Number(sample.dailyBdtCents) / 100).toFixed(2)}/day`,
  );
  await app.close();
}

run().catch((e) => {
  console.error('Head-cost ingest failed:', e);
  process.exit(1);
});

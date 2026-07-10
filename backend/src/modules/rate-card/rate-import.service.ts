import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { RateCardRepository } from './rate-card.repository';
import { AiService } from '../../infrastructure/ai/ai.service';
import { AuditService } from '../audit/audit.service';
import { Seniority } from '../../common/enums';

/** Canonical columns we need. The uploaded sheet may name them anything. */
const FIELDS = [
  'department',
  'role',
  'monthlyBdt',
  'dailyBdt',
  'hourlyBdt',
  'monthlyUsd',
  'dailyUsd',
  'hourlyUsd',
] as const;
type Field = (typeof FIELDS)[number];

export interface ImportRow {
  department: string;
  role: string;
  seniority: Seniority;
  monthlyBdtCents: string;
  dailyBdtCents: string;
  hourlyBdtCents: string;
  monthlyUsdCents: string;
  dailyUsdCents: string;
  hourlyUsdCents: string;
  dayRateCents: string;
  currency: string;
}

export interface ImportPreview {
  mapping: Record<string, Field | null>;
  headerRow: number;
  parsed: number;
  skipped: number;
  warnings: string[];
  rows: ImportRow[];
}

const cents = (n: number) => String(Math.round(n * 100));

/** "Sr. UI/UX Designer" → senior · "Jr. …" → junior · else mid. Mirrors ingest-head-cost.ts. */
export function seniorityOf(role: string): Seniority {
  const r = role.toLowerCase();
  if (/^(sr\.?|senior)\b/.test(r) || /\b(lead|architect|director|head)\b/.test(r)) return Seniority.SENIOR;
  if (/^(jr\.?|junior)\b/.test(r) || /\bintern\b/.test(r)) return Seniority.JUNIOR;
  return Seniority.MID;
}

/**
 * Bulk rate-card import from an arbitrary CSV/XLSX. The AI is used ONLY to map the sheet's column
 * headers onto our canonical fields — it never reads or produces a single number. Every value is
 * parsed from the sheet in code, so a hallucination cannot change a price (spec §10).
 */
@Injectable()
export class RateImportService {
  private readonly logger = new Logger(RateImportService.name);

  constructor(
    private readonly repo: RateCardRepository,
    private readonly ai: AiService,
    private readonly audit: AuditService,
  ) {}

  /** Deterministic fallback when the AI is unavailable — matches the obvious header wordings. */
  private guessMapping(headers: string[]): Record<string, Field | null> {
    const out: Record<string, Field | null> = {};
    for (const h of headers) {
      const t = h.toLowerCase();
      const bdt = /bdt|৳|taka/.test(t);
      const usd = /usd|\$|dollar/.test(t);
      const per = /month/.test(t) ? 'monthly' : /da(y|ily)/.test(t) ? 'daily' : /hour|hr/.test(t) ? 'hourly' : null;
      if (/depart/.test(t)) out[h] = 'department';
      else if (/head|role|position|designation/.test(t)) out[h] = 'role';
      else if (per && bdt) out[h] = `${per}Bdt` as Field;
      else if (per && usd) out[h] = `${per}Usd` as Field;
      else out[h] = null;
    }
    return out;
  }

  private async aiMapping(headers: string[]): Promise<Record<string, Field | null>> {
    if (!this.ai.enabled) return this.guessMapping(headers);
    try {
      const { data } = await this.ai.json<{ mapping: Record<string, string | null> }>({
        maxTokens: 1200,
        prompt:
          'Map each spreadsheet column header to exactly one canonical field, or null when it maps to none.\n' +
          `Canonical fields: ${FIELDS.join(', ')}.\n` +
          'Meaning: department = the team/department; role = the person/head/position title; ' +
          'monthlyBdt/dailyBdt/hourlyBdt = cost per month/day/hour in Bangladeshi Taka; ' +
          'monthlyUsd/dailyUsd/hourlyUsd = the same in US Dollars.\n' +
          'Never map two headers to the same field. Return {"mapping": {"<header>": "<field or null>"}}.\n' +
          `Headers: ${JSON.stringify(headers)}`,
      });
      const out: Record<string, Field | null> = {};
      const used = new Set<string>();
      for (const h of headers) {
        const v = data?.mapping?.[h];
        const ok = typeof v === 'string' && (FIELDS as readonly string[]).includes(v) && !used.has(v);
        out[h] = ok ? ((used.add(v), v) as Field) : null;
      }
      // If the model produced nothing usable, fall back rather than import an empty mapping.
      return Object.values(out).some(Boolean) ? out : this.guessMapping(headers);
    } catch (e) {
      this.logger.warn(`AI header mapping failed, falling back to keyword matching: ${String(e)}`);
      return this.guessMapping(headers);
    }
  }

  /** Parse + map, WITHOUT touching the database. The admin confirms before anything is written. */
  async preview(file: { originalname: string; buffer: Buffer }): Promise<ImportPreview> {
    if (!file?.buffer?.length) throw new BadRequestException('No file uploaded');

    const wb = new ExcelJS.Workbook();
    const isCsv = /\.csv$/i.test(file.originalname);
    try {
      if (isCsv) await wb.csv.read(bufferToStream(file.buffer));
      else await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('Could not read the file — upload a .xlsx or .csv');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('The workbook has no sheets');

    const cell = (r: number, c: number): unknown => {
      const v = ws.getRow(r).getCell(c).value as unknown;
      if (v && typeof v === 'object') {
        const o = v as { result?: unknown; text?: unknown };
        return o.result ?? o.text ?? null;
      }
      return v;
    };
    const text = (r: number, c: number) => String(cell(r, c) ?? '').replace(/\s+/g, ' ').trim();

    // The header row isn't always row 1 — real sheets carry a merged title band whose text repeats
    // across every cell. Score by DISTINCT non-numeric cells (a title band scores 1), and strongly
    // prefer a row that actually names a department/role column.
    let headerRow = 1;
    let best = -1;
    for (let r = 1; r <= Math.min(8, ws.rowCount); r++) {
      const distinct = new Set<string>();
      for (let c = 1; c <= ws.columnCount; c++) {
        const t = text(r, c);
        if (t && Number.isNaN(Number(t))) distinct.add(t.toLowerCase());
      }
      const names = [...distinct].join(' ');
      const looksLikeHeader = /depart|head|role|position|designation/.test(names);
      const score = distinct.size + (looksLikeHeader ? 100 : 0);
      if (score > best) { best = score; headerRow = r; }
    }

    const headers: { col: number; name: string }[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const name = text(headerRow, c);
      if (name) headers.push({ col: c, name });
    }
    if (!headers.length) throw new BadRequestException('No column headers found');

    const mapping = await this.aiMapping(headers.map((h) => h.name));
    const colOf = (f: Field) => headers.find((h) => mapping[h.name] === f)?.col;

    const warnings: string[] = [];
    for (const required of ['department', 'role', 'dailyUsd'] as Field[]) {
      if (!colOf(required)) warnings.push(`No column mapped to "${required}"`);
    }
    if (warnings.length) throw new BadRequestException(`${warnings.join('; ')}. Check the column headers.`);

    const num = (r: number, f: Field) => {
      const c = colOf(f);
      if (!c) return NaN;
      const n = Number(cell(r, c));
      return Number.isFinite(n) ? n : NaN;
    };

    const rows: ImportRow[] = [];
    const seen = new Set<string>();
    let skipped = 0;
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const department = text(r, colOf('department')!);
      const role = text(r, colOf('role')!);
      const dailyUsd = num(r, 'dailyUsd');
      if (!department || !role || !Number.isFinite(dailyUsd) || dailyUsd <= 0) { skipped++; continue; }

      const key = `${department}|${role}`.toLowerCase();
      if (seen.has(key)) { warnings.push(`Duplicate row skipped: ${department} / ${role}`); skipped++; continue; }
      seen.add(key);

      const val = (f: Field) => { const n = num(r, f); return Number.isFinite(n) && n > 0 ? n : 0; };
      rows.push({
        department,
        role,
        seniority: seniorityOf(role),
        monthlyBdtCents: cents(val('monthlyBdt')),
        dailyBdtCents: cents(val('dailyBdt')),
        hourlyBdtCents: cents(val('hourlyBdt')),
        monthlyUsdCents: cents(val('monthlyUsd')),
        dailyUsdCents: cents(dailyUsd),
        hourlyUsdCents: cents(val('hourlyUsd')),
        dayRateCents: cents(dailyUsd),
        currency: 'USD',
      });
    }

    if (!rows.length) throw new BadRequestException('No usable rate rows found in the file');
    return { mapping, headerRow, parsed: rows.length, skipped, warnings, rows };
  }

  /** Replace the whole card with the parsed rows. Guarded so a thin file can't wipe the card. */
  async commit(rows: ImportRow[], adminId: string) {
    if (!Array.isArray(rows) || rows.length < 5) {
      throw new BadRequestException('Refusing to replace the rate card with fewer than 5 rows');
    }
    const before = await this.repo.findAll();
    await this.repo.replaceAll(rows);
    await this.audit.log({
      actorId: adminId,
      action: 'ratecard.import',
      entity: 'RateCard',
      before: { count: before.length },
      after: { count: rows.length },
    });
    return { replaced: before.length, imported: rows.length };
  }
}

function bufferToStream(buf: Buffer) {
  const { Readable } = require('stream') as typeof import('stream');
  return Readable.from(buf);
}

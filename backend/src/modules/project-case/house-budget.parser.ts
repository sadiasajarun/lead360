import { Workbook, type Worksheet } from 'exceljs';

/**
 * Parses a Riseup house-format budget workbook (the "Cost Breakdown for Item 1" sheet:
 * Sl. | Departments | Heads | Type | No. of Unit | No. of Days | Per Day Cost | Unit Cost | Total Cost) into the
 * delivery facts the learning engine needs. Totals are recomputed from units × days × rate — never read from
 * formula cells — so a stale cached result can't leak in. Pure: no DB, no AI.
 */
export interface HouseBudgetLine {
  department: string;
  role: string;
  seniority: 'senior' | 'mid' | 'junior';
  units: number;
  days: number;
  rate: number;
}

export interface HouseBudget {
  sheet: string;
  lines: HouseBudgetLine[];
  /** Σ units × days × rate, major currency units. */
  total: number;
  /** Σ units × days (person-days). */
  effortDays: number;
  /** From the "Development/Delivery Timeline = N weeks" note, if present. */
  weeks?: number;
  /** Inferred from day rates: BDT rates are in the thousands, USD rates in the tens. */
  currency: 'USD' | 'BDT';
}

const num = (v: unknown): number => {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    const o = v as { result?: unknown };
    return o.result != null ? num(o.result) : NaN;
  }
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const text = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text?: string }[] };
    return String(o.result ?? o.text ?? o.richText?.map((r) => r.text ?? '').join('') ?? '').trim();
  }
  return String(v).trim();
};
const seniorityOf = (s: string): HouseBudgetLine['seniority'] => {
  const t = s.toLowerCase();
  if (t.startsWith('sr') || t.includes('senior') || t.includes('lead')) return 'senior';
  if (t.startsWith('jr') || t.includes('junior')) return 'junior';
  return 'mid';
};

export function parseWeeksNote(s: string): number | undefined {
  const m = /timeline\s*=\s*([\d.]+)\s*weeks?/i.exec(s) ?? /\b([\d.]+)\s*weeks?\b/i.exec(s);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n < 200 ? n : undefined;
}

function parseSheet(ws: Worksheet): HouseBudget | null {
  let headerRow = 0;
  const col: Record<string, number> = {};
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (headerRow) return;
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (c, i) => (cells[i] = text(c.value).toLowerCase()));
    if (cells.some((c) => c === 'heads' || c === 'role') && cells.some((c) => c?.includes('day'))) {
      headerRow = r;
      cells.forEach((c, i) => {
        if (!c) return;
        if (c.startsWith('department')) col.dept = i;
        else if (c === 'heads' || c === 'role') col.role = i;
        else if (c === 'type' || c.startsWith('seniority')) col.type = i;
        else if (c.includes('unit') && !c.includes('cost')) col.units = i;
        else if (c.includes('no. of days') || c === 'days' || c.startsWith('no of days')) col.days = i;
        else if (c.includes('per day') || c.includes('day rate') || c.includes('rate')) col.rate ??= i;
      });
    }
  });
  if (!headerRow || !col.role || !col.days || !col.rate) return null;

  const lines: HouseBudgetLine[] = [];
  let dept = '';
  let weeks: number | undefined;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const first = text(row.getCell(1).value);
    if (/^note/i.test(first)) weeks ??= parseWeeksNote(first);
    if (/^total/i.test(first)) continue;
    if (col.dept) dept = text(row.getCell(col.dept).value) || dept;
    const role = text(row.getCell(col.role).value);
    const units = col.units ? num(row.getCell(col.units).value) : 1;
    const days = num(row.getCell(col.days).value);
    const rate = num(row.getCell(col.rate).value);
    if (!role || !Number.isFinite(days) || !Number.isFinite(rate) || days <= 0 || rate <= 0) continue;
    lines.push({ department: dept, role, seniority: seniorityOf(col.type ? text(row.getCell(col.type).value) : role), units: Number.isFinite(units) && units > 0 ? units : 1, days, rate });
  }
  if (!lines.length) return null;
  // Notes can also sit below the table in any column.
  if (weeks === undefined) ws.eachRow((row) => row.eachCell((c) => { if (weeks === undefined && /timeline/i.test(text(c.value))) weeks = parseWeeksNote(text(c.value)); }));
  const total = Math.round(lines.reduce((s, l) => s + l.units * l.days * l.rate, 0) * 100) / 100;
  const effortDays = Math.round(lines.reduce((s, l) => s + l.units * l.days, 0) * 100) / 100;
  const medianRate = [...lines.map((l) => l.rate)].sort((a, b) => a - b)[Math.floor(lines.length / 2)];
  return { sheet: ws.name, lines, total, effortDays, weeks, currency: medianRate >= 500 ? 'BDT' : 'USD' };
}

/** First sheet that carries a house-format resource table (the "Development" cost breakdown). */
export async function parseHouseBudget(path: string): Promise<HouseBudget | null> {
  const wb = new Workbook();
  await wb.xlsx.readFile(path);
  for (const ws of wb.worksheets) {
    const parsed = parseSheet(ws);
    if (parsed) return parsed;
  }
  return null;
}

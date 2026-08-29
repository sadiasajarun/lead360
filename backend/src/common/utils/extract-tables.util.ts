import * as mammoth from 'mammoth';
import * as ExcelJS from 'exceljs';
import * as cheerio from 'cheerio';
import pdfParse = require('pdf-parse');
import type { ExtractableFile } from './extract-text.util';

/**
 * Table-PRESERVING extraction, for documents whose meaning lives in a grid — supplier quotations above all.
 *
 * This is deliberately a SEPARATE function from `extractText()`, which must keep its current behaviour for
 * its six consumers. `extractText` cannot be used here:
 *   - its DOCX path uses `mammoth.extractRawText`, which flattens a table to bare newline-separated cells,
 *     so an item name, its quantity and its price become indistinguishable (a real quotation's price table
 *     vanished entirely this way);
 *   - its XLSX path drops empty cells, which shifts every later value left and silently mis-columns a row.
 *
 * Output keeps BOTH channels, because a quotation splits its meaning across them: the priced line items sit
 * in the table, while warranty, delivery lead time and payment terms sit in the surrounding prose.
 */
export interface ExtractedTable {
  /** Row-major cells, ragged rows preserved as-is. */
  rows: string[][];
}

export interface RichExtract {
  /** Prose outside any table — warranty, delivery window, payment terms. */
  prose: string;
  tables: ExtractedTable[];
  /** Prose + every table rendered as pipe-delimited rows — the single string to hand an extractor. */
  text: string;
}

const clean = (s: string): string => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/** Render tables as pipe-delimited rows so column position survives into a prompt. */
function render(prose: string, tables: ExtractedTable[]): string {
  const blocks = tables
    .filter((t) => t.rows.length)
    .map((t, i) => `# Table ${i + 1}\n${t.rows.map((r) => r.join(' | ')).join('\n')}`);
  return [prose.trim(), ...blocks].filter(Boolean).join('\n\n');
}

async function fromDocx(buffer: Buffer): Promise<RichExtract> {
  // convertToHtml (NOT extractRawText) is what keeps <table>/<tr>/<td> intact.
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const $ = cheerio.load(html);

  const tables: ExtractedTable[] = [];
  $('table').each((_, el) => {
    const rows: string[][] = [];
    $(el).find('tr').each((__, tr) => {
      const cells: string[] = [];
      $(tr).find('th,td').each((___, td) => { cells.push(clean($(td).text())); });
      if (cells.some(Boolean)) rows.push(cells);
    });
    if (rows.length) tables.push({ rows });
  });

  // Prose = everything with the tables removed, so terms are not duplicated into the table channel.
  $('table').remove();
  const prose = $.root().text().split('\n').map(clean).filter(Boolean).join('\n');
  return { prose, tables, text: render(prose, tables) };
}

async function fromXlsx(buffer: Buffer): Promise<RichExtract> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const tables: ExtractedTable[] = [];
  wb.eachSheet((sheet) => {
    const rows: string[][] = [];
    // includeEmpty keeps blank cells in place — dropping them would shift every later column.
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells = (row.values as unknown[]).slice(1).map((v) => {
        if (v == null) return '';
        if (typeof v === 'object') {
          const o = v as Record<string, unknown>;
          if ('text' in o) return clean(String(o.text));
          if ('result' in o) return clean(String(o.result));
          if ('richText' in o) return clean((o.richText as { text: string }[]).map((r) => r.text).join(''));
        }
        return clean(String(v));
      });
      if (cells.some(Boolean)) rows.push(cells);
    });
    if (rows.length) tables.push({ rows });
  });
  return { prose: '', tables, text: render('', tables) };
}

/**
 * Extract a document into prose + tables. A PDF has no recoverable grid, so its whitespace-aligned text is
 * returned as prose and the column inference is left to the caller.
 */
export async function extractTables(file: ExtractableFile): Promise<RichExtract> {
  const name = (file.originalname || '').toLowerCase();
  const empty: RichExtract = { prose: '', tables: [], text: '' };
  try {
    if (name.endsWith('.docx')) return await fromDocx(file.buffer);
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return await fromXlsx(file.buffer);
    if (name.endsWith('.pdf')) {
      const prose = (await pdfParse(file.buffer)).text ?? '';
      return { prose, tables: [], text: prose.trim() };
    }
    if (/\.(txt|md|csv)$/.test(name)) {
      const prose = file.buffer.toString('utf8');
      return { prose, tables: [], text: prose.trim() };
    }
    return empty;
  } catch {
    return empty; // never block an upload on a parse failure — the caller falls back to manual entry
  }
}

import * as mammoth from 'mammoth';
import * as ExcelJS from 'exceljs';

// CommonJS default exports; import-equals is runtime-safe without esModuleInterop.
import pdfParse = require('pdf-parse');
import JSZip = require('jszip');

export interface ExtractableFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
}

// Flatten every worksheet into "Sheet · header: cell | cell" lines so budgets (roles, days, rates,
// totals) become searchable RAG text rather than opaque binary.
async function extractXlsx(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const lines: string[] = [];
  wb.eachSheet((sheet) => {
    lines.push(`# Sheet: ${sheet.name}`);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells = (row.values as unknown[]).slice(1).map((v) => {
        if (v == null) return '';
        if (typeof v === 'object' && 'text' in (v as Record<string, unknown>)) return String((v as { text: unknown }).text);
        if (typeof v === 'object' && 'result' in (v as Record<string, unknown>)) return String((v as { result: unknown }).result);
        return String(v);
      });
      const joined = cells.map((c) => c.trim()).filter(Boolean).join(' | ');
      if (joined) lines.push(joined);
    });
  });
  return lines.join('\n').trim();
}

// Pull the visible text runs (<a:t>) out of every slide XML in a .pptx (Office Open XML = a zip).
async function extractPptx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return na - nb;
    });
  const out: string[] = [];
  for (const n of slideNames) {
    const xml = await zip.files[n].async('string');
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]);
    const text = runs.join(' ').replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
  }
  return out.join('\n').trim();
}

// Best-effort text extraction from an uploaded document. Unparseable types (e.g. legacy .doc) return ''.
export async function extractText(file: ExtractableFile): Promise<string> {
  const name = file.originalname.toLowerCase();
  try {
    if (file.mimetype === 'application/pdf' || name.endsWith('.pdf')) {
      return ((await pdfParse(file.buffer)).text || '').trim();
    }
    if (name.endsWith('.docx') || file.mimetype.includes('wordprocessingml')) {
      return ((await mammoth.extractRawText({ buffer: file.buffer })).value || '').trim();
    }
    if (name.endsWith('.xlsx') || file.mimetype.includes('spreadsheetml')) {
      return await extractXlsx(file.buffer);
    }
    if (name.endsWith('.pptx') || file.mimetype.includes('presentationml')) {
      return await extractPptx(file.buffer);
    }
    if (file.mimetype.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
      return file.buffer.toString('utf8').trim();
    }
  } catch {
    return '';
  }
  return '';
}

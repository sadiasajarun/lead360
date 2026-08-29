import 'reflect-metadata';
import { readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { extractText } from '../common/utils/extract-text.util';

/**
 * Pull the real numbers out of the delivered proposals + the client briefs, so the generated output can be
 * diffed against what Riseup actually sent. Text-only, no AI - this must not spend tokens.
 */

const ROOT = join(__dirname, '../../data/kb-seed');
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF = 'application/pdf';

const FILES = [
  { key: 'steel-welding', kind: 'brief', path: join(ROOT, 'Global/Client requirement/PROJECT OVERVIEW- Steel Welding.docx'), mime: DOCX },
  { key: 'steel-welding', kind: 'reference', path: join(ROOT, 'Global/Proposal/Steel_Welding_VR_Training_Technical_Proposal_Revised_Duration_Options.docx'), mime: DOCX },
  { key: 'e-learning', kind: 'brief', path: join(ROOT, 'Local/Client requirement/Terms of reference-E-Learning.pdf'), mime: PDF },
  { key: 'e-learning', kind: 'reference', path: join(ROOT, 'Local/Proposal/Technical_Proposal_E_Learning_Digital_Accessibility_Disability_Inclusion.docx'), mime: DOCX },
  { key: 'humm', kind: 'brief', path: join(ROOT, 'Agency/Client requirement/Hummm - UX_UI Estimation (Final) - Dev Draft.pdf'), mime: PDF },
  { key: 'humm', kind: 'reference', path: join(ROOT, 'Agency/Proposal/Humm_Technical_and_Financial_Proposal_iOS_Development.docx'), mime: DOCX },
];

/** Money-looking figures, biggest first - the headline total is almost always the largest number present. */
function money(text: string): string[] {
  const hits = text.match(/(?:USD|BDT|\$|৳|Tk\.?|BDT\.)\s?[\d,]{3,}(?:\.\d+)?|\b[\d,]{5,}(?:\.\d+)?\s?(?:USD|BDT|taka)\b/gi) ?? [];
  const value = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0;
  return [...new Set(hits)].sort((a, b) => value(b) - value(a)).slice(0, 12);
}

/** Sentences that state a duration or a budget - the two things the plan is judged on. */
function statements(text: string, re: RegExp, limit = 8): string[] {
  const out: string[] = [];
  for (const line of text.split(/[\n.]/)) {
    const t = line.replace(/\s+/g, ' ').trim();
    if (t.length > 8 && t.length < 240 && re.test(t)) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

void (async () => {
  const report: Record<string, Record<string, unknown>> = {};
  for (const f of FILES) {
    const text = await extractText({ originalname: basename(f.path), buffer: readFileSync(f.path), mimetype: f.mime });
    report[f.key] ??= {};
    report[f.key][f.kind] = {
      file: basename(f.path),
      chars: text.length,
      money: money(text),
      budgetLines: statements(text, /budget|cost|investment|price|fee|ceiling|BDT|USD/i),
      timelineLines: statements(text, /\b(week|month|duration|timeline|deadline|delivery)\b/i),
      teamLines: statements(text, /\b(developer|engineer|designer|manager|QA|team|resource|man[- ]?day|person[- ]?month)\b/i, 12),
      text,
    };
  }
  const out = process.argv[2] ?? join(__dirname, 'reference-extract.json');
  writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
  for (const [key, parts] of Object.entries(report)) {
    for (const kind of ['brief', 'reference']) {
      const p = parts[kind] as { file: string; chars: number; money: string[] } | undefined;
      if (p) console.log(`${key.padEnd(15)} ${kind.padEnd(10)} ${String(p.chars).padStart(7)} chars  money: ${p.money.slice(0, 6).join(' | ')}`);
    }
  }
  console.log(`\nwrote ${out}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

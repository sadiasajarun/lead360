import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

/** Structural shape the builder needs (ClientQuery matches it). */
export interface QDocQuery {
  id: string;
  question: string;
  why: string;
  kind: 'single' | 'multi' | 'text' | 'upload';
  options?: string[];
  answer?: string;
  answers?: string[];
}

const FONT = 'Calibri';
const INK = '1A1715';
const MUTED = '6B6660';
const ACCENT = 'EA5400';

/** First 8 chars of the query id — the machine marker the importer maps answers back by. */
export const refOf = (id: string): string => (id || '').replace(/-/g, '').slice(0, 8);

const p = (children: TextRun[], opts: { spacing?: number; indent?: number } = {}): Paragraph =>
  new Paragraph({ children, spacing: { after: opts.spacing ?? 60 }, ...(opts.indent ? { indent: { left: opts.indent } } : {}) });
const run = (text: string, o: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}): TextRun =>
  new TextRun({ text, bold: o.bold, italics: o.italics, color: o.color ?? INK, size: o.size ?? 21, font: FONT });

/**
 * Build a fillable Word questionnaire from the readiness clarification questions. Universal `[ ]` tick-boxes
 * (the client types an X → `[X]`; works in Word, Google Docs, LibreOffice) and write-in lines for text — all
 * parseable back via plain-text extraction. Existing answers are pre-filled so a re-download reflects state.
 */
export async function buildQuestionnaireDocx(
  queries: QDocQuery[],
  meta: { projectTitle?: string; company?: string },
): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 80 }, children: [run('Requirement Clarifications', { bold: true, size: 32 })] }));
  const sub = [meta.projectTitle, meta.company].filter(Boolean).join(' · ');
  if (sub) children.push(p([run(sub, { color: MUTED, size: 20 })], { spacing: 120 }));
  children.push(p([run('Please answer the questions below, then save this file and send it back / upload it.', { color: INK, size: 21 })]));
  children.push(p([run('How to answer: for tick-box questions, put an X inside the brackets — [X]. For write-in questions, type your answer on the line under "Your answer:". Leave anything you are unsure of blank.', { color: MUTED, italics: true, size: 19 })], { spacing: 200 }));

  queries.forEach((q, i) => {
    // Question + why + machine marker.
    children.push(p([run(`${i + 1}. `, { bold: true }), run(q.question, { bold: true })], { spacing: 40 }));
    if (q.why) children.push(p([run(`Why we ask: ${q.why}`, { color: MUTED, italics: true, size: 19 })], { spacing: 40 }));
    children.push(p([run(`[ref: ${refOf(q.id)}]`, { color: 'B7B2AC', size: 16 })], { spacing: 40 }));

    if (q.kind === 'single' || q.kind === 'multi') {
      const hint = q.kind === 'single' ? '(choose one)' : '(choose all that apply)';
      children.push(p([run(hint, { color: MUTED, size: 18 })], { spacing: 40 }));
      const chosen = new Set((q.kind === 'multi' ? q.answers ?? [] : q.answer ? [q.answer] : []).map((s) => s.trim().toLowerCase()));
      for (const opt of q.options ?? []) {
        const on = chosen.has(opt.trim().toLowerCase());
        children.push(p([run(`[${on ? 'X' : ' '}]  ${opt}`, { size: 21 })], { indent: 260, spacing: 30 }));
      }
    } else if (q.kind === 'upload') {
      children.push(p([run('Please attach the relevant file separately (email it, or use the in-app upload button).', { color: MUTED, italics: true, size: 19 })], { indent: 260 }));
    } else {
      children.push(p([run('Your answer:', { color: MUTED, size: 19 })], { indent: 260, spacing: 30 }));
      const ans = (q.answer ?? '').trim();
      children.push(p([run(ans || '____________________________________________________________', { size: 21 })], { indent: 260 }));
    }
    children.push(new Paragraph({ spacing: { after: 160 }, children: [run('', {})] }));
  });

  children.push(p([run('Thank you — this helps us prepare an accurate proposal.', { color: ACCENT, italics: true, size: 19 })], { spacing: 40 }));

  const document = new Document({
    creator: 'Riseup Labs · Lead360',
    title: `${meta.projectTitle ?? 'Requirement'} — Clarifications`,
    styles: { default: { document: { run: { font: FONT, size: 21, color: INK } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children }],
  });
  return Packer.toBuffer(document);
}

// ── Parsing a filled questionnaire's extracted TEXT back into answers ─────────────────────────────────────

export interface ParsedAnswer {
  ref: string; // the [ref:] marker (8-char id prefix)
  question: string; // the question text as it appeared, for a fallback match
  checked: string[]; // ticked option labels (single/multi)
  text?: string; // write-in answer (text kind)
  note?: string; // free prose the client added beside the tick-boxes (their own extra context)
}

const UNDERSCORES = /^_{6,}$/;
const REF_LINE = /\[ref:\s*([0-9a-z]{4,})\s*\]/i;
const CHECKED = /^\s*\[\s*[xX✓✔]\s*\]\s*(.+?)\s*$/;
const OPTION = /^\s*\[\s*[xX✓✔ ]?\s*\]\s*(.+?)\s*$/; // any bracket line (checked or not)

/**
 * Parse the plain text of a filled questionnaire into per-question answers. Blocks are delimited by the
 * `[ref: …]` marker; each block collects ticked options and (for write-in questions) the text after
 * "Your answer:". Deliberately lenient — anything unrecognised is skipped, not failed.
 */
export function parseQuestionnaireText(text: string): ParsedAnswer[] {
  const lines = (text || '').split(/\r?\n/);
  // Find the index + ref of each question marker.
  const marks: { line: number; ref: string }[] = [];
  lines.forEach((l, i) => {
    const m = l.match(REF_LINE);
    if (m) marks.push({ line: i, ref: m[1].toLowerCase() });
  });
  const out: ParsedAnswer[] = [];
  for (let b = 0; b < marks.length; b++) {
    const start = marks[b].line;
    const end = b + 1 < marks.length ? marks[b + 1].line : lines.length;
    // The question text is the nearest meaningful line ABOVE the ref marker — skipping the muted
    // "Why we ask:" subtext (and blank spacer lines the extractor inserts between paragraphs).
    let question = '';
    for (let k = start - 1; k >= 0 && k > (b > 0 ? marks[b - 1].line : -1); k--) {
      const t = lines[k].replace(/^\s*\d+\.\s*/, '').trim();
      if (t && !/^why we ask:/i.test(t)) { question = t; break; }
    }
    const checked: string[] = [];
    let text: string | undefined;
    let inAnswer = false;
    const answerLines: string[] = [];
    const noteLines: string[] = [];
    // A ref block runs to the NEXT ref marker, so it also holds the next question's heading + "why"
    // preamble. Once that numbered heading appears, the rest belongs to THAT question — stop collecting.
    let stopped = false;
    for (let k = start + 1; k < end; k++) {
      const line = lines[k].trim();
      // Blank lines are just paragraph spacers the extractor inserts — never end a write-in region.
      if (!line) continue;
      if (/^\d+\.\s+\S/.test(line)) { stopped = true; inAnswer = false; continue; }
      if (stopped) continue;
      if (/^why we ask:/i.test(line) || /^\(choose\b/i.test(line)) { inAnswer = false; continue; }
      if (/^your answer:/i.test(line)) { inAnswer = true; const rest = line.replace(/^your answer:\s*/i, '').trim(); if (rest && !UNDERSCORES.test(rest)) answerLines.push(rest); continue; }
      const cm = line.match(CHECKED);
      if (cm) { checked.push(cm[1].trim()); inAnswer = false; continue; }
      if (OPTION.test(line)) { inAnswer = false; continue; } // an unticked option — ignore
      if (UNDERSCORES.test(line)) continue;
      // Prose: inside a write-in region it IS the answer; otherwise it is extra context the client typed
      // beside the tick-boxes (often the most valuable part) — keep it as a note rather than dropping it.
      if (inAnswer) answerLines.push(line);
      else if (!/^thank you\b/i.test(line)) noteLines.push(line);
    }
    if (answerLines.length) text = answerLines.join(' ').trim();
    const note = noteLines.join(' ').trim();
    out.push({ ref: marks[b].ref, question, checked, ...(text ? { text } : {}), ...(note ? { note } : {}) });
  }
  return out;
}

/**
 * Word (.docx) renderer for the block-based proposal — EDITABLE, brand-styled.
 *
 * The PDF is pixel-perfect (Puppeteer renders the locked HTML/CSS). Word is a reflowable format and
 * cannot reproduce CSS grid/custom layout, so this produces an EDITABLE document styled as close to the
 * design as Word allows: a dark branded cover block, orange section eyebrows, bold headings, dark table
 * headers with an orange total row, stat cards, and section dividers. Same content as the PDF.
 *
 * Keep the content contract in step with render-proposal-document.ts (the PDF renderer).
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, VerticalAlign,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, ImageRun, HeightRule,
} from 'docx';
import { PROPOSAL_CSS } from './proposal-css';

/** Pre-rasterised figure (e.g. the solution-architecture diagram) to embed as an image — keyed by block id. */
export type ArchImage = { data: Buffer; width: number; height: number };
/** Renders a figure block's PDF HTML to a PNG so Word matches the PDF exactly (architecture + process flow). */
export type ArchRasterizer = (block: SolutionArchitectureBlock | ProcessFlowBlock) => Promise<ArchImage | null>;
import type {
  ProposalDocument, ProposalMeta, Block,
  CoverBlock, OverviewBlock, ScopeBlock, FeatureMatrixBlock, WorkApproachBlock,
  DeliverablesBlock, TimelineBlock, AssumptionsBlock, OutOfScopeBlock, SignoffBlock,
  TechStackBlock, TeamAllocationBlock, FinancialBlock, EquipmentBlock, PaymentTermsBlock, CommercialTermsBlock,
  HandoverBlock, ComparablesBlock, NextStepBlock, ProseBlock,
  LayeredArchitectureBlock, NumberedFlowBlock, ProcessFlowBlock, VendorArchitectureBlock, SolutionArchitectureBlock, DiagramBlock,
} from '../../../modules/generation/blocks/block.types';

const FONT = 'Segoe UI';
const ORANGE = 'EA5400';
const INK = '211E1F';
const BODY = '39332F';
const MUTED = '6E6764';
const SUBTLE = '9C948F';
const LINE = 'E7E2DF';
const SOFT = 'F6F3F1';

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat(currency === 'BDT' ? 'en-IN' : 'en-US', { maximumFractionDigits: 0 }).format(Math.round(cents / 100));

// The Riseup logo the PDF cover uses — extracted from the SAME locked CSS asset so Word and PDF share one mark.
const RISEUP_LOGO: Buffer | null = (() => {
  const m = /--logo:url\(data:image\/png;base64,([^)]+)\)/.exec(PROPOSAL_CSS);
  return m ? Buffer.from(m[1], 'base64') : null;
})();

// Minimal PNG/JPEG pixel-size readers — ImageRun needs explicit dimensions to scale a client logo correctly.
function imageDims(buf: Buffer): { type: 'png' | 'jpg'; width: number; height: number } | null {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: 'jpg', width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5) };
      }
      off += 2 + buf.readUInt16BE(off + 2);
    }
  }
  return null;
}
// Parse a data-URI image (the client logo is stored as one on the lead) into an embeddable buffer.
function dataUriImage(uri: string | null | undefined): { data: Buffer; type: 'png' | 'jpg'; width: number; height: number } | null {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(uri ?? '');
  if (!m) return null;
  try {
    const data = Buffer.from(m[2], 'base64');
    const dims = imageDims(data);
    return dims ? { data, ...dims } : null;
  } catch { return null; }
}

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const hair = { style: BorderStyle.SINGLE, size: 2, color: LINE };
const rowBorders = { top: hair, bottom: hair, left: NONE, right: NONE };

// ── inline helpers ───────────────────────────────────────────────────────────
const run = (text: string, o: { bold?: boolean; color?: string; size?: number; caps?: boolean; spacing?: number } = {}) =>
  new TextRun({ text: o.caps ? text.toUpperCase() : text, bold: o.bold, color: o.color ?? BODY, size: o.size ?? 21, characterSpacing: o.spacing, font: FONT });

const eyebrow = (text: string) =>
  new Paragraph({ spacing: { before: 340, after: 60 }, children: [run(text, { bold: true, color: ORANGE, size: 17, caps: true, spacing: 16 })] });

const h2 = (text: string) =>
  new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { after: 150 }, children: [run(text, { bold: true, color: INK, size: 30 })] });

const h3 = (text: string) =>
  new Paragraph({ spacing: { before: 180, after: 60 }, children: [run(text, { bold: true, color: INK, size: 23 })] });

const subLabel = (text: string) =>
  new Paragraph({ spacing: { before: 100, after: 40 }, children: [run(text, { bold: true, color: ORANGE, size: 15, caps: true, spacing: 12 })] });

const para = (text: string, o: { color?: string; size?: number; bold?: boolean; after?: number } = {}) =>
  new Paragraph({ spacing: { after: o.after ?? 100 }, children: [run(text, { color: o.color ?? BODY, size: o.size ?? 21, bold: o.bold })] });

const bullets = (items: string[]) =>
  items.filter(Boolean).map((t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [run(t, { size: 20, color: '4A4340' })] }));

const numbered = (items: string[]) =>
  items.filter(Boolean).map((t, i) => new Paragraph({ spacing: { after: 40 }, children: [run(`${i + 1}.  `, { bold: true, color: ORANGE, size: 20 }), run(t, { size: 20, color: '4A4340' })] }));

// Thin divider between sections.
const divider = () => new Paragraph({ spacing: { before: 60, after: 220 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 1 } }, children: [] });

// ── table helper (dark header, optional orange total row) ────────────────────
function tcell(text: string, o: { bold?: boolean; color?: string; fill?: string; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; width?: number } = {}): TableCell {
  return new TableCell({
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    borders: rowBorders,
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: o.align, children: [run(text, { bold: o.bold, color: o.color ?? BODY, size: o.size ?? 20 })] })],
  });
}

function table(headers: string[], rows: string[][], opts: { widths?: number[]; totalRow?: boolean } = {}): Table {
  const isNum = (c: string) => /^[\d.,$৳\s]+$/.test(c.trim());
  const headerRow = new TableRow({ tableHeader: true, children: headers.map((h, i) => tcell(h, { fill: INK, color: ORANGE, bold: true, size: 16, width: opts.widths?.[i], align: i === headers.length - 1 && /\(|investment|amount/i.test(h) ? AlignmentType.RIGHT : undefined })) });
  const last = rows.length - 1;
  const bodyRows = rows.map((r, ri) => {
    const total = opts.totalRow && ri === last;
    return new TableRow({ children: r.map((c, i) => tcell(c, { width: opts.widths?.[i], fill: total ? ORANGE : undefined, color: total ? 'FFFFFF' : undefined, bold: total, align: isNum(c) && i === r.length - 1 ? AlignmentType.RIGHT : undefined })) });
  });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: [headerRow, ...bodyRows] });
}

// Overview stat cards — a row of bordered cells (big orange number + label).

// Dark branded cover — fills the whole first page like the PDF: logos on top, kicker/title/one-liner in
// the middle, prepared-for/by + contact at the foot. Same dark ground, same orange accents, same logo asset.
function coverTable(c: CoverBlock, meta: ProposalMeta): Table {
  const email = meta.contact.email || 'contact@riseuplabs.com';
  const phone = meta.contact.phone || '+88-0175-974-7387';
  const website = meta.contact.website || 'riseuplabs.com';
  const line = (label: string, value: string, valColor = 'FFFFFF') =>
    new Paragraph({ spacing: { after: 30 }, children: [run(`${label}   `, { bold: true, color: ORANGE, size: 15, caps: true, spacing: 6 }), run(value, { color: valColor, size: 18 })] });

  // Top logo band: Riseup mark left, client logo (or a text mark) right — a nested borderless table.
  const clientLogo = dataUriImage(meta.client.logoUrl);
  const clientCell: Paragraph = clientLogo
    ? new Paragraph({ alignment: AlignmentType.RIGHT, children: [new ImageRun({ type: clientLogo.type, data: clientLogo.data, transformation: { width: Math.round((clientLogo.width / clientLogo.height) * 40), height: 40 } })] })
    : new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(meta.client.name.toUpperCase(), { bold: true, color: 'FFFFFF', size: 19, spacing: 12 })] });
  const logoBand = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [new TableRow({ children: [
      new TableCell({ borders: noBorders, width: { size: 50, type: WidthType.PERCENTAGE }, children: [RISEUP_LOGO
        ? new Paragraph({ children: [new ImageRun({ type: 'png', data: RISEUP_LOGO, transformation: { width: 54, height: 54 } })] })
        : new Paragraph({ children: [run('RISEUP LABS', { bold: true, color: 'FFFFFF', size: 22, spacing: 16 })] })] }),
      new TableCell({ borders: noBorders, width: { size: 50, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: [clientCell] }),
    ] })],
  });

  const inner: (Paragraph | Table)[] = [
    logoBand,
    // Mid block, pushed down so the title sits in the upper-middle of the page like the PDF.
    new Paragraph({ spacing: { before: 2600, after: 100 }, children: [run(c.kicker, { bold: true, color: ORANGE, size: 18, caps: true, spacing: 20 })] }),
    new Paragraph({ spacing: { after: 160 }, children: [run(c.projectName, { bold: true, color: 'FFFFFF', size: 64 })] }),
    new Paragraph({ spacing: { after: 200 }, children: [run(c.oneLiner, { color: 'CFC7C2', size: 24 })] }),
    // Foot block, pushed toward the bottom of the page.
    new Paragraph({ spacing: { before: 3200, after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '3A3637', space: 1 } }, children: [] }),
    line('Prepared for', meta.client.name),
    line('Prepared by', meta.preparedBy),
    line('Contact', [email, phone, website].join('   ·   '), 'CFC7C2'),
    ...(meta.date ? [line('Date', meta.date, 'CFC7C2')] : []),
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    // ATLEAST a full A4 content height so the dark ground covers the whole first page like the PDF cover.
    rows: [new TableRow({ height: { value: 14300, rule: HeightRule.ATLEAST }, children: [new TableCell({ shading: { type: ShadingType.CLEAR, fill: INK, color: 'auto' }, borders: noBorders, margins: { top: 520, bottom: 520, left: 420, right: 420 }, children: inner })] })],
  });
}

// ── per-block rendering ──────────────────────────────────────────────────────
function renderBlock(b: Block, meta: ProposalMeta, archImg?: Map<string, ArchImage>): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  switch (b.type) {
    case 'cover':
      out.push(coverTable(b as CoverBlock, meta));
      out.push(new Paragraph({ children: [new PageBreak()] }));
      return out; // no trailing divider on the cover
    case 'overview': {
      const o = b as OverviewBlock;
      out.push(eyebrow(o.eyebrow ?? 'The Solution'));
      if (o.heading) out.push(h2(o.heading));
      out.push(para(o.lead, { size: 23, color: BODY }));
      // Stats cards removed by request — heading + lead only.
      break;
    }
    case 'scope': {
      const s = b as ScopeBlock;
      out.push(eyebrow(s.eyebrow ?? 'Project scope'));
      if (s.heading) out.push(h2(s.heading));
      // Card grid (3-up) like the PDF's scope cards: bordered cells, bold title + compact bullet points.
      const cardCell = (m: ScopeBlock['modules'][number]) => new TableCell({
        borders: { top: hair, bottom: hair, left: hair, right: hair },
        width: { size: 33.33, type: WidthType.PERCENTAGE },
        margins: { top: 120, bottom: 120, left: 130, right: 130 },
        children: [
          new Paragraph({ spacing: { after: 60 }, children: [run(m.title, { bold: true, color: INK, size: 21 })] }),
          ...m.points.map((p) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 30 }, children: [run(p, { size: 18, color: '4A4340' })] })),
        ],
      });
      const filler = () => new TableCell({ borders: noBorders, width: { size: 33.33, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [] })] });
      const cardRows: TableRow[] = [];
      for (let i = 0; i < s.modules.length; i += 3) {
        const trio = s.modules.slice(i, i + 3);
        cardRows.push(new TableRow({ children: [...trio.map(cardCell), ...Array.from({ length: 3 - trio.length }, filler)] }));
      }
      if (cardRows.length) out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows: cardRows }));
      if (s.experience?.length) { out.push(subLabel('How your end users will experience it')); out.push(...s.experience.map((e) => para(`${e.title} — ${e.detail}`, { size: 21 }))); }
      if (s.outOfScope?.length) { out.push(subLabel('Out of scope')); out.push(...bullets(s.outOfScope)); }
      break;
    }
    case 'featureMatrix': {
      const f = b as FeatureMatrixBlock;
      out.push(eyebrow('Requirements'));
      if (f.heading) out.push(h2(f.heading));
      // Grouped like the PDF: a soft full-width module band, then that module's features underneath.
      const rows: TableRow[] = [];
      for (const mod of f.modules) {
        rows.push(new TableRow({ children: [new TableCell({
          columnSpan: 2, shading: { type: ShadingType.CLEAR, fill: SOFT, color: 'auto' }, borders: rowBorders,
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [new Paragraph({ children: [run(mod.name, { bold: true, color: INK, size: 20 })] })],
        })] }));
        for (const feat of mod.features) {
          rows.push(new TableRow({ children: [
            tcell(feat.title, { bold: true, width: 42 }),
            tcell(feat.sub ?? '', { color: MUTED, size: 18, width: 58 }),
          ] }));
        }
      }
      out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows }));
      break;
    }
    case 'workApproach': {
      const w = b as WorkApproachBlock;
      out.push(eyebrow('Our work approach'));
      if (w.heading) out.push(h2(w.heading));
      if (w.methodology) { out.push(subLabel('Development methodology')); out.push(para(w.methodology, { size: 21 })); }
      if (w.qaApproach) { out.push(subLabel('QA approach')); out.push(para(w.qaApproach, { size: 21 })); }
      for (const u of w.units) {
        out.push(h3(u.name));
        out.push(subLabel('Deliverables'));
        out.push(...bullets(u.deliverables));
      }
      if (w.devTesting) out.push(para(w.devTesting, { color: MUTED, size: 20 }));
      break;
    }
    case 'deliverables': {
      const d = b as DeliverablesBlock;
      out.push(eyebrow(d.eyebrow ?? 'Scope commitment'));
      if (d.heading) out.push(h2(d.heading));
      out.push(table(['Deliverable', 'Acceptance criteria'], d.items.map((it) => [it.phase ? `${it.deliverable} (${it.phase})` : it.deliverable, it.acceptance]), { widths: [46, 54] }));
      break;
    }
    case 'timeline': {
      const t = b as TimelineBlock;
      out.push(eyebrow(t.eyebrow ?? 'Delivery timeline'));
      if (t.heading) out.push(h2(t.heading));
      const durW = (w: number) => `${w} ${w === 1 ? 'week' : 'weeks'}`;
      if (t.layout === 'table') {
        // Local template: a plain Phase | Duration table with a total row.
        const rows = t.rows.map((r) => [r.label, r.duration ?? durW(Math.max(1, r.endWeek - r.startWeek + 1))]);
        rows.push(['Total', durW(t.totalWeeks)]);
        out.push(table(['Phase', 'Duration'], rows, { widths: [70, 30], totalRow: true }));
      } else {
        out.push(table(['Phase', 'Weeks', 'Focus'], t.rows.map((r) => [r.label, r.startWeek === r.endWeek ? `Wk ${r.startWeek}` : `Wks ${r.startWeek}–${r.endWeek}`, r.deliverable ?? '']), { widths: [34, 16, 50] }));
      }
      break;
    }
    case 'techStack': {
      const t = b as TechStackBlock;
      out.push(eyebrow('Technology choices'));
      if (t.heading) out.push(h2(t.heading));
      out.push(table(['Layer', 'Choice', 'Why'], t.rows.map((r) => [r.layer, r.choice, r.why + (r.value ? ` — ${r.value}` : '')]), { widths: [22, 26, 52] }));
      break;
    }
    case 'teamAllocation': {
      const t = b as TeamAllocationBlock;
      out.push(eyebrow('Team allocation'));
      if (t.heading) out.push(h2(t.heading));
      out.push(table(['Role', 'Responsibility'], t.members.map((m) => [m.role, m.responsibility]), { widths: [40, 60] }));
      break;
    }
    case 'financial': {
      const f = b as FinancialBlock;
      out.push(eyebrow('Financial estimation'));
      if (f.heading) out.push(h2(f.heading));
      const rows = f.rows.map((r) => [r.label, r.focus ?? '', r.timeline ?? '', money(r.amountCents, f.currency)]);
      // Sum the phase-row weeks for the total row (adjustment rows carry "—" → contribute 0).
      const totalWeeks = f.rows.reduce((s, r) => { const m = /(\d+(?:\.\d+)?)/.exec(r.timeline ?? ''); return s + (m ? parseFloat(m[1]) : 0); }, 0);
      rows.push([f.note ?? 'Total', '', totalWeeks > 0 ? `${totalWeeks} wks` : '', money(f.totalCents, f.currency)]);
      out.push(table(['Phase', 'Focus', 'Timeline', `Investment (${f.currency})`], rows, { widths: [20, 42, 14, 24], totalRow: true }));
      break;
    }
    case 'equipment': {
      const e = b as EquipmentBlock;
      if (!e.rows?.length) break; // nothing supplied — print no table
      out.push(eyebrow(e.eyebrow ?? 'Hardware & equipment'));
      if (e.heading) out.push(h2(e.heading));
      if (!e.showPricing) {
        // Global/local: what is supplied, not what it costs — the money is in the Budget tab.
        out.push(table(['Item', 'Brand / model', 'Qty', 'Remarks'],
          e.rows.map((r) => [r.item, r.brand ?? '', `${r.qty}${r.uom ? ` ${r.uom}` : ''}`, r.note ?? '']),
          { widths: [44, 26, 10, 20] }));
        if (e.note) out.push(para(e.note, { color: MUTED, size: 19 }));
      } else {
        const rows = e.rows.map((r) => [
          [r.item, [r.brand, r.uom].filter(Boolean).join(' · ')].filter(Boolean).join(' — '),
          String(r.qty),
          money(r.unitPriceCents, e.currency),
          money(r.amountCents, e.currency),
        ]);
        rows.push([e.note ?? 'Total', '', '', money(e.totalCents, e.currency)]);
        out.push(table(['Item', 'Qty', 'Unit price', `Amount (${e.currency})`], rows, { widths: [52, 10, 18, 20], totalRow: true }));
      }
      if (e.warranty) out.push(para(`Warranty — ${e.warranty}`, { color: MUTED, size: 19 }));
      break;
    }
    case 'paymentTerms': {
      const p = b as PaymentTermsBlock;
      out.push(eyebrow('Payment terms'));
      if (p.heading) out.push(h2(p.heading));
      out.push(table(['Stage', 'Payment'], p.terms.map((t) => [t.label, `${t.percent}%`]), { widths: [70, 30] }));
      if (p.note) out.push(para(p.note, { color: MUTED, size: 19 }));
      break;
    }
    case 'commercialTerms': {
      const c = b as CommercialTermsBlock;
      out.push(eyebrow('Hosting, support & ownership'));
      if (c.heading) out.push(h2(c.heading));
      out.push(
        table(
          ['Term', 'What it covers', 'Basis'],
          c.terms.map((t) => [t.label, t.detail, t.basis ?? '']),
          { widths: [26, 52, 22] },
        ),
      );
      if (c.note) out.push(para(c.note, { color: MUTED, size: 19 }));
      break;
    }
    case 'assumptions': {
      const a = b as AssumptionsBlock;
      out.push(eyebrow(a.eyebrow ?? 'Ground rules'));
      if (a.heading) out.push(h2(a.heading));
      out.push(subLabel('Assumptions')); out.push(...bullets(a.assumptions));
      out.push(subLabel('Remarks')); out.push(...bullets(a.dependencies));
      break;
    }
    case 'outOfScope': {
      const o = b as OutOfScopeBlock;
      out.push(eyebrow(o.eyebrow ?? 'Boundaries'));
      if (o.heading) out.push(h2(o.heading));
      out.push(...bullets(o.items));
      if (o.note) out.push(para(o.note, { color: MUTED, size: 19 }));
      break;
    }
    case 'signoff': {
      const s = b as SignoffBlock;
      out.push(eyebrow(s.eyebrow ?? 'Acceptance'));
      if (s.heading) out.push(h2(s.heading));
      out.push(...bullets(s.criteria ?? []));
      if (s.note) out.push(para(s.note, { color: MUTED, size: 19 }));
      for (const p of s.parties ?? []) {
        out.push(subLabel(p.role));
        out.push(para(`Name: ${p.name ?? '________________________'}`, { size: 19, color: MUTED }));
        out.push(para('Signature: ________________________     Date: ______________', { size: 19, color: MUTED }));
      }
      break;
    }
    case 'handover': {
      const h = b as HandoverBlock;
      out.push(eyebrow('Release & handover'));
      if (h.heading) out.push(h2(h.heading));
      out.push(...bullets(h.columns.flat()));
      break;
    }
    case 'comparables': {
      const c = b as ComparablesBlock;
      out.push(eyebrow('Comparable work'));
      if (c.heading) out.push(h2(c.heading));
      for (const it of c.items) out.push(new Paragraph({ spacing: { after: 90 }, children: [run(it.name, { bold: true, color: INK, size: 21 }), run(` — ${it.blurb}`, { size: 20, color: MUTED }), ...(it.url ? [run(`  (${it.url})`, { size: 18, color: ORANGE })] : [])] }));
      if (c.whyRiseup) { out.push(h3(c.whyRiseup.heading)); out.push(para(c.whyRiseup.body, { size: 21 })); }
      break;
    }
    case 'nextStep': {
      const n = b as NextStepBlock;
      out.push(eyebrow('Next step'));
      if (n.heading) out.push(h2(n.heading));
      out.push(...numbered(n.steps.map((s) => (s.sub ? `${s.title} — ${s.sub}` : s.title))));
      break;
    }
    case 'prose': {
      const p = b as ProseBlock;
      if (p.eyebrow) out.push(eyebrow(p.eyebrow));
      if (p.heading) out.push(h2(p.heading));
      out.push(...p.paragraphs.map((t) => para(t)));
      break;
    }
    case 'layeredArchitecture': {
      const l = b as LayeredArchitectureBlock;
      out.push(eyebrow(l.eyebrow ?? 'Solution architecture'));
      if (l.heading) out.push(h2(l.heading));
      out.push(table(['Layer', 'Components'], l.layers.map((layer) => [layer.label, layer.modules.map((m) => m.label).join(', ')]), { widths: [26, 74] }));
      break;
    }
    case 'solutionArchitecture': {
      const s = b as SolutionArchitectureBlock;
      out.push(eyebrow(s.eyebrow ?? 'Solution architecture'));
      const img = archImg?.get(s.id);
      if (img && img.width > 0) {
        // Embed the EXACT PDF figure as an image (Word can't render the HTML/SVG/CSS layout). Fit to the
        // usable page width; the image already carries the centred title, so no separate heading here.
        const MAX_W = 630;
        const scale = img.width > MAX_W ? MAX_W / img.width : 1;
        out.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60, after: 60 },
          children: [new ImageRun({ type: 'png', data: img.data, transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) } })],
        }));
        break;
      }
      // Fallback (no rasteriser available): the structured table.
      if (s.heading) out.push(h2(s.heading));
      const rows: string[][] = [];
      for (const g of s.groups) {
        g.nodes.forEach((n, i) => {
          const detail = [n.subtitle, n.items?.map((it) => it.label).join(' · ')].filter(Boolean).join(' — ');
          rows.push([i === 0 ? g.label : '', n.title, detail]);
        });
      }
      out.push(table(['Layer', 'Component', 'Details'], rows, { widths: [22, 26, 52] }));
      if (s.edges.length) {
        const groupName = (key: string) => s.groups.find((g) => g.key === key)?.label ?? key;
        out.push(para('Connections: ' + s.edges.map((e) => `${groupName(e.from)} → ${groupName(e.to)}${e.label ? ` (${e.label})` : ''}`).join('; '), { color: MUTED, size: 19 }));
      }
      break;
    }
    case 'processFlow': {
      const s = b as ProcessFlowBlock;
      if (s.eyebrow) out.push(eyebrow(s.eyebrow));
      const img = archImg?.get(s.id);
      if (img && img.width > 0) {
        const MAX_W = 630;
        const scale = img.width > MAX_W ? MAX_W / img.width : 1;
        out.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60, after: 60 },
          children: [new ImageRun({ type: 'png', data: img.data, transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) } })],
        }));
        break;
      }
      for (const flow of s.flows) {
        if (flow.heading) out.push(h2(flow.heading));
        out.push(...numbered(flow.stages.map((st) => (st.desc ? `${st.title} — ${st.desc}` : st.title))));
      }
      break;
    }
    case 'vendorArchitecture': {
      const v = b as VendorArchitectureBlock;
      out.push(eyebrow(v.eyebrow ?? 'Deployment'));
      if (v.heading) out.push(h2(v.heading));
      out.push(para(v.tiers.map((n) => n.title).join('  →  '), { size: 21 }));
      if (v.group) out.push(para(`${v.group.label}: ${v.group.services.map((s) => s.title).join(', ')}`, { size: 21 }));
      break;
    }
    case 'numberedFlow': {
      const n = b as NumberedFlowBlock;
      out.push(eyebrow(n.eyebrow ?? 'User journey'));
      if (n.heading) out.push(h2(n.heading));
      out.push(...numbered(n.steps.map((s) => (s.sub ? `${s.title} — ${s.sub}` : s.title))));
      break;
    }
    case 'diagram': {
      const d = b as DiagramBlock;
      if (d.heading) out.push(h2(d.heading));
      out.push(para('(Diagram — see the PDF or web version for the visual figure.)', { color: MUTED, size: 19 }));
      break;
    }
    default: {
      const _never: never = b;
      return _never;
    }
  }
  out.push(divider());
  return out;
}

export async function renderProposalDocx(doc: ProposalDocument, rasterizeArch?: ArchRasterizer): Promise<Buffer> {
  // Rasterise each solution-architecture figure to a PNG so Word shows the EXACT PDF design (best-effort;
  // falls back to the structured table if the rasteriser is absent or fails).
  const archImg = new Map<string, ArchImage>();
  if (rasterizeArch) {
    for (const block of doc.blocks) {
      if (block.type === 'solutionArchitecture' || block.type === 'processFlow') {
        const img = await rasterizeArch(block).catch(() => null);
        if (img) archImg.set(block.id, img);
      }
    }
  }
  const children: (Paragraph | Table)[] = [];
  for (const block of doc.blocks) children.push(...renderBlock(block, doc.meta, archImg));
  const document = new Document({
    creator: 'Riseup Labs · Lead360',
    title: doc.blocks.find((b): b is CoverBlock => b.type === 'cover')?.projectName ?? 'Proposal',
    styles: { default: { document: { run: { font: FONT, size: 21, color: BODY } } } },
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children }],
  });
  return Packer.toBuffer(document);
}

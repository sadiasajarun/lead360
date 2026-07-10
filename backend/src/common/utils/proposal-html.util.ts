import { readFileSync } from 'fs';
import { join } from 'path';
import { accentFor, iconSvg } from './diagram-icons';

// Riseup logo as a data URI (read once). Puppeteer's setContent can't fetch external files, so we inline it.
let logoDataUri: string | null = null;
function logo(): string {
  if (logoDataUri === null) {
    try {
      logoDataUri = `data:image/png;base64,${readFileSync(join(process.cwd(), 'assets', 'riseup-logo.png')).toString('base64')}`;
    } catch {
      logoDataUri = '';
    }
  }
  return logoDataUri;
}

// Canonical Riseup proposal section order + titles (diagrams + commercial terms included). Keys not
// listed here (outcome/approach) are consumed elsewhere and not rendered as numbered sections.
const SECTION_TITLES: Record<string, string> = {
  executiveSummary: 'Executive Summary',
  projectUnderstanding: 'Project Understanding',
  proposedScope: 'Proposed Scope',
  domainTables: 'Scope & Inventory Tables',
  technicalApproach: 'Proposed Technical Approach',
  architecture: 'High-Level Architecture',
  architectureDiagram: 'System Architecture',
  workflowDiagram: 'Key Workflow',
  controlFlowDiagram: 'Control Flow',
  technicalStack: 'Proposed Technical Stack',
  developmentMethodology: 'Development Methodology',
  timeline: 'Suggested Timeline',
  deliverables: 'Deliverables',
  paymentTerms: 'Payment Terms',
  changeRequest: 'Change Request',
  testingQa: 'Testing & Quality Assurance',
  assumptions: 'Assumptions & Dependencies',
  conclusion: 'Conclusion',
  comparableProjects: 'Comparable Riseup Work',
};
const ORDER = Object.keys(SECTION_TITLES);
// Consumed by the cover/hero, never rendered as a numbered body section.
const SKIP = new Set(['outcome', 'approach', 'coverTagline']);
// Diagram keys in render order — figure numbers are assigned dynamically (absent diagrams don't consume one).
const DIAGRAM_KEYS = ['architectureDiagram', 'workflowDiagram', 'controlFlowDiagram'];

// Model titles sometimes already start with "Figure N:" / "Table:" — strip it so captions don't double up.
const stripCaptionPrefix = (t: string) => t.replace(/^(figure|fig\.?|table)\s*\d*\s*[:.\-]\s*/i, '');

// ---- Structured section shapes (generator additions). Old proposals may lack these keys or emit
// ---- malformed data — validators return null/[] so the section is silently skipped, never crashes.
// A tinted panel at the bottom of a figure — `focus` (architecture) / `footer` (workflow). Optional.
interface FigureStrip { text: string; chips: string[] }
function asFigureStrip(v: unknown): FigureStrip | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.text !== 'string' || !o.text.trim()) return null;
  const chips = Array.isArray(o.chips) ? (o.chips as unknown[]).filter((c): c is string => typeof c === 'string') : [];
  return { text: o.text, chips };
}

interface ArchGroup { label: string; items: string[]; icon?: string }
interface ArchDiagram { title: string; subtitle?: string; groups: ArchGroup[]; focus: FigureStrip | null }
function asArchDiagram(v: unknown): ArchDiagram | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.title !== 'string' || !Array.isArray(o.groups)) return null;
  const groups = (o.groups as unknown[])
    .filter(
      (g): g is Record<string, unknown> =>
        !!g && typeof g === 'object' && typeof (g as Record<string, unknown>).label === 'string' &&
        Array.isArray((g as Record<string, unknown>).items) && ((g as Record<string, unknown>).items as unknown[]).every((x) => typeof x === 'string'),
    )
    .map((g) => ({ label: String(g.label), items: g.items as string[], icon: typeof g.icon === 'string' ? g.icon : undefined }));
  return groups.length ? { title: o.title, subtitle: typeof o.subtitle === 'string' ? o.subtitle : undefined, groups, focus: asFigureStrip(o.focus) } : null;
}

interface WorkflowStep { title: string; detail: string; icon?: string }
interface WorkflowDiagram { title: string; subtitle?: string; steps: WorkflowStep[]; footer: FigureStrip | null }
function asWorkflowDiagram(v: unknown): WorkflowDiagram | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.title !== 'string' || !Array.isArray(o.steps)) return null;
  const steps = (o.steps as unknown[])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof (s as Record<string, unknown>).title === 'string')
    .map((s) => ({ title: String(s.title), detail: typeof s.detail === 'string' ? s.detail : '', icon: typeof s.icon === 'string' ? s.icon : undefined }));
  return steps.length ? { title: o.title, subtitle: typeof o.subtitle === 'string' ? o.subtitle : undefined, steps, footer: asFigureStrip(o.footer) } : null;
}

interface DomainTable { title: string; headers: string[]; rows: string[][] }
function asDomainTables(v: unknown): DomainTable[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[])
    .filter((t): t is Record<string, unknown> =>
      !!t && typeof t === 'object' && typeof (t as Record<string, unknown>).title === 'string' &&
      Array.isArray((t as Record<string, unknown>).headers) && ((t as Record<string, unknown>).headers as unknown[]).length > 0 &&
      ((t as Record<string, unknown>).headers as unknown[]).every((h) => typeof h === 'string') &&
      Array.isArray((t as Record<string, unknown>).rows))
    .map((t) => ({
      title: String(t.title),
      headers: t.headers as string[],
      rows: (t.rows as unknown[]).filter((r): r is unknown[] => Array.isArray(r)).map((r) => r.map((c) => String(c ?? ''))),
    }));
}

interface ComparableProject { name: string; blurb: string; url?: string }
function asComparables(v: unknown): ComparableProject[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as Record<string, unknown>).name === 'string')
    .map((p) => ({ name: String(p.name), blurb: typeof p.blurb === 'string' ? p.blurb : '', url: typeof p.url === 'string' ? p.url : undefined }));
}

// Shape-aware body: object-array -> table, string-array -> list, else paragraphs. Mirrors the UI.
function renderBody(v: unknown): string {
  if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
    const rows = v as Record<string, unknown>[];
    const cols = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>()));
    const head = cols.map((c) => `<th>${esc(humanize(c))}</th>`).join('');
    const trs = rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('');
    return `<table class="tbl"><thead><tr>${head}</tr></thead><tbody>${trs}</tbody></table>`;
  }
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
    return `<ul>${(v as string[]).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  }
  return `<div class="body">${esc(typeof v === 'string' ? v : JSON.stringify(v, null, 2)).replace(/\n/g, '<br/>')}</div>`;
}

// Figure heading band (accent bar + title + optional subtitle) shared by both diagram renderers.
function figHead(title: string, subtitle?: string): string {
  const sub = subtitle ? `<div class="fig-sub">${esc(stripCaptionPrefix(subtitle))}</div>` : '';
  return `<div class="fig-head"><div class="fig-bar"></div><div class="fig-hx"><div class="fig-title">${esc(stripCaptionPrefix(title))}</div>${sub}</div></div>`;
}

// Bottom focus/footer strip: orange target icon + text on the left, accent-tinted chip pills on the right.
function figStrip(strip: FigureStrip | null): string {
  if (!strip) return '';
  const chips = strip.chips
    .map((c, i) => `<span class="fig-chip" style="color:${accentFor(i).fg}">${esc(c)}</span>`)
    .join('');
  return `<div class="fig-strip"><span class="fig-strip-i">${iconSvg('shield', '#EA5400', 15)}</span><span class="fig-strip-t">${esc(strip.text)}</span>${chips ? `<span class="fig-chips">${chips}</span>` : ''}</div>`;
}

// The caption reads "Figure N: <subtitle | title>" — since the title now sits inside the canvas, we
// prefer the subtitle to avoid a pure duplicate.
function figCaption(fig: number, d: { title: string; subtitle?: string }): string {
  return `<div class="figcap">Figure ${fig}: ${esc(stripCaptionPrefix(d.subtitle || d.title))}</div>`;
}

// Illustrated architecture figure (mirrors Riseup's real figures): heading band, coloured icon nodes in
// a wrapping flex row joined by orange arrows, optional focus strip. Pure inline SVG + CSS (print-safe).
// `flows` in the payload are informational; layout order of `groups` IS the flow order.
function renderArchDiagram(d: ArchDiagram, fig: number): string {
  const boxes = d.groups
    .map((g, i) => {
      const a = accentFor(i);
      const items = g.items
        .map((it) => `<div class="node-item"><span class="node-dot" style="background:${a.fg}"></span>${esc(it)}</div>`)
        .join('');
      return `<div class="node" style="border-color:${a.bd}">` +
        `<div class="node-hd"><span class="node-ic">${iconSvg(g.icon, a.fg, 18)}</span>` +
        `<span class="node-n" style="background:${a.bg};color:${a.fg}">${i + 1}</span>` +
        `<span class="node-l">${esc(g.label)}</span></div>${items}</div>`;
    })
    .join('<div class="arr">&rarr;</div>');
  return `<div class="fig">${figHead(d.title, d.subtitle)}<div class="diagram">${boxes}</div>${figStrip(d.focus)}</div>${figCaption(fig, d)}`;
}

// Illustrated workflow/control-flow figure (shared): heading band, numbered icon step cards in a
// wrapping flex row joined by orange arrows, optional footer strip. Pure inline SVG + CSS.
function renderWorkflowDiagram(d: WorkflowDiagram, fig: number): string {
  const cards = d.steps
    .map((s, i) => {
      const a = accentFor(i);
      return `<div class="step" style="border-color:${a.bd}">` +
        `<div class="step-hd"><span class="step-n" style="background:${a.fg}">${i + 1}</span>` +
        `<span class="step-ic">${iconSvg(s.icon, a.fg, 17)}</span></div>` +
        `<div class="step-t">${esc(s.title)}</div><div class="step-d">${esc(s.detail)}</div></div>`;
    })
    .join('<div class="arr">&rarr;</div>');
  return `<div class="fig">${figHead(d.title, d.subtitle)}<div class="diagram">${cards}</div>${figStrip(d.footer)}</div>${figCaption(fig, d)}`;
}

// Domain/inventory tables (0-3 per proposal): small bold title + a standard .tbl per item.
function renderDomainTables(ts: DomainTable[]): string {
  return ts
    .map((t) => {
      const head = t.headers.map((h) => `<th>${esc(h)}</th>`).join('');
      const trs = t.rows.map((r) => `<tr>${t.headers.map((_, ci) => `<td>${esc(r[ci] ?? '')}</td>`).join('')}</tr>`).join('');
      return `<div class="dt"><h3 class="dt-t">${esc(stripCaptionPrefix(t.title))}</h3><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${trs}</tbody></table></div>`;
    })
    .join('');
}

// Comparable Riseup work: a card per project — the name links to the riseuplabs.com portfolio when matched.
// Comparable-work cards. Matched portfolio work links to its riseuplabs.com page; anything unmatched
// falls back to the portfolio index so every card is clickable in the PDF.
const PORTFOLIO_INDEX = 'https://riseuplabs.com/portfolio/';
function renderComparables(ps: ComparableProject[]): string {
  const cards = ps
    .map((p) => `<div class="cmp-c"><a class="cmp-n" href="${esc(p.url || PORTFOLIO_INDEX)}">${esc(p.name)}</a><p class="cmp-b">${esc(p.blurb)}</p></div>`)
    .join('');
  return `<div class="cmp">${cards}</div>`;
}

// { stage, detail }[] -> "N.1 Stage" headings + prose, the way Riseup's real proposals present the
// technical approach (numbered subsections), instead of a flat two-column table.
function renderSubsections(v: unknown, secNo: number): string {
  if (!Array.isArray(v) || !v.length) return renderBody(v);
  const rows = v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
  if (!rows.length || !rows.every((r) => typeof r.stage === 'string')) return renderBody(v);
  return rows
    .map((r, i) => `<h3 class="sub">${secNo}.${i + 1} ${esc(r.stage)}</h3><div class="body">${esc(r.detail)}</div>`)
    .join('');
}

// Section dispatch: structured renderers for the diagram/table/portfolio keys, shape-aware renderBody
// otherwise. `fig` = dynamic figure number (diagram keys); `secNo` = this section's ordinal.
function renderSectionBody(k: string, v: unknown, fig = 1, secNo = 1): string {
  if (k === 'architectureDiagram') { const d = asArchDiagram(v); return d ? renderArchDiagram(d, fig) : ''; }
  if (k === 'workflowDiagram' || k === 'controlFlowDiagram') { const d = asWorkflowDiagram(v); return d ? renderWorkflowDiagram(d, fig) : ''; }
  if (k === 'domainTables') return renderDomainTables(asDomainTables(v));
  if (k === 'comparableProjects') return renderComparables(asComparables(v));
  if (k === 'technicalApproach') return renderSubsections(v, secNo);
  return renderBody(v);
}

export interface ProposalHtmlInput {
  /** Data URI of the org's uploaded logo; falls back to the bundled Riseup mark when absent. */
  logoDataUri?: string;
  title: string;
  company: string;
  template: string;
  valueLabel?: string;
  contactName?: string;
  sections: Record<string, unknown>;
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const humanize = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();

export function renderProposalHtml(input: ProposalHtmlInput): string {
  // An admin-uploaded logo (Settings → Branding) wins over the bundled mark, in the app AND the PDF.
  const brandLogo = () => input.logoDataUri || logo();
  const has = (k: string) => {
    const v = input.sections[k];
    if (k === 'architectureDiagram') return asArchDiagram(v) !== null;
    if (k === 'workflowDiagram' || k === 'controlFlowDiagram') return asWorkflowDiagram(v) !== null;
    if (k === 'domainTables') return asDomainTables(v).length > 0;
    if (k === 'comparableProjects') return asComparables(v).length > 0;
    return v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim().length > 0);
  };
  // Comparable Riseup Work always closes the document — unknown extra keys slot in before it.
  const keys = [
    ...ORDER.filter((k) => k !== 'comparableProjects' && has(k)),
    ...Object.keys(input.sections).filter((k) => !ORDER.includes(k) && !SKIP.has(k) && has(k)),
    ...(has('comparableProjects') ? ['comparableProjects'] : []),
  ];
  // Figure numbers in render order — absent diagrams don't consume a number.
  const figNo: Record<string, number> = {};
  keys.filter((k) => DIAGRAM_KEYS.includes(k)).forEach((k, i) => { figNo[k] = i + 1; });
  const body = keys
    .map((k, i) => {
      const heading = SECTION_TITLES[k] ?? humanize(k);
      return `<section><h2 id="sec-${esc(k)}"><span class="n">${i + 1}</span>${esc(heading)}</h2>${renderSectionBody(k, input.sections[k], figNo[k], i + 1)}</section>`;
    })
    .join('');
  const brand = brandLogo()
    ? `<img src="${brandLogo()}" alt="Riseup Labs" class="logo"/>`
    : `<span class="mk">L</span><span class="bn">RISEUP LABS</span>`;
  // "Engagement" (template name) removed by user decision 2026-07-10 — it's internal jargon.
  const meta = [
    ['Prepared for', input.company],
    ['Contact', input.contactName || '—'],
    ['Investment', input.valueLabel || '—'],
  ]
    .map(([k, v]) => `<div><span class="mk2">${esc(k)}</span><b>${esc(v)}</b></div>`)
    .join('');

  // COVER — mirrors Riseup's real proposal cover: centered title block, a short tagline (never the
  // full executive summary), tech keywords, logo below, prepared-by + date.
  const combined = input.template === 'agency' || input.template === 'design_portfolio';
  const stack = input.sections.technicalStack;
  const keywords = (Array.isArray(stack) ? (stack as unknown[]) : [])
    .map((r) => (r && typeof r === 'object' && typeof (r as Record<string, unknown>).tech === 'string' ? String((r as Record<string, unknown>).tech) : ''))
    .filter(Boolean)
    .slice(0, 6)
    .join(' | ');
  const tagline = typeof input.sections.coverTagline === 'string' ? input.sections.coverTagline.trim() : '';
  const coverDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const cover = `<div class="cover">
    <div class="cv-k">${combined ? 'Technical &amp; Financial Proposal' : 'Technical Proposal'}</div>
    <div class="cv-t">${esc(input.title)}</div>
    ${tagline ? `<div class="cv-s">${esc(tagline)}</div>` : ''}
    <div class="cv-v">Version 1.0</div>
    ${keywords ? `<div class="cv-kw">${esc(keywords)}</div>` : ''}
    ${brandLogo() ? `<img src="${brandLogo()}" alt="Riseup Labs" class="cv-logo"/>` : '<div class="cv-bn">RISEUP LABS</div>'}
    <div class="cv-p">Prepared by: Riseup Labs</div>
    <div class="cv-d">${esc(coverDate)}</div>
  </div>`;

  // TABLE OF CONTENTS — Puppeteer keeps internal anchor links clickable in the PDF.
  const toc = `<div class="tocpage"><h2 class="toc-h">Table of Contents</h2><ol class="toc">${keys
    .map((k, i) => `<li><a href="#sec-${esc(k)}"><span class="tn">${i + 1}.</span>${esc(SECTION_TITLES[k] ?? humanize(k))}</a></li>`)
    .join('')}</ol></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1A1715; margin: 0; }
    /* Cover + Table-of-Contents pages */
    .cover { height:290mm; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:0 70px; page-break-after:always; }
    .cv-k { font-size:13px; font-weight:700; letter-spacing:.3em; text-transform:uppercase; color:#EA5400; }
    .cv-t { font-size:40px; font-weight:800; line-height:1.15; margin-top:18px; max-width:560px; color:#1A1715; }
    .cv-s { margin:14px auto 0; max-width:520px; font-size:14px; line-height:1.6; color:#5c554e; }
    .cv-v { margin-top:14px; font-size:13px; font-weight:600; color:#6B6660; }
    .cv-kw { margin-top:26px; font-size:12.5px; letter-spacing:.05em; color:#9A948E; }
    .cv-logo { height:90px; width:auto; margin-top:28px; }
    .cv-bn { margin-top:28px; font-size:20px; font-weight:800; letter-spacing:.06em; }
    .cv-p { margin-top:32px; font-size:13px; font-weight:600; color:#39332e; }
    .cv-d { margin-top:4px; font-size:12.5px; color:#9A948E; }
    .tocpage { padding:52px 44px; page-break-after:always; }
    .toc-h { font-size:24px; font-weight:800; margin:0 0 16px; padding-bottom:10px; border-bottom:2px solid #EAE4DE; }
    .toc { list-style:none; margin:0; padding:0; }
    .toc li { border-bottom:1px solid #F0EBE5; }
    .toc a { display:flex; gap:12px; padding:9px 2px; font-size:13.5px; font-weight:600; color:#1A1715; text-decoration:none; }
    .toc .tn { min-width:22px; color:#EA5400; font-weight:800; }
    .hero { background: linear-gradient(135deg,#1A1715,#3a2a20); color: #fff; padding: 40px 44px; }
    .brand { display:flex; align-items:center; gap:10px; margin-bottom:18px; }
    .brand .logo { height:34px; width:auto; }
    .brand .mk { width:34px;height:34px;border-radius:8px;background:linear-gradient(120deg,#EA5400,#FF8A3D);color:#fff;font-weight:800;display:inline-grid;place-items:center;font-size:18px; }
    .brand .bn { font-weight:800; font-size:15px; letter-spacing:.02em; }
    .kicker { font-size:11px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:#FFB27E; }
    h1 { font-size:30px; font-weight:800; line-height:1.12; margin:10px 0 0; max-width:620px; }
    .meta { display:flex; flex-wrap:wrap; gap:26px; margin-top:24px; }
    .meta .mk2 { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:rgba(255,255,255,.5); }
    .meta b { font-size:14px; font-weight:600; text-transform:capitalize; }
    main { padding: 34px 44px 44px; }
    section { margin-bottom: 26px; }
    /* Bigger, bolder section headings */
    h2 { font-size:22px; font-weight:800; letter-spacing:-.01em; color:#1A1715; margin:0 0 12px; padding-bottom:8px; border-bottom:2px solid #EAE4DE; display:flex; align-items:center; gap:12px; }
    h2 .n { width:30px;height:30px;flex:0 0 30px;border-radius:8px;background:#EA5400;color:#fff;font-size:14px;font-weight:800;display:inline-grid;place-items:center; }
    .body { font-size:13px; line-height:1.7; color:#39332e; }
    ul { margin:0; padding-left:20px; font-size:13px; line-height:1.7; color:#39332e; }
    li { margin-bottom:4px; }
    .tbl { width:100%; border-collapse:collapse; border:1px solid #EAE4DE; border-radius:8px; overflow:hidden; font-size:12.5px; }
    .tbl th { background:#FBF7F3; text-align:left; padding:9px 12px; font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; color:#9A948E; }
    .tbl td { padding:9px 12px; border-top:1px solid #EAE4DE; color:#39332e; vertical-align:top; line-height:1.5; }
    .tbl td:first-child { font-weight:600; color:#1A1715; }
    /* Domain/inventory tables */
    .dt { margin-bottom:14px; }
    .dt:last-child { margin-bottom:0; }
    .dt-t { margin:0 0 8px; font-size:14px; font-weight:700; color:#1A1715; }
    .sub { margin:18px 0 6px; font-size:14px; font-weight:700; color:#1A1715; page-break-after:avoid; }
    /* Illustrated figures (print-safe inline SVG + flexbox — no JS, no external assets) */
    .figcap { margin-top:8px; font-size:11.5px; font-style:italic; color:#6B6660; }
    .fig { border:1px solid #E8E6E3; background:#fff; border-radius:12px; padding:20px; page-break-inside:avoid; }
    .fig-head { display:flex; align-items:stretch; gap:12px; margin-bottom:16px; }
    .fig-bar { width:4px; flex:0 0 4px; border-radius:2px; background:#EA5400; }
    .fig-title { font-size:21px; font-weight:800; letter-spacing:-.01em; color:#1A1715; line-height:1.2; }
    .fig-sub { margin-top:3px; font-size:12.5px; color:#6B6660; }
    .diagram { display:flex; flex-wrap:wrap; align-items:stretch; gap:8px; }
    .diagram .arr { align-self:center; color:#EA5400; font-size:17px; font-weight:800; }
    /* Architecture nodes */
    .node { flex:1; min-width:150px; border:1px solid #E8E6E3; border-radius:10px; padding:12px 14px; background:#fff; }
    .node-hd { display:flex; align-items:center; margin-bottom:8px; }
    .node-ic { display:inline-flex; margin-right:7px; }
    .node-n { display:inline-grid; place-items:center; width:18px; height:18px; margin-right:7px; border-radius:50%; font-size:10.5px; font-weight:800; }
    .node-l { font-size:13px; font-weight:800; color:#1A1715; }
    .node-item { display:flex; align-items:center; margin-top:5px; font-size:12px; color:#5c554e; line-height:1.4; }
    .node-dot { display:inline-block; width:6px; height:6px; margin-right:7px; border-radius:50%; flex:0 0 6px; }
    /* Workflow / control-flow steps */
    .step { flex:1; min-width:150px; max-width:220px; border:1px solid #E8E6E3; border-radius:10px; padding:12px 14px; background:#fff; }
    .step-hd { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
    .step-n { display:inline-grid; place-items:center; width:22px; height:22px; border-radius:50%; background:#EA5400; color:#fff; font-size:11.5px; font-weight:800; }
    .step-ic { display:inline-flex; }
    .step-t { font-size:13px; font-weight:700; color:#1A1715; }
    .step-d { margin-top:3px; font-size:12px; line-height:1.5; color:#5c554e; }
    /* Focus / footer strip */
    .fig-strip { display:flex; flex-wrap:wrap; align-items:center; margin-top:16px; padding:10px 12px; border:1px solid #E8E6E3; border-radius:10px; background:#F8FAFC; }
    .fig-strip-i { display:inline-flex; margin-right:8px; }
    .fig-strip-t { font-size:12.5px; font-weight:500; color:#39332e; }
    .fig-chips { margin-left:auto; }
    .fig-chip { display:inline-block; margin-left:5px; padding:2px 8px; border:1px solid #E8E6E3; border-radius:999px; background:#fff; font-size:11px; font-weight:600; }
    /* Comparable Riseup work cards */
    .cmp { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .cmp-c { border:1px solid #EAE4DE; border-radius:10px; padding:12px 14px; }
    .cmp-n { font-size:13px; font-weight:700; color:#1A1715; text-decoration:none; }
    a.cmp-n { color:#EA5400; }
    .cmp-b { margin:5px 0 0; font-size:12px; line-height:1.55; color:#5c554e; }
    section { break-inside: avoid; }
    footer { padding: 16px 44px; border-top:1px solid #EAE4DE; color:#9A948E; font-size:10.5px; }
  </style></head><body>
    ${cover}
    ${toc}
    <div class="hero"><div class="brand">${brand}</div><div class="kicker">Technical Proposal · Riseup Labs</div><h1>${esc(input.title)}</h1><div class="meta">${meta}</div></div>
    <main>${body}</main>
    <footer>&copy; ${new Date().getFullYear()} Riseup Labs &middot; ${esc(input.company)} &middot; Generated by Lead360</footer>
  </body></html>`;
}

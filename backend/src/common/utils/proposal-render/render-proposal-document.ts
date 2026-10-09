/**
 * PDF renderer for the block-based proposal — mirrors the React block renderer
 * (frontend/app/components/proposal) exactly: same classes, same scoped CSS
 * (PROPOSAL_CSS), same inlined icon/diagram SVGs. Produces a full HTML document
 * for pdf.service.htmlToPdf(), so web and PDF are identical.
 */
import type {
  ProposalDocument, ProposalMeta, Block,
  CoverBlock, OverviewBlock, ScopeBlock, FeatureMatrixBlock, WorkApproachBlock,
  DeliverablesBlock, TimelineBlock, AssumptionsBlock, OutOfScopeBlock, SignoffBlock,
  TechStackBlock, TeamAllocationBlock, FinancialBlock, EquipmentBlock, PaymentTermsBlock, CommercialTermsBlock,
  HandoverBlock, ComparablesBlock, NextStepBlock, ProseBlock,
  LayeredArchitectureBlock, NumberedFlowBlock, ProcessFlowBlock, VendorArchitectureBlock, SolutionArchitectureBlock, DiagramBlock,
} from '../../../modules/generation/blocks/block.types';
import { PROPOSAL_CSS } from './proposal-css';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat(currency === 'BDT' ? 'en-IN' : 'en-US', { maximumFractionDigits: 0 }).format(Math.round(cents / 100));

const PLACEHOLDER = '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
function icon(name: string | undefined, map: Record<string, string>, size = 20): string {
  const svg = name ? map[name] : undefined;
  return `<span class="ic-svg" style="width:${size}px;height:${size}px;display:inline-grid;place-items:center">${svg ?? PLACEHOLDER}</span>`;
}

const VARROW = '<svg width="26" height="34" viewBox="0 0 26 34" style="margin:2px 0"><path d="M13 2 V25" stroke="#9AA4B4" stroke-width="2" fill="none"/><path d="M13 32 L8 23 H18 Z" fill="#9AA4B4"/></svg>';
// The eyebrow + h2 are wrapped so print fragmentation treats them as one unbreakable unit. `.eyebrow` is
// an inline <span>, and break-after does not apply to inline boxes — without this wrapper the eyebrow
// prints alone at the foot of a page and its heading starts on the next one.
const head = (eyebrow: string | undefined, heading: string | undefined, defEyebrow?: string) =>
  `<div class="sechead">${eyebrow || defEyebrow ? `<span class="eyebrow">${esc(eyebrow ?? defEyebrow)}</span>` : ''}${heading ? `<h2>${esc(heading)}</h2>` : ''}</div>`;

// Riseup Labs' own contact — fallback so older proposals (generated before contact was baked into meta)
// still show it in the PDF without a regenerate. Keep in sync with the frontend Cover component.
const RISEUP_CONTACT = { phone: '+88-0175-974-7387', email: 'contact@riseuplabs.com', website: 'riseuplabs.com' };

function cover(b: CoverBlock, meta: ProposalMeta): string {
  const c = meta.client;
  const email = meta.contact.email || RISEUP_CONTACT.email;
  const phone = meta.contact.phone || RISEUP_CONTACT.phone;
  const website = meta.contact.website || RISEUP_CONTACT.website;
  const clientMark = c.logoUrl
    ? `<img src="${esc(c.logoUrl)}" alt="${esc(c.name)}" style="max-height:40px;max-width:160px"/>`
    : `<div class="clogo"><span class="cm">${esc(c.name.trim().charAt(0).toUpperCase() || '•')}</span> ${esc(c.name.toUpperCase())}</div>`;
  return `<section class="cover">
    <div class="top"><div class="rlogo" role="img" aria-label="Riseup Labs"></div>${clientMark}</div>
    <div class="mid"><div class="pk">${esc(b.kicker)}</div><h1>${esc(b.projectName)}</h1><p class="oneline">${esc(b.oneLiner)}</p></div>
    <div class="foot">
      <div><b>Prepared for</b>${esc(c.name)}${meta.contact.address ? `<br/>${esc(meta.contact.address)}` : ''}</div>
      <div><b>Prepared by</b>${esc(meta.preparedBy)}</div>
      <div class="ct"><b>Contact</b><span class="o">${esc(email)}</span><span>${esc(phone)}</span><span>${esc(website)}</span></div>
    </div>
  </section>`;
}

function overview(b: OverviewBlock, _m: Record<string, string>): string {
  // Stats cards (Surfaces / Integrations / Modules / Timeline) removed by request — heading + lead only.
  return `<section>${head(b.eyebrow, b.heading, 'The Solution')}<p class="lead">${esc(b.lead)}</p></section>`;
}

function scope(b: ScopeBlock, m: Record<string, string>): string {
  const mods = `<div class="cols3" style="margin-bottom:26px">${b.modules.map((mo) => `<div class="card">${mo.icon ? `<div class="cico">${icon(mo.icon, m)}</div>` : ''}<h3>${esc(mo.title)}</h3><ul class="clean small">${mo.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}</div>`;
  const exp = b.experience?.length ? `<div><div class="subh">How your end users will experience it</div><div class="exp">${b.experience.map((e, i) => `<div class="row"><div class="ei">${i + 1}</div><div><b>${esc(e.title)}</b><p>${esc(e.detail)}</p></div></div>`).join('')}</div></div>` : '';
  const oos = b.outOfScope?.length ? `<div><div class="oos"><div class="subh">Out of scope</div><ul>${b.outOfScope.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div></div>` : '';
  // Side by side only when there IS an out-of-scope column; alone, the experience list takes the full
  // width and flows as a 2-column grid rather than one tall stack.
  const cols = exp || oos ? `<div class="${exp && oos ? 'cols2' : ''}">${exp}${oos}</div>` : '';
  return `<section>${head(b.eyebrow, b.heading, 'Project scope')}${mods}${cols}</section>`;
}

function featureMatrix(b: FeatureMatrixBlock, m: Record<string, string>): string {
  const mods = b.modules.map((mo) => `<div class="fmod"><div class="fh">${mo.icon ? `<span class="fi">${icon(mo.icon, m, 16)}</span>` : ''} ${esc(mo.name)}</div>${mo.features.map((f) => `<div class="frow"><div class="ft">${esc(f.title)}${f.sub ? `<span>${esc(f.sub)}</span>` : ''}</div></div>`).join('')}</div>`).join('');
  return `<section>${head(b.eyebrow, b.heading, 'Requirements')}${mods}</section>`;
}

function workApproach(b: WorkApproachBlock): string {
  const cards = (b.methodology || b.qaApproach)
    ? `<div class="cols2 wa-how">${b.methodology ? `<div class="wa-c"><div class="subh">Development methodology</div><p>${esc(b.methodology)}</p></div>` : ''}${b.qaApproach ? `<div class="wa-c"><div class="subh">QA approach</div><p>${esc(b.qaApproach)}</p></div>` : ''}</div>`
    : '';
  // Deliverables only — the week chip and the acceptance panel are not shown in this section.
  const units = b.units.map((u) => `<div class="phase"><div class="ph-h"><b>${esc(u.name)}</b></div><div><div class="subh">Deliverables</div><ol class="del">${u.deliverables.map((d) => `<li>${esc(d)}</li>`).join('')}</ol></div></div>`).join('');
  return `<section>${head(undefined, b.heading, 'Our work approach')}${cards}${units}${b.devTesting ? `<p class="small muted" style="margin-top:16px">${esc(b.devTesting)}</p>` : ''}</section>`;
}

function deliverables(b: DeliverablesBlock): string {
  const rows = b.items.map((it) => `<tr><td><b>${esc(it.deliverable)}</b>${it.phase ? `<span class="small muted"> · ${esc(it.phase)}</span>` : ''}</td><td>${esc(it.acceptance)}</td></tr>`).join('');
  return `<section>${head(b.eyebrow, b.heading, 'Deliverables & acceptance criteria')}<div class="tw"><table class="dl-tbl"><tbody><tr><th>Deliverable</th><th>Acceptance criteria</th></tr>${rows}</tbody></table></div></section>`;
}

function timeline(b: TimelineBlock): string {
  const dur = (w: number) => `${w} ${w === 1 ? 'week' : 'weeks'}`;
  // Local template: a plain Phase | Duration table rather than the Gantt.
  if (b.layout === 'table') {
    const trows = b.rows
      .map((r) => `<tr><td><b>${esc(r.label)}</b>${r.deliverable ? `<span class="small muted"> · ${esc(r.deliverable)}</span>` : ''}</td><td class="r num">${esc(r.duration ?? dur(Math.max(1, r.endWeek - r.startWeek + 1)))}</td></tr>`)
      .join('');
    return `<section>${head(b.eyebrow, b.heading, 'Project timeline')}<div class="tw"><table><tbody><tr><th>Phase</th><th class="r">Duration</th></tr>${trows}<tr class="tot"><td>Total</td><td class="r num">${dur(b.totalWeeks)}</td></tr></tbody></table></div><p class="small muted" style="margin-top:10px">Durations run from project kickoff; parallelisable work may compress the total.</p></section>`;
  }
  const total = Math.max(1, b.totalWeeks);
  const ticks = Array.from({ length: total }, (_, i) => `<span class="tl-tick">${i + 1}</span>`).join('');
  const rows = b.rows.map((r) => {
    const span = Math.max(1, r.endWeek - r.startWeek + 1);
    const left = ((r.startWeek - 1) / total) * 100;
    const width = (span / total) * 100;
    const wkLabel = r.startWeek === r.endWeek ? `Wk ${r.startWeek}` : `Wks ${r.startWeek}–${r.endWeek}`;
    return `<div class="tl-row"><div class="tl-lab"><b>${esc(r.label)}</b>${r.deliverable ? `<span>${esc(r.deliverable)}</span>` : ''}</div><div class="tl-track"><div class="tl-bar" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"><span>${wkLabel}</span></div></div></div>`;
  }).join('');
  return `<section>${head(b.eyebrow, b.heading, 'Project timeline')}<div class="tl"><div class="tl-row tl-axis"><div class="tl-lab"></div><div class="tl-track tl-ticks">${ticks}</div></div>${rows}</div><p class="small muted" style="margin-top:10px">Weeks are indicative and run from project kickoff; parallelisable work may compress the total.</p></section>`;
}

function assumptions(b: AssumptionsBlock): string {
  const col = (title: string, items: string[]) => `<div><div class="subh">${title}</div><ul class="clean small ad-list">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`;
  return `<section>${head(b.eyebrow, b.heading, 'Assumptions & remarks')}<div class="cols2">${col('Assumptions', b.assumptions)}${col('Remarks', b.dependencies)}</div></section>`;
}

function outOfScope(b: OutOfScopeBlock): string {
  const items = b.items.map((i) => `<li>${esc(i)}</li>`).join('');
  return `<section>${head(b.eyebrow, b.heading, 'Proposed out of scope')}<ul class="clean small oos-list">${items}</ul>${b.note ? `<p class="small muted" style="margin-top:12px">${esc(b.note)}</p>` : ''}</section>`;
}

function signoff(b: SignoffBlock): string {
  const criteria = (b.criteria ?? []).map((c) => `<li>${esc(c)}</li>`).join('');
  const line = (label: string, val?: string) => `<div class="so-line"><span>${label}</span><i></i>${val ? `<b>${esc(val)}</b>` : ''}</div>`;
  const parties = (b.parties ?? []).map((p) => `<div class="so-party"><div class="so-role">${esc(p.role)}</div>${line('Name', p.name)}${line('Signature')}${line('Date')}</div>`).join('');
  return `<section>${head(b.eyebrow, b.heading, 'Acceptance & sign-off')}<ul class="clean small ad-list">${criteria}</ul>${b.note ? `<p class="small muted" style="margin-top:10px">${esc(b.note)}</p>` : ''}<div class="so-grid">${parties}</div></section>`;
}

function techStack(b: TechStackBlock): string {
  const rows = b.rows.map((r) => `<tr><td>${esc(r.layer)}</td><td><b>${esc(r.choice)}</b></td><td class="why"><div class="whybox">${esc(r.why)}${r.value ? `<div class="val">${esc(r.value)}</div>` : ''}</div></td></tr>`).join('');
  return `<section>${head(undefined, b.heading, 'Technology choices')}<div class="tw"><table><tbody><tr><th>Layer</th><th>Choice</th><th>Why</th></tr>${rows}</tbody></table></div></section>`;
}

function teamAllocation(b: TeamAllocationBlock, m: Record<string, string>): string {
  const cards = b.members.map((me) => `<div class="tcard"><div class="av">${icon(me.icon, m, 16)}</div><div class="tinfo"><div class="rn">${esc(me.role)}</div>${me.responsibility ? `<div class="rp">${esc(me.responsibility)}</div>` : ''}</div></div>`).join('');
  return `<section>${head(undefined, b.heading, 'Team allocation')}<div class="team">${cards}</div></section>`;
}

function financial(b: FinancialBlock): string {
  // Wide mode: rows carry `cells` matching `columns` (any width). First column is the row label, the
  // rest are figures; the last is right-aligned like the amount column of the phase layout.
  if (b.rows.some((r) => r.cells)) {
    const cols = b.columns ?? [];
    const last = cols.length - 1;
    const ths = cols.map((h, i) => `<th${i === last ? ' class="r"' : ''}>${esc(h)}</th>`).join('');
    const trs = b.rows
      .map((r) => `<tr>${(r.cells ?? []).map((c, i) => (i === 0 ? `<td><b>${esc(c)}</b></td>` : `<td class="num${i === last ? ' r' : ''}">${esc(c)}</td>`)).join('')}</tr>`)
      .join('');
    const tot = b.hideTotal ? '' : `<tr class="tot"><td colspan="${Math.max(1, last)}">${esc(b.note ?? 'Total')}</td><td class="r num">${money(b.totalCents, b.currency)}</td></tr>`;
    const noteBelow = b.hideTotal && b.note ? `<p class="small muted" style="margin-top:8px">${esc(b.note)}</p>` : '';
    const dense = cols.length > 6 ? ' style="font-size:12px"' : '';
    // A wide table is often not money at all (a capability comparison, a rate card) — honour its own eyebrow.
    return `<section>${head(b.eyebrow, b.heading, 'Financial estimation')}<div class="tw"><table${dense}><tbody><tr>${ths}</tr>${trs}${tot}</tbody></table></div>${noteBelow}</section>`;
  }
  const rows = b.rows
    .map((r) => {
      const focus = `${esc(r.focus ?? '')}${r.rationale ? `<span class="small muted"> · ${esc(r.rationale)}</span>` : ''}`;
      return `<tr><td><b>${esc(r.label)}</b></td><td>${focus}</td><td>${esc(r.timeline)}</td><td class="r num">${money(r.amountCents, b.currency)}</td></tr>`;
    })
    .join('');
  // Sum the phase-row weeks for the total row (adjustment rows carry "—" → contribute 0).
  const totalWeeks = b.rows.reduce((s, r) => { const m = /(\d+(?:\.\d+)?)/.exec(r.timeline ?? ''); return s + (m ? parseFloat(m[1]) : 0); }, 0);
  const totalWks = totalWeeks > 0 ? `${totalWeeks} wks` : '';
  // A financial table is not always a phase breakdown (e.g. cost per call by contract term), so the
  // column headings may be overridden. Falls back to the phase-breakdown wording.
  const c = b.columns ?? [];
  const h1 = esc(c[0] ?? 'Phase');
  const h2c = esc(c[1] ?? 'Focus');
  const h3 = esc(c[2] ?? 'Timeline');
  const h4 = c[3] ? esc(c[3]) : `Investment (${esc(b.currency)})`;
  // A rate card by usage band has no meaningful sum: drop the total row and print the note beneath.
  const totalRow = b.hideTotal
    ? ''
    : `<tr class="tot"><td colspan="2">${esc(b.note ?? 'Total')}</td><td>${b.columns ? '' : totalWks}</td><td class="r num">${money(b.totalCents, b.currency)}</td></tr>`;
  const noteBelow = b.hideTotal && b.note ? `<p class="small muted" style="margin-top:8px">${esc(b.note)}</p>` : '';
  return `<section>${head(undefined, b.heading, 'Financial estimation')}<div class="tw"><table><tbody><tr><th>${h1}</th><th>${h2c}</th><th>${h3}</th><th class="r">${h4}</th></tr>${rows}${totalRow}</tbody></table></div>${noteBelow}</section>`;
}

function equipment(b: EquipmentBlock): string {
  if (!b.rows?.length) return ''; // an empty schedule prints nothing rather than an empty table
  const warranty = b.warranty ? `<p class="small muted" style="margin-top:10px">Warranty — ${esc(b.warranty)}</p>` : '';
  if (!b.showPricing) {
    // Global/local: what is supplied, not what it costs — the money is in the Budget tab.
    const rows = b.rows.map((r) =>
      `<tr><td><b>${esc(r.item)}</b></td><td>${esc(r.brand ?? '')}</td><td class="r num">${esc(r.qty)}${r.uom ? ` ${esc(r.uom)}` : ''}</td><td>${esc(r.note ?? '')}</td></tr>`).join('');
    const tax = b.note ? `<p class="small muted" style="margin-top:6px">${esc(b.note)}</p>` : '';
    return `<section>${head(b.eyebrow, b.heading, 'Hardware & equipment')}<div class="tw"><table><tbody><tr><th>Item</th><th>Brand / model</th><th class="r">Qty</th><th>Remarks</th></tr>${rows}</tbody></table></div>${tax}${warranty}</section>`;
  }
  const rows = b.rows.map((r) => {
    const spec = [r.brand, r.uom].filter(Boolean).map(esc).join(' · ');
    return `<tr><td><b>${esc(r.item)}</b>${spec ? `<span class="small muted"> · ${spec}</span>` : ''}</td><td class="r num">${esc(r.qty)}</td><td class="r num">${money(r.unitPriceCents, b.currency)}</td><td class="r num">${money(r.amountCents, b.currency)}</td><td>${esc(r.note ?? '')}</td></tr>`;
  }).join('');
  return `<section>${head(b.eyebrow, b.heading, 'Hardware & equipment')}<div class="tw"><table><tbody><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount (${esc(b.currency)})</th><th>Remarks</th></tr>${rows}<tr class="tot"><td colspan="3">${esc(b.note ?? 'Total')}</td><td class="r num">${money(b.totalCents, b.currency)}</td><td></td></tr></tbody></table></div>${warranty}</section>`;
}

function paymentTerms(b: PaymentTermsBlock): string {
  const terms = b.terms.map((t) => `<div class="p"><div class="pn num">${t.percent}%</div><div class="pl">${esc(t.label)}</div></div>`).join('');
  return `<section>${head(undefined, b.heading, 'Payment terms')}<div class="paybar">${terms}</div>${b.note ? `<p class="small muted" style="margin-top:14px">${esc(b.note)}</p>` : ''}</section>`;
}

function commercialTerms(b: CommercialTermsBlock): string {
  const rows = b.terms
    .map(
      (t) =>
        `<tr><td><b>${esc(t.label)}</b></td><td>${esc(t.detail)}</td><td class="small muted">${esc(t.basis ?? '')}</td></tr>`,
    )
    .join('');
  return `<section>${head(b.eyebrow, b.heading, 'Hosting, support & ownership')}<table class="tbl"><tbody>${rows}</tbody></table>${
    b.note ? `<p class="small muted" style="margin-top:14px">${esc(b.note)}</p>` : ''
  }</section>`;
}

function handover(b: HandoverBlock): string {
  const cols = b.columns.map((col) => `<ul class="clean">${col.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>`).join('');
  return `<section>${head(undefined, b.heading, 'Release & handover')}<div class="cols2">${cols}</div></section>`;
}

function comparables(b: ComparablesBlock): string {
  const items = b.items.map((c) => `<a href="${esc(c.url ?? '#')}"><b>${esc(c.name)}</b><p>${esc(c.blurb)}</p><span class="go">View project →</span></a>`).join('');
  const why = b.whyRiseup ? `<div class="why"><h3>${esc(b.whyRiseup.heading)}</h3><p>${esc(b.whyRiseup.body)}</p><div class="pts">${b.whyRiseup.points.map((p) => `<div class="pt"><b>${esc(p.stat)}</b><span>${esc(p.label)}</span></div>`).join('')}</div></div>` : '';
  return `<section>${head(undefined, b.heading, 'Comparable work')}<div class="cmp">${items}</div>${why}</section>`;
}

function nextStep(b: NextStepBlock): string {
  const steps = b.steps.map((s, i) => `<div class="step"><div class="k num">${i + 1}</div><h4>${esc(s.title)}</h4>${s.sub ? `<p>${esc(s.sub)}</p>` : ''}</div>`).join('');
  return `<section>${head(undefined, b.heading, 'Next step')}<div class="steps">${steps}</div></section>`;
}

function prose(b: ProseBlock): string {
  return `<section>${head(b.eyebrow, b.heading)}${b.paragraphs.map((p) => `<p class="lead">${esc(p)}</p>`).join('')}</section>`;
}

function layeredArchitecture(b: LayeredArchitectureBlock, m: Record<string, string>): string {
  const tones = ['blue', 'core', 'grey', 'amber'];
  const inner = b.layers.map((l, i) => `<div class="dg-layer ${esc(l.tone ?? tones[i % tones.length])}"><span class="dg-lab">${esc(l.label)}</span><div class="dg-mods">${l.modules.map((mo) => `<div class="dg-mod"><span class="dg-ico">${icon(mo.icon, m)}</span><b>${esc(mo.label)}</b></div>`).join('')}</div></div>${i < b.layers.length - 1 ? '<div class="dg-drop"></div>' : ''}`).join('');
  return `<section>${head(b.eyebrow, b.heading)}<div class="dg-arch">${inner}</div></section>`;
}

function numberedFlow(b: NumberedFlowBlock, m: Record<string, string>): string {
  const steps = b.steps.map((s, i) => `<div class="dg-card"><span class="dg-nb">${i + 1}</span><span class="dg-cico">${icon(s.icon, m, 24)}</span><b>${esc(s.title)}</b><span class="dg-rule"></span>${s.sub ? `<span>${esc(s.sub)}</span>` : ''}</div>${i < b.steps.length - 1 ? '<div class="dg-narr">→</div>' : ''}`).join('');
  const rules = b.rulesBar ? `<div class="dg-rules"><span class="dg-rico">${icon(b.rulesBar.icon, m, 22)}</span><div><b>${esc(b.rulesBar.title)}</b><span>${b.rulesBar.items.map(esc).join(' · ')}</span></div></div>` : '';
  return `<section>${head(b.eyebrow, b.heading)}<div class="dg-flow">${steps}</div>${rules}${b.note ? `<p class="small muted" style="margin-top:12px">${esc(b.note)}</p>` : ''}</section>`;
}

// Process / System flow — the "Diagram 2" numbered pipeline. Mirrors the frontend ProcessFlow component.
const PF_TONE = ['blue', 'orange', 'purple', 'green'];
const pfArrow = (k?: string) => (k === 'data' ? 'data' : k === 'storage' ? 'storage' : 'proc');
function processFlow(b: ProcessFlowBlock): string {
  const LINE: Record<string, string> = { data: 'Data Flow', proc: 'Processing Flow', storage: 'Storage Flow' };
  const kinds = [...new Set(b.flows.flatMap((f) => (f.arrows ?? []).map((a) => pfArrow(a.kind))).concat(b.flows.some((f) => f.outputs?.length) ? ['storage'] : []))];
  const flows = b.flows.map((flow) => {
    const title = flow.heading ? `<div class="pf-title"><h3>${esc(flow.heading)}</h3><span class="pf-rule"></span></div>` : '';
    const pipe = `<div class="pf-pipe">${flow.stages.map((s, i) => {
      const t = PF_TONE[i % 4];
      const stage = `<div class="pf-stage"><div class="pf-ficon ${t}">${saIcon(s.icon)}</div><div class="pf-card ${t}"><div class="pf-chead"><span class="pf-badge ${t}">${String(i + 1).padStart(2, '0')}</span><div class="pf-ctext"><b>${esc(s.title)}</b>${s.desc ? `<span>${esc(s.desc)}</span>` : ''}</div></div>${s.footer ? `<div class="pf-foot ${t}"><span class="pf-fico">${saIcon(s.footerIcon || s.icon)}</span>${esc(s.footer)}</div>` : ''}</div></div>`;
      const a = i < flow.stages.length - 1
        ? `<div class="pf-arr ${pfArrow(flow.arrows?.[i]?.kind)}">${flow.arrows?.[i]?.label ? `<span class="pf-alabel">${esc(flow.arrows[i].label as string)}</span>` : ''}<svg width="46" height="14"><line x1="2" y1="7" x2="39" y2="7" stroke="currentColor" stroke-width="2"/><polygon points="44,7 36,3 36,11" fill="currentColor"/></svg></div>`
        : '';
      return stage + a;
    }).join('')}</div>`;
    const outs = flow.outputs?.length
      ? `<div class="pf-branch"><span class="pf-blabel">${esc(flow.outputLabel || 'outputs')}</span></div><div class="pf-outs">${flow.outputs.map((o) => `<div class="pf-out"><div class="pf-orow"><span class="pf-oico">${saIcon(o.icon)}</span><div class="pf-otext"><b>${esc(o.title)}</b>${o.desc ? `<span>${esc(o.desc)}</span>` : ''}</div></div>${o.items?.length ? `<div class="pf-oitems">${o.items.map((it) => `<span class="pf-oitem">${saIcon(it.icon)}${esc(it.label)}</span>`).join('')}</div>` : ''}</div>`).join('')}</div>`
      : '';
    return `<div class="pf-flow">${title}${pipe}${outs}</div>`;
  }).join('');
  const legend = kinds.length ? `<div class="pf-legend">${kinds.map((k) => `<span class="pf-lg ${k}"><i></i>${LINE[k] ?? k}</span>`).join('')}</div>` : '';
  return `<section>${b.eyebrow ? `<span class="eyebrow">${esc(b.eyebrow)}</span>` : ''}<div class="pf">${flows}${legend}</div></section>`;
}

function vendorArchitecture(b: VendorArchitectureBlock, m: Record<string, string>): string {
  const node = (n: VendorArchitectureBlock['tiers'][number], cls = 'va-node') =>
    `<div class="${cls}">${n.badge != null ? `<span class="va-badge">${n.badge}</span>` : ''}<span class="va-ico">${icon(n.icon, m, 24)}</span><span class="va-t"><b>${esc(n.title)}</b>${n.sub ? `<span>${esc(n.sub)}</span>` : ''}</span></div>`;
  const tiers = b.tiers.map((n) => node(n) + VARROW).join('');
  const group = b.group ? `<div class="va-vm"><div class="va-vm-h">${esc(b.group.label)}</div><div class="va-svcs">${b.group.services.map((s, j) => `<div class="va-svc"><span class="va-ico">${icon(s.icon, m, 24)}</span><b>${esc(s.title)}</b>${s.sub ? `<span>${esc(s.sub)}</span>` : ''}</div>${j < b.group!.services.length - 1 ? '<span class="va-harr">→</span>' : ''}`).join('')}</div></div>` : '';
  const data = b.data?.length ? VARROW + b.data.map((n) => node(n, 'va-node va-db')).join('') : '';
  return `<section>${head(b.eyebrow, b.heading)}<div class="diagram" style="border:1px solid var(--line);border-radius:12px;padding:30px 20px"><div class="va-col">${tiers}${group}${data}</div></div></section>`;
}

// ── Solution-architecture icon set — mirrors frontend/app/components/proposal/arch-icons.tsx. Self-contained
//    inline glyphs (NOT the flaky resolve-and-inject iconMap that fell back to a blank square), so the PDF and
//    the web view draw identical, always-visible icons. Every glyph is a 24×24 viewBox with stroke=currentColor.
const SA_GLYPH: Record<string, string> = {
  users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.5a3 3 0 0 1 0 5.5"/><path d="M17 14.5a5.5 5.5 0 0 1 3.5 4.5"/>',
  server: '<rect x="3.5" y="4" width="17" height="6" rx="1.6"/><rect x="3.5" y="14" width="17" height="6" rx="1.6"/><circle cx="7" cy="7" r=".6" fill="currentColor"/><circle cx="7" cy="17" r=".6" fill="currentColor"/>',
  braces: '<path d="M9 4c-2 0-2 3-2 4s-1 1.8-2 1.8c1 0 2 .8 2 1.8s0 4 2 4"/><path d="M15 4c2 0 2 3 2 4s1 1.8 2 1.8c-1 0-2 .8-2 1.8s0 4-2 4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  gauge: '<path d="M4 15a8 8 0 0 1 16 0"/><path d="M12 15l3.5-3.5"/><circle cx="12" cy="15" r="1" fill="currentColor"/>',
  cart: '<path d="M4 5h2l2 10h9l2-7H7"/><circle cx="9" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
  pin: '<path d="M12 21c4-4.5 6.5-7.6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 13.4 8 16.5 12 21Z"/><circle cx="12" cy="10.2" r="2.2"/>',
  bell: '<path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2H4.5Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  card: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M3.5 10h17"/><path d="M7 15h3"/>',
  msg: '<path d="M4 5h16v10H9l-4 3.5V15H4Z"/><path d="M8 9h8M8 12h5"/>',
  db: '<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/><path d="M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6"/>',
  bucket: '<path d="M5 7h14l-1.4 12.2a1 1 0 0 1-1 .8H7.4a1 1 0 0 1-1-.8Z"/><ellipse cx="12" cy="7" rx="7" ry="2.4"/>',
  file: '<path d="M7 3h7l4 4v14H7Z"/><path d="M14 3v4h4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6Z"/><path d="M9 12l2 2 4-4"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
  plug: '<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0Z"/><path d="M12 17v4"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13 0 16M12 4c-2.5 2.5-2.5 13 0 16"/>',
  brain: '<path d="M9.5 4a2.8 2.8 0 0 0-2.8 2.8A2.8 2.8 0 0 0 5 12a2.4 2.4 0 0 0 1.8 4A2.4 2.4 0 0 0 11 17.4V6.4A2.4 2.4 0 0 0 9.5 4Z"/><path d="M14.5 4a2.8 2.8 0 0 1 2.8 2.8A2.8 2.8 0 0 1 19 12a2.4 2.4 0 0 1-1.8 4A2.4 2.4 0 0 1 13 17.4"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 3v2M14.5 3v2M9.5 19v2M14.5 19v2M3 9.5h2M3 14.5h2M19 9.5h2M19 14.5h2"/>',
  layers: '<path d="M12 4l8 4-8 4-8-4Z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/>',
  cloud: '<path d="M7.5 18a4 4 0 0 1 .4-8 5 5 0 0 1 9.5 1.1A3.5 3.5 0 0 1 17 18Z"/>',
  funnel: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5Z"/>',
  tag: '<path d="M12 3H5v7l9 9 7-7Z"/><circle cx="8.2" cy="8.2" r="1.2" fill="currentColor"/>',
  bolt: '<path d="M13 3 5.5 13H10l-1 8 8.5-11H13Z"/>',
  chart: '<path d="M4 4v16h16"/><rect x="7.5" y="12" width="2.6" height="5"/><rect x="12" y="8.5" width="2.6" height="8.5"/><rect x="16.5" y="5.5" width="2.6" height="11.5"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z"/>',
  upload: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 14v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l4.5 4.5"/>',
  box: '<rect x="5" y="5" width="14" height="14" rx="3"/>',
};
const SA_ALIAS: Record<string, string> = {
  'server-cog': 'server', api: 'braces', 'api-server': 'braces', code: 'braces', rest: 'braces',
  web: 'globe', browser: 'globe', portal: 'globe', frontend: 'monitor', desktop: 'monitor', dashboard: 'monitor', app: 'monitor', smartphone: 'monitor', mobile: 'monitor', phone: 'monitor',
  'sliders-horizontal': 'gear', sliders: 'gear', controls: 'gear', security: 'shield', auth: 'lock', authentication: 'lock', key: 'lock',
  settings: 'gear', orchestration: 'gear', cog: 'gear', processing: 'gear', engine: 'gear', matching: 'gear',
  rate: 'gauge', 'rate-limit': 'gauge', ratelimit: 'gauge', meter: 'gauge',
  booking: 'cart', checkout: 'cart', order: 'cart', shopping: 'cart', ecommerce: 'cart',
  catalog: 'list', 'list-checks': 'list', items: 'list', products: 'list',
  sources: 'file', 'cloud-upload': 'upload', 'file-up': 'upload', ingest: 'upload', import: 'upload',
  filter: 'funnel', collector: 'funnel', collection: 'funnel',
  label: 'tag', 'audit-trail': 'clock', versioned: 'file',
  zap: 'bolt', lightning: 'bolt', fast: 'bolt', 'fast-retrieval': 'bolt', retrieval: 'bolt', speed: 'bolt',
  'bar-chart': 'chart', analytics: 'chart', scalable: 'chart', graph: 'chart', metrics: 'chart',
  find: 'search', magnifier: 'search', query: 'search', 'vector-db': 'search',
  map: 'pin', 'map-pin': 'pin', location: 'pin', geo: 'pin', maps: 'pin', address: 'pin',
  notification: 'bell', notify: 'bell', alerts: 'bell', reminders: 'bell',
  'credit-card': 'card', payment: 'card', payments: 'card', wallet: 'card', billing: 'card', pay: 'card',
  message: 'msg', 'message-square': 'msg', whatsapp: 'msg', chat: 'msg', sms: 'msg', email: 'msg', mail: 'msg',
  database: 'db', postgres: 'db', postgresql: 'db', mysql: 'db', sql: 'db', 'relational-db': 'db',
  folder: 'bucket', 'file-storage': 'bucket', s3: 'bucket', storage: 'bucket', blob: 'bucket',
  document: 'file', doc: 'file', audit: 'file', logs: 'file', 'audit-logs': 'file', metadata: 'file',
  sessions: 'clock', time: 'clock', schedule: 'clock',
  user: 'users', people: 'users', customer: 'users', admin: 'users', account: 'users', accounts: 'users', hr: 'users',
  integration: 'plug', integrations: 'plug', service: 'plug', services: 'plug', 'api-service': 'plug', gateway: 'plug',
  ai: 'brain', ml: 'brain', llm: 'brain', model: 'brain', 'llm-provider': 'brain',
  compute: 'cpu', processor: 'cpu', embedding: 'layers', vector: 'layers', index: 'layers',
};
function saIcon(name?: string): string {
  const raw = (name ?? '').toLowerCase().trim();
  const g = SA_GLYPH[SA_ALIAS[raw] ?? raw] ?? SA_GLYPH.box;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${g}</svg>`;
}
const SA_MONITOR =
  '<div class="sa-monitor"><svg viewBox="0 0 200 118" fill="none">' +
  '<rect x="6" y="6" width="188" height="94" rx="8" fill="#fff" stroke="#C4D6FF" stroke-width="2"/><rect x="6" y="6" width="188" height="20" rx="8" fill="#EAF1FF"/>' +
  '<circle cx="18" cy="16" r="2.4" fill="#2563EB"/><circle cx="27" cy="16" r="2.4" fill="#93B4FF"/><circle cx="36" cy="16" r="2.4" fill="#CBD9FF"/>' +
  '<rect x="16" y="36" width="52" height="54" rx="6" fill="#EAF1FF"/><circle cx="42" cy="58" r="14" fill="none" stroke="#2563EB" stroke-width="6"/><path d="M42 44a14 14 0 0 1 12 7" stroke="#EA5400" stroke-width="6" fill="none"/>' +
  '<rect x="80" y="36" width="104" height="12" rx="4" fill="#EAF1FF"/><rect x="80" y="54" width="104" height="12" rx="4" fill="#F1F5FB"/><rect x="80" y="72" width="70" height="12" rx="4" fill="#F1F5FB"/>' +
  '<path d="M60 100h80M100 100v8M92 108h16" stroke="#C4D6FF" stroke-width="2" stroke-linecap="round"/></svg></div>';

const SA_HEAD_TONE: Record<string, string> = { client: 'blue', core: 'dark', ai: 'purple', data: 'green', grey: 'dark' };
const saNodeTone = (gt: string, i: number) => (gt === 'client' ? 'blue' : gt === 'core' ? (i === 0 ? 'dark' : 'orange') : gt === 'ai' ? 'purple' : gt === 'data' ? 'green' : 'dark');
const saSubTone = (nt: string) => (nt === 'dark' ? 'blue' : nt);
const saArrowClass = (k: string) => (k === 'sync' ? 'sync' : k === 'data' ? 'data' : k === 'vector' ? 'event' : 'orm');
const SA_VARR = '<svg width="15" height="22"><line x1="7.5" y1="1" x2="7.5" y2="15" stroke="currentColor" stroke-width="1.8"/><polygon points="7.5,21 3.5,13 11.5,13" fill="currentColor"/></svg>';

function solutionArchitecture(b: SolutionArchitectureBlock): string {
  const top = b.groups.filter((g) => !g.span);
  const spans = b.groups.filter((g) => g.span);
  const between = (a: string, c: string) => b.edges.filter((e) => (e.from === a && e.to === c) || (e.from === c && e.to === a));
  const downEdges = b.edges.filter((e) => spans.some((s) => s.key === e.to));
  const kinds = [...new Set(b.edges.map((e) => e.kind))];
  const KIND: Record<string, string> = { sync: 'Synchronous Call', data: 'Data Flow', vector: 'Event / Webhook', orm: 'ORM Connection' };

  const nodeCard = (g: SolutionArchitectureBlock['groups'][number], n: SolutionArchitectureBlock['groups'][number]['nodes'][number], i: number) => {
    const nt = saNodeTone(g.tone, i);
    const subs = n.items?.length
      ? `<div class="sa-subs">${n.items.map((it) => `<span class="sa-sub ${saSubTone(nt)}"><span class="sa-sic">${saIcon(it.icon)}</span>${esc(it.label)}</span>`).join('')}</div>`
      : '';
    return `<div class="sa-card"><div class="sa-nrow"><span class="sa-chip lg ${nt}">${saIcon(n.icon)}</span><span class="sa-ntext"><b>${esc(n.title)}</b>${n.subtitle ? `<span>${esc(n.subtitle)}</span>` : ''}</span></div>${subs}</div>`;
  };
  const groupCard = (g: SolutionArchitectureBlock['groups'][number]) => {
    const head0 = `<div class="sa-ghead"><span class="sa-chip ${SA_HEAD_TONE[g.tone] ?? 'dark'}">${saIcon(g.icon)}</span>${esc(g.label)}</div>`;
    let body: string;
    if (g.tone === 'client') {
      const surf = `<div class="sa-surf">${g.nodes.map((n) => `<div class="sa-s"><span class="sa-chip blue">${saIcon(n.icon)}</span><span>${esc(n.title)}</span></div>`).join('')}</div>`;
      body = SA_MONITOR + surf;
    } else {
      body = `<div class="sa-nodes ${g.span ? 'row' : ''}">${g.nodes.map((n, i) => (i > 0 && !g.span ? `<div class="sa-vgap">${SA_VARR}</div>` : '') + nodeCard(g, n, i)).join('')}</div>`;
    }
    return `<div class="sa-group ${esc(g.tone)}">${head0}${body}${g.footnote ? `<div class="sa-foot">${esc(g.footnote)}</div>` : ''}</div>`;
  };
  const hConn = (leftKey: string, edges: SolutionArchitectureBlock['edges']) => {
    const fwd = edges.some((e) => e.from === leftKey);
    const back = edges.some((e) => e.to === leftKey);
    const kind = edges[0]?.kind ?? 'sync';
    const cls = saArrowClass(kind);
    const pills = edges.map((e) => (e.label ? `<span class="sa-pill ${saArrowClass(e.kind)}">${esc(e.label)}</span>` : '')).join('');
    return `<div class="sa-gut">${pills}<svg width="60" height="14" class="sa-arw ${cls}"><line x1="4" y1="7" x2="56" y2="7" stroke="currentColor" stroke-width="2"${kind === 'orm' ? ' stroke-dasharray="4 3"' : ''}/>${fwd ? '<polygon points="56,7 49,3.5 49,10.5" fill="currentColor"/>' : ''}${back ? '<polygon points="4,7 11,3.5 11,10.5" fill="currentColor"/>' : ''}</svg></div>`;
  };
  const vConn = (edges: SolutionArchitectureBlock['edges']) =>
    `<div class="sa-downs">${edges.map((e) => `<div class="sa-down">${e.label ? `<span class="sa-pill ${saArrowClass(e.kind)}">${esc(e.label)}</span>` : ''}<svg width="15" height="22" class="sa-arw ${saArrowClass(e.kind)}"><line x1="7.5" y1="1" x2="7.5" y2="15" stroke="currentColor" stroke-width="2"${e.kind === 'orm' ? ' stroke-dasharray="4 3"' : ''}/><polygon points="7.5,21 3.5,13 11.5,13" fill="currentColor"/></svg></div>`).join('')}</div>`;

  const topRow = top.map((g, i) => groupCard(g) + (i < top.length - 1 && between(g.key, top[i + 1].key).length ? hConn(g.key, between(g.key, top[i + 1].key)) : '')).join('');
  const spanRow = spans.length ? (downEdges.length ? vConn(downEdges) : '') + spans.map(groupCard).join('') : '';
  const iconLegend =
    '<span class="sa-lgsep"></span>' +
    `<span class="sa-lg"><span class="sa-chip dark">${saIcon('shield')}</span>Security</span>` +
    `<span class="sa-lg"><span class="sa-chip orange">${saIcon('gear')}</span>Processing</span>` +
    `<span class="sa-lg"><span class="sa-chip green">${saIcon('db')}</span>Storage</span>` +
    `<span class="sa-lg"><span class="sa-chip purple">${saIcon('plug')}</span>Integration</span>`;
  const legend = `<div class="sa-legend">${kinds.map((k) => `<span class="sa-lg ${saArrowClass(k)}"><i></i>${esc(KIND[k] ?? k)}</span>`).join('')}${iconLegend}</div>`;
  const title = b.heading ? `<div class="sa-title"><h3>${esc(b.heading)}</h3><span class="sa-rule"></span></div>` : '';
  return `<section>${b.eyebrow ? `<span class="eyebrow">${esc(b.eyebrow)}</span>` : ''}<div class="sa">${title}<div class="sa-top">${topRow}</div>${spanRow}${legend}</div></section>`;
}

function diagram(b: DiagramBlock): string {
  const body = b.svg
    ? `<div class="kroki-svg">${b.svg}</div>`
    : `<div style="border:1px dashed var(--line-2);border-radius:12px;padding:36px 20px;text-align:center;color:var(--subtle);background:var(--soft);font-size:13px">▧ ${esc(b.kind)} diagram · rendered at generation via Kroki (${esc(b.engine)})</div>`;
  return `<section>${head(b.eyebrow, b.heading)}${body}</section>`;
}

function renderBlock(b: Block, meta: ProposalMeta, m: Record<string, string>): string {
  switch (b.type) {
    case 'cover': return cover(b, meta);
    case 'overview': return overview(b, m);
    case 'scope': return scope(b, m);
    case 'featureMatrix': return featureMatrix(b, m);
    case 'workApproach': return workApproach(b);
    case 'deliverables': return deliverables(b);
    case 'timeline': return timeline(b);
    case 'assumptions': return assumptions(b);
    case 'outOfScope': return outOfScope(b);
    case 'signoff': return signoff(b);
    case 'techStack': return techStack(b);
    case 'teamAllocation': return teamAllocation(b, m);
    case 'financial': return financial(b);
    case 'equipment': return equipment(b);
    case 'paymentTerms': return paymentTerms(b);
    case 'commercialTerms': return commercialTerms(b);
    case 'handover': return handover(b);
    case 'comparables': return comparables(b);
    case 'nextStep': return nextStep(b);
    case 'prose': return prose(b);
    case 'layeredArchitecture': return layeredArchitecture(b, m);
    case 'numberedFlow': return numberedFlow(b, m);
    case 'processFlow': return processFlow(b);
    case 'vendorArchitecture': return vendorArchitecture(b, m);
    case 'solutionArchitecture': return solutionArchitecture(b);
    case 'diagram': return diagram(b);
    default: { const _n: never = b; return _n; }
  }
}

/** Full HTML document for pdf.service.htmlToPdf(). Web/PDF identical via PROPOSAL_CSS. */
export function renderProposalDocumentHtml(doc: ProposalDocument): string {
  const map = doc.iconMap ?? {};
  const body = doc.blocks.map((b) => renderBlock(b, doc.meta, map)).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
/* Content pages get top/bottom breathing room so nothing sits flush against the page edge; the FIRST
   page (the dark cover) stays full-bleed. Honored via preferCSSPageSize in pdf.service. */
@page{size:A4;margin:16mm 0 13mm 0}
@page:first{margin:0}
html,body{margin:0;background:#fff}
${PROPOSAL_CSS}
.pdoc{background:#fff}
.pdoc .paper{max-width:100% !important;margin:0 !important;box-shadow:none !important;border-radius:0 !important;overflow:visible !important}
/* Sections flow naturally across pages (cards/rows stay whole via the @media print rules); avoiding
   whole-section breaks caused tall sections to jump to the next page and leave big gaps. */
.pdoc section{break-inside:auto}
/* ...but a heading must never be the last thing on a page. Without this the eyebrow + h2 print at the
   foot of one page and the content starts on the next, which reads as a blank page. */
.pdoc .sechead{break-inside:avoid;break-after:avoid}
.pdoc .card{break-inside:avoid}
</style></head><body><div class="pdoc"><div class="paper">${body}</div></div></body></html>`;
}

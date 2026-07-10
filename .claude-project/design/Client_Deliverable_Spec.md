# Lead360 — Client Deliverable Design Spec (premium & interactive)

> Applies ONLY to the 3 client-facing pages: `client/proposal-view`, `client/budget-view`, `client/deliverable-view`.
> The internal app stays enterprise "Riseup Studio" (v3, Inter, restrained). These client pages are the opposite:
> **brand-forward, warm, premium, and highly interactive** — the client must feel excited and "see it happening."
> Keep the v3 CONTENT (14/11 sections, FIFA budget, ATEC/FIFA samples). Upgrade the LOOK + INTERACTIVITY.

## Vibe
Think Qwilr / Pandadoc / a beautiful pitch microsite — not a static PDF, not an admin table. Confident, classy, alive.
Warmer than the internal app. Generous whitespace, big type, smooth motion, tasteful use of brand orange.

## Brand & tokens (client deliverable)
- Font: **Plus Jakarta Sans** (warm, premium) for headings + body. (Different from the app's Inter — intentional.)
- Colors: brand orange `#EA5400` (used generously here, unlike the app), deep charcoal `#1A1715`, canvas `#FFFFFF` with soft warm sections `#FBF7F3`, hairline `#EAE4DE`, muted text `#6B6660`.
- Accents for variety: warm gradient `linear-gradient(120deg,#EA5400,#FF8A3D)`; supporting teal `#0E9F8E`, amber `#F4A93C` for chips/status only.
- Corners: soft `16px` cards, pill chips — premium and friendly (this is client-facing, restraint rules don't apply).
- Shadows: allowed and tasteful — `0 8px 30px rgba(26,23,21,.08)` for elevated cards; soft.
- Motion: rich but smooth — scroll-reveals (fade + 12px rise), animated architecture, count-up numbers, hover lifts. Nothing childish/bouncy; easing `cubic-bezier(.2,.7,.2,1)`, 300–500ms.
- Icons: Lucide (stroke 1.75). Tech logos via CDN (simple-icons) or clean inline SVG/monograms; no emoji.

## Chrome (all 3 pages)
- **Fixed top bar**: small "Riseup Labs" wordmark left · a thin **scroll-progress bar** under it · right: "Download PDF" + "Request a demo" buttons.
- **Sticky left (or top) section nav**: jump links to each section, active item highlights as you scroll (IntersectionObserver).
- **Right slide-in comment panel**: every section has a small "＋ comment" affordance → opens a right thread panel with a couple of sample comments; a comment can flag "Request a demo about this".
- **Request-a-demo modal**: name, email, preferred date range, note.
- `@media print`: hide top bar/nav/comment UI, clean single-column document.
- Small "tokenized preview • read-only" tag (no app sidebar/chrome).

## Required interactivity (make it noticeably MORE interactive than before)
1. **Scroll progress + sticky section nav** with active highlighting.
2. **Scroll-reveal** on every section (staggered).
3. **Animated architecture diagram** (proposal §4 / deliverable): nodes fade/scale in on scroll, arrow paths draw (~450ms), data-flow dots travel the arrows on a 4–6s loop; **hover a node → highlight its connections + show a tooltip** of what it does. Tasteful, no 3D.
4. **Requirements comparison table** (3-col): rows **expand on click** to reveal sub-points; hover highlights the row.
5. **Tech stack**: chips with logo + **hover tooltip "why we chose this"**.
6. **Deliverables**: interactive **week-by-week timeline** — hover/click a week to expand its items.
7. **Count-up animation** on the headline numbers (total price, timeline weeks) when they scroll into view.
8. **Inline comments** per section + **Request demo** (modal) — both functional (JS, in-memory).
9. Smooth anchor scrolling from the section nav.

## Page specifics

### client/proposal-view.page.html — Global/Local (sample: "AP Invoice Automation (SAP)" · ATEC Group)
Premium scrollytelling proposal. **Hero cover** (client name, project title, Riseup mark, warm gradient accent, subtle animated motif, "Prepared for ATEC Group" + date). Then the **14 sections** (Executive Summary; Understanding of Requirements as the interactive 3-col table; Solution Capabilities; **Proposed Architecture** animated+interactive; Technical Approach with the 8 named subsections as an interactive accordion/stepper; SAP Integration Feasibility; Technical Stack chips+tooltips; Development Methodology; Deliverables interactive timeline; Testing & QA; Infrastructure & Deployment; Security/Governance/Compliance; Assumptions & Dependencies; Conclusion). A **Pricing summary** card near the end (milestone split with animated bars, count-up total) with a note that the full budget is a separate document (link to budget-view). Proof: 2–3 comparable Riseup projects as cards. Strong closing CTA.

### client/budget-view.page.html — Global/Local budget (ATEC, FIFA structure)
Premium **interactive spreadsheet** experience (not a plain table):
- **Milestone tabs** across the top ("Development", etc.), animated underline.
- Banner "Cost Breakdown for Item A".
- The FIFA table: **Sl. | Departments | Heads | Type | No. of Unit | No. of Days | Per Day Cost | Unit Cost | Total Cost**, grouped by department (Managing & Planning, Art, Development, Others), **collapsible groups**, per-department subtotal rows, bold **Total**.
- **Toggles** that visibly recompute the total with a count-up: "Hide dev cost", "Show optional line items". Timeline note.
- Hover row highlight; **per-row comment** affordance. **Export to Excel** button (prominent). Use the §9 sample rows; math must be correct.
- Feels alive: subtle row-in animation, animated total.

### client/deliverable-view.page.html — Agency/Design Portfolio combined (sample: "FIFA Campaign Microsite")
Same premium proposal treatment for the **11 sections**, with **§9 Financial Proposal** rendered inline as the interactive FIFA budget (tabs, collapsible groups, animated total, toggles) — one continuous, gorgeous page. Single **Download combined PDF**. All sections commentable.

## Rules
- Keep sample data/numbers consistent (ATEC AP Invoice budget total from §9 of the guide; FIFA combined likewise).
- Every interactive element `data-testid="{page}-{element}"`.
- All motion smooth + tasteful; degrade gracefully (works without JS = content still readable).
- No app sidebar/topbar. Brand-forward, premium, warm. Vanilla JS only + Lucide (+ optional simple-icons CDN for logos).

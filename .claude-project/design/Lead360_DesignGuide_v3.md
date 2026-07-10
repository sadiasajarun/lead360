# Lead360 — Design Guide v3 (Riseup Studio · enterprise rebuild)

> The single build spec for the v3 redesign. Pairs with `DESIGN_SYSTEM.md` (tokens).
> Enterprise SaaS look: dark sidebar, Inter, hairline borders, restrained orange, small radii, tabular numerals.
> Vocabulary: **Lead** (pre-lock) / **Project** (portfolio). **Never "Deal".** "Conversion Rate" (never "Win Rate"). "Approvals" (never "Verification").

---

## 0. Three concept shifts (drive everything)
1. **Dashboard = analytics landing** (KPIs, funnel, cycle time, activity). The list of leads lives on its own **Leads** page.
2. **"Deal" is dead** → Lead / Project everywhere in UI.
3. **Enforced approval loop**: Sales generates → Submit for approval → Management approves → *then* "Send to client" unlocks the client link.

## 1. Pipeline statuses (the state machine)
Funnel nodes (order): **Generated → Pending Approval → Approved → Sent → Locked**, plus **Lost** as a leaked side-branch. Draft/Ready are wizard-internal only (never in funnel/filters).

| Current | Action (who) | Next |
|---|---|---|
| Generated | Submit for approval (Sales) | Pending Approval |
| Pending Approval | Approve / Reject (Management) | Approved / Rejected |
| Rejected | Regenerate → Submit again (Sales) | Pending Approval |
| Approved | Send to client (Sales — unlocks client link) | Sent |
| Sent | Mark Locked / Mark Lost / Regenerate | Locked / Lost |
| Lost | requires reason: budget·scope·timeline·competitor·no response·other + note | Lost |

---

## 2. SHARED BASE CSS (paste verbatim into every App-Shell + Flow-Shell page `<style>`)

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
 --bg:#FAFAF9;--panel:#FFFFFF;--panel-2:#F4F4F2;
 --sidebar:#111111;--sidebar-text:#B8B5B0;--sidebar-text-active:#FFFFFF;--sidebar-hover:#1F1F1F;
 --border:#E8E6E3;--border-strong:#D4D1CC;
 --text:#0F0F0F;--text-muted:#6B6660;--text-subtle:#9A948E;
 --primary:#EA5400;--primary-soft:rgba(234,84,0,.08);--primary-press:#CC4900;
 --success:#0E7C5A;--warn:#B8710A;--danger:#B42318;--info:#175CD3;
}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);
 -webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
a{color:inherit;text-decoration:none}
.num{font-variant-numeric:tabular-nums}
.label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-subtle)}
.card{background:var(--panel);border:1px solid var(--border);border-radius:8px}
.btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px;border-radius:6px;border:1px solid transparent;
 font:inherit;font-size:14px;font-weight:500;cursor:pointer;transition:all .12s}
.btn.sm{height:32px;padding:0 11px;font-size:13px}
.btn-primary{background:var(--primary);color:#fff}.btn-primary:hover{background:var(--primary-press)}
.btn-secondary{background:var(--panel);border-color:var(--border-strong);color:var(--text)}.btn-secondary:hover{background:var(--panel-2)}
.btn-ghost{background:transparent;color:var(--text-muted)}.btn-ghost:hover{color:var(--text);background:var(--panel-2)}
.btn-danger{background:var(--panel);border-color:var(--danger);color:var(--danger)}
.btn[disabled]{opacity:.45;cursor:not-allowed}
.pill{display:inline-flex;align-items:center;gap:7px;height:24px;padding:0 10px;border:1px solid var(--border);
 border-radius:4px;background:var(--panel);color:var(--text);font-size:12px;font-weight:500}
.pill .dot{width:6px;height:6px;border-radius:50%}
.dot-generated{background:var(--info)}.dot-pending{background:var(--warn)}.dot-approved{background:var(--success)}
.dot-sent{background:var(--primary)}.dot-locked{background:var(--success)}.dot-lost{background:var(--danger)}.dot-rejected{background:var(--danger)}
table{width:100%;border-collapse:collapse;font-size:14px}
thead th{position:sticky;top:0;background:var(--panel-2);border-bottom:1px solid var(--border-strong);
 text-align:left;font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--text-subtle);text-transform:uppercase;padding:0 16px;height:40px}
tbody td{border-bottom:1px solid var(--border);padding:0 16px;height:44px;color:var(--text)}
tbody tr:hover{background:var(--panel-2);cursor:pointer}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.kpi{padding:24px}
.kpi .label{margin-bottom:10px;padding-bottom:12px;border-bottom:1px solid var(--border)}
.kpi .val{font-size:32px;font-weight:600;line-height:1}.kpi .delta{font-size:12px;font-weight:500;margin-left:8px}
.delta.up{color:var(--success)}.delta.down{color:var(--danger)}
/* readiness segment bar */
.segbar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--panel-2);position:relative}
.segbar .z-danger{background:rgba(180,35,24,.18)}.segbar .z-warn{background:rgba(184,113,10,.18)}.segbar .z-success{background:rgba(14,124,90,.18)}
.segbar .marker{position:absolute;top:-3px;width:3px;height:16px;background:var(--text);border-radius:2px}
```

## 3. SHARED APP-SHELL MARKUP (paste verbatim; change only the active nav item, the nav SET per role, and `<main>`)

```html
<div style="display:flex;min-height:100vh">
  <aside style="width:260px;flex:0 0 260px;background:var(--sidebar);display:flex;flex-direction:column;padding:20px 12px">
    <div style="display:flex;align-items:center;gap:9px;padding:6px 12px 22px">
      <span style="width:24px;height:24px;border-radius:6px;background:var(--primary);display:grid;place-items:center;color:#fff;font-weight:700;font-size:13px">L</span>
      <span style="font-weight:600;font-size:16px;color:#fff">Lead360</span>
    </div>
    <nav style="display:flex;flex-direction:column;gap:1px" aria-label="Primary">
      <!-- SALES/PM set: Dashboard, Leads, Projects, Settings -->
      <!-- MANAGEMENT set: Overview, Approvals, Leads, Projects, Settings -->
      <a class="side" data-testid="nav-dashboard" href="dashboard.page.html"><i data-lucide="layout-dashboard"></i>Dashboard</a>
      <a class="side" data-testid="nav-leads" href="leads.page.html"><i data-lucide="list"></i>Leads</a>
      <a class="side" data-testid="nav-projects" href="projects.page.html"><i data-lucide="folder"></i>Projects</a>
      <a class="side" data-testid="nav-settings" href="#"><i data-lucide="settings"></i>Settings</a>
    </nav>
    <div style="margin-top:auto;display:flex;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid #262626">
      <span style="width:30px;height:30px;border-radius:50%;background:#2a2a2a;color:#fff;display:grid;place-items:center;font-size:12px;font-weight:600">FK</span>
      <div style="line-height:1.25"><div style="font-size:13px;color:#fff;font-weight:500">Farah Karim</div><div style="font-size:11px;color:var(--sidebar-text)">Sales</div></div>
    </div>
  </aside>
  <div style="flex:1;min-width:0;display:flex;flex-direction:column">
    <header style="display:flex;align-items:center;gap:14px;padding:0 32px;height:60px;background:var(--panel);border-bottom:1px solid var(--border)">
      <div style="position:relative;flex:1;max-width:420px">
        <i data-lucide="search" style="position:absolute;left:11px;top:9px;width:16px;color:var(--text-subtle)"></i>
        <input data-testid="topbar-search" placeholder="Search leads, companies…" style="width:100%;height:36px;padding:0 12px 0 34px;border:1px solid var(--border);border-radius:6px;background:var(--bg);font:inherit;font-size:13px">
      </div>
      <a class="btn btn-primary" data-testid="topbar-new-lead" href="new-lead-info.page.html"><i data-lucide="plus" style="width:16px"></i>New Lead</a>
      <button class="iconbtn" data-testid="topbar-bell" aria-label="Notifications"><i data-lucide="bell"></i></button>
    </header>
    <main style="padding:32px;max-width:1400px;width:100%;margin:0 auto"><!-- PAGE --></main>
  </div>
</div>
```
Sidebar item CSS: `.side{display:flex;align-items:center;gap:10px;height:36px;padding:0 12px;border-radius:6px;color:var(--sidebar-text);font-size:14px;font-weight:500}.side i{width:16px;height:16px}.side:hover{background:var(--sidebar-hover);color:#fff}.side.active{background:var(--sidebar-hover);color:#fff;position:relative}.side.active::before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:2px;border-radius:2px;background:var(--primary)}`
Icon-btn CSS: `.iconbtn{width:36px;height:36px;border-radius:6px;border:1px solid var(--border);background:var(--panel);display:grid;place-items:center;cursor:pointer;color:var(--text-muted)}.iconbtn:hover{background:var(--panel-2);color:var(--text)}`
- **Management nav SET** replaces the sales items with: Overview `overview.page.html`, Approvals `approvals.page.html`, Leads `leads.page.html`, Projects `../app/projects.page.html`, Settings. Management top bar has **NO "+ New Lead"** button. User chip = a manager (e.g., "Sadia N. · Management").
- End every page with `<script src="https://unpkg.com/lucide@latest"></script><script>lucide.createIcons()</script>`.

## 4. FLOW-SHELL (wizard) — top stepper
Top bar (white, hairline): Lead360 wordmark (left) + centered 5-step tracker (①Info ②Requirement ③Readiness ④Template ⑤Generate) + "Save & exit" (right). Completed = orange filled + check; current = orange ring + bold; upcoming = `--text-subtle`; connector line orange to current. Content centered **720px**, 32px padding. Bottom bar: `[← Back]` (secondary; step1 = "Cancel" → dashboard.page.html) + `[Continue →]` (primary). No sidebar.

## 5. CLIENT DOCUMENT chrome
No app sidebar/topbar. Centered document column (max ~860px) on `--bg`. **Sticky right action rail** (fixed, right:24px): Download PDF · Add comment · Request demo. Comments open a right thread panel. Brand-locked (orange/charcoal), `@media print` (hide rail). Top-left small "Riseup Labs" wordmark.

---

## 6. PAGE INVENTORY (18) — output paths + briefs

### `html/app/` — Sales & PM
1. **login.page.html** — centered card, no shell. Lead360 mark, "Sign in to Lead360", email+password, primary Sign in, "Riseup Labs internal".
2. **dashboard.page.html** (App Shell, active=Dashboard) — **ANALYTICS, not a list.** Header has a **date-range dropdown** (exact order: This month · Last month · Last 3 months · Last 6 months · Last year). Top row: 4 KPI cards — Active Leads, **Conversion Rate**, Avg Cycle Time (days), Proposals Awaiting Approval. Middle: **Pipeline funnel** (Generated→Pending Approval→Approved→Sent→Locked + Lost side-branch) + **Cycle-time trend** line (inline SVG). Bottom: **Recent activity** (client comments, demo requests, approvals) + **Loss reasons** small horizontal bars.
3. **leads.page.html** (App Shell, active=Leads) — the full lead table: Lead / Company, Template chip, Status pill, Owner, Value, Updated. Filters: status, template, owner, search. **No readiness column.** Row → lead-detail.page.html. Empty + one skeleton concept.
4. **new-lead-info.page.html** (Flow, step1) — company, contact name, contact email, website, optional lead title.
5. **new-lead-requirement.page.html** (Flow, step2) — drag-drop upload (PDF/DOCX/TXT/MD) or paste; file chips on success.
6. **new-lead-readiness.page.html** (Flow, step3) — **segment bar** (not gauge) + large score. If **≥80**: compact "Ready to generate" + collapsed "What we found". If **<80**: score + short "what's missing" paragraph + **checklist of client queries** (copy-to-send, mark confirmed w/ inline answer, or override & continue [logged]). Show the <80 state in the prototype (score 72) so reviewers see the checklist.
7. **new-lead-template.page.html** (Flow, step4) — 4 cards (name, one-line, what's produced, preview thumb): Global (Proposal PDF + separate Excel), Local (same), Agency (combined), Design Portfolio (combined). One selected (orange ring/dot).
8. **new-lead-generate.page.html** (Flow, step5) — progress: "Retrieving similar Riseup projects · Drafting sections · Building budget · Rendering" → "View lead" → lead-detail.page.html.
9. **lead-detail.page.html** (App Shell, active=Leads) — **the workhorse. Two columns.** LEFT = tabbed: **Proposal** (rendered proposal + a **Light / Dark / Mixture** theme switcher — three visual themes of ONE content; actions Download PDF, Regenerate prompt, View history), **Budget** (interactive table, Export .xlsx, Regenerate), **Sales Brief** (see §8), **Client activity** (comments + demo requests, threaded), **History** (version log). RIGHT rail: status pill + **status control** (buttons per state machine §1), client info (company/contact/website), template chip, owner, created/updated, **Client link** (shows tokenized URL + copy — **locked with "Available after approval" until Approved + Sent**), approval trail (Submitted → Approved by [Mgr] → Sent, each timestamped). Render the sample in **Approved** state so "Send to client" is enabled and the approval trail shows.
10. **projects.page.html** (App Shell, active=Projects) — portfolio: Category (multi-select chips) + Tech Stack (multi-select) filters + search + grid of project cards (cover/muted banner, title, one-line, category chips, stack chips). **No "Add to proposal" button.** Card → project-detail.page.html.
11. **project-detail.page.html** (App Shell, active=Projects) — hero banner (muted gradient) + two columns. LEFT: **Short summary (3–4 sentences, first, required)**, Problem/Solution/Outcome, Key features (bullets), Screenshots gallery (placeholder tiles), Timeline note. RIGHT rail: Client, Category, Tech stack chips, Duration, Team size, **View proposal** button, **Use as reference in RAG** toggle.
12. **404.page.html** — minimal, "Page not found" + back to dashboard.

### `html/management/` — Management
13. **overview.page.html** (App Shell mgmt nav, active=Overview) — org analytics + same date-range dropdown. KPIs: Conversion Rate · Avg Cycle Time (lead→locked) · Approval Turnaround (submitted→decision) · Revenue at Stake (Σ pending values). Funnel (org-wide, owner breakdown on hover). Loss reasons (larger panel, drill-down affordance). Cycle-time split by stage (Lead→Generated, Generated→Approved, Approved→Sent, Sent→Locked).
14. **approvals.page.html** (mgmt nav, active=Approvals) — queue of **Pending Approval** leads, oldest first: client, template, owner, submitted-at, waiting time. Row → review panel rendering proposal (current theme) + budget side-by-side with **Approve** / **Reject (note required)** + Sales comment thread above buttons.
15. **leads.page.html** (mgmt nav, active=Leads) — same table as sales but **read-only**, filter-heavy (owner, template, status, date range). No row actions beyond view.

### `html/client/` — external, tokenized (Client Document chrome)
16. **proposal-view.page.html** — **Global/Local proposal**, sample = "AP Invoice Automation (SAP)" for **ATEC Group**. Render the **14 sections** (§7). Interactive: animated architecture (§7b), requirements comparison table (hover highlight), tech-stack chips w/ tooltip, deliverables timeline, **inline comments** per section + **Request demo**. Sticky action rail. Default theme = Light. Budget is separate (link to budget-view).
17. **budget-view.page.html** — **Global/Local budget**, sample = ATEC AP Invoice project, **FIFA structure** (§9): milestone tabs, columns Sl.|Departments|Heads|Type|No. of Unit|No. of Days|Per Day Cost|Unit Cost|Total Cost, grouped by department with subtotals, sheet Total, timeline note, "Cost Breakdown for Item X" banner. Read-only but spreadsheet-alive; per-row comment; **Export to Excel** button.
18. **deliverable-view.page.html** — **Agency & Design Portfolio combined**, sample = "FIFA Campaign Microsite" (Agency). One continuous page: the **11 sections** (§7) with the **Financial Proposal (§9)** rendered inline as the FIFA budget. All commentable, single **Download combined PDF**.

Also rebuild **html/index.html** — a clickable map grouped: Sales/PM · Management · Client, reflecting the above.

---

## 7. Proposal content structure (match the docx templates)

**Global & Local — 14 sections:** 1 Executive Summary · 2 Understanding of Requirements *(3-col table: Requirement Area | Client Need | Proposed Response)* · 3 Proposed Solution Capabilities · 4 Proposed Architecture *(animated diagram)* · 5 Technical Approach *(subsections for the AP-invoice sample: Document Intake, Pre-Processing & Extraction, Supporting Document Retrieval, Validation & Matching, Exception Handling, SAP Posting, Reporting & MIS, Learning & Accuracy Improvement)* · 6 Integration Feasibility *(named: "SAP Integration Feasibility")* · 7 Proposed Technical Stack · 8 Development Methodology · 9 Deliverables · 10 Testing & QA · 11 Infrastructure & Deployment · 12 Security, Governance & Compliance · 13 Assumptions & Dependencies · 14 Conclusion. Budget separate.

**Agency & Design Portfolio — 11 sections:** 1 Introduction · 2 Project Context & Objectives *(+ Target Websites)* · 3 Proposed Technical Approach & Methodology *(+ Delivery Methodology, Environments & Governance)* · 4 Proposed Technical Stack · 5 Scope of Work *(Frontend Scope + Backend & CMS Scope with HR & Responsibilities tables)* · 6 Deliverables · 7 Technical Diagrams (High-Level Architecture, Lead Capture/CRM Flow, CI/CD Strategy) · 8 Complimentary Support (1 Month) · 9 **Financial Proposal** *(budget inline: payment terms, change-request policy, assumptions)* · 10 Proposed Out of Scope · 11 Acceptance & Sign-off.

### 7b. Interactive elements (enterprise-tasteful)
- Architecture: nodes fade in on scroll, arrow paths draw ~400ms, slow data-flow dots loop 4–6s. No 3D/bounce/confetti.
- Requirements table: hover row highlights both cells; expandable sub-points.
- Tech stack: chips with logo + "why we chose this" tooltip on hover.
- Deliverables: checkbox timeline week-by-week.
- Inline comments on any section (right thread panel); each comment can flag "Request demo about this".

## 9. Budget structure (match `FIFA Campaign Budget.xlsx`)
- **One sheet/tab per milestone** (e.g., "Development"). Banner: "Cost Breakdown for Item A" / "[Milestone name]".
- Columns: **Sl. | Departments | Heads | Type | No. of Unit | No. of Days | Per Day Cost | Unit Cost | Total Cost**.
- Rows grouped by Department (Managing & Planning, Art, Development, Others…); first row of a group carries Sl.# + dept name, rest blank.
- Formulas: `Unit Cost = Unit × Days × PerDayCost`; department `Total Cost = SUM(group unit costs)` on the group's top row; sheet **Total = SUM(dept totals)** bold row.
- Timeline note under the table ("Development Timeline = 3 weeks").
- Sample rows (use these): Managing & Planning → Project Manager (Senior, 1×15×$120), Product Designer (Senior, 1×10×$90); Art → UI/UX Designer (Mid, 2×12×$70); Development → Tech Lead (Senior,1×18×$130), Backend Developer (Mid,2×20×$85), Frontend Developer (Mid,2×18×$85), DevOps (Senior,1×6×$110); Others → QA Expert (Mid,1×10×$60). Compute Unit Cost per row and department subtotals + grand total; render tabular.
- (Dev phase: real ExcelJS export with live formulas — the web view here just mirrors this structure.)

---

## 8. Sales Brief (Lead Detail tab) — 8 sections
1 What we're proposing (plain English, 3–5 sentences) · 2 Why it matters to this client (tied to pains) · 3 Key highlights (≤5 bullets) · 4 Talking points (5–7 sayable lines) · 5 Anticipated objections & responses (table 3–5) · 6 Comparable Riseup projects (2–3 with "why relevant") · 7 Ready-made 60-sec pitch · 8 Suggested close (one line). Clean printable page; Download PDF.

---

## 10. Reseed sample data (NO template-author sample data)
Owners: Farah Karim, Tanvir Rahman, Nabil Hasan (Sales); Sadia Noor (Management).
Leads (Lead / Company / Template / Status / Value / Owner):
- **AP Invoice Automation** · ATEC Group · Global · **Approved** · $86,000 · Farah Karim  ← use for Lead Detail + client Global proposal/budget
- **FIFA Campaign Microsite** · FIFA Partner Co · Agency · **Sent** · $58,000 · Nabil Hasan  ← use for client combined deliverable
- **Urmi Commerce Revamp** · Urmi Group · Local · **Pending Approval** · $42,000 · Tanvir Rahman
- **WriteRush Rebrand** · WriteRush · Design Portfolio · **Generated** · $31,000 · Farah Karim
- **Vault Health Platform** · Vital Labs · Global · **Locked** · $120,000 · Tanvir Rahman
- **Loop Social App** · Loopwave · Agency · **Lost** (reason: budget) · $26,000 · Nabil Hasan
Projects (portfolio — REAL Riseup work only, from riseuplabs.com/portfolio): Trainr (fitness AI, mobile/ai), Cloud Couture (AI B2B fashion marketplace, web/ai/ecommerce), HR AI Automation (AI document generation + approvals, web/ai/automation), ContentOS (multi-agent AI content pipeline, web/ai), OPS Web Application (UNICEF ECARO enterprise migration, web/enterprise), Red Grocer (grocery eCommerce, mobile/ecommerce), COMPASS (sales prescription mgmt, web/health), HealthBuddy+ (WHO-UNICEF chatbot, mobile/health/ngo).

## 11. Universal rules (every page)
- Paste SHARED BASE CSS; App-Shell pages paste the shell verbatim (sidebar+topbar identical within a role; only active nav + main differ).
- **Inter** font; Lucide icons (stroke 1.5, no emoji); brand `#EA5400` used sparingly on `#FAFAF9` canvas / white cards; charcoal `#0F0F0F` type.
- Small radii (8/6/4). Hairline borders, almost no shadow. Tabular numerals on figures. Table rows 44px.
- Every interactive element `data-testid="{page}-{element}"` (≥70%, unique). cursor:pointer on clickables; hover = color/opacity only (no scale). Semantic `<header><nav><main><aside><footer>`. Real filenames in links (cross-role `../management/`, `../app/`, `../client/`).
- Desktop 1440; App-Shell main max-width 1400px.

# Lead360 — Product Requirements Document

> Generated with `.claude/operations/skills/client/prd/generate-prd` conventions (Feature Phase A + Technical Phase B), tailored to the Lead360 internal product.
> Date: 2026-06-29 · Owner: Riseup Labs · Status: Draft v0.1
> Marker legend: `[📌 Adopted]` = confirmed decision · `[💡 Recommended: X]` = proposed default, needs sign-off.

---

## ⭐ Revision v3 (2026-07-01) — AUTHORITATIVE OVERRIDE

This block supersedes any conflicting detail below. Design spec: `.claude-project/design/Lead360_DesignGuide_v3.md` + `DESIGN_SYSTEM.md` (v3).

**Vocabulary (enforced everywhere — UI, DB, routes, DTOs, files):** the entity is **`Lead`** (pre-lock) / **`Project`** (portfolio). **The word "Deal" is removed.** `/deals` → `/leads`. Copy: **"Conversion Rate"** (not Win Rate), **"Approvals"** (not Verification), **"Approved"** (not Verified).

**Three concept shifts:**
1. **Dashboard = analytics landing** (KPIs, pipeline funnel, cycle-time trend, recent activity, loss reasons + a global date-range filter: This month · Last month · Last 3 months · Last 6 months · Last year). The lead list moves to its own **Leads** page.
2. **Deal → Lead / Project** across the product.
3. **Enforced approval loop**: Sales *Submit for approval* → Management *Approve/Reject* → on Approve, Sales *Send to client* (this unlocks the tokenized client link). Client link is hidden until Sent.

**Pipeline / status state machine (funnel: Generated → Pending Approval → Approved → Sent → Locked, + Lost side-branch; Draft/Ready are wizard-internal only, never in funnel/filters):**
`Generated —(Submit for approval, Sales)→ Pending Approval —(Approve/Reject, Mgmt)→ Approved | Rejected`; `Rejected —(Regenerate+resubmit)→ Pending Approval`; `Approved —(Send to client, Sales)→ Sent`; `Sent —(Mark Locked | Mark Lost | Regenerate)→ Locked | Lost`. **Lost requires a reason** (budget·scope·timeline·competitor·no response·other + note).

**Information architecture / nav:**
- Sales/PM sidebar (dark): Dashboard · Leads · Projects · Settings.
- Management sidebar (dark): Overview · Approvals · Leads · Projects · Settings. (Overview *is* analytics; Approvals *is* verification — two pages, not four.)
- Client (public, tokenized `/c/:token/…`): `proposal`, `budget`, or combined `deliverable` (Agency/Design Portfolio).

**Client-facing views are BACK IN and interactive** (this reverses the v0.2 "no client comments" pivot): each Lead has a **unique signed token**; client views are read-only but support **inline comments + Request demo**, which surface back on Lead Detail → *Client activity*. (Still no client *account/login*.)

**Lead Detail (the workhorse):** two columns. Left tabs = **Proposal** (with a **Light / Dark / Mixture** theme switcher — 3 visual themes of one `content JSON`, stored as `proposal_theme`), **Budget** (interactive, Export .xlsx), **Sales Brief** (8-section non-technical pitch pack), **Client activity**, **History**. Right rail = status + status-control buttons (state machine), client info, template, owner, timestamps, **Client link** (locked until Approved+Sent), approval trail.

**Deliverables & generation:**
- **Global / Local** → Proposal (PDF) + **separate Excel budget**. Proposal = **14 sections** (Executive Summary; Understanding of Requirements as a 3-col table; Proposed Solution Capabilities; Proposed Architecture [animated]; Technical Approach [named subsections]; Integration Feasibility; Technical Stack; Development Methodology; Deliverables; Testing & QA; Infrastructure & Deployment; Security/Governance/Compliance; Assumptions & Dependencies; Conclusion).
- **Agency / Design Portfolio** → Proposal + budget **combined** (single file/page). Proposal = **11 sections** with the budget inline as **§9 Financial Proposal**.
- **Budget structure** matches `FIFA Campaign Budget.xlsx`: one sheet per milestone; columns **Sl. | Departments | Heads | Type | No. of Unit | No. of Days | Per Day Cost | Unit Cost | Total Cost**; rows grouped by department; `Unit Cost = Unit × Days × PerDayCost`; department subtotal = SUM(group); sheet Total = SUM(dept totals); milestone timeline note. **Excel export via ExcelJS with real formulas (not pre-computed), matched column widths/number formats — zero formula errors** (hard requirement).
- **Sales Brief** generated alongside the proposal (plain-English pitch, why-it-matters, highlights, talking points, objections table, comparable projects, 60-sec pitch, suggested close).
- **Readiness step:** score as a segment bar; **≥80** → compact "ready"; **<80** → query checklist Sales can send to the client (copy / confirm inline / override-and-log).

**Data-model changes (§ supersedes Section 6 where conflicting):** rename `Deal`→`Lead` (tables/DTOs/routes); add `proposal_theme` enum `light|dark|mixture` (default light); add `approval` submodel `{submitted_at, submitted_by, decided_at, decided_by, decision, note}`; add `lost_reason` enum + note (required on Lost); add `client_link_token` (signed, per-lead, minted on *Send to client*); add `client_comment` `{lead_id, anchor_section, anchor_paragraph, author_name, author_email, body, created_at, resolved}`; add `demo_request` `{lead_id, name, email, preferred_range, note, status}`. **Seed:** delete template-author sample placeholders; reseed realistic Riseup examples across the new funnel (owners: Farah Karim, Tanvir Rahman, Nabil Hasan; manager: Sadia Noor).

**Page inventory (18):** `app/`: login, dashboard (analytics), leads, new-lead-{info,requirement,readiness,template,generate}, lead-detail, projects, project-detail, 404. `management/`: overview, approvals, leads. `client/`: proposal-view, budget-view, deliverable-view.

**Visual language "Riseup Studio":** enterprise SaaS — **dark sidebar (#111)**, Inter, hairline borders (not shadows), small radii (8/6/4), restrained orange `#EA5400`, KPI cards without colored strips, flat dot-led status pills, readiness as a segment bar (not a gauge). Design roles for handoff: `[app, client, management]`.

---

## ⭐ Revision v4 (2026-07-01) — CLIENT DELIVERY (supersedes v3 client-link model)

**No public client links.** Tokenized `/c/:token` routes are **removed** (security: a URL is a bearer credential that can be forwarded, exposing pricing). Replaced with **document delivery by email**:

- **Submission = email attachments.** On **Send documents** (enabled only after Management approval), Lead360 emails the branded **Proposal (PDF)** + **Budget (Excel)** as attachments to the lead's client contact via SES — a branded email from Riseup. **No password** (user decision 2026-07-01); no public hosting.
- **The interactive proposal/budget become an INTERNAL "Present" surface** — Sales screen-shares them live in the client meeting (the "excite the client" moment) and they are the render source for the exported PDF/Excel. The `client/*` views are **not internet-exposed**.
- **Removed from MVP:** `client_link_token`, public share routes, in-product **client comments** (`client_comment`) and **demo requests** (`demo_request`). Client feedback is captured by Sales on the lead (a simple note/activity entry).
- **Added:** `document_delivery` `{ lead_id, method:'email', recipient, cc, subject, message, files:[proposal.pdf, budget.xlsx], sent_at, sent_by, email_status }` (+ optional email open-tracking).
- **Lead Detail UI:** "Send to client" → **Send documents** (email composer modal: to/cc/subject/message + the two attachments). Right-rail "Client link" → **Delivery** panel (method / recipient / files / status). The Proposal & Budget tabs show **one** internal Present view each (the interactive client render) + Download PDF / Export .xlsx.
- **Status machine unchanged** except "Send to client" now means "email documents"; `Sent` = documents emailed.
- **Backend:** an authenticated `POST /api/leads/:id/send-documents` (staff only) that renders PDF/xlsx and dispatches email via SES. No unauthenticated public endpoints remain.

**Projects (portfolio):** seeded from **real Riseup Labs data fetched from `https://riseuplabs.com/portfolio/`** (a backend sync job ingests title, categories, tech stack, description → the RAG store). The Projects page has category + tech-stack filters, search, a **Re-sync** action, and an **Add project** flow (manual entry → becomes RAG evidence). **Project Detail** supports **attaching proposals** to a project (upload a file, link an existing lead's proposal, or generate a new one using the project as reference) — so each project can carry its winning pitch for reuse.

Everything else in Revision v3 stands.

---

## ⭐ Revision v6 (2026-07-01) — "Presale Product Draft" fixes

Refinements from the user's `Presale Product Draft.docx`:

- **Client-view delivery (refines v4):** Lead360 emails the branded **PDF + Excel**, and the **interactive client-view link is embedded *inside* those documents** (not pasted in the email body, which trips spam/phishing filters). The client opens the interactive **client view** from that in-document link. Client view = **interactive**: inline comments (Notion/Figma/GDoc-style thread) **with replies** (a reply is visible to the client in client-mode **and** triggers an email notification), **Request a demo** (→ becomes a **Join demo** redirect button once the rep schedules it), and **Share** (Email · Slack · Zoom · Copy link). **"Request a demo" is client-view only — never on the internal Lead Detail.**
- **One content, two modes:** proposal/budget/deliverable render in **client mode** (full chrome) or **embed mode** (`?embed=1`, chrome hidden) — Lead Detail embeds the latter at **auto-height so the page scrolls (no inner-box scroll)**.
- **New Lead wizard** keeps the app **sidebar + top bar** on every step; the generate step shows step 5 **filled**.
- **Lead Detail reorg:** controls consolidated into a **Status box** (status + Send documents + **approval trail moved to the top**) and a single **Prompt box** (regenerate). **Removed duplicate** Send-documents / Regenerate / Status-history buttons. Proposal & Budget previews scroll with the page.
- **Budget:** each pricing line is **editable** (Unit/Days/Rate → live recompute of unit cost, subtotals, total); a **currency switch converts** all figures (USD base + EUR/GBP/BDT/AED/SAR); optional lines reflow without overlap. Excel export A4-accurate.
- **PDF:** generated PDF mirrors the on-screen preview at **A4** with a **Table of Contents** (prototype adds `@page` A4 + a print ToC; production renders via Puppeteer with a native/tagged ToC).
- **Projects → Database tab:** mirrors the Riseup **Proposal & Budget Database** (`Agency · Design Portfolio · Global · Local` → `Client requirement / Proposal / Budget` → files) with **preview + download**. Backend job ingests the folder and feeds proposals/budgets into RAG. docx/xlsx need server-side preview conversion.
- **History:** shows **all** version + status updates (not just document versions).

**Data-model additions:** `comment_reply` (with `notified_client` flag); `budget_line` becomes editable + a per-lead display `currency`; `document_library` (category → section → file metadata + storage); `demo` scheduled state that flips the client CTA to "Join demo".

**Deferred to dev:** Puppeteer PDF (A4 + native ToC), server-side docx/xlsx preview + folder ingestion into RAG, live FX rates, real email send/reply-threading/notifications + demo scheduling, real Slack/Zoom share integrations.

---

## ⭐ Revision v7 (2026-07-03) — Presale batch #2

- **Two views only:** **Admin** (Overview = all analytics · Approvals = verify each project · read-only Leads) and **Sales/PM** (Leads home · Projects · New-Lead wizard · Lead Detail). The separate sales analytics dashboard is **removed** (analytics is Admin-only).
- **Removed globally:** notifications (no bell), lead **Owner** (leads have no owner), and the **cycle-time trend** chart on Overview.
- **Leads list** redesigned (company monograms, template chips, dot-led status, value, updated; no owner).
- **Lead Detail:** tabs are now **Proposal · Budget · Sales Brief · Pitch Deck** (Client activity + History tabs removed). **Separate regenerate** for Proposal and Budget (no universal regenerate). **Sales Brief** and **Pitch Deck** are **generate-on-click** (not auto-generated); Pitch Deck produces a slide deck. Owner removed. Flow: create proposal + budget → **send for approval** to Admin → Admin verifies → send.
- **Database auto-save:** every client requirement used for generation, and every **approved** proposal + budget, is saved into **Projects → Database** (Agency / Design Portfolio / Global / Local). Real files are stored in-app (39 seed files, preview + download).
- **Projects:** cleaner card design (lighter cover, not black); **locked leads auto-add to Projects**. **Project Detail:** screenshots panel removed; **summary is large/prominent**.
- **Delivery = downloadable files only.** Each lead's deliverables are the branded **Proposal (PDF)** + **Budget (Excel)**; the salesperson downloads and sends them. **In-app email delivery is developed but DISABLED for production** (feature-flagged off, e.g. `EMAIL_ENABLED=false`) — the email/send-documents module stays in the codebase but is not exposed/active. No auto-emailing, no in-email link. (This supersedes the email-delivery emphasis in Revisions v4/v6.)
- **Proposal content matches the real Riseup database format** (Global/Local: Executive Summary → Project Understanding → Proposed Scope Coverage table → Technical Approach → Technical Diagrams → Tech Stack table → Methodology → Suggested Timeline → Deliverables → Assumptions → Conclusion; Agency/Design: 11 sections with inline Financial Proposal). **Only Global & Local generate a separate budget.** The real **Riseup logo** now appears on the proposal (hero + footer).

---

## ⭐ Revision v9 (2026-07-05) — Settings

**Settings** for both views (role-gated), no dead nav link. **Sales/PM** (`app/settings.page.html`) = **Personal only**: Profile · Preferences (default template/currency/theme/language) · Security (password + sessions). **Admin** (`management/settings.page.html`) = Personal **+ Organization**: **Team & Roles** (users + invite + role) · **Templates** (4 types + budget rule + default) · **Rates & Currency** (day-rates by role/dept + FX table + tax) · **Approvals** (require-approval, approvers, **readiness threshold**, lost-reasons) · **Branding** (logo, colors, company info, footer, file-naming) · **Knowledge Base** (portfolio sync source/schedule + RAG folder toggles + auto-save rules) · **Delivery & Integrations** (PDF/Excel active; **Email delivery flag shown OFF** — `EMAIL_ENABLED=false`, greyed SMTP/from; Slack/Zoom "coming soon") · **Security & Audit** (auth method, session/password policy, audit log). Layout = left section sub-nav + panels. **Dev-phase:** real persistence, RBAC, SSO, SMTP behind the flag, live FX, sync scheduler, and audit log are backend.

---

## Section 0: Project Overview

### Product

**Lead360** — an AI proposal & budget studio that turns a client brief into a living, interactive proposal + budget, grounded in Riseup Labs' past work, and runs the whole lead → proposal → lock journey.

### Description

Lead360 lets the Riseup Labs sales team capture a client brief, retrieve relevant past projects via RAG, score proposal readiness, and generate a classy, interactive web proposal plus a budget. Clients open a private link to view the proposal/budget, comment inline, and request a demo. PMs view project context, and Management oversees pipeline analytics and verifies every proposal and budget before it reaches the client.

### Business Context

| Item | Detail |
|------|--------|
| **Business Model** | Internal tool (no external revenue). Value = faster lead→conversion, higher win-rate, less presales effort. |
| **Core Value Proposition** | Collapses the sales→presales→sales loop into one system; generates differentiated, interactive proposals grounded in real Riseup wins. |
| **Competitive Differentiator** | "Living" proposals (animated architecture, inline client comments, in-place demo requests) + RAG over Riseup's portfolio + readiness gating before generation. |

### Goals & Success Metrics

| # | Goal | Success Metric | Measurement Method |
|---|------|---------------|-------------------|
| 1 | Shorten lead-to-lock cycle | Median days from lead created → deal locked ↓ | Timestamp delta on Deal status transitions |
| 2 | Raise proposal win-rate | % of submitted proposals locked ↑ | Deals locked / Deals submitted |
| 3 | Cut presales turnaround | Median hours from brief uploaded → proposal generated ↓ | Timestamp delta brief → first generation |
| 4 | Capture loss intelligence | % of pending/lost deals with recorded loss reason | Non-null loss_reason on closed-lost Deals |

### Target Audience

Internal Riseup Labs staff across Sales, Project Management, and Management, plus external prospective clients who receive a no-login link to view and comment on their proposal/budget.

### User Types

| Type | DB Value | Description | Key Actions |
|------|----------|-------------|-------------|
| Sales | `sales` | Creates clients, uploads briefs, generates/regenerates proposals & budgets, submits to client, updates status | Create deal, generate proposal/budget, send link, update status |
| PM (Viewer) | `pm` | Reads project context to prepare delivery; cannot edit sales artifacts | View deal, proposal, budget, meeting kit |
| Management | `management` | Oversees all deals, verifies/approves proposals & budgets, views analytics | Approve/reject, view analytics, view all deals |
| Client (External) | `client` (tokenized, no account) | Views their proposal/budget via private link, comments, requests demo | View, comment, request demo |

### User Status

| Status | DB Value (int) | Description | Allowed Actions |
|--------|---------------|-------------|-----------------|
| Active | `1` | Normal operational state | All standard actions for role |
| Suspended | `2` | Temporarily restricted | Read-only |
| Pending | `0` | Invited, not yet activated | Complete profile |
| Withdrawn | `3` | Soft-deleted account | None |

### User Relationships

A Management user oversees all Deals. A Sales user owns the Deals they create. A PM is assigned to a Deal as viewer. A Client is not a user account — it is a tokenized recipient bound to one Deal's share links. A Deal belongs to exactly one Client Company and one owning Sales user.

### User Data Fields

**Signup Fields** (NOT NULL):

| Field | Type | Required | Validation |
|-------|------|:--------:|-----------|
| email | `string` | ✅ | RFC 5322, `@riseuplabs.com` domain `[💡 Recommended: restrict to company domain]` |
| password | `string` | ✅ | Min 8, 1 uppercase, 1 number |
| name | `string` | ✅ | Min 2, Max 50 |
| role | `enum` | ✅ | sales / pm / management |

**Profile Fields** (NULLABLE): profileImage, jobTitle, phone.

**System Fields**: id (UUID), status (int enum), createdAt, updatedAt, deletedAt, lastLoginAt.

**Terms Agreement**: N/A (internal staff tool; SSO/company policy governs).

### Design Reference

| Screen / Flow | Reference | Notes |
|--------------|-----------|-------|
| Proposal deck | `.claude/operations/.claude-project/proposals/[Proposal] Sales Dashboard.html` | Base interactive template to fork into 4 variants |
| Brand tokens | `generate-proposal` SKILL.md | Dark theme, lime `#DDFE52`, purple `#5C4EFF`, Plus Jakarta Sans |

### MVP Scope

**In Scope:**

| Feature | Supports Goal # | Priority |
|---------|:--------------:|:--------:|
| Guided **New Deal wizard flow** (Lead Info → Requirement → Readiness → Template → Generate) | 3 | Must-have |
| Client/company intake (company, contact, website link) + brief/MoM upload | 3 | Must-have |
| RAG knowledge engine over past projects | 2 | Must-have |
| Readiness score + gap/query list (in-flow gate) | 2, 3 | Must-have |
| Proposal generation (4 templates) | 2 | Must-have |
| Budget generation — Global/Local = **separate downloadable Excel**; Agency/Design = **combined with proposal** | 2 | Must-have |
| **Downloadable branded deliverables: Proposal (PDF) + Budget (Excel)** | 1, 2 | Must-have |
| **Submit to client** (secure read-only view link and/or email) + status tracking | 1 | Must-have |
| Prompt-based regeneration | 2 | Must-have |
| Management verification gate | 2 | Must-have |
| Simplified Sales dashboard (deals list + New Deal entry; no analytics clutter) | 3 | Must-have |
| Pipeline analytics for Management (cycle time, win rate, loss reasons) | 1, 4 | Should-have |
| Riseup projects dashboard (search by category + tech stack) | 2 | Should-have |
| Next-meeting kit (summary, highlights, convince points) | 1 | Should-have |
| "Moving architecture" animation inside the proposal deliverable | 1 | Should-have |

> **Revision v0.2 (2026-06-29) — scope pivot.** Lead360 is an **internal Riseup Labs tool**; clients do **not** interact inside the product. The primary client-facing output is **downloadable, branded Proposal (PDF) + Budget (Excel)** that Riseup **submits** to the client (view link and/or email). Therefore **in-app real-time client commenting, per-client comment threads, and the demo-request CTA are removed from MVP** (deferred). The client `proposal-view` / `budget-view` are **read-only branded documents**. The core experience is a **calm, guided wizard flow**. Real-time (Socket.IO) is **no longer on the MVP critical path** (only optional internal notifications).

**Out of Scope (post-MVP):**
- **Real-time inline client commenting + demo requests inside the product** — deferred — Reason: internal-only tool; clients receive downloadable deliverables, not an in-app account.
- CRM/email-client integrations — deferred to Phase 2 — Reason: validate core loop first.
- E-signature / contract execution — deferred to Phase 2 — Reason: lock event is manual for MVP.
- Multi-language client proposals — deferred to Phase 2 — Reason: clients are English-first today.

### Detected Feature Bundles

| Bundle | Status | Required `[필수]` | Recommended `[권장]` | Key Conditional Triggers |
|--------|--------|:-----------------:|:-------------------:|--------------------------|
| Auth/Registration | Active | — | — | Internal staff login (email/pw), no social, no phone |
| File Upload | Active | — | — | Brief / MoM upload → S3 |
| Real-time | Active | — | — | Inline comments on proposal/budget |
| RAG/Knowledge | Active | — | — | Ingest past projects, retrieval into generation |
| Notification | Active | — | — | Comment / demo-request / approval events |
| Payment/Subscription | Not applicable | — | — | Internal tool |

---

## Section 1: Terminology

### Core Concepts

| Term | Definition |
|------|-----------|
| Deal | One sales engagement: a Client Company + brief + generated proposal/budget + status, owned by a Sales user. |
| Brief | Client requirement / meeting minutes uploaded by Sales; the generation input. |
| Readiness Score | 0–100 score indicating whether the brief is complete enough to generate a strong proposal. |
| Gap / Query | A specific missing input the system flags before generation (e.g., unclear budget band, no tech stack). |
| Template | One of 4 proposal styles: Global, Local, Agency, Design Portfolio. |
| Living Proposal | The interactive web proposal: animated architecture, inline comments, demo CTA. |
| Web Budget | Excel-like editable grid rendered in browser, commentable per cell, exportable to `.xlsx`. |
| Next-Meeting Kit | Auto-generated summary, key highlights, and "how to convince" notes for the post-proposal meeting. |
| Share Link | Per-client tokenized URL granting no-login view + comment access to one Deal's proposal or budget. |
| Case Study | An indexed past Riseup project (summary, category, tech stack, outcome, budget range) used by RAG. |

### User Roles

| Role | Internal Name | Description |
|------|--------------|-------------|
| Sales | `sales` | Owns deals, generates/sends proposals & budgets |
| PM | `pm` | Read-only project context |
| Management | `management` | Oversight, verification, analytics |
| Client | `client` | External, tokenized link recipient |

### Status Values

| Status Name | DB Integer Value | Context | Description |
|-------------|-----------------|---------|-------------|
| Draft | `0` | Deal | Created, brief not yet sufficient |
| Ready | `1` | Deal | Readiness gate passed |
| Generated | `2` | Deal | Proposal/budget generated, awaiting verification |
| Verified | `3` | Deal | Management approved, link can go live |
| Submitted | `4` | Deal | Sent to client |
| Locked | `5` | Deal | Deal won |
| Pending | `6` | Deal | Client undecided |
| Lost | `7` | Deal | Deal lost (loss_reason required) |

### Technical Terms

| Term | Definition |
|------|-----------|
| RAG | Retrieval-Augmented Generation: retrieve relevant case studies + brief context, feed to the LLM to ground output. |
| Embedding | Vector representation of a case study / brief chunk for similarity search. |
| pgvector | PostgreSQL extension storing embeddings for similarity queries. |

---

## Section 2: System Modules

### Module: Intake & Workspace

**Description:** Captures Client, Client Company, and Brief/MoM uploads; creates the Deal object.

**Main Features:**
- Create/select Client Company and Client contact
- Upload brief / requirement / meeting minutes (PDF, DOCX, TXT, MD)
- Pick template (Global / Local / Agency / Design Portfolio)

**Technical Flow:**
```
1. Sales creates Deal → POST /api/deals
2. Sales uploads brief → POST /api/deals/:id/briefs (multipart)
3. Server stores file to S3, extracts text, chunks + embeds → pgvector
4. Server responds 201 with deal + brief metadata
5. Client UI shows brief parsed + "Run readiness check" CTA
```
- **Success path:** Upload brief → text extracted → embeddings stored → 201 → UI enables readiness check.
- **Failure path:** Unsupported file → 422 → UI shows "Unsupported format" with accepted types.

**Real Scenario — Success:**
> **Actor:** Riaz (Sales)
> **Context:** New lead from a fintech startup; has meeting minutes PDF.
> **Action:** Creates Deal "Acme Wallet", selects Agency template, uploads `acme-mom.pdf`.
> **Server Response:** `201 Created` — `{ dealId, briefId, status: "draft" }`
> **UI Reaction:** Brief preview + extracted requirements list + "Run readiness check".

**Real Scenario — Failure:**
> **Actor:** Riaz (Sales)
> **Context:** Uploads a 60MB scanned image.
> **Action:** Drops file into uploader.
> **Server Response:** `422 Unprocessable Entity` — `{ error: "FILE_TOO_LARGE" }`
> **UI Reaction:** Inline error "Max 25MB. Try a text-based PDF."

**3rd Party API List**

| Service | Purpose | Integration Point | Alternative |
|---------|---------|-------------------|-------------|
| AWS S3 | Brief/asset storage | Intake upload | Local disk (dev) |
| Anthropic Claude | Text extraction assist / structuring | Brief parse | None |

---

### Module: RAG Knowledge Engine

**Description:** Indexes past Riseup projects and retrieves relevant ones for gap analysis, generation grounding, and the "add similar project" action. Powers the searchable Riseup Projects dashboard.

**Main Features:**
- Ingest case studies (from Drive/folder import) → embeddings
- Similarity retrieval by brief + filters (category, tech stack)
- "Similar successful projects" suggestions surfaced into the proposal

**Technical Flow:**
```
1. Admin imports case studies → POST /api/kb/ingest
2. Server chunks, embeds (Claude/embeddings), stores in pgvector
3. On generation, server retrieves top-K relevant case studies for the brief
4. Retrieved context injected into the generation prompt
```
- **Success path:** Brief embedded → top-K case studies retrieved → injected → grounded proposal.
- **Failure path:** No matches above threshold → proposal generated without portfolio proof + UI note.

**Real Scenario — Success:**
> **Actor:** System (during generation)
> **Context:** Brief tagged fintech + mobile.
> **Action:** Retrieve top-5 case studies by cosine similarity.
> **Server Response:** `200 OK` — `{ matches: [ "HR AI Automation", "ContentOS", "OPS Web Application" ] }`
> **UI Reaction:** Sales sees suggested proof projects with "Add to proposal" toggles.

**Real Scenario — Failure:**
> **Actor:** System
> **Context:** Brief is a niche domain with no close past work.
> **Action:** Retrieval returns nothing above 0.75 similarity.
> **Server Response:** `200 OK` — `{ matches: [] }`
> **UI Reaction:** "No close past projects found — proposal will use generic credibility slides."

**3rd Party API List**

| Service | Purpose | Integration Point | Alternative |
|---------|---------|-------------------|-------------|
| Anthropic Claude | Embeddings + generation | Ingest + retrieve + generate | None |

---

### Module: Readiness & Gap Analysis

**Description:** Before any generation, computes a Readiness Score and a list of queries to confirm.

**Main Features:**
- Rubric-based score (scope clarity, budget signal, tech stack, timeline, success criteria)
- Query checklist with recommended defaults
- Gate: generation disabled until score ≥ threshold `[💡 Recommended: 70]` or Sales overrides with reason

**Technical Flow:**
```
1. Sales clicks "Run readiness check" → POST /api/deals/:id/readiness
2. Server runs rubric over brief (+ RAG context) via Claude
3. Server returns score + gaps + suggested questions
4. UI renders score gauge + query checklist
```
- **Success path:** Score 82 → no blocking gaps → "Generate" enabled.
- **Failure path:** Score 41 → 4 blocking gaps → "Generate" disabled, checklist shown.

**Real Scenario — Success:**
> **Actor:** Riaz (Sales)
> **Context:** Detailed brief.
> **Action:** Runs readiness check.
> **Server Response:** `200 OK` — `{ score: 82, gaps: [], status: "ready" }`
> **UI Reaction:** Green gauge, "Generate proposal" enabled.

**Real Scenario — Failure:**
> **Actor:** Riaz (Sales)
> **Context:** One-paragraph brief.
> **Action:** Runs readiness check.
> **Server Response:** `200 OK` — `{ score: 41, gaps: ["No budget band","No tech stack","No timeline","Unclear scope"] }`
> **UI Reaction:** Amber gauge + checklist; generate disabled with "Resolve 4 queries first".

---

### Module: Generation Engine

**Description:** Produces the proposal and budget per the chosen template, with prompt-based regeneration.

**Main Features:**
- Template-aware generation (Global / Local / Agency / Design Portfolio)
- Output rules: Agency & Design Portfolio → proposal + budget combined in one file; Global & Local → budget separate (web spreadsheet → `.xlsx`)
- Milestone-based + feature-based pricing (reused from `generate-proposal`)
- Regenerate proposal or budget from a free-text prompt

**Technical Flow:**
```
1. Sales clicks Generate → POST /api/deals/:id/generate { artifact: "proposal"|"budget"|"both" }
2. Server builds prompt: brief + RAG context + template spec + selected proof projects
3. Claude returns structured proposal JSON + budget line items
4. Server renders interactive proposal (HTML/React) + web budget grid; stores versions
5. UI shows preview; status → "generated"
```
- **Success path:** Generate → proposal + budget rendered → status generated → sent for verification.
- **Failure path:** LLM timeout → 504 → UI "Generation failed, retry" (idempotent retry).

**Real Scenario — Success:**
> **Actor:** Riaz (Sales)
> **Context:** Ready deal, Agency template.
> **Action:** Clicks "Generate both".
> **Server Response:** `201 Created` — `{ proposalVersionId, budgetVersionId }`
> **UI Reaction:** Split preview: living proposal + editable budget grid.

**Real Scenario — Failure:**
> **Actor:** Riaz (Sales)
> **Context:** Regeneration with a vague prompt.
> **Action:** "make it cheaper" with no number.
> **Server Response:** `200 OK` with clarification — `{ needsInput: "Specify a target total or % reduction" }`
> **UI Reaction:** Inline prompt asking for a concrete target.

**3rd Party API List**

| Service | Purpose | Integration Point | Alternative |
|---------|---------|-------------------|-------------|
| Anthropic Claude (Opus 4.8 / Sonnet 4.6) | Proposal + budget generation | Generate / regenerate | None |

---

### Module: Deliverables & Submission

**Description:** Turns the generated proposal/budget into **downloadable, branded deliverables** and submits them to the client. Internal-only — the client receives read-only documents; there is **no in-app commenting** (deferred, see Revision v0.2).

**Main Features:**
- Download **Proposal as branded PDF** (Riseup orange/charcoal) and **Budget as Excel (.xlsx)** — Global/Local budget is a separate file; Agency/Design budget is combined with the proposal.
- **Submit to client**: generate a secure **read-only view link** (proposal + budget) and/or **send by email** with files attached; or download & send manually.
- Read-only client document views (`proposal-view`, `budget-view`) — premium, brand-locked, with a light animated architecture diagram in the proposal. No comment UI.
- Status tracking after submit: Submitted → Locked / Pending / Lost (Lost requires a reason).

**Technical Flow:**
```
1. Sales clicks Download → GET /api/deals/:id/proposal.pdf (or /budget.xlsx) → branded file
2. Sales clicks Submit → POST /api/deals/:id/submit { method: "link"|"email", recipients? }
3. Server mints a signed read-only token (scoped to dealId) → view URL(s)
4. (email) Server sends branded email with PDF/XLSX + view link via SES
5. Sales updates status → PATCH /api/deals/:id/status { status, reason? }
```
- **Success path:** Generate verified → Download/Submit → status Submitted → later Locked.
- **Failure path:** Submit before Verified → 403 "Awaiting management approval."

**Real Scenario — Success:**
> **Actor:** Riaz (Sales)
> **Context:** Acme Wallet proposal + budget verified by management.
> **Action:** Downloads the branded PDF + Excel, clicks "Submit → Send by email" to NovaPay.
> **Server Response:** `200 OK` — `{ viewLink, emailed: true }`; status → Submitted.
> **UI Reaction:** Confirmation toast + copyable view link; deal shows "Submitted".

**Real Scenario — Failure:**
> **Actor:** Riaz (Sales)
> **Context:** Deal not yet verified.
> **Action:** Clicks Submit.
> **Server Response:** `403 Forbidden` — `{ error: "NOT_VERIFIED" }`
> **UI Reaction:** "Send for verification first."

**Export targets**
- Proposal → PDF (Puppeteer/print of the branded `proposal-view`).
- Budget → `.xlsx` (ExcelJS) from `budget_versions.lineItemsJson`.

**WebSocket Events** *(deferred — internal notifications only, not on MVP critical path)*

| Channel | Event | Payload | Direction |
|---------|-------|---------|-----------|
| `deal:{dealId}` | `comment:create` | `{ anchor, body, author }` | Client → Server → Sales |
| `deal:{dealId}` | `comment:new` | `{ commentId, anchor, body }` | Server → Client/Sales |
| `deal:{dealId}` | `demo:request` | `{ dealId, message }` | Server → Sales |

---

### Module: Next-Meeting Kit

**Description:** After submission, generates a sales enablement pack for the next meeting.

**Main Features:**
- Project summary + key highlights
- "How to convince the client" talking points
- Reuses `meetings/kickoff` + `weekly` patterns

**Technical Flow:**
```
1. On submit (or on demand) → POST /api/deals/:id/meeting-kit
2. Server composes from brief + proposal + client comments via Claude
3. Returns summary, highlights, objection-handling notes
```
- **Success path:** Kit generated → Sales reviews before meeting.
- **Failure path:** No proposal yet → 409 → "Generate a proposal first."

**Real Scenario — Success:**
> **Actor:** Riaz (Sales)
> **Context:** Client commented with 3 concerns.
> **Action:** Opens "Meeting kit".
> **Server Response:** `200 OK` — `{ summary, highlights, convince: [...] }`
> **UI Reaction:** One-page brief tailored to the client's comments.

**Real Scenario — Failure:**
> **Actor:** Riaz
> **Context:** Deal still in draft.
> **Action:** Opens "Meeting kit".
> **Server Response:** `409 Conflict` — `{ error: "NO_PROPOSAL" }`
> **UI Reaction:** Disabled state with reason.

---

### Module: Pipeline, Verification & Analytics

**Description:** Status management, Management verification gate, and analytics.

**Main Features:**
- Deal status transitions (Draft→…→Locked/Pending/Lost)
- Management verify/reject of proposal & budget (gate before link goes live)
- Analytics: lead→conversion time, win-rate, loss reasons

**Technical Flow:**
```
1. Management opens verification queue → GET /api/deals?status=generated
2. Approves → PATCH /api/deals/:id/verify → status verified (links enabled)
3. Rejects → PATCH with reason → status back to generated/draft
4. Analytics → GET /api/analytics/pipeline
```
- **Success path:** Approve → links go live → Sales submits.
- **Failure path:** Sales tries to share before verification → 403 "Awaiting management approval."

**Real Scenario — Success:**
> **Actor:** Management user
> **Context:** Reviews generated proposal + budget.
> **Action:** Approves.
> **Server Response:** `200 OK` — `{ status: "verified" }`
> **UI Reaction:** Sales' "Share link" button unlocks.

**Real Scenario — Failure:**
> **Actor:** Sales (Riaz)
> **Context:** Tries to share an unverified deal.
> **Action:** Clicks Share.
> **Server Response:** `403 Forbidden` — `{ error: "NOT_VERIFIED" }`
> **UI Reaction:** "Send for verification first."

---

## Section 2.5: Notification Specification

### Notification Triggers

| # | Trigger Event | Channel(s) | Recipient | Template Key | Delay |
|:-:|:-------------|:-----------|:----------|:------------|:------|
| 1 | Client posts comment | In-app, Email | Owning Sales | `comment_new` | Immediate |
| 2 | Client requests demo | In-app, Email | Owning Sales | `demo_request` | Immediate |
| 3 | Proposal/budget submitted for verification | In-app | Management | `verify_pending` | Immediate |
| 4 | Management approves/rejects | In-app, Email | Owning Sales | `verify_result` | Immediate |
| 5 | Deal status → Locked/Lost | In-app | Management | `deal_closed` | Immediate |

### Notification Channels

| Channel | Provider | Fallback | Rate Limit |
|---------|---------|----------|-----------|
| In-app | Built-in (WS) | — | — |
| Email | AWS SES `[💡 Recommended]` | — | 100/hour/user |

### User Notification Settings

| Setting | Default | User Configurable | Channels Affected |
|---------|---------|:-----------------:|-------------------|
| Comment & demo alerts | On | No (core) | In-app, Email |
| Verification alerts | On | No (core) | In-app, Email |
| Digest summary | Off | Yes | Email |

### Quiet Hours

- Enabled: No (internal tool, immediate alerts preferred). `[💡 Recommended: off for MVP]`

---

## Section 3: User Application

### 3.1 Page Architecture

**Route Groups:**

| Group | Prefix | Auth Required | Layout |
|-------|--------|--------------|--------|
| Auth | `/auth` | No | `AuthLayout` |
| Sales/PM | `/app` | Yes | `AppLayout` (sidebar shell) |
| New Deal flow | `/app/new-deal` | Yes (sales) | `FlowLayout` (focused wizard, no sidebar) |
| Management | `/admin` | Yes (management) | `AppLayout` (same shell) |
| Client deliverable | `/share` | Tokenized read-only (no login) | `DocumentLayout` (brand-locked, no app chrome) |

**Page Map** (role folders: `app/`, `management/`, `client/`):

| Route | Page Component | Data Source | Guard |
|-------|---------------|-------------|-------|
| `/auth/login` | `LoginPage` | `POST /api/auth/login` | Guest only |
| `/app` | `DashboardPage` (simple deals list) | `GET /api/deals` | Auth |
| `/app/new-deal/lead-info` | `NewDealLeadInfoPage` (step 1) | `POST /api/deals` | sales |
| `/app/new-deal/requirement` | `NewDealRequirementPage` (step 2) | `POST /api/deals/:id/briefs` | sales |
| `/app/new-deal/readiness` | `NewDealReadinessPage` (step 3) | `POST /api/deals/:id/readiness` | sales |
| `/app/new-deal/template` | `NewDealTemplatePage` (step 4) | — | sales |
| `/app/new-deal/generate` | `NewDealGeneratePage` (step 5) | `POST /api/deals/:id/generate` | sales |
| `/app/deals/:id` | `DealDetailPage` (deliverables + submit + status) | `GET /api/deals/:id` | Auth (owner/pm) |
| `/app/projects` | `PortfolioSearchPage` | `GET /api/kb/projects` | Auth |
| `/admin/verify` | `VerificationQueuePage` | `GET /api/deals?status=generated` | management |
| `/admin/analytics` | `AnalyticsPage` | `GET /api/analytics/pipeline` | management |
| `/share/:token/proposal` | `ProposalViewPage` (read-only branded PDF) | `GET /share/:token` | Token |
| `/share/:token/budget` | `BudgetViewPage` (read-only branded Excel) | `GET /share/:token` | Token |
| `*` | `NotFoundPage` | — | None |

> Deliverables: `DealDetailPage` exposes **Download Proposal (PDF)**, **Download Budget (Excel)**, and **Submit to client** (copy view link / send email). Client routes are **read-only documents** — no commenting.

### 3.2 Mandatory 8 Items Per Route

Every dynamic route below carries all 8 items; static helpers use N/A with reason.

### 3.3 Feature List by Route

#### Route: `/app/deals/:id` (Deal Workspace — primary screen)

**Access:** Owning Sales (edit), assigned PM (view), Management (view) | **Ownership:** Sales owns own deals.

**1. Component Detail**

| Component | Default State | Active State | Disabled State | Error State |
|-----------|--------------|-------------|----------------|-------------|
| Readiness gauge | Grey "not run" | Animated score 0–100 | — | "Check failed, retry" |
| Generate button | Enabled if Ready | Spinner during gen | Disabled if score < threshold & no override | Red "Generation failed" |
| Status pill | Current status color | Dropdown on change | Locked if not owner | — |
| Template selector | Selected template | Open dropdown | Locked after generation | — |

**2. Input Validation Rules**

| Field | Type | Required | Min | Max | Pattern | Error Message |
|-------|------|----------|-----|-----|---------|---------------|
| regenerate prompt | `string` | No | 3 | 500 | — | "Keep it under 500 chars" |
| override reason | `string` | If override | 10 | 300 | — | "Explain why you're bypassing the gate" |

**3. State Screens**
- **Loading:** Skeleton workspace (cards shimmer).
- **Empty:** No brief yet → "Upload a brief to begin" CTA.
- **Error:** Deal load failed → retry.

**4. Interactions**

| Trigger | Action | Feedback |
|---------|--------|----------|
| Click "Run readiness" | POST readiness | Gauge animates |
| Click "Generate" | POST generate | Inline progress + toast |
| Change status | PATCH status | Pill updates, audit logged |
| Click "Share" | Mint link | Copyable URL modal (only if verified) |

**5. Navigation**
- **Reachable screens:** Proposal editor, Budget editor, Meeting kit, Portfolio search.
- **Back behavior:** Browser back → dashboard.
- **Deep link:** Auth redirect to login; non-owner sales → 403 page.

**6. Data Display**

| Field | Source | Format | Fallback |
|-------|--------|--------|----------|
| readiness score | `deal.readiness.score` | 0–100 gauge | "Not run" |
| status | `deal.status` | colored pill | Draft |
| last generated | `deal.proposal.updatedAt` | relative time | "—" |

- **Default sort:** Comments DESC by createdAt | Changeable: No.
- **Pagination:** Comments load-more (20).

**7. Error Handling**

| Error Type | Status Code | User Message | Recovery Action |
|------------|-------------|-------------|-----------------|
| Network | — | "Connection lost." | Auto-retry 3s |
| Server | 500 | "Something went wrong." | Manual retry |
| Permission | 403 | "You can't edit this deal." | Redirect to dashboard |
| Not verified | 403 | "Awaiting management approval." | Send for verification |

**8. Edge Cases**

| # | Category | Scenario | Expected Behavior |
|---|----------|----------|-------------------|
| 1 | Zero data | No brief uploaded | Empty state + upload CTA |
| 2 | Concurrent | Sales regenerates while client comments | Comments anchor to version; new version flagged |
| 3 | Gate bypass | Generate with low score | Require override reason, log it |
| 4 | Offline | Connection drops mid-generate | Show "reconnecting", resume status poll |

---

#### Route: `/app/deals/:id/budget` (Web Budget — Excel-like grid)

**Access:** Owning Sales (edit), PM/Management (view).

**1. Component Detail**

| Component | Default | Active | Disabled | Error |
|-----------|---------|--------|----------|-------|
| Budget grid | Rendered line items | Cell editing | Read-only for non-owner | "Failed to load" |
| Cell comment pin | Hidden | Open thread | — | — |
| Export button | "Export .xlsx" | Generating | — | "Export failed" |

**2. Input Validation Rules**

| Field | Type | Required | Min | Max | Pattern | Error Message |
|-------|------|----------|-----|-----|---------|---------------|
| line item amount | `number` | Yes | 0 | — | numeric | "Amount must be ≥ 0" |
| line item label | `string` | Yes | 2 | 120 | — | "Label 2–120 chars" |

**3. State Screens** — Loading: grid skeleton · Empty: "No budget yet, generate one" · Error: retry.

**4. Interactions** — Edit cell (autosave), add/remove row, comment on cell, export .xlsx, recompute totals live.

**5. Navigation** — Reachable: Deal workspace, Proposal editor · Back → workspace · Deep link auth-guarded.

**6. Data Display** — line items, subtotal, total, currency; default sort by phase order; no pagination (single sheet).

**7. Error Handling** — 422 invalid amount (highlight cell) · 403 non-owner edit · 500 export failure (retry).

**8. Edge Cases** — (1) Zero rows → empty grid + "Generate budget" · (2) Combined-file template (Agency/Design) → budget embedded in proposal, separate export hidden · (3) Concurrent edit → last-write-wins + toast · (4) Huge budget (100+ rows) → virtualized grid.

---

#### Route: `/share/:token` (Client Shared Artifact)

**Access:** Anyone with valid token (proposal OR budget scope).

**1. Component Detail** — Living proposal canvas / web budget (read-only values, comment-enabled) · Comment composer · "Request a demo" button.

**2. Input Validation Rules** — comment body: required, 1–1000 chars; demo message: optional, ≤500.

**3. State Screens** — Loading: branded splash + skeleton · Empty: N/A (always has content) · Error: "Link inactive."

**4. Interactions** — Scroll triggers architecture animation · select text/section → comment · click Request Demo → form.

**5. Navigation** — Single page; proposal↔budget cross-link only if both shared; no app nav.

**6. Data Display** — proposal sections / budget cells (read-only); comments inline anchored.

**7. Error Handling** — 410 expired/revoked → "Link no longer active" · 404 bad token → generic not-found · 429 comment spam → "Slow down."

**8. Edge Cases** — (1) Expired link · (2) Revoked/re-issued link · (3) Mobile 375px render of architecture animation (graceful static fallback) · (4) Client offline mid-comment (queue + retry).

---

#### Route: `/app/projects` (Riseup Portfolio Search)

**Access:** All internal roles.

**1. Component Detail** — Search bar, category chips, tech-stack filters, project cards.
**2. Input Validation Rules** — query: optional, ≤100 chars.
**3. State Screens** — Loading: card skeletons · Empty: "No projects match" · Error: retry.
**4. Interactions** — Filter by category/tech, click card → detail, "Add to proposal" (from a deal context).
**5. Navigation** — Reachable: project detail, back to deal.
**6. Data Display** — name, type, tags, tech stack, outcome; default sort by relevance then name ASC; pagination 24/page.
**7. Error Handling** — 500 search failure (retry) · empty filter combo (clear-all).
**8. Edge Cases** — zero results · all-filters-cleared · very long tag list (truncate) · stale index (reindex hint).

---

#### Route: `/auth/login`

**Access:** Guest only. **1.** email/password fields + submit. **2.** email RFC5322, password required. **3.** Loading spinner on submit; Error: "Invalid credentials." **4.** Click navigation only. **5.** Success → role home (`/app` or `/admin`). **6.** N/A (no dynamic data). **7.** 401 invalid creds, 423 locked after N fails, 500 retry. **8.** (min 2) wrong password lockout after `[💡 Recommended: 5]` attempts; already-authenticated user hitting login → redirect home.

---

## Section 4: Admin Dashboard (Management)

### Admin Page: Verification Queue

**Access:** Management only | **URL:** `/admin/verify`

**1. Table Column Definition**

| Column | Type | Sortable | Description |
|--------|------|----------|-------------|
| Deal | `string` | Yes | Client company + project name |
| Owner | `string` | Yes | Sales rep |
| Template | `badge` | Yes | Global/Local/Agency/Design |
| Total | `currency` | Yes | Budget total |
| Generated At | `datetime` | Yes | Relative time |
| Actions | `actions` | No | Review / Approve / Reject |

**2. Filter Options**

| Filter | Type | Options | Default |
|--------|------|---------|---------|
| Template | Dropdown | All / 4 templates | All |
| Owner | Dropdown | Sales reps | All |
| Date Range | Date picker | Custom | Last 30 days |

**3. Detail Drawer** — Display: proposal preview, budget grid, readiness score, RAG proof projects. Actions: Approve (→ verified), Reject (reason required → back to sales), Comment. Related: comment history, version history.

**4. Creation Modal** — N/A (Management does not create deals).

**5. Standard Features Applied** — Reference `.claude/operations/skills/qa/_qa-shared` admin standards (pagination, search, bulk, audit).

**Default Sort:** `generatedAt DESC` | User-changeable: Yes

**Edge Cases**

| # | Category | Scenario | Expected Behavior |
|---|----------|----------|-------------------|
| 1 | Zero data | Nothing to verify | Empty state "All caught up" |
| 2 | Concurrent | Two managers approve same deal | First wins, second sees "Already verified" |
| 3 | Reject loop | Repeated rejects | Reason history retained on deal |
| 4 | Filter → zero | No matches | "No results" + clear-all |

### Admin Page: Pipeline Analytics

**Access:** Management | **URL:** `/admin`

**1. Cards/Charts** — Lead→conversion median time, win-rate, deals by status (funnel), loss reasons (bar), cycle-time trend (line).
**Filter Options** — Date range, owner, template.
**Default Sort:** N/A (aggregates). **Edge Cases** — zero deals (empty charts), single-deal stats (suppress misleading medians), date range with no data, very large dataset (server-side aggregation).

---

## Section 5: Tech Stack & System Design

### Technologies

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| Frontend Framework | React Router 7 (framework mode) + Vite + React | RR7 | Per project rules (`app/`, `~/` alias) |
| Styling | Tailwind CSS | v4 | Per project rules + matches proposal template |
| State | Redux Toolkit (async thunks) | latest | Per project rules (no TanStack Query) |
| Backend Framework | NestJS | 10.x | Per project rules (4-layer + base classes) |
| Database | PostgreSQL | 16 | Relational + `pgvector` for RAG |
| Vector store | pgvector | latest | Co-locate embeddings with Postgres (no extra infra) |
| ORM | TypeORM | latest | Per project rules |
| Cache/Queue | Redis | 7 | Generation job queue + sessions |
| File Storage | AWS S3 | — | Brief uploads, generated PDFs/xlsx |
| Realtime | Socket.IO (NestJS Gateway) | latest | Inline comments + notifications |
| LLM | Anthropic Claude (Opus 4.8 + Sonnet 4.6) | claude-opus-4-8 / claude-sonnet-4-6 | Generation, readiness, embeddings/retrieval reasoning |
| Excel export | ExcelJS | latest | Web budget → `.xlsx` |
| PDF export | Puppeteer / Playwright print | latest | Proposal → PDF |
| Deployment | Docker + AWS | — | Per ship rules |

### Third-Party Integrations

| Service | Purpose | SDK/API | Env Variables Required |
|---------|---------|---------|----------------------|
| Anthropic | Generation, readiness, RAG | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` |
| AWS S3 | File storage | `@aws-sdk/client-s3` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` |
| AWS SES | Email notifications | `@aws-sdk/client-ses` | `SES_FROM_EMAIL` |

### Key Architectural Decisions

| # | Decision | Rationale | Trade-offs |
|---|----------|-----------|------------|
| 1 | pgvector over dedicated vector DB | One datastore, simpler ops for MVP | May need migration at large scale |
| 2 | Generation runs as async Redis-queued jobs | LLM latency; avoid HTTP timeouts | Added job infra |
| 3 | Tokenized share links (signed, scoped) | No-login client access, revocable | Token management/rotation |
| 4 | Proposal rendered as React + interactive (not static HTML) | Comments, animation, regeneration need live app | Heavier than static deck |
| 5 | Claude Opus for generation, Sonnet for readiness/cheap passes | Cost/quality balance | Two model paths |

### Environment Variables

> Allocate unique port/prefix per `.claude/operations/docs/project-registry.md`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | Yes | `30XX` | Backend port (allocate unique) |
| `FRONTEND_URL` | Yes | `http://localhost:51XX` | Frontend dev URL |
| `DATABASE_URL` | Yes | — | Postgres connection |
| `POSTGRES_DATABASE` | Yes | `lead360_db` | DB name |
| `JWT_SECRET` | Yes | — | JWT signing secret (no fallback) |
| `AUTH_TOKEN_COOKIE_NAME` | No | `Lead360Token` | JWT cookie name |
| `SHARE_LINK_SECRET` | Yes | — | Signs client share tokens |
| `ANTHROPIC_API_KEY` | Yes | — | Claude API |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Yes | — | S3 + SES |
| `S3_BUCKET` | Yes | — | Brief + artifact bucket |
| `REDIS_PREFIX` | No | `lead360:` | Redis key prefix |
| `VITE_API_URL` | Yes | `http://localhost:30XX/api` | Public API base |

### Conditional Section: Auth Flow

**Authentication Method:** JWT in httpOnly cookie (per backend rules — `httpOnly, secure, sameSite:'strict'`).
**Token Strategy:** Access token (short-lived) + refresh token (rotated, deleted-before-reissue on refresh). Logout via `RemoveTokenInterceptor` (works with expired token).
**Login Flow:** credentials → `POST /api/auth/login` → validate → set cookies → redirect to role home.
**Client share access:** Not auth — `GET /share/:token` validates a signed, scoped, expirable token (separate from user JWT).

### Conditional Section: File Pipeline

**Upload Config:** Max 25MB; types: PDF, DOCX, TXT, MD; method: server proxy → S3.
**Processing Pipeline:**

| Step | Process | Input | Output | Async |
|------|---------|-------|--------|-------|
| 1 | Text extraction | Raw brief | Plain text | Yes |
| 2 | Chunk + embed | Text | Vectors → pgvector | Yes |
| 3 | Generated artifact export | Proposal/budget | PDF / xlsx → S3 | Yes |

**Storage:** S3 path `lead360/{dealId}/{type}/{timestamp}-{hash}.{ext}`; access via signed URLs; orphan cleanup after 30 days.

### Conditional Section: Real-time Architecture

**Connection:** Socket.IO; auth via httpOnly cookie (internal) or share token (client); heartbeat 30s.
**Channel Structure:**

| Channel | Purpose | Subscribers | Publishers |
|---------|---------|-------------|-----------|
| `deal:{dealId}` | Comments, demo requests, status | Sales/PM/Management + client (scoped) | All participants |
| `user:{userId}` | Personal notifications | The user | Server |

**Reconnection:** Exponential backoff 1s→30s, 10 attempts; on recovery fetch missed comments since last cursor.

### Conditional Section: Billing Flow

N/A — internal tool, no payment processing. (The "budget" is a sales artifact, not a transaction.)

### Conditional Section: Multi-tenancy

N/A for MVP — single Riseup Labs tenant. (Row-level org scoping reserved for future white-label.)

---

## Section 6: Data Model — Full Schema

### Entity Relationships

| Entity A | Relationship | Entity B | Description |
|----------|-------------|----------|-------------|
| User | 1:N | Deal | A sales user owns many deals |
| ClientCompany | 1:N | Deal | A company can have many deals |
| Deal | 1:N | Brief | A deal has many uploaded briefs |
| Deal | 1:N | ProposalVersion | Versioned proposals |
| Deal | 1:N | BudgetVersion | Versioned budgets |
| Deal | 1:N | Comment | Comments anchored to proposal/budget |
| Deal | 1:N | ShareLink | Tokenized links per artifact |
| Deal | 1:N | StatusEvent | Audit of status transitions |
| CaseStudy | 1:N | CaseStudyChunk | Embedding chunks for RAG |
| Deal | N:N | CaseStudy | Proof projects attached to a proposal (join: DealCaseStudy) |

**Join Tables:**

| Join Table | Left | Right | Extra Columns |
|-----------|------|-------|---------------|
| DealCaseStudy | Deal | CaseStudy | position, addedBy |

### Full Schema

#### users
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| email | String | UNIQUE, NOT NULL |
| password | String | NOT NULL (bcrypt) |
| name | String | NOT NULL |
| role | int (enum) | NOT NULL (sales/pm/management) |
| status | int (enum) | NOT NULL, DEFAULT 1 |
| lastLoginAt | DateTime | NULLABLE |
| createdAt/updatedAt/deletedAt | DateTime | base entity |

#### client_companies
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| name | String | NOT NULL |
| contactName | String | NULLABLE |
| contactEmail | String | NULLABLE |
| industry | String | NULLABLE |
| createdAt/updatedAt/deletedAt | DateTime | base |

#### deals
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| title | String | NOT NULL |
| companyId | UUID | FK → client_companies.id |
| ownerId | UUID | FK → users.id |
| pmId | UUID | FK → users.id, NULLABLE |
| template | int (enum) | NOT NULL (global/local/agency/design) |
| status | int (enum) | NOT NULL, DEFAULT 0 |
| readinessScore | int | NULLABLE |
| lossReason | String | NULLABLE (required when status=Lost) |
| lockedAt | DateTime | NULLABLE |
| createdAt/updatedAt/deletedAt | DateTime | base |

#### briefs
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| dealId | UUID | FK → deals.id |
| s3Key | String | NOT NULL |
| fileName | String | NOT NULL |
| extractedText | text | NULLABLE |
| createdAt/updatedAt/deletedAt | DateTime | base |

#### proposal_versions
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| dealId | UUID | FK → deals.id |
| versionNo | int | NOT NULL |
| contentJson | jsonb | NOT NULL (structured proposal) |
| renderedUrl | String | NULLABLE (PDF export) |
| generatedBy | String | NOT NULL (model id) |
| prompt | text | NULLABLE (regeneration prompt) |
| createdAt/updatedAt/deletedAt | DateTime | base |

#### budget_versions
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| dealId | UUID | FK → deals.id |
| versionNo | int | NOT NULL |
| lineItemsJson | jsonb | NOT NULL (grid rows) |
| total | numeric | NOT NULL |
| currency | String | NOT NULL, DEFAULT 'USD' |
| xlsxUrl | String | NULLABLE |
| createdAt/updatedAt/deletedAt | DateTime | base |

#### comments
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| dealId | UUID | FK → deals.id |
| artifact | int (enum) | NOT NULL (proposal/budget) |
| anchor | String | NOT NULL (section id / cell ref) |
| body | text | NOT NULL |
| authorType | int (enum) | NOT NULL (staff/client) |
| authorRef | String | NULLABLE (userId or client token id) |
| createdAt/updatedAt/deletedAt | DateTime | base |

#### share_links
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| dealId | UUID | FK → deals.id |
| artifact | int (enum) | NOT NULL (proposal/budget) |
| token | String | UNIQUE, NOT NULL (signed) |
| expiresAt | DateTime | NULLABLE |
| revokedAt | DateTime | NULLABLE |
| createdAt/updatedAt/deletedAt | DateTime | base |

#### status_events
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| dealId | UUID | FK → deals.id |
| fromStatus | int | NULLABLE |
| toStatus | int | NOT NULL |
| reason | String | NULLABLE |
| actorId | UUID | FK → users.id |
| createdAt | DateTime | NOT NULL |

#### case_studies
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| name | String | NOT NULL |
| projectType | String | NULLABLE |
| categoryTags | String[] | NOT NULL |
| techStack | String[] | NOT NULL |
| outcome | text | NULLABLE |
| budgetRange | String | NULLABLE |
| coverS3Key | String | NULLABLE |
| createdAt/updatedAt/deletedAt | DateTime | base |

#### case_study_chunks
| Column | Type | Constraints |
|--------|------|------------|
| id | UUID | PK |
| caseStudyId | UUID | FK → case_studies.id |
| chunkText | text | NOT NULL |
| embedding | vector(1536) | NOT NULL (pgvector) |
| createdAt | DateTime | NOT NULL |

### Status Enums

| Enum Name | Value | Label | Used By |
|-----------|-------|-------|---------|
| DealStatus.DRAFT | `0` | Draft | deals |
| DealStatus.READY | `1` | Ready | deals |
| DealStatus.GENERATED | `2` | Generated | deals |
| DealStatus.VERIFIED | `3` | Verified | deals |
| DealStatus.SUBMITTED | `4` | Submitted | deals |
| DealStatus.LOCKED | `5` | Locked | deals |
| DealStatus.PENDING | `6` | Pending | deals |
| DealStatus.LOST | `7` | Lost | deals |
| Template.GLOBAL/LOCAL/AGENCY/DESIGN | `0-3` | — | deals |
| Artifact.PROPOSAL/BUDGET | `0-1` | — | comments, share_links |

### Index Hints

| Entity | Column(s) | Type | Reason |
|--------|-----------|------|--------|
| users | email | UNIQUE | Login |
| deals | ownerId, status | COMPOSITE | Sales dashboard filter |
| deals | status, createdAt | COMPOSITE | Management queue + analytics |
| share_links | token | UNIQUE | Link resolution |
| comments | dealId, artifact | COMPOSITE | Thread loading |
| case_study_chunks | embedding | IVFFLAT (pgvector) | Similarity search |

### Soft Delete

| Entity | Soft Delete | Retention | Hard Delete Policy |
|--------|------------|-----------|-------------------|
| All (via BaseEntity) | Yes | 90 days | Manual/admin purge |

---

## Section 7: Permission Matrix

### Action x Role Matrix

> `own` = only on resources the user owns.

| Action | Client (token) | PM | Sales | Management |
|--------|:--------------:|:--:|:-----:|:----------:|
| View deal | scoped artifact only | Yes (assigned) | own | Yes (all) |
| Create deal | No | No | Yes | No |
| Upload brief | No | No | own | No |
| Run readiness | No | No | own | No |
| Generate proposal/budget | No | No | own | No |
| Regenerate (prompt) | No | No | own | No |
| Comment | scoped artifact | No | own deal | Yes |
| Request demo | scoped artifact | No | No | No |
| Mint/revoke share link | No | No | own (if verified) | Yes |
| Verify/approve | No | No | No | Yes |
| Update status | No | No | own | Yes |
| View analytics | No | No | own deals only | Yes (all) |
| Manage users | No | No | No | Yes |

### Ownership Rules

| Resource | Owner Field | Ownership Determined By |
|----------|-----------|------------------------|
| Deal | `ownerId` | Sales user who created it |
| ProposalVersion / BudgetVersion | via `deal.ownerId` | Inherited from deal |
| Comment (staff) | `authorRef` | Author |

### Role Hierarchy

```
Client (tokenized, no auth — scoped to one deal artifact)
PM (authenticated, read-only)
  └── Sales (authenticated, owns deals)
       └── Management (full access + verification + analytics + user mgmt)
```

**Escalation rules:**
- Only Management changes user roles and verifies deals.
- All status transitions and verifications logged in `status_events` (audit).
- Share links can only go live after a Management `verified` transition.

---

## Section 8: Open Questions

| # | Question | Context / Impact | Owner | Status |
|---|----------|-----------------|-------|--------|
| 1 | Source of the claude-base brand/case-study asset pack | Needed to seed RAG + proposal portfolio | PM | Open |
| 2 | Exact content/structure of the 4 templates (Global/Local/Agency/Design) | Drives generation prompts + variants | PM | Open |
| 3 | SSO vs email/password for staff login | Affects auth module | Management | Open |
| 4 | Readiness score threshold + rubric weights | Gating behavior | PM | Open |
| 5 | Who can import case studies into the KB (Management only?) | Permission scope | Management | Open |

---

## Additional Questions

**Required** — Must be answered before development begins:

| # | Question | Recommendation | Rationale | Blocks |
|---|----------|----------------|-----------|--------|
| 1 | Brand/case-study asset pack source | Pull from `claude-base` repo | Same org assets already exist there | Proposal engine + RAG seed |
| 2 | The 4 template definitions | Fork the existing `generate-proposal` deck into 4 variants; gather 1 sample each | Reuses proven template | Generation engine |
| 3 | Staff auth method | Email/password (company domain) for MVP | Simplest; SSO later | Auth module |

**Recommended** — Development can start but should be answered:

| # | Question | Recommendation | Rationale | Affects |
|---|----------|----------------|-----------|---------|
| 1 | Default currency | USD (global/local), with per-deal override | Matches existing proposal examples | Budget module |
| 2 | Email provider | AWS SES | Already on AWS | Notifications |
| 3 | Embedding dimension / model | Claude-based embeddings, `vector(1536)` | Standard | RAG schema |

---

## Bundle Coverage Summary

| Bundle | Required | Recommended | Excluded by PM | Notes |
|--------|:--------:|:-----------:|:--------------:|-------|
| Auth/Registration | core ✅ | — | Social, phone | Internal staff only |
| File Upload | ✅ | — | — | Brief → S3 |
| Real-time | ✅ | — | — | Comments + notifications |
| RAG/Knowledge | ✅ | — | — | pgvector |
| Notification | ✅ | digest deferred | — | In-app + email |

**Deferred Bundles:** Payment (N/A), Multi-language proposals (Phase 2), Multi-tenancy (Phase 2).

---

## UX Flow Improvement Suggestions

| Current Flow | Issue | Suggestion | Priority | Complexity |
|-------------|-------|-----------|----------|------------|
| Generate → manual send for verification | Extra step | Auto-route to verification queue on generate | P2 | Low |
| Client comments scattered | Sales context-switch | Aggregate client comments into the Meeting Kit automatically | P1 | Med |
| Readiness gate hard-blocks | May frustrate experienced reps | Allow override-with-reason (already specced) + track override outcomes | P2 | Low |

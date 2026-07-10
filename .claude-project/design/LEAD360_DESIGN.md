# Lead360 — Complete Product & Design Reference (v3 · Riseup Studio)

> **One file to understand the whole product design.** Self-contained. Updated 2026-07-01 (v3 enterprise redesign).
> Company: Riseup Labs. Type: internal web app (desktop). Look: enterprise SaaS — **dark sidebar**, Inter, hairlines, restrained orange `#EA5400` on `#FAFAF9`.
> Deeper sources: `DESIGN_SYSTEM.md` (tokens), `Lead360_DesignGuide_v3.md` (page-by-page build spec), `../docs/PRD.md` (full PRD, see the v3 override block at top).

---

## 1. What Lead360 is

An **AI proposal & budget studio** Riseup Labs uses internally to turn a client brief into branded **Proposal + Budget** deliverables, grounded in past projects (RAG), and to run the **lead → proposal → lock** journey with a real Management approval loop.

**Vocabulary (enforced):** the entity is a **Lead** (pre-lock) / **Project** (portfolio). The word **"Deal" is never used**. "Conversion Rate" (not Win Rate). "Approvals" (not Verification).

### Three concept pillars
1. **Dashboard = analytics landing** (KPIs, funnel, cycle time, activity). The lead list lives on its own **Leads** page.
2. **Lead / Project** vocabulary everywhere.
3. **Enforced approval loop:** Sales *Submit for approval* → Management *Approve/Reject* → Sales *Send to client* (unlocks the tokenized client link).

---

## 2. Users & roles

| Role | Sidebar | What they do |
|------|---------|--------------|
| **Sales** | Dashboard · Leads · Projects · Settings | Runs the New Lead wizard, generates, submits for approval, sends to client, updates status |
| **PM** | (same as Sales) | Views lead context |
| **Management** | Overview · Approvals · Leads · Projects · Settings | Approves/rejects, sees org analytics |
| **Client** | *(public, tokenized `/c/:token/…`)* | Views proposal/budget read-only; **can comment + request a demo** (surfaces back on Lead Detail) |

**Status state machine (funnel):** `Generated → Pending Approval → Approved → Sent → Locked`, plus **Lost** (side-branch, reason required). Draft/Ready are wizard-internal only.

| From | Action (who) | To |
|---|---|---|
| Generated | Submit for approval (Sales) | Pending Approval |
| Pending Approval | Approve / Reject (Mgmt) | Approved / Rejected |
| Rejected | Regenerate + resubmit (Sales) | Pending Approval |
| Approved | Send to client (Sales) → unlocks link | Sent |
| Sent | Mark Locked / Mark Lost / Regenerate | Locked / Lost |

---

## 3. The New Lead flow (guided wizard, 5 steps, no sidebar)

```
Dashboard/Leads ─[+ New Lead]─▶ ① Info ─▶ ② Requirement ─▶ ③ Readiness ─▶ ④ Template ─▶ ⑤ Generate ─▶ Lead Detail
                                company,    upload/paste     segment bar +   Global/Local/    RAG + draft
                                contact,    brief            client queries  Agency/Design    + budget
                                website                      (if <80)
```
- **③ Readiness** shows a **segment bar** (0–60 danger / 60–80 warn / 80–100 success) + big score. ≥80 → compact "ready"; <80 → a **checklist of client queries** Sales can copy/confirm/override.
- **④ Template:** Global & Local → Proposal (PDF) + **separate Excel**; Agency & Design Portfolio → **combined** (proposal + budget one file).

---

## 4. Lead Detail — the workhorse

Two columns. **Left tabs:** Proposal · Budget · Sales Brief · Client activity · History. **Right rail:** status + status-control buttons, client info, template, owner, timestamps, **Client link** (locked until Approved + Sent), approval trail.
- **Proposal tab** has a **Light / Dark / Mixture** theme switcher — three visual themes of one content source (`proposal_theme`).
- **Budget tab** is an interactive FIFA-structured table with Export .xlsx.
- **Sales Brief tab** = an 8-section non-technical pitch pack (plain-English proposal, why-it-matters, highlights, talking points, objections table, comparable projects, 60-sec pitch, suggested close).
- **Client activity tab** = comments + demo requests coming back from the client link.

---

## 5. Deliverables & client views (tokenized, interactive)

- **Global/Local:** `proposal-view` (14 sections) + separate `budget-view`.
- **Agency/Design Portfolio:** `deliverable-view` — 11 sections with the **Financial Proposal (budget) inline as §9**.
- Client views are read-only but **commentable per section + Request demo**; brand-locked, print-optimized, sticky right action rail (Download PDF · Add comment · Request demo). No login; unique signed token per lead.

**Proposal sections** — Global/Local (14): Executive Summary · Understanding of Requirements (3-col table) · Solution Capabilities · Proposed Architecture (animated) · Technical Approach (named subsections) · Integration Feasibility · Technical Stack · Development Methodology · Deliverables · Testing & QA · Infrastructure & Deployment · Security/Governance/Compliance · Assumptions & Dependencies · Conclusion. Agency/Design (11): Introduction · Context & Objectives · Approach & Methodology · Technical Stack · Scope of Work · Deliverables · Technical Diagrams · Complimentary Support · **Financial Proposal** · Out of Scope · Acceptance & Sign-off.

**Budget** (matches `FIFA Campaign Budget.xlsx`): one sheet per milestone; columns **Sl. | Departments | Heads | Type | No. of Unit | No. of Days | Per Day Cost | Unit Cost | Total Cost**; rows grouped by department; `Unit Cost = Unit × Days × PerDayCost`; department subtotals + sheet Total; milestone timeline note. Excel export via ExcelJS with **real formulas** (dev phase).

---

## 6. All pages (18) — inventory

Prototypes in `.claude-project/design/html/<role>/`. Map: `html/index.html`.

### `app/` — Sales & PM
| Page | File | Purpose |
|------|------|---------|
| Login | `app/login.page.html` | Sign-in |
| Dashboard | `app/dashboard.page.html` | **Analytics** (KPIs, funnel, cycle-time, activity, loss reasons, date-range filter) |
| Leads | `app/leads.page.html` | Full lead table + filters |
| New Lead ①–⑤ | `app/new-lead-{info,requirement,readiness,template,generate}.page.html` | The wizard |
| Lead Detail | `app/lead-detail.page.html` | Proposal(3 themes)/Budget/Sales Brief/Client activity/History + approval loop |
| Projects | `app/projects.page.html` | Portfolio by category + tech (no "Add to proposal") |
| Project Detail | `app/project-detail.page.html` | Summary-first + View proposal + RAG toggle |
| 404 | `app/404.page.html` | Not found |

### `management/`
| Page | File | Purpose |
|------|------|---------|
| Overview | `management/overview.page.html` | Org analytics (Conversion Rate, Cycle Time, Approval Turnaround, Revenue at Stake, stage cycle times) |
| Approvals | `management/approvals.page.html` | Approve/reject queue (the gate) |
| Leads | `management/leads.page.html` | Org-wide read-only table |

### `client/` — tokenized, interactive
| Page | File | Purpose |
|------|------|---------|
| Proposal | `client/proposal-view.page.html` | Global/Local, 14 sections, animated architecture, comments + demo |
| Budget | `client/budget-view.page.html` | Global/Local, FIFA structure, Export .xlsx |
| Combined | `client/deliverable-view.page.html` | Agency/Design, 11 sections + inline Financial Proposal |

---

## 7. Design system — "Riseup Studio" (enterprise)

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#FAFAF9` | Off-white canvas |
| `--panel` | `#FFFFFF` | Cards |
| `--sidebar` | `#111111` | **Dark sidebar** (the signature move) |
| `--border` / `--border-strong` | `#E8E6E3` / `#D4D1CC` | Hairlines (do the work of shadows) |
| `--text` / `--text-muted` / `--text-subtle` | `#0F0F0F` / `#6B6660` / `#9A948E` | Charcoal type |
| `--primary` | `#EA5400` | Orange — **sparingly** (primary buttons, one accent/section, active) |
| status | success `#0E7C5A` · warn `#B8710A` · danger `#B42318` · info `#175CD3` | flat dot-led pills |

- **Font:** Inter — headings 600, body 400/500, **tabular numerals**.
- **Radii:** 8 (cards) / 6 (buttons) / 4 (chips). No `rounded-2xl`.
- **Shadows:** almost none — borders + spacing create elevation.
- **Motion:** functional only (120ms hover, 200ms panels). No cartoon gauge.
- **Components:** KPI cards without colored strips; tables (sticky header, hairline dividers, 44px rows, right-aligned tabular numerics); **readiness = horizontal segment bar** (not a ring).
- **Layouts:** (1) App Shell — 260px dark sidebar + white top bar + 1400px main; (2) Flow Shell — wizard (720px, stepper, no sidebar); (3) Client Document — brand-locked, sticky action rail, print stylesheet.

---

## 8. How it's built (context)
Frontend React Router 7 + Tailwind v4 + Redux · Backend NestJS + TypeORM + PostgreSQL + **pgvector** (RAG) · Claude (Opus generate / Sonnet readiness) · Proposal → PDF, Budget → `.xlsx` (ExcelJS, real formulas) · JWT httpOnly (staff); client links are signed per-lead tokens. Data model: `Lead`, `proposal_theme`, `approval`, `lost_reason`, `client_link_token`, `client_comment`, `demo_request`. Full detail + v3 override in `../docs/PRD.md`.

## 9. Still needed from Riseup
1. **claude-base asset pack** — brand/case-study images for RAG + portfolio.
2. **Staff auth** — email/password (default) vs SSO.
(The 4 template structures are now defined from the provided `.docx` files + `FIFA Campaign Budget.xlsx`.)

## 10. File index (design)
- **This file** — complete reference. · `DESIGN_SYSTEM.md` — tokens. · `Lead360_DesignGuide_v3.md` — build spec. · `Lead360_DomainResearch.md` — references. · `html/index.html` — clickable map. · `html/{app,management,client}/*.html` — 18 pages. · `../status/lead360/DESIGN_STATUS.md` — approval + handoff snapshot. · `../docs/PRD.md` — full PRD (v3 override at top).

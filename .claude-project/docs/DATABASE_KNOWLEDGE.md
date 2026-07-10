# Lead360 — Database Knowledge (RAG seed)

> Learned from Riseup Labs' real Proposal & Budget Database (39 files, in-app at `app/db/`) + the live portfolio.
> This is the **structured knowledge** that grounds proposal + budget generation. Two uses: (1) a compact **scaffold** injected as a cached system prompt (skeletons, guidance, boilerplate); (2) a **retrieval corpus** (chunked docs + past generations) for few-shot grounding. See `RAG_AI_ARCHITECTURE.md`.
> Source of truth is the real files; where a number/label is a representative sample it is marked *(sample — dev computes actual from ingested files)*.

---

## 1. Proposal templates (verified across 15 real proposals)

### 1a. Global / Local — technical proposal, budget is a SEPARATE Excel
Canonical skeleton (the stable core; real proposals vary section names slightly and insert domain sections):
1. **Executive Summary**
2. **Understanding of the Assignment** *(aka Project Understanding / Understanding of Requirements / Understanding of Scope)* — Local (gov/NGO) proposals add **"Scope Alignment with the ToR"**
3. **Proposed Scope of Work** *(aka Proposed Scope / Scope Coverage)* — often a table of Scope Area → Coverage
4. **Proposed Technical Approach** — frequently broken into **named sub-steps/phases** (e.g. Discovery → Build → Integration & QA → Pilot → Evaluation; or module-by-module)
5. **Proposed Solution Architecture** *(when system-heavy: architecture + data-flow + integration roadmap)*
6. **Development Methodology**
7. **Proposed Technical Stack** — a table (Layer | Recommended Technology | Purpose)
8. **Technical Diagrams** — architecture / data-flow / CI-CD placeholders
9. **Deliverables**
10. **Testing and Quality Assurance**
11. **Assumptions and Dependencies** *(aka Assumptions and Exclusions / Initial Boundaries)*
12. **Proposed Out of Scope**
13. **Conclusion**
Optional domain sections observed: Duration-Based Options, Information Architecture/Sitemap, Third-Party Licensing, Governance & Capacity Building, Risks & Mitigation, Implementation Timeline, Similar Experiences/References.

### 1b. Agency / Design Portfolio — proposal + budget COMBINED (budget inline as "Financial Proposal")
Canonical skeleton (~11–13 sections):
1. **Introduction**
2. **Project Context & Objectives** *(aka Project Objective / Project Scope Overview)*
3. **Proposed Technical Approach & Methodology** — with **named phases** (e.g. Phase 1 Foundation → Phase 2 Social Planning → Phase 3 …; or Environment Review → Provisioning → Deployment → CI/CD → Handover)
4. **Proposed Technical Stack**
5. **Scope of Work** *(Frontend + Backend & CMS; sometimes "Development Only")*
6. **Deliverables**
7. **Human Resources & Responsibilities**
8. **Technical Diagrams (Placeholders)** — High-Level Architecture · Auth & Data-Flow · Notification/Sync · CI/CD
9. **Complimentary Support (1 Month)** *(boilerplate — reuse verbatim)*
10. **Financial Proposal** ← the budget, INLINE
11. **Proposed Out of Scope**
12. **Assumptions & Prerequisites**
13. **Acceptance & Sign-off** *(boilerplate — reuse verbatim)*

### 1c. Per-section guidance (what goes in each — learned from the corpus)
- **Executive Summary**: 2–3 short paras — the problem, the proposed outcome, the milestone/phased delivery promise.
- **Understanding**: restate the client's context + pains in Riseup's words; for Local, map to the **ToR** clause-by-clause.
- **Scope**: a table (area → what's covered) + explicit **phase breakdown** with what's in each phase.
- **Technical Approach**: numbered stages, each 1–3 sentences; system projects add architecture + data-flow + integration roadmap.
- **Methodology**: standard phases — **Discovery/SRS → Design → Build/Modular Enhancement → Integration & QA → Pilot/UAT → Evaluation/Handover** (or a 3-phase variant). Reusable.
- **Tech Stack**: table Layer|Technology|Purpose (see §4 stack library).
- **Deliverables**: bulleted, week/phase-tagged.
- **Testing & QA**: automated + manual + UAT + labelled test-set; sign-off criteria.
- **Assumptions/Out of Scope/Conclusion/Complimentary Support/Acceptance**: largely **boilerplate** → store as fixed templates and reuse (near-zero generation cost).

---

## 2. Budget knowledge (verified across 11 budgets — one identical structure)

> Full product/UX + AI-workflow treatment of budgeting (how it's drafted, computed, and customized) is in **`docs/BUDGETING.md`**. Key fact: Riseup budgets are **resource-count × days × day-rate** (man-days, **not hourly**).

### 2a. Structure (matches every budget + the FIFA template)
- **One sheet per milestone** (default "Development"; maintenance projects use "Monthly Maintenance Plan").
- Banner: **"Cost Breakdown for Item A" / "Development of {Project}"**.
- **9 columns**: `Sl. | Departments | Heads | Type | No. of Unit | No. of Days | Per Day Cost | Unit Cost | Total Cost`.
- Rows **grouped by department**; the first row of a group carries the Sl.# + department name.
- **Formulas** (real, in the file): `Unit Cost = No. of Unit × No. of Days × Per Day Cost`; department **Total Cost = SUM(group Unit Costs)** on the top row; sheet **Total = SUM(department totals)**.
- **Timeline note** under the table: "Development Timeline = X weeks/months".

### 2b. Department + role taxonomy (the real, consolidated list)
- **Managing & Planning Department**: Project Manager · Product Designer · Product Analyst · Game Designer
- **Art Department**: UI/UX Designer · 2D Artist · 3D Artist · 2D Animator · Creative Director · Graphics Designer · Motion Graphics Designer · Illustrator · Script Writer · Voice Artist
- **Development Department**: Technical Lead · Backend Developer · Frontend Developer · Unity Game Developer · VR Developer · DevOps · eLearning Expert · Moodle Expert
- **Others**: QA Expert (Test Engineer) · Trainer
- **Type / seniority**: Senior · Mid · Junior

### 2c. Rate card — day-rates, USD *(sample from FIFA/Blitz — dev computes real averages per role from all ingested budgets)*
| Role | Type | Day rate (USD) |
|---|---|---|
| Project Manager | Senior | 120 |
| Product Designer | Senior | 90 |
| Tech / Technical Lead | Senior | 130 |
| Backend / Frontend Developer | Mid | 85 |
| DevOps | Senior | 110 |
| UI/UX Designer | Mid | 70 |
| QA Expert (Test Engineer) | Mid | 60 |
| Specialist (Unity/VR/Moodle/eLearning/Motion/Voice…) | Mid–Senior | *(learn from ingested budgets)* |

### 2d. Budget-from-proposal mapping (how a budget is derived — the key capability)
Scope/phases in the proposal → **which roles**, **how many**, **for how many days** → apply rate card → compute. Signals: project type (game→Unity/2D-3D artists; VR→VR/3D; web→Frontend/Backend/UI-UX; eLearning→Moodle/eLearning/Script/Voice; gov MIS→Backend/DevOps/Tech Lead), phase count/duration → days. This is mostly **deterministic math**; the LLM only estimates the role/day mix from scope (a small structured call). → **We can generate a budget for any proposal in the database** by parsing its scope + duration and mapping to this taxonomy + rate card; where a budget already exists, we learn the mapping (scope→role-days) to sharpen future estimates.

---

## 3. Category conventions
- **Global** — international clients; full technical proposal + separate Excel budget; commercial framing.
- **Local** — Bangladesh gov/NGO/UN; **ToR/RFP alignment is mandatory** (Scope Alignment section, clause mapping, governance/capacity-building, risks); separate Excel budget.
- **Agency** — combined proposal+budget (Financial Proposal inline); phase-based; HR & Responsibilities table; Complimentary Support + Acceptance boilerplate.
- **Design Portfolio** — design-led combined deliverable.

## 4. Tech-stack library (observed across proposals)
Frontend: React · Next.js · Vue · Flutter (mobile) · WordPress. Backend: Node.js · Laravel · Python · PHP. Data: PostgreSQL · MySQL · MongoDB · Redis. Infra: AWS · Nginx · Docker · CI/CD. Game/XR: Unity · Cocos2d-x · C#. AI: OpenAI · Google Gemini · Langchain · n8n. LMS: Moodle · Xerte. (Render as the Layer|Technology|Purpose table per proposal domain.)

## 5. Methodology phase library (reusable, near-zero-cost boilerplate)
Standard 5–6 phase spine: **Discovery/SRS → Design → Build / Modular Enhancement → Integration & QA → Pilot / UAT → Evaluation & Handover**. Agency variant: **Foundation → Feature phases → Release Readiness**. Store as templates; the generator inserts and lightly tailors.

---

## 6. How this is used at generation time
1. Classify the new lead (template + domain) → pick the **skeleton** (§1) + **methodology** (§5) + **boilerplate** sections (near-zero tokens).
2. **Retrieve** 3–5 most-similar real proposals/sections (same category/domain) as few-shot grounding.
3. Generate only the **project-specific** sections; reuse boilerplate verbatim.
4. Derive the **budget** from scope + duration → role/day mix → rate card → compute (§2d); Global/Local emit a separate Excel, Agency/Design inline.
5. Every **approved** output is added back to the corpus (see the learning loop in `RAG_AI_ARCHITECTURE.md`).

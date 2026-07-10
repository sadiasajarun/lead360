# lead360 ⇄ claude-operations — Integration Map

> How the cloned `claude-operations` toolkit (at `.claude/operations/`) maps onto the lead360 product modules.
> lead360 is essentially the **web product** that productizes this **CLI skill library**. Reuse aggressively.

Source: Riseup Labs internal skill library (cloned operations toolkit). Cloned 2026-06-29 (no nested `.git`). NOTE: the toolkit ships with the template-author's own sample company/client data ("Potential Inc" and its example clients/people/contacts) — that sample data is a **structural reference only** and MUST NOT appear in Lead360 (product, seeds, or generated output). Use Riseup Labs' own database/portfolio as the sole source of real examples.

---

## 1. Skill → Product-Module Map

| lead360 module | Reuse from operations | Status of reuse | Net-new work for lead360 |
|---|---|---|---|
| **Proposal Engine** (interactive, "lively") | `skills/client/proposals/generate-proposal` — 16:9 PPT-style HTML deck, dark lime/purple brand, milestone + feature pricing, auto portfolio slides, example output `[Proposal] Sales Dashboard.html` | **Template + content logic directly reusable** as the proposal renderer | Per-client tokenized link, **inline client commenting**, "moving architecture" animation, demo-request CTA, regeneration-by-prompt |
| **RAG Knowledge Engine** | `skills/internal/kb` — ingest → compile → query wiki (Karpathy pattern); `ask`/`search` commands | Pattern + commands reusable as the retrieval spec | Replace file-grep with a real vector store; ingest from Drive/folders; surface "similar successful projects" into proposal |
| **Readiness / Gap Analysis + PRD** | `skills/client/prd/generate-prd` — 9-agent PRD pipeline, `[💡 Recommended]`/`[📌 Adopted]` TBD markers, live `interview-presenter.html` | The **TBD-marker + readiness gating** logic is the model for our "proposal readiness score + query list" | Convert markers into a numeric readiness score + UI query checklist before generation |
| **Next-Meeting Kit** (summary, highlights, how-to-convince) | `skills/client/meetings/` — `kickoff`, `weekly`, `closing`, `mm` (meeting minutes) HTML generators | Reusable as the post-proposal enablement outputs | Auto-trigger after proposal submit; "how to convince client" generator |
| **Budget + Excel deliverable** | `skills/client/billing/` — `invoice`, `tax-invoice`, `transaction-statement` HTML/PDF | Reusable for the Excel/PDF export side of budgets | Web spreadsheet (Excel-like grid) with per-cell client comments; combined-file output for Agency/Design-Portfolio templates |
| **Riseup Projects dashboard** (search by category + tech stack) | `generate-proposal` portfolio table — ~19 case studies tagged `mobile/web/ai/fintech/erp/...` + tech-stack icon registry | The tag taxonomy + case-study list seed the dashboard | Searchable UI + "add similar project to proposal" action |

---

## 2. The 4 proposal templates (lead360 requirement) vs what exists

The operations `generate-proposal` is **one** template (the toolkit's standard deck — its sample client data is reference-only and must not be reused). lead360 needs **four**: Global, Local, Agency, Design Portfolio — with the rule:
- **Agency & Design Portfolio** → proposal + budget combined in **one** file.
- **Global & Local** → budget **separate** (web spreadsheet → `.xlsx` export).

→ Treat the existing deck as the **base template**; fork it into the 4 variants. The pricing slides (milestone-based + feature-based) already model the budget section needed for the combined-file templates.

---

## 3. Asset gap to resolve before the proposal engine is functional

`generate-proposal` references assets at `.claude/resources/case-studies/...`, `.claude/base/brand/...`, `.claude/resources/brand/team/` — these live in the sibling **claude-base** repo and are **NOT in this clone**. The finished example HTML works only because its images were already base64-embedded.

**Action:** to seed lead360's RAG + proposal portfolio we need the claude-base brand/case-study asset pack (logos, project covers, team photos, tech-stack icons). This is also our **RAG seed data** (the "2-3 flagship past projects" mentioned earlier — actually ~19 are catalogued in the proposal skill).

---

## 4. The delta lead360 adds on top (the genuinely net-new product surface)

The operations decks are **static, self-contained presentations** (`overflow:hidden`, keyboard slide nav, no backend). lead360 adds the live product layer:
1. **Per-client tokenized links** (one for proposal, one for budget) — no-login client view.
2. **Inline commenting** on proposal sections AND budget cells + **request-a-demo** CTA.
3. **"Moving architecture"** animated build-up as the client scrolls.
4. **Regeneration by prompt** for both proposal and budget.
5. **Pipeline/status + analytics** (lead→conversion time, loss reasons) and **management verification gate**.
6. **Roles**: Sales / PM (viewer) / Management / external Client.

---

## 5. Recommended next steps

1. **Generate the lead360 PRD** using `.claude/operations/skills/client/prd/generate-prd` (the tool we agreed to use last session) — feeds straight into `/fullstack-pm` → `/fullstack-dev`.
2. **Obtain the claude-base asset pack** (brand + case studies) to seed RAG and the proposal portfolio.
3. **Fork the proposal template** into the 4 lead360 variants and add the live layer (comments, links, animation).

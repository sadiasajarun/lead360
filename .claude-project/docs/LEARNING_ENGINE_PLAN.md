# Learning Engine — Plan of Record

**Status:** DRAFT for review. **No code until approved.** This supersedes ad-hoc grounding behavior and
sits alongside the regeneration overhaul (`fix.md`).

**Author context:** written after an end-to-end trace of the generation engine (Understand → Decide →
Compose) in response to two observed problems — (a) proposals give wrong timeline/resources (e.g. 20 weeks
for a 4-week job) and (b) "learning" from past projects is not actually applied where estimates are made.

---

## 1. Goals (the requirements this must satisfy)

1. **Take knowledge from the previous database** — past requirement → proposal → budget informs new proposals.
2. **Dynamic, not generic** — every proposal is written for *this* requirement, not a template fill.
3. **Facts correct from learning** — tech stack, budget, architecture, timeline, resources anchored to how
   Riseup actually delivers comparable work.
4. **Regeneration works perfectly** — budget / resource / timeline changes, section fixes, rep prompts and
   client feedback all apply cleanly and cheaply.

**Meta-goal:** a near-perfect first draft → far less regeneration.

### The non-negotiable principle

> **Learn the decisions, not the words.**
> Consistency lives in the *decisions* (tech/team/timeline/approach). Uniqueness lives in the *language*
> (written fresh from this client's requirement). They are produced by two different mechanisms in two
> different layers, so we get **both at once** — never one at the expense of the other.

**Same kind of project → same logic → described in each client's own terms.**

---

## 2. Two channels + the fixed-ness gradient

**Channel A — What & How (learned, structured, anchored).** Decisions and approach retrieved from comparable
past projects as **structured data**, never sentences: stack, team shape, weeks-per-scope, phase structure,
architecture pattern, work approach.

**Channel B — Words (generated fresh, per requirement).** Every section's prose is written new, in the
client's own domain terms, users and pains. It **never reuses past sentences**.

The seam between them is the whole design. Not everything is equally locked:

| Level | What | Source of truth |
|---|---|---|
| **Hard-fixed** | Day rates; the client's *stated* deadline / budget cap | Rate card + current requirement (deterministic) |
| **Strong anchor** | Tech stack, team baseline, weeks-per-scope | Matched cases; AI may add complements within guardrails |
| **Soft guidance** | How to frame / sequence the approach & sections | Comparable cases inform structure |
| **Free** | All actual wording | AI, focused on *this* requirement |

Numbers sit at the top (deterministic). Language sits at the bottom (fresh). **That gradient is the architecture.**

**Anti-generic rule:** *retrieve decisions, not prose.* Pasting past sentences into the prompt is the exact
mechanism that makes proposals sound the same — so grounding moves upstream into the *decisions*, and the
composer receives structured decisions + the current requirement, not text to mimic.

**Fallback:** where learning has no comparable case, the AI writes from its own general knowledge. Hard-fixed
decisions (rates, stated deadline) always come from the deterministic layer regardless.

---

## 3. Current state — what exists vs. the gap

Grounded in the real code (file references for the implementer):

| Concern | Today | Verdict |
|---|---|---|
| Requirement extraction | `understand.service.ts` extracts full Intent incl. `constraints` (deadline can land here) | ✅ good |
| **Requirement → Decide handoff** | Decide prompt (`decide.service.ts:104`) receives only summary/domain/modules/integrations/platforms/scopeSize/projectType. **Drops** constraints, pains, desiredOutcome, userRoles, surfaces, outOfScope | ❌ **root cause of wrong timeline** |
| Timeline & team | AI-guessed phase weeks (`decide.service.ts:134`), team units AI-chosen; days = weeks×5 | ❌ guessed, not learned |
| Budget **rates** | Rate card only, never AI (§10) | ✅ correct by design |
| Budget **magnitude** | rates × guessed weeks × guessed team | ❌ inherited from timeline error |
| Tech stack | Grounded in real `portfolioTech` from comparable projects | ✅ learned |
| Comparable work | Portfolio-grounded, real projects | ✅ learned |
| Architecture | Rule-based topology from intent (`engine.service.ts` `solutionArch`) | ⚠️ deterministic, not learned |
| Overview / scope / journey / handover / approach copy | AI from intent, **no past-proposal grounding** | ⚠️ dynamic but not learned |
| Learned role-days | `recordSamples()` **writes** (`decide.service.ts:151`) but `learnedDays()` is **read only in the legacy `generateBudget`** (`generation.service.ts:1126`) — the main path never consumes it | ❌ **write-only; learning not applied** |
| RAG retrieval | Chunk-level **prose** (`kb.service.ts` `retrieveContext`), soft guidance; returns `[]` if not embedded | ⚠️ prose-level (risks sameness) + fragile |
| Regeneration (numbers) | Deterministic Plan/sheet solver; ~0 tokens | ✅ already Excel-like |

**Takeaways:**
- The proposal is already **requirement-dynamic** (Goal 2 ≈ met).
- Regeneration already works and is cheap (Goal 4 ≈ met).
- Learning is applied to **only 2 sections** (tech, comparables) and **no numbers**; requirement facts are
  dropped before the decision that needs them. **That is the whole gap** (Goals 1 & 3).
- This is **extension within the current architecture, not a rewrite.** The engine is modular blocks +
  grounding hooks + retrieval — exactly the right foundation.

---

## 4. The design

### 4.0 Layer 0 — Requirement intake (close the leak)

- Add an explicit **`timelineWeeks` / deadline** signal to Intent (from `constraints` or a dedicated field).
- Pass **all** extracted requirement facts to Decide: constraints, pains, desiredOutcome, userRoles,
  surfaces, outOfScope — plus the timeline/budget asks as **hard constraints** (top of the gradient).
- Harden `scopeSize` — infer from module/surface counts instead of silently defaulting to `medium`.

### 4.1 Layer 1 — The Project Case store (the heart of learning)

A structured, embedded, keyword-tagged record per past requirement → proposal → budget. Modeled on the
existing `portfolio_projects` pattern (which already carries structured data + embedding + `techStack`).

**New table `project_cases` (schema sketch — design, not final DDL):**

```
project_cases
  id                 uuid pk
  title              text
  category           text            -- Global | Local | Agency | Design Portfolio
  domain             text
  tags               text[]          -- keywords: domain terms, integrations, module names (GIN indexed)
  scope_size         text            -- small | medium | large
  modules            text[]
  stack              text[]
  team               jsonb           -- [{ role, seniority, units }]
  phases             jsonb           -- [{ name, weeks, focus }]
  timeline_weeks     int
  budget_total_cents bigint
  currency           text
  section_structure  jsonb           -- which sections the proposal contained, in order (for adaptive composition)
  source_doc_id      uuid            -- link to the KB document / proposal it was mined from
  embedding          vector(768)
  created_at / updated_at / deleted_at
indexes: GIN(tags), ivfflat(embedding), btree(category)
```

**Ingestion & the requirement↔proposal relation.** Extend the existing structured extractor (`kb.service`
insights call already pulls facts and is told to *never invent* pricing/roles/dates) to emit these fields for
each **paired** requirement + proposal + budget, then embed.
- **Generated leads:** the pairing already exists in-app (a Lead has both a requirement and a proposal), so
  appending a case on *proposal-passed / lead-accepted* is clean.
- **Seed corpus:** the pairing must be *established during ingestion* — match a requirement doc ↔ its proposal
  ↔ its budget for the same project. A mismatched pair teaches wrong norms, so this is a real, careful task.
- One-time backfill + incremental on every new passed lead (feeds both the case store and the Norms layer).

**Retrieval (hybrid — this is why keywords matter).**
- **Embeddings** catch semantic similarity ("ticketing" ≈ "booking").
- **Tags/keywords** catch exact domain terms embeddings blur ("bKash", "tournament", "wallet", "Moodle").
- Query = category filter + tag overlap + vector similarity → **top-K matched cases**.

### 4.1a Layer 1b — The Norms layer (parametric estimation by size)

The case store answers "how was a *similar* project done." The **Norms layer** answers "what do projects
*of this size* typically need." Two estimators, combined, beat either alone — the norm is a stable central
tendency that scales with size; the analog captures project-specific structure.

This **generalizes the existing `EstimateService.band()`** — which already mines a *budget* band by
category + scope size — to the **full set** (weeks, phases, team ratios, resources) and to **finer buckets**.

**Derived aggregates over `project_cases`**, bucketed by `category + scope_size + module-count band +
integration-count band`:

```
project_norms (derived — materialized view or computed on read)
  bucket_key         text            -- e.g. "Local|medium|modules:5-8|integrations:2-4"
  sample_count       int             -- how many cases back this norm (confidence)
  weeks_per_module   numeric         -- median
  budget_per_module_cents numeric    -- median, per currency
  team_ratio         jsonb           -- median role mix, e.g. {BE:2, FE:1, QA:1, PM:0.5}
  phases_typical     int             -- median phase count
  weeks_p50 / p25 / p75  numeric     -- distribution, not just a point
  budget_p50 / p25 / p75 cents       -- distribution
```

**Confidence guard:** use a norm only above a **minimum `sample_count`** (e.g. ≥ 5). Below it → fall back to
analogs, then heuristic. Always surface the sample count so an estimate is explainable ("sized against N
comparable projects").

**Size metric:** never module-count alone (a payments module ≠ a settings module). Size = **module count +
scope_size + integration count** combined. A norm bucket keys on all three.

### 4.2 Layer 2 — Decide resolves numbers: Norm → Analog → Requirement

Deterministic resolution order for every number (timeline, team, budget):

1. **Norm baseline** — parametric prior for this size bucket (stable, scales with size).
2. **Analog nudge** — adjust toward the top-K nearest cases (captures this kind of project's real shape).
3. **Requirement override** — the client's *stated* deadline / budget / team asks win outright (hard-fixed).
4. **Sanity flag** — if Norm and Analog diverge wildly, mark it as a possible under/over-scope for the rep.

**Template scoping (implemented 2026-08-18):** same-category is prioritised, with a currency-safe fallback:
- **Budget** → STRICTLY same template **+ same currency**, never borrowed (BDT ≠ USD). Thin → no budget norm (rate card + estimate band take over). Analog budgets are shown only when the analog's currency matches the lead's.
- **Timeline / team-shape / stack / approach** → same template first; if same-template samples are thin (< 5), widen ACROSS templates (currency-independent) as a **lower-confidence, clearly-flagged** fallback (`crossTemplate: true`). So a Global proposal borrows Local/Agency *shape* when Global is sparse, but its money stays Global+currency.

Then:
- Build a **Decision Brief** from the resolved values + most-common stack + typical phase structure.
  **Structured, not prose.**
- The AI proposes **within these bounds**, never freely.
- **Wire `learnedDays()` back in** as a role-days baseline (currently write-only).
- Numbers are **owned by the deterministic layer** (norms + cases + rate card + Plan solver); the AI never
  sets them. Extends the principle the budget already follows for rates.

### 4.3 Layer 3 — Compose writes fresh, grounded in decisions not prose

- Compose receives the **Decision Brief + the current requirement** — and is instructed to write every
  section in the client's own domain terms.
- **Reduce raw-prose grounding** in the composer (it causes sameness). Grounding lives upstream in decisions.
- Widen learning from 2 sections to **all** sections — but as *approach/structure* anchors, not sentences.

### 4.4 Layer 4 — Adaptive composition (sections flex to the requirement)

- Section plan (`architect()`) becomes driven by **the requirement + what comparable cases contained**
  (`section_structure`), not a fixed template rule — so sections are added/dropped as the project needs.
- **New generic content-section block** so a genuinely novel required section (e.g. "Compliance & Security
  Controls" for a fintech RFP) can be produced even if it's outside the standard catalog.

### 4.5 Layer 5 — The learning loop (compounding)

- When a rep **edits** a proposal's team/weeks/budget by hand (`budget.edited`) or a lead is **accepted**,
  upsert/refresh that lead's `project_case`. The system learns from **human corrections** over time —
  every corrected proposal makes the next similar one better. This elevates the primitive `learnedDays`
  mechanism to case level *and actually reads it back*.

### 4.6 Regeneration — confirmed unchanged (already correct)

Numeric directives ("make it 4 weeks", "budget $80k") stay **Excel-like**: one tiny intent-parse call, then
deterministic recompute on the budget sheet (Plan solver). Content/wording regens use one targeted call.
The dual-channel design changes *first-generation quality*, not the regeneration mechanics — which already work.

### 4.7 Layer 6 — Diagram Rendering (same principle, applied to visuals)

**Problem:** diagrams don't reach the reference quality (branded, card-based, icon-rich, tone-grouped,
legend'd — see the three target references). Root cause: the `diagram` block renders **AI-written
Mermaid/D2 specs via Kroki** (`DiagramService.render()` → external Kroki) — a generic layout engine that
**cannot** produce the house infographic style, no matter how detailed the AI's instructions.

**Key correction:** no 3rd-party renderer draws *exactly* our style — only a renderer we own does. The
"exactness" comes from **owning the drawing code**, not from the AI's instructions being detailed.

**The same principle as the whole plan — AI decides, deterministic layer owns the output:**

> **AI owns semantics (the "what"). The renderer owns aesthetics (the "how"). Never make the AI describe pixels.**

If the AI emits positions/colors/sizes, it's fragile, wastes tokens, and two similar diagrams look
*different*. The AI emits only meaning; the **same house renderer** draws every diagram → they all look
like one system (the consistency Mermaid and image-gen can't give). Image generation is ruled out entirely
(garbled text, off-brand, non-editable, non-deterministic — fatal for a proposal).

**Three layers, clear ownership:**

| Layer | Owns | Produces |
|---|---|---|
| **1. LLM (learned)** | Semantics — the "what" | A **structured spec**: archetype + nodes (icon keyword + label) + groups + typed edges. Grounded in the chosen stack + comparable projects (Channel A). Not pixels, not Mermaid, not an image. |
| **2. Deterministic layout** | Positioning — the "where" | Clean node positions + edge routing (template-per-archetype; a layout lib like ELK/dagre only for complex graphs) |
| **3. House renderer (already own it)** | Aesthetics — the "how" | Exact cards, icons, tone palette, chips, legend in SVG/React we control (extends today's `solutionArchitecture` renderer) |

**We already own Layer 3** — it draws `solutionArchitecture`/`numberedFlow` today, and it *is* the style of
the reference Diagram 1 & 2. The work is **extending** it, not adding a dependency.

**Spec contract (what the AI emits — example):**

```json
{ "archetype": "pipeline", "title": "Document Ingestion & Embedding Pipeline",
  "steps": [ { "n": 1, "title": "Sources", "desc": "Documents, PDFs, URLs…",
               "icon": "document", "tone": "blue", "footer": "Multiple data sources" } ],
  "edges": [ { "from": 1, "to": 2, "label": "raw", "kind": "processing" } ],
  "branches": [ { "from": 4, "to": "doc-store", "label": "store vectors" } ] }
```

**Archetype library (map to the references):**

| Reference | Archetype | Status | Effort |
|---|---|---|---|
| Diagram 1 — High-Level System Architecture | `solutionArchitecture` (grouped containers, typed edges, legend) | **Engine exists** | Polish: richer icons, edge routing, legend — moderate |
| Diagram 2 — Ingestion Pipeline | `numberedPipeline` (footer chips + branch-out store cards) | Base exists (`numberedFlow`) | Extend layout — moderate |
| Maintenance Flow — lifecycle swimlane | `swimlane` (sub-cards notify/confirm, section bands, decision diamonds) | Not built | **Large / deprioritized** (reads as internal-ops, rarely needed in a client proposal) |

**Scope of work:**
1. **Retire Mermaid/Kroki for hero diagrams** (keep only, if at all, for throwaway ad-hoc flows).
2. **Curated icon library** — keyword-mapped inline SVG (lucide + devicon + a few custom).
3. **Archetype templates + deterministic auto-layout** — renderer computes positions/edge routing so it's
   always clean regardless of node count.
4. **Tone palette + typed connectors + legend** — standardized so every diagram reads as one system.
5. **AI spec contract** — the JSON above per archetype; the AI chooses the archetype and fills it.

**Where a "3rd party" legitimately fits (narrow — never styling):** layout math (ELK/dagre) and icon assets
(lucide/devicon). Style stays 100% ours.

**Diagram decisions (need your call):**
- **D1** Retire Mermaid/Kroki for hero diagrams (yes / keep as fallback)?
- **D2** Scope — Diagram 1 + 2 archetypes only, or include the full lifecycle swimlane?
- **D3** Icon source — extend lucide/devicon, or commission a custom brand icon set?

---

## 5. Phasing

| Phase | Scope | Cost | Delivers |
|---|---|---|---|
| **0 — Verify data (blocking)** | Confirm the corpus is embedded (the `synchronize=true` wipe trap) and that requirement+proposal+budget are **paired**. Console check: is `grounding` non-empty during a generation? | ~0 | Proof learning has fuel. **Nothing else works until this passes.** |
| **1 — Close the leak** ✅ **IMPLEMENTED 2026-08-17** (pending runtime verification) | Pass all requirement facts + stated timeline to Decide; wire `learnedDays` back; harden `scopeSize` inference. *(Deterministic timeline hard-scale deferred to Phase 2 — Phase 1 makes the AI right-size to the stated timeline rather than crudely scaling weeks, which would break the effort/team/time relationship.)* | **0 extra AI tokens** | Kills the "20 weeks" bug at the source; cuts regenerations |
| **2 — Case store + Norms layer (the real fix)** — **2a ✅ 2b ✅ 2c-core ✅ (2026-08-17)** | `project_cases` (tagged, embedded, `{synchronize:false}`) + `normStats` computed-on-read + `ingest:cases` backfill + hybrid retrieval + `decisionBrief` (Norm baseline + nearest Analogs) fed into Decide as structured anchors (requirement/stated-timeline overrides). **Deferred (structure-changing, lower value):** adaptive composition, generic section block, Compose-grounding widening. | new table + one embed per case/gen | Accurate, **size-calibrated** timeline/team/budget anchored to real deliveries |
| **3 — Learning loop** ✅ **IMPLEMENTED 2026-08-17** | `@OnEvent('lead.locked')` → `ingestLead` — every WON lead (re)ingested into the case store (highest signal). Decoupled via the existing event; best-effort. | ~0 | Compounding improvement from every won deal |
| **4 — Diagram rendering** — **core ✅ IMPLEMENTED 2026-08-17** | **Done:** retired the Mermaid/Kroki `diagram` block (removed from architect plans + compose prompt → token savings); hero diagrams now use only the house-style `solutionArchitecture` (= reference Diagram 1) + `numberedFlow`. **Remaining (visual iteration, needs app running):** the exact Diagram-2 pipeline archetype renderer (footer chips + branch cards) + icon-set expansion. | small AI spec (no image gen) | On-brand house diagrams; generic Mermaid gone |

*(Phases 1–4 are independent enough to sequence by priority; Diagram rendering can run in parallel with the learning phases since it shares only the "AI decides, deterministic renders" principle.)*

### 5.1 Phase 0 — FINDINGS (verified 2026-08-17, live Neon DB, read-only)

**Result: PASS — learning has fuel; proceed. Two nuances reshape Phase 2's data strategy.**

- ✅ **RAG is fully alive** — `kb_chunks` 2096/2096 embedded (100%), `portfolio_projects` 64/64 embedded.
  kb_chunks' `{ synchronize:false }` protection held despite the sync flag.
  **→ The "20 weeks" bug is NOT empty embeddings — it's the architectural gaps (Decide drops the timeline,
  `learnedDays` write-only, soft grounding). Phase 1 is confirmed the correct, high-impact first fix.**
- ✅ Supporting data present: `rate_cards` 52 rows, `historical_projects` 31 (estimate-band fuel),
  `role_day_samples` populated (learnedDays *has* data to read once wired).
- ⚠️ **Seed-corpus triples are thin** — 127 proposals but only ~18 requirements + 7 budgets across categories
  (Global 31p/6r/3b, Local 60p/5r/4b, Agency 34p/7r/0b, Design Portfolio 2p/0/0). Full requirement↔proposal↔
  budget triples from the *seed* alone are few.
- ✅ **The app's own data is the real goldmine** — **59 leads already have BOTH a requirement AND a proposal**
  (plus auto-generated budgets) → ~59 near-complete in-app triples *now*, growing with every lead.
  **→ Phase 2 should bootstrap `project_cases` primarily from in-app generated/accepted leads, seed corpus
  secondary. This makes the Phase 3 learning loop central, not just "ongoing."**
- ⚠️ **Data-starved buckets** — Design Portfolio (2 proposals, no req/budget) and Agency (no budgets) →
  norms unreliable there → the min-`sample_count` guard falls back to analogs/heuristics.
- ⚠️ **`DATABASE_SYNCHRONIZE=true` against Neon is a standing hazard.** Not damaging now (kb protected,
  portfolio self-heals), but **Phase 2's new pgvector entities MUST be `{ synchronize:false }` + migration**,
  and we should switch to `synchronize:false` + migrations before Phase 2.

---

## 6. How this satisfies each requirement

- **(1) Knowledge from DB** → Project Case store + Norms layer + hybrid retrieval (Phase 2), fueled by Phase 0.
- **(2) Dynamic, not generic** → already met; *strengthened* because prose is fresh-from-requirement and we
  deliberately **don't** feed past sentences.
- **(3) Facts correct** → numbers move to the deterministic layer (**Norm→Analog→Requirement** resolution +
  rate card + Plan solver); tech/comparables already correct; timeline/team/budget-magnitude fixed by
  Phases 1–2 and **calibrated to project size** by the Norms layer.
- **(4) Regeneration** → already works; unchanged.
- **A + B together** → guaranteed by construction: determinism gives consistency, fresh composition gives
  uniqueness, and they live in different layers so they never trade off.
- **Diagrams** → same principle: AI emits a structured spec, the house renderer owns the pixels → exact
  reference quality, consistent across every proposal, editable and PDF-safe.

---

## 7. Token / cost impact

- Phase 1: **no extra AI calls** (richer prompts, deterministic wiring).
- Phase 2: one embedding per case at ingestion (cheap, one-time + incremental); retrieval adds one small
  embed per generation (already happening). Compose grounding **shrinks** (less prose).
- Better first drafts → **fewer regenerations** → net token *reduction*. The regeneration token savings
  already shipped stay intact.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Corpus not embedded / not paired | **Phase 0 is blocking** — verify before anything |
| Thin corpus for a niche → weak match | Graceful fallback to AI general knowledge; band/heuristic as backstop |
| **Norm from too few samples** → misleading estimate | Min `sample_count` guard (e.g. ≥ 5); below it use analogs → heuristic; always surface the sample count |
| **Bad size metric** → norms drift | Size = module count + scope_size + integration count (never module count alone) |
| **Mismatched requirement↔proposal pair** teaches wrong norms | Careful pairing at ingestion; prefer accepted/won leads as higher-signal sources |
| LLM still varies the numbers | Take numbers **off** the AI — deterministic priors + rate card own them |
| Prose sameness | Retrieve **decisions not prose**; compose from the requirement; mild sampling variety |
| Novel required section | Generic content-section block |
| Over-fitting to one big past project | Use top-K aggregate (median/most-common), not a single case |

---

## 9. Open decisions (need your call before Phase 2)

1. **Case granularity** — one case per past proposal, or merge near-duplicates?
2. **Prior strength** — how hard should the Norm→Analog priors bind vs. how much latitude the AI gets to adjust?
3. **Norm minimum sample count** — the confidence threshold below which we ignore the norm (default ≥ 5)?
4. **Size metric weighting** — how to weight module count vs. scope_size vs. integration count in the bucket key?
5. **Generic block** — build the open-ended section block now (Phase 2) or defer?
6. **Learning loop trigger** — learn on *every* human edit, or only on **accepted/won** leads (higher signal)?
7. **Diagrams (D1)** — retire Mermaid/Kroki for hero diagrams, or keep it as a fallback?
8. **Diagrams (D2)** — scope to architecture + pipeline archetypes only, or include the full lifecycle swimlane?
9. **Diagrams (D3)** — extend lucide/devicon icons, or commission a custom brand icon set?

---

## 10. Non-goals (explicitly out of scope for now)

- Rebuilding the engine or the block renderer (not needed — this is all extension).
- **AI-generated diagram *images*** (image-gen is ruled out — garbled text, off-brand, non-editable). Diagrams
  stay AI-spec → deterministic house renderer (§4.7).
- The full lifecycle **swimlane** archetype (deprioritized unless proposals genuinely need it).
- Changing the regeneration mechanics (they already work).

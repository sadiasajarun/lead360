# Lead360 — RAG + AI Architecture (cost-efficient, self-improving)

> Goal: **best proposal/budget output with the fewest wasted tokens**, and a system that **keeps learning** — from the database, from every new (approved) generation, and from how users edit/prompt/win. Spend tokens where they buy quality; never spend them re-doing work the system already "knows". Grounded in `DATABASE_KNOWLEDGE.md`.
> Models: Anthropic **Claude** — Opus 4.8 (hard synthesis), Sonnet 4.6 (drafting), Haiku 4.5 (cheap classify/extract/estimate). Store: **PostgreSQL + pgvector**. Uses **Anthropic prompt caching** heavily.

> ⚠️ **AS BUILT (2026-07-09): the model plan above was NOT implemented.** The running system uses
> **OpenAI `gpt-5.4`** for all generation + **`text-embedding-3-small`@768** for all RAG, one model for
> everything (no tiering, no prompt caching yet). Measured ≈ **$0.12/lead (~$13/month)** — cheap enough
> that tiering isn't worth its complexity at current volume. The pgvector store, grounding, budget-math-
> in-code, and learning-loop parts of this doc ARE built as described. Current model state, measured
> costs, and the switch procedure: **`AI_MODEL_GUIDE.md`** (authoritative for the AI layer).

---

## 1. Three knowledge stores (separate on purpose)
1. **Structured KB (scaffold)** — the compact, hand/auto-compiled recipes from `DATABASE_KNOWLEDGE.md`: skeletons per template, section guidance, methodology spine, **boilerplate sections** (Complimentary Support, Acceptance, Out-of-Scope), the **rate card**, department/role taxonomy, tech-stack library. Small + stable → lives in a **cached system prompt** (pay once, reuse ~free).
2. **Vector store (retrieval corpus)** — every proposal/budget/requirement chunked + embedded, tagged `{category, template, domain, section, project, outcome}`; plus every **approved** new generation and portfolio case study. Used for **few-shot grounding**, not bulk stuffing.
3. **Structured tables (facts)** — `rate_card`, `role_taxonomy`, `proposal_template`, per-role learned day-estimates. Budget math runs in **SQL/code, not the LLM**.

The split matters for cost: the LLM never "reads" the whole DB — the scaffold is cached, retrieval returns a few relevant chunks, and numbers come from tables.

## 2. Ingestion pipeline (one-time seed + continuous)
`parse (docx/xlsx/pdf) → normalize → chunk (section-aware) → embed → upsert(pgvector, metadata)` and, in parallel, **extract structured facts** (skeletons → `proposal_template`, budget rows → `rate_card`/role-day samples). Embeddings are **cached by content hash** (never re-embed unchanged text). Runs once over the 39 files, then incrementally on every new approved doc + portfolio sync.

## 3. Retrieval (token-lean by design)
1. **Metadata pre-filter** first (template=Global, domain=fintech) → shrink the candidate set before any vector math.
2. **Hybrid** BM25 + vector, small **top-K (3–5)**, then a cheap **rerank** (Haiku or a reranker) → keep only what's actually relevant.
3. Retrieve **sections, not whole documents**. Never pass a full proposal when one section will do.
4. Cache retrieval results per (lead, section) so regeneration doesn't re-retrieve.

## 4. Generation (structured + deterministic where possible)
- **Deterministic scaffolding**: section list + order + **boilerplate** come from the KB, not the model. The LLM fills only **project-specific** sections. Boilerplate (methodology spine, Complimentary Support, Acceptance, Out-of-Scope) is inserted **verbatim** → 0 generation tokens.
- **Structured output (JSON)** per section → rendered deterministically into the branded HTML/PDF. No re-prompting for formatting.
- **Prompt caching**: the big static block (scaffold + template + few-shot examples) is marked cacheable → repeat calls (and every section of the same proposal) hit the cache at ~10% cost.
- **Model tiering** (spend to match difficulty):
  - **Haiku**: classify lead → template/domain; readiness scoring + gap questions; budget role/day **estimation**; extraction; short rewrites.
  - **Sonnet**: draft the project-specific proposal sections.
  - **Opus**: only the hardest synthesis (novel domain, low retrieval confidence) or final polish — invoked conditionally, not by default.
- **Delta regeneration**: "Regenerate proposal/budget" (or a prompt like *"tighten the exec summary"*) re-generates **only the targeted section**, diffed against the current version — not the whole document. Cheapest possible edit.
- **Budget generation is mostly code**: LLM (Haiku) returns a small JSON of `{role, count, days}` inferred from the scope+duration; **the app computes** Unit/subtotals/total from the `rate_card` (see `DATABASE_KNOWLEDGE.md` §2). Currency conversion, formulas, Excel export = deterministic. → cheap and exact.

### Generate budget for existing DB proposals (your ask)
Any proposal already in the database (or newly generated) → parse its scope/phases + duration → Haiku maps to the role/day mix → rate card → compute the FIFA-structured budget (separate Excel for Global/Local, inline for Agency/Design). Where the proposal **already has** a budget, we store the (scope → role-days) pair as a **training example** so future estimates get sharper.

## 5. The learning loop ("loop engineering")
```
        ┌────────────── seed ──────────────┐
        │  39 DB files + portfolio → KB + vectors + rate_card
        ▼
   [ Generate ] --uses--> KB (cached) + retrieval (few-shot) + rate_card
        │
        ▼
   [ Human in loop ]  Sales edits · Admin approves/rejects · client wins/loses
        │   capture signals ▼
   [ Learn ]
     • APPROVED proposal/budget → add to vector corpus as a NEW gold example (+ metadata, outcome)
     • EDITS → diff(generated, final) → learn corrections (what humans always change → fix the scaffold/prompt)
     • WIN/LOSS → re-weight retrieval (promote patterns that win; down-weight lost ones) + record loss reasons
     • PROMPT patterns → common regeneration prompts become reusable "moves"; frequent asks fold into defaults
     • READINESS gaps → recurring missing inputs tighten the intake questions
        │
        ▼
   [ Distill ]  periodically compress accumulated learnings into UPDATED compact templates/recipes
                (KB grows in QUALITY, not token size — the cached scaffold stays small)
        └──────────── feeds next Generate ────────────┘
```
- **Always learning:** every approved output and every human edit feeds back. The corpus grows; the scaffold is **re-distilled** (not just appended) so retrieval + prompts get better without getting bigger.
- **Increase knowledge, don't bloat cost:** new knowledge lives in the vector store (retrieved only when relevant) or is distilled into the compact cached scaffold — so per-generation token cost stays flat as knowledge grows.
- **Evaluation drives the loop:** track **edit-distance (generated → final)**, approval rate, win rate, tokens/proposal. These are the reward signals; the loop optimizes them (better retrieval, better defaults, less regeneration).

## 6. Token-cost controls (summary)
| Tactic | Saves |
|---|---|
| Cached scaffold (skeleton, guidance, boilerplate, few-shot) | Static context billed ~once, not per call |
| Retrieval (small top-K, section-level) not full-doc stuffing | Avoids passing whole documents |
| Boilerplate reused verbatim from KB | 0 tokens for ~40% of a proposal |
| Deterministic budget math (SQL/code) | LLM only does a tiny estimate call |
| Structured JSON output | No formatting re-prompts |
| Model tiering (Haiku→Sonnet→Opus) | Right-sized spend per task |
| Delta regeneration (section-only) | Edits cost a fraction of a full run |
| Embedding cache (content-hash) | No re-embedding unchanged text |
| Distillation (compress, don't append) | Flat cost as knowledge grows |
| Conditional Opus (only low-confidence/hard) | Premium model used rarely |

## 7. Data model additions (for dev)
`kb_document` (source file/section metadata) · `kb_chunk` (text + `embedding vector`, hash, metadata) · `rate_card` (department, role, type, day_rate, currency) · `role_day_sample` (learned scope→role-days) · `proposal_template` (category → section list + boilerplate refs) · `generation` (lead, versions, model, tokens, section JSON) · `feedback` (approval, edit_diff, win/loss, loss_reason, prompt) · `learning_snapshot` (distilled scaffold versions).

## 8. Guardrails
- Numbers (budget totals, rates) are **computed, never hallucinated**; the LLM proposes structure/estimates, code does arithmetic.
- Retrieved examples are **grounding, cited internally** (traceable to a source file) — no fabricated "past projects".
- Low retrieval confidence → escalate model tier and flag for human review rather than guess.

---

### Bottom line
The database is turned into a **cached scaffold + a retrieval corpus + fact tables**. Generation reuses the scaffold and boilerplate for free, retrieves only a few relevant sections, computes budgets deterministically, and sizes the model to the task. Every approved output and human edit feeds a **distillation loop** so quality compounds while **per-generation token cost stays flat**. This is the build target for `/fullstack-dev`.

# Lead360 — Backend & DevOps Architecture

> Goal: a **document- and data-heavy**, **ERP-grade** system that is **accurate, bug-free, smooth**, and **cost-effective**. Grounds the repo's NestJS rules, `RAG_AI_ARCHITECTURE.md`, and `BUDGETING.md`. This is the build target for `/fullstack-dev`.

Lead360 ingests many source documents (proposals, budgets, requirements, portfolio), turns them into a RAG corpus, and generates + exports branded PDF/Excel per lead. So the backbone is: **relational data + a vector store + object storage + background workers**, sized for low cost and high correctness.

---

## 1. Backend stack (recommended)

| Layer | Choice | Why |
|---|---|---|
| Runtime / framework | **NestJS + TypeScript** (4-layer: Controller→Service→Repository→Entity) | Mandated by repo rules; structured, testable, DI, first-class validation. |
| ORM | **TypeORM** + migrations | Repo standard; migrations = safe schema evolution. |
| Primary DB | **PostgreSQL 16** | One database for relational + JSON + vectors. ACID = accurate money/approvals. |
| Vector store | **pgvector** (extension in the same Postgres) | No separate vector DB (Pinecone/Weaviate) → far cheaper; embeddings live next to the data, one backup, one connection. HNSW index for fast top-K. |
| Object storage | **S3-compatible — Cloudflare R2** (or Backblaze B2) | Source docs + generated PDF/Excel. R2 has **zero egress fees** — critical when users download documents constantly. Adapter pattern (`IFileStorageService`) so S3/R2/local are swappable. |
| Cache / queue broker | **Redis** | Retrieval cache, prompt-cache metadata, sessions, rate-limit buckets, and the job queue. |
| Background jobs | **BullMQ (on Redis)** | Ingestion, embedding, generation, PDF/Excel export, (disabled) email all run off the request thread → API stays snappy. |
| Doc parsing | `mammoth` (docx→text), `exceljs` (xlsx), `pdf-parse`/`unstructured` (pdf) | Extract text + structure for the RAG pipeline. |
| Generation | **AS BUILT: OpenAI `gpt-5.4`** (single model, no tiering; ≈$0.12/lead measured — see `AI_MODEL_GUIDE.md`). *Original plan: Anthropic Claude tiered Haiku→Sonnet→Opus + caching — not implemented.* | Estimates only; **math is code**. |
| Exports | **ExcelJS** (budget .xlsx with live formulas), **Puppeteer** (proposal PDF, native ToC) | Deterministic, branded outputs. Puppeteer runs in the worker, not the API. |
| Realtime (if needed) | Socket.IO gateway | Only if the PRD keeps live generation progress / presence. |
| Auth | JWT in **httpOnly cookies**, RBAC (Sales/PM, Admin) | Per repo security rules; no localStorage tokens. |

### Data model (adds to the RAG tables in `RAG_AI_ARCHITECTURE.md`)
Relational: `user`, `lead`, `requirement`, `proposal`, `proposal_version`, `budget`, `budget_line`, `milestone`, `approval`, `feedback`, `project`, `document_delivery`, `audit_log`, `rate_card`, `role_day_sample`. Vector: `kb_document`, `kb_chunk(embedding vector)`. All extend BaseEntity (UUID, timestamps, soft-delete).

---

## 2. Document & data handling pipeline

```
Upload (docx/xlsx/pdf) ──▶ Object storage (R2)  ── metadata row (kb_document)
        │
        ▼  (BullMQ job)
   parse → normalize → section-aware chunk → embed (cached by content-hash) → upsert pgvector
        │                                            └─ extract facts → rate_card / role_day_sample / proposal_template
        ▼
   Ready for retrieval (metadata pre-filter → hybrid BM25+vector top-K → rerank)
```
- **Files never touch the DB as blobs** — only in object storage; Postgres holds paths + metadata + extracted text/chunks.
- **Embeddings cached by content hash** — never re-embed unchanged text (big cost saver on re-sync).
- **Generated outputs** (PDF/Excel) are also stored in R2, referenced by `proposal_version`/`budget`; downloads are presigned URLs (zero egress on R2).
- **Ingestion + generation are jobs**, so a 30-file re-sync or an Opus generation never blocks a request.

---

## 3. Accuracy, correctness & "ERP-smooth" (bug-free by construction)

Money and approvals must be exact — these are the non-negotiables:

- **Money as integers.** Store all amounts in **minor units (cents)** as `bigint`, rates as `numeric(10,2)`. Never use JS floats for currency. Budget math (`Unit = No.ofUnit × Days × Rate`; dept = Σ lines; total = Σ depts; contingency/discount/VAT) runs **in code/SQL, deterministically** — the LLM only proposes the role/day mix (see `BUDGETING.md`). Currency conversion happens once, at the display/export edge, from a stored FX rate on the budget (so a saved budget never silently changes value).
- **Transactions.** A generation that writes proposal + budget + feedback commits **atomically** (one DB transaction) — no half-saved leads.
- **Idempotency.** Generation, ingestion, export, and any webhook accept an **idempotency key** → no double-embed, no duplicate budget, no double-charge of tokens on retry.
- **Optimistic concurrency.** `version` column on `budget`/`proposal`; a stale save is rejected (409) → two people editing a budget can't silently clobber each other (the prototype's live editor maps to this).
- **Validation everywhere.** `class-validator` DTOs on all input; DB constraints (FKs, checks, unique); enums not free strings. Reject bad input at the edge.
- **Approval integrity.** Every approve/reject/edit writes an immutable `audit_log` row (who, what, when, before→after). Approval is a **hard gate**: a lead can't be delivered until `approved` (state machine enforced in the service, mirroring the prototype's Generated→Pending→Approved→Sent→Locked/Lost).
- **Deterministic outputs.** Structured JSON from the LLM → rendered by code into HTML/PDF/Excel. No re-prompting for formatting → stable, reproducible documents.
- **Testing** (repo gates): Jest unit tests on the pure functions (budget calculator, currency, scope→role mapper, field mappers) with **golden totals**; Supertest e2e per endpoint (happy + auth + validation + not-found); a contract test that the frontend types match backend DTOs. The budget calculator gets property-based tests (totals always reconcile: Σ lines = Σ dept subtotals = grand).
- **Guardrails on AI.** Numbers never hallucinated; low retrieval confidence → escalate model tier + flag for human review; every retrieved example is traceable to a source file.

---

## 4. DevOps & hosting — cost-effective, three tiers

Pick by stage; all keep egress and idle cost low.

### Tier A — Lowest cost / full control (recommended MVP)
- **One VPS** (Hetzner CPX21/CCX — ~€8–25/mo) running **Docker Compose**: NestJS API, worker, Postgres+pgvector, Redis, **Caddy** (auto-TLS reverse proxy). Files on **R2** (pay-per-use, ~$0.015/GB, no egress).
- Total: **~$15–35/mo** + AI tokens + a few $/mo storage. Cheapest, and everything is one `docker compose up`.

### Tier B — Managed convenience (recommended once live)
- **Supabase** (managed Postgres **with pgvector + object storage + auth** in one) **or Neon** (serverless Postgres, **scales to zero** → cheap when idle) + **R2** for files.
- **API + worker** on **Railway / Render / Fly.io** (small always-on instances).
- Upstash Redis (serverless) for the queue.
- Total: **~$25–70/mo** at low volume; almost no ops. Supabase is the strongest single-vendor fit for a document-heavy app (Postgres+pgvector+storage+auth together).

### Tier C — Scale-out (later)
- Managed Postgres with a **read replica** (retrieval reads off the replica), horizontal API + worker instances, object storage behind a CDN, pgvector HNSW tuned or migrate hot vectors to a dedicated index only if needed.

### Cross-cutting DevOps
- **CI/CD:** GitHub Actions — lint → test → build → run TypeORM migrations → deploy. Preview envs per PR (Railway/Render/Fly support this).
- **Migrations:** TypeORM, run automatically on deploy; never hand-edit prod schema.
- **Config/secrets:** 12-factor env vars; a secrets manager (Infisical/Doppler — free tiers) or the platform's env store. `.env.example` complete (repo gate).
- **Observability:** **Sentry** (errors + perf), **pino** structured logs, Postgres slow-query log, **UptimeRobot/BetterStack** (free uptime + status page). Track the AI cost signals from `RAG_AI_ARCHITECTURE.md` (tokens/proposal, edit-distance, approval/win rate) on a small dashboard.
- **Backups:** managed PG auto-backups (Tier B) or nightly `pg_dump` → R2 (Tier A); R2 object versioning on; test restores quarterly.
- **Security:** httpOnly+secure+sameSite cookies; helmet; per-IP + per-user rate limits (Redis); presigned URLs with short TTL for document downloads; least-privilege R2 keys; dependency scanning in CI.

---

## 5. Cost-control levers (money-heavy on tokens + storage, so:)
| Lever | Saves |
|---|---|
| **R2 / B2 object storage (zero egress)** vs S3 | Document downloads don't rack up egress bills |
| **pgvector in the app DB** vs managed vector DB | No extra $70–100+/mo vector service |
| **Neon scale-to-zero / single VPS** | Near-zero idle compute cost |
| **Embedding cache (content-hash)** | Re-sync doesn't re-embed unchanged files |
| **Model tiering + prompt caching** (RAG doc) | Opus used rarely; static scaffold billed ~once |
| **Deterministic budget math in code** | LLM does a tiny estimate, not arithmetic |
| **BullMQ batching** (embeddings/exports) | Fewer, larger API calls |
| **Delta regeneration** (section-only) | Edits cost a fraction of a full run |

---

## 6. Recommended pick (opinionated)
**Start Tier A** (Hetzner + Docker Compose + R2) for the lowest bill and full control during build; **graduate to Tier B** (Supabase _or_ Neon + R2, API/worker on Fly/Railway) the moment you want managed backups, zero-ops scaling, and preview envs. Both keep pgvector in Postgres, files in zero-egress object storage, and heavy work in BullMQ workers — which is what makes Lead360 accurate, responsive, and cheap while handling lots of documents.

> Bottom line: **NestJS + Postgres/pgvector + R2 + Redis/BullMQ + OpenAI `gpt-5.4`** (as built — see `AI_MODEL_GUIDE.md`), money in integer cents with deterministic calculators, transactions + idempotency + optimistic locking for correctness, and Hetzner→Supabase/Neon for cost-effective, low-ops hosting.

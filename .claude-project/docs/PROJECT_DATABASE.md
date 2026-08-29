---
prd_hash: "29c34d6e6690430554b6addcf0aafd9c9f04410787eb4ba99f6936dfc6714f2d"
prd_version: v13
generated_at: "2026-07-06"
phase: D2-tech-spec
---

# Lead360 — Database Spec (D4 builds from this)

PostgreSQL 16 + **pgvector**. TypeORM, UUID PKs, snake_case columns, **soft delete** (`deletedAt`). Every entity **extends `BaseEntity`** (`src/core/base/base.entity.ts` → id, createdAt, updatedAt, deletedAt). **Money is stored as integer minor units (cents)** in `bigint` columns (serialised as strings in JSON to avoid precision loss); FX rate as `numeric`. pgvector embedding columns are **768-dim with HNSW cosine indexes** (`kb_chunks.embedding`, `portfolio_projects.embedding`). Deep domain facts: `DATABASE_KNOWLEDGE.md`, `RAG_AI_ARCHITECTURE.md`, `BUDGETING.md`, `BACKEND_DEVOPS.md`.

## Enums
- `user_role`: `sales_pm` | `admin`
- `lead_status` (7): `generated` | `pending_approval` | `approved` | `rejected` | `sent` | `locked` | `lost` (`rejected` is a distinct status — a rejected lead is not bounced back to `generated`)
- `template_type`: `global` | `local` | `agency` | `design_portfolio`
- `loss_reason`: `budget` | `scope` | `timeline` | `competitor` | `no_response` | `other`
- `budget_currency` (9): `USD` | `BDT` | `GBP` | `EUR` | `CAD` | `AUD` | `CNY` | `JPY` | `INR` (default BDT for a `local` lead, USD for every other template)
- `approval_decision`: `approved` | `rejected`
- `seniority`: `senior` | `mid` | `junior`

## Entities (feature module → table)
| Entity | Key fields | Relations |
|---|---|---|
| **User** | email(unique), passwordHash, name, role(user_role), isActive | 1—* Lead (submittedBy), 1—* Approval (decidedBy) |
| **Lead** | title, company, contactName, contactEmail, website, status(lead_status), template(template_type), budgetCurrency(budget_currency, default USD), valueCents(bigint), lossReason?, lossNote?, submittedAt?(timestamptz), submittedById | *—1 User; 1—1 Requirement; 1—* Proposal; 1—1 Budget; 1—* Approval; 1—1 Project(when locked) |
| **Requirement** | leadId, sourceText, files(jsonb: {name,key,mime}), readinessScore, queries(jsonb) | 1—1 Lead |
| **Proposal** | leadId, template, sections(jsonb), theme(light/dark/mixture), currentVersionId | 1—1 Lead; 1—* ProposalVersion |
| **ProposalVersion** | proposalId, versionNo, sectionsJson, model, tokensUsed, pdfKey | *—1 Proposal |
| **Budget** | leadId, currency, fxRate(numeric), contingencyPct, discountPct, vatPct, totalCents(bigint), version(int, optimistic lock) | 1—1 Lead; 1—* Milestone; 1—* BudgetLine |
| **Milestone** | budgetId, name, orderNo | *—1 Budget; 1—* BudgetLine |
| **BudgetLine** | budgetId, milestoneId, department, role, seniority, units(int), days(int), dayRateCents(bigint), optional(bool) | *—1 Budget/Milestone |
| **Approval** | leadId, submittedAt, submittedById, decidedAt?, decidedById?, decision(approval_decision)?, note? | *—1 Lead; *—1 User |
| **Project** | slug(unique), name, summary, category(jsonb), techStack(jsonb), coverKey?, sourceLeadId? | 1—1 Lead (auto-created on Locked) |
| **DocumentDelivery** | leadId, files(jsonb), method('download'), status, deliveredAt? | *—1 Lead |
| **AuditLog** | actorId, action, entity, entityId, before(jsonb), after(jsonb) | *—1 User |
| **RateCard** | department, role, seniority, monthly/daily/hourly × {UsdCents, BdtCents} (all bigint), currency, dayRateCents(bigint, **deprecated mirror of dailyUsdCents**) | — (from the authored head-cost sheet via `ingest:head-cost` — 52 roles / 8 departments; seniority parsed from the role name; @Index on role,seniority) |
| **OrgSetting** | section(unique), value(jsonb), updatedById? | — (one row per settings section: branding·approvals·templates·delivery·security·currency) |
| **RoleDaySample** | scopeSignature, role, days, source | — (learned scope→role-days) |
| **KbDocument** | title, sourcePath, category, template, meta(jsonb) | 1—* KbChunk |
| **KbChunk** | kbDocumentId, text, `embedding vector(768)`, contentHash(unique), meta(jsonb) | *—1 KbDocument; **HNSW cosine index on embedding** (created via raw SQL, not TypeORM) |
| **Generation** | leadId, kind(proposal/budget/brief/pitch), versions(jsonb), model, tokensIn, tokensOut | *—1 Lead |
| **Feedback** | generationId, approval(bool), editDiff(jsonb), outcome(win/loss)?, lossReason?, prompt? | *—1 Generation |
| **LearningSnapshot** | scaffoldVersion, distilledJson, metrics(jsonb) | — |

## Rules
- Base classes in `src/core/base/` MUST exist before any entity (D4 first step).
- Lookup columns (`email`, `slug`, `contentHash`, `role+seniority`) get `@Index`.
- `Budget.version` = optimistic lock (concurrent editors). Never `synchronize: true` — migrations only.
- pgvector: `CREATE EXTENSION IF NOT EXISTS vector;` in the first migration; HNSW index on `kb_chunk.embedding`.

## 2026-08 additions
- **`historical_projects`** (`src/modules/estimate`) — mined per-project totals for the budget-first band: `category`, `title`, `total_usd_cents` (bigint), `currency`, `weeks`, `scope_size`, `source`; indexed `['category','scope_size']`. Filled by `npm run ingest:estimates` (batch) and `EstimateService.mineFromText` (per-upload). `EstimateService.band()` = IQR (p25–p75) over ≥3 comparables.
- **`kb_documents.meta.insights`** (jsonb) — LLM-distilled `KbInsights` (summary/technical/stack/resources/pricing/budgeting/timeline/diagramTypes/decisions); `meta.section` gates band mining to Proposal/Budget. No migration (schemaless meta).
- **`proposals.pdf_cache`** (bytea, `select:false`) + **`pdf_hash`** — content-hash PDF cache (rendered on first download, reused until sections/renderer change).
- **`leads`** new columns: `client_logo_url` (data URI), `project_type` (enum), `audience` (enum), `project_context` (text), `structure_mode_override` (varchar). Added via `synchronize` in dev; author a migration before prod.

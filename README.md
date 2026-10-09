# Lead360

Internal pre-sales platform for Riseup Labs. It turns a client brief into a priced proposal (PDF/Word)
and budget (Excel). Generation is an LLM pipeline grounded by pgvector retrieval over past projects. The
LLM decides scope and writes prose; deterministic code owns every number (person-days × rate card).

> ⚠️ **Private repository.** `backend/data/kb-seed/` holds real client proposals and budgets with pricing.

---

## Contents

1. [Stack](#stack)
2. [Repository layout](#repository-layout)
3. [Getting started](#getting-started)
4. [How generation works](#how-generation-works)
5. [Retrieval and learning](#retrieval-and-learning)
6. [Regeneration, edits and versions](#regeneration-edits-and-versions)
7. [API overview](#api-overview)
8. [Data and scripts](#data-and-scripts)
9. [Testing and the regression gate](#testing-and-the-regression-gate)
10. [Configuration](#configuration)
11. [Engineering rules](#engineering-rules)
12. [Further documentation](#further-documentation)

---

## Stack

| Layer | Tech | Notes |
|---|---|---|
| API | NestJS 10, Node 20, TypeScript | Controller → Service → Repository → Entity; base classes in `src/core/base` |
| ORM | TypeORM | Raw SQL only for vector search |
| Database | PostgreSQL + pgvector (Neon in dev) | Embeddings `vector(768)`, HNSW indexes |
| LLM | OpenAI `gpt-5.4` via `infrastructure/ai/ai.service.ts` | ≈ $0.12 per generated lead |
| Embeddings | `text-embedding-3-small` @ 768 dims | Changing it means re-embedding everything |
| Documents | Puppeteer (PDF), `docx` (Word), ExcelJS (Excel) | House renderers in `src/common/utils/proposal-render` |
| Diagrams | In-house SVG renderer + Kroki | `infrastructure/diagram` |
| Auth | JWT in httpOnly cookies, role guards | `core/guards`, `modules/auth` |
| Frontend | React 18, React Router 7, Vite, Redux Toolkit, Tailwind 4 | `frontend/app` |
| Tests | Jest | Unit, golden render, API sweep, backtest |

Installed but not wired yet: BullMQ/Redis, Socket.io, S3 storage (local disk in dev).

## Repository layout

```text
lead360/
├─ backend/
│  ├─ src/
│  │  ├─ main.ts, app.module.ts
│  │  ├─ core/                    base classes, guards, decorators, filters, interceptors
│  │  ├─ common/                  enums, constants, utils (proposal-render, text extraction)
│  │  ├─ infrastructure/          ai, pdf, diagram, s3, mail, token, logging
│  │  ├─ modules/
│  │  │  ├─ generation/           controller + service (orchestration, regen router)
│  │  │  │  └─ engine/            understand → decide → compose, flags, calibration, crash, redaction
│  │  │  ├─ project-case/         past-project memory, gold ingest, feature memory, calibration service
│  │  │  ├─ proposal/             blocks, versions, PDF/DOCX export
│  │  │  ├─ budget/               budget lines, calculator, XLSX export
│  │  │  ├─ rate-card/            head-cost rates (single source of price)
│  │  │  ├─ kb/ portfolio/        RAG corpus and portfolio
│  │  │  └─ lead/ approval/ auth/ user/ settings/ …
│  │  └─ database/                migrations/, data-source.ts, one-off ingest/migrate/backtest scripts
│  ├─ test/                       unit/, golden/, fixtures/, e2e/, api-sweep.mjs
│  └─ data/                       kb-seed corpus, rate sources (head-cost xlsx)
├─ frontend/app/                  pages/, components/, services/httpServices/, redux/, routes/
├─ .claude-project/docs/          PRD, API, database, AI model guide, backtest log
└─ docker-compose.yml             local Postgres + pgvector
```

## Getting started

Prerequisites: Node 20+, PostgreSQL 15+ with pgvector (or `docker compose up -d`), an OpenAI API key.

```bash
# 1. Install
cd backend && npm install
cd ../frontend && npm install

# 2. Configure
cp backend/.env.example backend/.env       # fill DATABASE_*, JWT_*, AI_API_KEY
cp frontend/.env.example frontend/.env     # VITE_API_URL=http://localhost:3000/api

# 3. Database + data (all idempotent)
cd backend
npm run migration:run      # schema, pgvector extension, HNSW indexes
npm run seed               # users from .claude-project/user_stories/_fixtures.yaml, rate card
npm run ingest:head-cost   # official rates from data/rate-sources
npm run ingest:riseup      # chunk + embed the past-proposal corpus

# 4. Run
npm run start:dev          # API on :3000, Swagger at /api/docs
cd ../frontend && npm run dev   # app on :5173
```

Full walkthrough, including portfolio ingest and production notes: [`SETUP.md`](SETUP.md).

## How generation works

`POST /api/leads/:id/generate` → `GenerationService` builds the engine input (brief, file manifest, lead
meta) and calls `EngineService`:

| # | Stage | File | Kind | Output |
|---|---|---|---|---|
| 1 | Understand | `engine/understand.service.ts` | LLM | `Intent` JSON: modules, platforms, stated budget/deadline |
| 2 | Retrieve | `project-case/project-case.repository.ts`, `kb` | Code + embeddings | Top-K chunks, analog cases, strong match |
| 3 | Decide | `engine/decide.service.ts` | LLM + rules | Delivery Plan: phases → roles → days |
| 4 | Price | `rate-card/rate-card.service.ts` | Code | `rate × effective days`; unknown role → line skipped |
| 5 | Compose | `engine/engine.service.ts` | LLM | Typed blocks per template + diagrams |
| 6 | Lint + persist | `engine/redaction.util.ts`, `generation.service.ts` | Code | `proposals`, `budgets`, `proposal_versions` |

Inside Decide: module classification (`module.service.ts`) → strong-match reuse (cosine ≤ 0.35, coverage
≥ 0.8) → optional calibration → deadline crash (`plan-crash.util.ts`: hours/day up to 12, then parallel
heads) → budget fit/cap. The plan is persisted in `proposal.internalCalc` (never client-facing).

Templates: **Local** (BDT, separate Excel, phase-wise financial estimation), **Global** (USD, separate
Excel), **Agency** (money inside the proposal), **Design Portfolio**.

## Retrieval and learning

| Store | Content | Used for |
|---|---|---|
| `kb_chunks` | Chunked past proposals/budgets | Prompt grounding (style + facts) |
| `portfolio_projects` | Public portfolio | Comparables |
| `project_cases` | One structured row per past project; `quality='gold'` = user-approved final | Analogs, strong match, norms, calibration |
| `case_features` | Per-feature rows: domain-free capability, scale 1–5, attributed days, embedding | Cross-domain module sizing |

**Learning Engine v2** (behind flags, default off):

```bash
npm run migrate:gold-cases      # one-time columns on project_cases
npm run approved:manifest       # scan approved files → .claude-project/clients/_approved.yaml (last-created = final)
npm run ingest:approved [keys]  # parse xlsx/docx + one LLM extract → gold project_cases
npm run build:feature-memory    # gold cases → case_features
npm run backtest -- <label>     # leave-one-out accuracy → .claude-project/docs/BACKTEST.md
```

Re-run the last three whenever new approved finals are added. All learning is in person-days; money is
always re-priced from the current rate card.

## Regeneration, edits and versions

| Action | Endpoint | Behaviour |
|---|---|---|
| Edit a block | `PATCH /leads/:id/proposal/blocks/:blockId` | Saves and locks the block (regen skips it) |
| Regenerate a block | `POST /leads/:id/generate/block/:blockId` | Single compose call |
| Prompted regenerate | `POST /leads/:id/generate` | `routeRegenInstructions` splits into per-section edits; weeks/budget/team directives mutate the Plan in code |
| Budget regenerate | `POST /leads/:id/generate/budget` | `regenerateBudget`; `solveBudgetToTarget` for an exact total |
| Edit budget sheet | `PUT /leads/:id/budget` | Recompute → `budget.edited` → `syncProposalFromSheet` re-derives money blocks |
| Plan tab | `GET/PUT /leads/:id/generate/plan` | Direct phase/team edit, no LLM call |
| Versions | `GET /leads/:id/proposal/versions`, `POST …/versions/:versionId/restore` | Snapshot incl. `internalCalc` |

Invariant: budget total == proposal financial total, because both derive from the Plan.

## API overview

All routes are prefixed with `/api`. Swagger lives at `/api/docs`. Full reference:
[`.claude-project/docs/PROJECT_API.md`](.claude-project/docs/PROJECT_API.md).

| Area | Module |
|---|---|
| `/auth`, `/users` | `auth`, `user` |
| `/leads` (CRUD, requirement, readiness, submit, mark-sent/locked/lost) | `lead` |
| `/leads/:id/generate` | `generation` |
| `/leads/:id/proposal`, `/leads/:id/budget`, `/leads/:id/feedback` | `proposal`, `budget`, `client-feedback` |
| `/approvals` | `approval` |
| `/kb`, `/portfolio`, `/projects` | `kb`, `portfolio`, `project` |
| `/rate-cards`, `/settings`, `/analytics`, `/audit`, `/generations` | matching modules |

## Data and scripts

Every script lives in `backend/src/database/` and is exposed in `package.json`. All of them are idempotent.

| Script | Purpose |
|---|---|
| `migration:run` / `migration:revert` | TypeORM migrations |
| `migrate:*` | Additive column scripts (budget-hours, module-profiles, budget-pinning, proposal-versions, gold-cases …) |
| `seed` | Fixture users, catalog, rate card |
| `ingest:head-cost` | Rate card from the head-cost xlsx (BDT and USD stored verbatim) |
| `ingest:riseup`, `reembed-kb` | RAG corpus; re-embed rows with NULL vectors |
| `ingest:seed-cases` | Rebuild `project_cases` from the corpus |
| `approved:manifest`, `ingest:approved`, `build:feature-memory`, `backtest` | Learning Engine v2 |

ts-node on Windows: set `TEMP`/`TMP` to a writable folder if compilation fails.

## Testing and the regression gate

```bash
npm test                       # unit suite (incl. golden renders, source hygiene)
UPDATE_GOLDEN=1 npx jest renderer-golden   # re-record only after an intended render change
npm run test:api-sweep         # every endpoint: same status + response shape (needs a running API)
npm run backtest -- <label>    # accuracy vs approved finals
npx tsc --noEmit               # backend; frontend: npm run typecheck
```

A V2 flag is turned `on` only when the unit suite, golden renders and API sweep pass, and the backtest
is no worse than the V1 baseline on any metric.

## Configuration

Every variable is documented in [`backend/.env.example`](backend/.env.example). Key ones:

| Variable | Meaning |
|---|---|
| `DATABASE_SYNCHRONIZE` | Keep `false` on any database with real data. Sync drops pgvector columns and resets timestamps |
| `AI_API_KEY`, `AI_CHAT_MODEL`, `AI_EMBED_MODEL` | OpenAI access; see `AI_MODEL_GUIDE.md` before changing models |
| `CASE_STRONG_MATCH_MAX_DIST` | Strong-match reuse threshold (default 0.35) |
| `ENGINE_V2_GOLD` / `_FEATURES` / `_CALIBRATION` | `off` \| `shadow` \| `on` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Required; no fallback |

## Engineering rules

- **Prices** come only from `rate_cards`. Never invent a rate; an unknown role is skipped and flagged.
- **The LLM never sets numbers.** Weeks, team and money are computed or validated in code.
- **Client output** must not mention AI, LLMs or third-party vendors (enforced by the redaction lint).
- **Schema changes** are additive: new tables or nullable columns via migration or `migrate:*` script; no synchronize.
- **New engine behaviour** goes behind a flag with V1 fallback and must pass the backtest.
- **Tests** must not use real client leads. Fixtures are fictional.
- **Repo conventions** (branching, no `console.log`, no `any`, DTO validation): `.claude/rules/`.

## Further documentation

| Doc | Topic |
|---|---|
| [`SETUP.md`](SETUP.md) | Full install and data bootstrap |
| `.claude-project/docs/AI_MODEL_GUIDE.md` | Model choice, measured cost, switch checklist |
| `.claude-project/docs/RAG_AI_ARCHITECTURE.md` | Retrieval design |
| `.claude-project/docs/BUDGETING.md` | Budget and costing rules |
| `.claude-project/docs/PROJECT_API.md`, `PROJECT_DATABASE.md` | API and schema reference |
| `.claude-project/docs/BACKTEST.md` | Accuracy history per engine change |
| `.claude-project/docs/PROD_DEPLOYMENT.md`, `DEVOPS_HANDOFF.md` | Deployment |
| `fix.md` | Open issue register |

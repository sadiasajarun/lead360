---
prd_hash: "29c34d6e6690430554b6addcf0aafd9c9f04410787eb4ba99f6936dfc6714f2d"
prd_version: v13
generated_at: "2026-07-06"
phase: D2-tech-spec
---

# Lead360 — Project Knowledge (features + env; source of truth for D4–D10)

**Lead360** = Riseup Labs' internal AI proposal & budget studio. Turns a client brief into a branded, downloadable **Proposal (PDF) + Budget (Excel)**, grounded in Riseup's past work via **RAG**, running the **lead → proposal → lock** journey. Two internal views (**Sales/PM**, **Admin**) + external **client** tokenized deliverable views. Deep specs: `PRD.md` (canonical), `BACKEND_DEVOPS.md`, `BUDGETING.md`, `DATABASE_KNOWLEDGE.md`, `RAG_AI_ARCHITECTURE.md`, `PRESENTATION_GUIDE.md`.

## Feature modules (build order D4→D7)
1. **Auth/RBAC** — JWT httpOnly cookies; roles `sales_pm`, `admin`.
2. **Leads + wizard** — Info → Requirement (upload/paste) → Readiness (score+queries) → Template (4) → Generate → Lead Detail. **Status machine (7 states):** `generated · pending_approval · approved · rejected · sent · locked · lost` (`lead-status.enum.ts`, enforced in `LeadService`). Sales/PM: `generated|rejected —submit→ pending_approval —approve→ approved —mark-sent→ sent —lock|lost→ locked|lost`; a rejected lead gets its **own** `rejected` status (never bounced back to `generated`) and the rep revises + resubmits from it. Admin flow: an admin **cannot** submit for approval (`POST /leads/:id/submit` → 400) — an admin IS the approver, so their **own** `generated` lead goes straight to `sent` via `mark-sent` (still emits `lead.approved` to archive deliverables; `submitted_at` stays NULL); an admin cannot `mark-sent` another rep's draft (400 — must go through the queue). Reject requires a note, written into the lead's comment thread as a `decision` comment. Visibility (SQL, `LeadRepository`): a rep sees only their own leads; an admin sees their own plus any lead in the approval pipeline (`submitted_at IS NOT NULL OR status != 'generated'`). UI labels (`StatusPill.tsx`): Generated · Awaiting Approval · Approved · Rejected · Sent to Client · Locked · Lost.
3. **Proposal Engine** — 4 templates (Global/Local separate Excel; Agency/Design inline). Section JSON → branded HTML/PDF. Delta regeneration.
4. **Budget Engine** — resource×days×rate (FIFA structure), AI drafts role/day mix, **code computes** from rate card; contingency/discount/VAT; .xlsx export. See `BUDGETING.md`. **Currency (9): USD, BDT, GBP, EUR, CAD, AUD, CNY, JPY, INR** (`budget-currency.enum.ts`). Default **BDT for the `local` template, USD for every other**; the rep may override with any of the nine on `POST /leads` (also `PATCH /leads/:id`); an unsupported code → 400. **Pricing source: USD and BDT are read verbatim from the head-cost sheet's own columns** (never USD × FX for BDT — the sheet rounds each column independently); the other seven convert from USD at the admin-synced live FX rate. `GET /leads/:id/budget?currency=EUR` re-prices **for display only** (`{ budget, computed, viewCurrency, converted, rate }`) — nothing is written back, and the budget table goes read-only whenever `viewCurrency !== budget.currency`. **Money is never AI-generated:** day rates come from the rate card, totals are computed in code, and a role not on the rate card is **skipped, never priced**.
5. **RAG Knowledge** — ingest 39-file DB + portfolio → pgvector; retrieve for grounding; **Riseup data only** (never template-author/Potential Inc — `PRESENTATION_GUIDE.md` §0).
6. **Sales enablement** — Sales Brief + Pitch Deck (generate-on-click; 13-slide deck per `PRESENTATION_GUIDE.md`).
7. **Approvals** — admin verifies each; `approve` → `approved`, `reject` (note **required**, 400 without) → `rejected` (the lead leaves the queue but stays visible to the admin who rejected it); hard gate before Sent.
8. **Projects** — portfolio (auto-adds Locked leads) + real doc database.
9. **Analytics** — pipeline KPIs, funnel (stage snapshots), loss reasons.
10. **Delivery** — PDF+Excel download per lead; **email BUILT but DISABLED** (`EMAIL_ENABLED=false`).
11. **Settings** (`org_settings` table, one jsonb row per section) — sections: branding, approvals, templates, delivery, security, currency. `GET /settings`, `GET|PUT /settings/:section` (PUT admin-only), `POST /settings/currency/sync` (admin — pulls the live USD→BDT rate). Branding logo: `POST /settings/branding/logo` (admin, multipart PNG/JPG/SVG/WebP ≤2 MB, embedded into every generated proposal PDF), **`GET /settings/branding/logo` is `@Public`** so client-facing deliverable views render without a session (404 → app falls back to the bundled mark), `DELETE /settings/branding/logo` (admin). The `currency` section stores `{ usdBdt, vatPercent, syncedAt, syncSource, rates: { USD:1, BDT, GBP, EUR, CAD, AUD, CNY, JPY, INR } }`.
12. **Rate card** (`rate_cards`) — the authored head-cost sheet `backend/data/rate-sources/Head-Cost- Project Outsourcing- Tender & Local (August-2025).xlsx`, loaded by `npm run ingest:head-cost` → **52 roles across 8 departments** (Product Management & Delivery 3, Product Design & Planning 5, Graphics 9, Art 12, Engineering 12, Server 4, Quality Assurance 4, Others 3). Each row stores monthly/daily/hourly in **both BDT and USD** cents; **role names embed seniority** ("Mid Back-end Web Developer", "Sr. Android / Flutter Developer") and seniority is parsed from the name. Bulk update via CSV/XLSX import where **AI maps column HEADERS only** — every value is parsed in code, so the model cannot alter a number. (`npm run ingest:rates`, the older median-derivation approach, is superseded.)

## AI / cost model
**As built (2026-07-09):** OpenAI Platform, single chat model **`gpt-5.4`** for all generation (proposal,
budget plan, sales brief, pitch deck, section regen) + **`text-embedding-3-small`@768** for all RAG.
**Budget math in code, never LLM** (rates from `rate_card`, totals computed). Measured: **≈ $0.12/lead,
~$13/month** at 4–5 leads/day; full stats, model comparison, and switch procedure in **`AI_MODEL_GUIDE.md`**.
Every AI call is audited in the `generations` table (model + real token counts).
*(The original plan — Anthropic tiered Haiku/Sonnet/Opus + prompt caching + distillation — was not built;
prompt caching and a possible Anthropic switch remain open options, see AI_MODEL_GUIDE.md §4.)*

## Environment variables (authoritative — mirror into .env.example)
**Backend** (`backend/.env.example`): `NODE_ENV, PORT, API_PREFIX, CORS_ORIGIN, APP_URL` (`APP_URL` builds invitation links); DB `DATABASE_HOST/PORT/USER/PASSWORD/NAME/SSL` + `DATABASE_SYNCHRONIZE` (`true` local only; **must be `false` in staging/production** — synchronize drops unmanaged columns/indexes); Auth `JWT_SECRET`(required, no fallback)`, JWT_ACCESS_EXPIRES, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES, COOKIE_SECURE`; Storage `STORAGE_PROVIDER, S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY`; AI `AI_API_KEY, AI_BASE_URL, AI_CHAT_MODEL, AI_EMBED_MODEL` (OpenAI Platform; see `AI_MODEL_GUIDE.md`); `FX_API_URL` (default `https://open.er-api.com/v6/latest/USD`; the FX endpoint used by currency sync, configurable for locked-down networks); `RISEUP_DB_DIR` (overrides the kb-seed corpus directory); Email(off) `EMAIL_ENABLED, MAIL_FROM`. **Reserved but NOT read by any code** (planned infra only): `REDIS_*`, `SES_*`, `SENTRY_DSN`.
**Frontend** (`frontend/.env.example`): `VITE_API_URL, VITE_WS_URL`.

## Tooling (npm scripts)
`npm run ingest:head-cost` rebuilds `rate_cards` from the authored head-cost sheet (52 roles / 8 departments; supersedes `ingest:rates`). `npm run test:api-sweep` (`backend/test/api-sweep.mjs`) runs 59 checks against a running backend — status machine, RBAC, cross-rep isolation, currency defaults/overrides, budget conversion, loss-reason validation, empty-brief guard, settings RBAC, analytics contract — reading credentials from `_fixtures.yaml`; it never triggers AI (costs nothing). `npm run backfill:rejected` (`backend/src/database/backfill-rejected.ts`) is a one-off idempotent migration that adds `'rejected'` to the Postgres enum and re-labels leads rejected under the old behaviour.

## Non-functional
TS strict; no `any`; class-validator on all input; every controller Swagger-documented; ≥1 e2e test per endpoint; every interactive element `data-testid`; WCAG AA; i18n-ready. Correctness: integer-cents money, transactions, idempotency keys, optimistic locking, audit log (see `BACKEND_DEVOPS.md` §3).

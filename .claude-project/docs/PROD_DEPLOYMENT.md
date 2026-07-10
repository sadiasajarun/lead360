# Lead360 — Production Deployment Guide (Reminder Checklist)

> Keep this. When you move off the free dev setup (Neon free tier + OpenAI pay-per-token + local disk) to a paid,
> AWS-hosted, production stack, work through these steps **in order**. Each item says what changes
> from the current dev setup and why. Nothing here is done yet — dev currently runs on free services.

---

## 0. Current dev setup (what you're replacing)
| Concern | Dev (now, free) | Production (target) |
|---|---|---|
| Database | Neon free Postgres + pgvector | **AWS RDS PostgreSQL** (16+) with pgvector, or Neon paid |
| Schema | `DATABASE_SYNCHRONIZE=true` (auto-create) | **Migrations only** (`synchronize` OFF) |
| AI | OpenAI Platform key, `gpt-5.4` (pay-per-token, ~$0.12/lead) | Same key/model; add usage limits + alerts |
| File storage | Local disk (`./uploads`) | **AWS S3** (or Cloudflare R2) |
| Secrets | `backend/.env` (plaintext) | **AWS Secrets Manager** / SSM Parameter Store |
| Hosting | localhost (npm run) | **EC2 / ECS / Elastic Beanstalk** + a process manager |
| Cookies | `COOKIE_SECURE=false` | `COOKIE_SECURE=true` (HTTPS only) |

---

## 1. Database → AWS RDS PostgreSQL
1. Provision **RDS PostgreSQL 16+** (Multi-AZ for HA). Enable automated backups + a maintenance window.
2. **pgvector:** RDS supports it. Connect and run `CREATE EXTENSION IF NOT EXISTS vector;` (the
   `EnableVectorExtension` migration also does this). If your instance's Postgres/pgvector is older and
   lacks HNSW, either upgrade or change the index in `AddKbEmbedding` to `ivfflat`.
3. **Turn OFF synchronize.** In prod env do **not** set `DATABASE_SYNCHRONIZE` (defaults to false). This
   removes the boot-time raw-column race and makes schema changes deliberate.
4. **Run migrations** on deploy (fresh DB): `npm run migration:run`. This applies EnableVectorExtension →
   InitialSchema (all 21 tables) → AddKbEmbedding (vector column + HNSW index). Already validated on a
   fresh DB.
5. **Seed** once: `npm run seed` (creates the fixture users + KB catalog + rate card). **Change the seed
   passwords / rotate them** — the `_fixtures.yaml` credentials are dev-only.
6. Set `DATABASE_SSL=true` and point `DATABASE_HOST/PORT/USER/PASSWORD/NAME` at RDS. Use least-privilege
   DB credentials (not the master user) for the app.
7. Connection pooling: put **RDS Proxy** (or PgBouncer) in front for many connections.

> ⚠️ Note: KbService still runs an idempotent `ensureVectorColumn` on boot as a dev safety net. It's
> harmless in prod (IF NOT EXISTS), but the migration is the source of truth.

## 2. AI — already on a paid OpenAI key (gpt-5.4)
- Dev already runs the production provider: **OpenAI Platform**, `AI_CHAT_MODEL=gpt-5.4`,
  `AI_EMBED_MODEL=text-embedding-3-small` (768 dims). Measured cost ≈ **$0.12/lead** (~$13/month at
  4–5 leads/day). Full model comparison, measured stats, and the **switch-model procedure**:
  **`AI_MODEL_GUIDE.md`** (same folder) — read it before changing `AI_CHAT_MODEL`.
- For prod: **rotate the API key** (the dev key was shared in chat), set a **monthly usage limit +
  email alert** on platform.openai.com, and store the key in Secrets Manager (§4).
- ⚠️ **Timeout blocker:** `POST /leads/:id/generate` blocks ~50s. nginx `proxy_read_timeout` (60s
  default) and most LB idle timeouts will 504 it. Either raise the proxy timeout for that route or
  (better) move generation to a background job (202 + poll) before go-live.
- **Embedding dimension:** `EMBED_DIM` in `ai.service.ts` is **768** and must match the
  `vector(768)` columns (kb_chunks, portfolio_projects). A different embedding model size means
  updating BOTH `EMBED_DIM` and the migration column, then re-embedding everything
  (`POST /api/kb/ingest` + `POST /api/portfolio/embed`).
- Cost control: proposals generate on demand; embeddings run on ingest. Add rate-limits/quotas.

## 3. Object storage → AWS S3 (or R2)
- Set `STORAGE_PROVIDER=s3` (code already has the S3 adapter) + `S3_ENDPOINT` (blank for AWS S3),
  `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (prefer an **IAM role** on EC2/ECS
  over static keys).
- Bucket: block public access; downloads go through the API (or switch to presigned URLs — the code
  already has `presignedGetUrl`). Deliverables (proposal PDF, budget xlsx) + uploaded KB docs land here.
- Migrate any dev files from `./uploads` if needed (usually not — regenerate on approval).

### 3b. Data migration — two supported paths (see also `SETUP.md` at repo root)
- **Rebuild from the repo** (proves reproducibility; recommended for a clean prod start):
  `migration:run` → `seed` → `ingest:riseup` (reads the **committed** `backend/data/kb-seed/` corpus —
  no external drive/Downloads dependency) → `POST /portfolio/ingest` + `/portfolio/embed`.
  Re-embedding everything costs a few cents.
- **Carry the dev data over**: `pg_dump` (Neon) → `pg_restore` (RDS), then
  `aws s3 sync backend/uploads/ s3://<bucket>/` + `STORAGE_PROVIDER=s3`. DB rows store **relative**
  storage keys (`kb/…`, `leads/…`, `deliverables/…`) so they resolve identically on disk or S3.
- **Trash retention job**: the 30-day Database-trash auto-purge runs via `setInterval` inside the API
  (`KbService.onModuleInit`). Fine for ONE instance; if you scale to multiple API instances, move it
  to a single cron/queue worker so purges don't race.

## 4. Secrets & environment
- Move every secret out of `backend/.env` into **AWS Secrets Manager / SSM**: `JWT_SECRET`,
  `JWT_REFRESH_SECRET` (long random, **rotate** the dev ones), DB password, AI key, S3 keys.
- `JWT_SECRET` must be present (app throws otherwise). Use distinct access/refresh secrets.
- `NODE_ENV=production`, `CORS_ORIGIN=https://your-frontend-domain` (exact), `COOKIE_SECURE=true`.
- Create a real `backend/.env.production` (or inject via the platform) — never commit it.

## 5. Server / hosting (AWS)
- **Backend (NestJS):** build `npm run build` → run `node dist/main` under **PM2** (or a container on
  **ECS Fargate** / Elastic Beanstalk). Health check: `GET /api/health`.
- **Frontend (React Router 7):** `npm run build` → serve with `npm run start` (react-router-serve) on a
  Node host, **or** static-host the SPA build on **S3 + CloudFront**. Set `VITE_API_URL` to the prod API
  URL at build time.
- **HTTPS + domain:** put an **ALB / CloudFront** in front with an **ACM certificate**. Cookies are
  `SameSite=strict` — keep the frontend and API on the **same registrable domain** (e.g. `app.riseup…`
  and `api.riseup…`) so cookies flow.
- **Puppeteer (proposal PDF):** the server must have Chromium. In a container install the OS deps
  (`apt-get install -y chromium` or the puppeteer install), or set
  `PUPPETEER_EXECUTABLE_PATH`. Locally we ran `npx puppeteer browsers install chrome`.

## 6. Redis / background jobs (optional)
- Currently unused. If proposal generation should be async (recommended at scale), add **BullMQ + Redis
  (ElastiCache)** and move `generateProposal` to a queue. Env `REDIS_HOST/PORT/PASSWORD` already exist.

## 7. Email (currently disabled by design)
- `EMAIL_ENABLED=false`. If enabling client delivery emails, wire **AWS SES** (env `SES_*`, `MAIL_FROM`),
  verify the domain, and move out of the SES sandbox.

## 8. Security hardening (verify before go-live)
- `COOKIE_SECURE=true`, HTTPS everywhere, exact `CORS_ORIGIN`.
- Refresh-token rotation + revocation is **already implemented** (`refresh_tokens` table). Add a
  scheduled cleanup of expired rows (a cron/BullMQ job) — currently pruned opportunistically on refresh.
- Rotate all dev secrets + seed passwords. Enforce strong passwords for real users.
- Rate-limit auth + generation endpoints. Add helmet (already on) + WAF at the ALB.
- Review RBAC: `sales_pm` vs `admin` guards are in place.

## 9. Monitoring & ops
- **Sentry:** set `SENTRY_DSN` (referenced in guides) for error tracking.
- CloudWatch logs/metrics/alarms on the backend + RDS. Alert on 5xx, DB CPU, connection count.
- The `HttpExceptionFilter` logs unexpected 500s with stack — ship those to your log aggregator.

## 10. CI/CD (recommended)
- Pipeline: install → `npm run build` (backend + frontend) → run tests (D8/D9 once written) →
  `migration:run` → deploy. Block deploy on build/test failure.
- Keep migrations forward-only; never enable `synchronize` in prod.

---

## Quick go-live sequence (once infra exists)
1. RDS up + `CREATE EXTENSION vector` + app DB user.
2. Secrets in Secrets Manager; prod env wired (`NODE_ENV=production`, `COOKIE_SECURE=true`, real
   `CORS_ORIGIN`, S3, AI key, DB — `DATABASE_SYNCHRONIZE` unset).
3. `npm run build` (both). `npm run migration:run`. `npm run seed` (then rotate seed creds).
4. Start backend under PM2/ECS; deploy frontend (S3+CloudFront or Node host).
5. Smoke test: `/api/health`, login, create lead, generate proposal (paid AI), download deliverable.
6. Point DNS + certificates; verify cookies flow over HTTPS.

## Drift / follow-ups still open (not blockers)
- Ingest the **real Riseup document library** (38 catalog entries are metadata-only until files are uploaded).
- Budget editor auto-fill from `GET /rate-cards/suggest`.
- Backend e2e tests (D8) + Playwright user-story tests (D9).
- A/B check policy after go-live (see CHANGELOG header).

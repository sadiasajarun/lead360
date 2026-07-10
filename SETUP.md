# Lead360 — Developer Setup Manual (clone → running)

> For the developer/DevOps taking this over. Following this from a fresh clone gives you the full
> working system — app, database schema, seed users, the Riseup knowledge base (RAG), and the
> portfolio — on any machine or server. Production migration: `.claude-project/docs/PROD_DEPLOYMENT.md`.

⚠️ **This repository must stay PRIVATE.** `backend/data/kb-seed/` contains real Riseup client
proposals and budgets (Hummm, KHDMETI, Kwando, …) with pricing.

---

## 1. What lives where

| Thing | Where | In git? |
|---|---|---|
| Backend (NestJS 10 + TypeORM) | `backend/` | ✅ |
| Frontend (React Router 7 + Redux) | `frontend/` | ✅ |
| **Riseup corpus (RAG seed source)** | `backend/data/kb-seed/<Category>/<Section>/` | ✅ (deliberately) |
| Runtime files (uploads, generated PDFs/xlsx) | `backend/uploads/` | ❌ gitignored |
| Secrets | `backend/.env` | ❌ **never** — get values from the owner via a secure channel; `backend/.env.example` lists every variable |
| Database | PostgreSQL **with pgvector** (dev used Neon free tier) | ❌ — rebuilt from repo (§3) or dumped (§4) |

## 2. Prerequisites

- Node.js 20+, npm
- PostgreSQL 15+ **with the pgvector extension available** (Neon/Supabase/RDS all have it)
- An **OpenAI Platform API key** (`sk-proj-…`, pay-per-token) — powers generation + RAG embeddings
- ~200 MB disk for Chromium (Puppeteer downloads it on install; used for proposal PDFs)

## 3. Fresh install (recommended — proves everything is reproducible)

```bash
git clone <repo> && cd lead360
npm install                        # root (concurrently etc.)
cd backend && npm install          # if Puppeteer's Chromium download fails: PUPPETEER_SKIP_DOWNLOAD=true npm install, then: npx puppeteer browsers install chrome
cd ../frontend && npm install
```

Configure `backend/.env` (copy `backend/.env.example`, fill in):
- `DATABASE_HOST/PORT/USER/PASSWORD/NAME`, `DATABASE_SSL=true` for cloud DBs
- Dev only: `DATABASE_SYNCHRONIZE=true` (prod: **unset** and use migrations — see §4 of PROD_DEPLOYMENT)
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — generate fresh: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `AI_API_KEY` (OpenAI), `AI_CHAT_MODEL=gpt-5.4`, `AI_EMBED_MODEL=text-embedding-3-small`
- `STORAGE_PROVIDER=local` (dev) — S3 vars only when migrating storage
- `EMAIL_ENABLED=false` (email is built but disabled by decision)

Frontend: copy `frontend/.env.example` → `frontend/.env` (default `VITE_API_URL=http://localhost:3000/api`).

Then build the data (all idempotent — safe to re-run):

```bash
cd backend
npm run migration:run     # schema: 21 tables + pgvector extension + HNSW indexes
npm run seed              # users from .claude-project/user_stories/_fixtures.yaml + catalog + rate card
npm run ingest:riseup     # reads data/kb-seed/ -> stores files to uploads/, chunks + embeds (RAG)
npm run start:dev         # API on :3000  (docs at /api/docs)
# then ingest the portfolio (needs the API up; login as the admin fixture user first — or curl):
#   POST /api/portfolio/ingest     (scrapes riseuplabs.com/portfolio)
#   POST /api/portfolio/embed      (embeds them for stack recommendations)
cd ../frontend && npm run dev      # app on :5173
```

Login credentials = `.claude-project/user_stories/_fixtures.yaml` (`users:` section). **Rotate these
for any shared/production environment** — they are dev fixtures.

Embedding the corpus + portfolio costs a few cents (text-embedding-3-small).

## 4. Carry-over install (keep the existing dev data instead)

```bash
pg_dump "$OLD_DATABASE_URL" --no-owner --no-privileges -Fc -f lead360.dump
pg_restore -d "$NEW_DATABASE_URL" --no-owner lead360.dump
```
Then copy `backend/uploads/` to the new machine (or `aws s3 sync uploads/ s3://<bucket>/` if going
straight to S3 with `STORAGE_PROVIDER=s3`). DB rows store **relative** storage keys
(`kb/…`, `leads/…`, `deliverables/…`), so they work unchanged under local disk or S3.

## 5. How file handling works (so you don't have to reverse-engineer it)

- **One storage adapter** — `backend/src/infrastructure/s3/storage.service.ts` (`STORAGE_PROVIDER`:
  `local` → `backend/uploads/`; `s3`/`r2` → bucket). Everything (KB files, lead brief attachments,
  generated deliverables) goes through it; preview/download stream through the authenticated API.
- **Database tab** (Projects → Database) = `kb_documents` rows + stored files. Sub-navs per template:
  Agency & Design Portfolio → Client requirements / Proposal; Global & Local → + Budget.
- **RAG learning loop**: any file added — manual upload, `ingest:riseup`, or automatic filing on
  lead approval (client requirement + proposal PDF + budget xlsx) — is text-extracted, chunked, and
  embedded into `kb_chunks` (pgvector). Deleting to Trash removes its knowledge from RAG immediately;
  restore re-learns it from the stored file; permanent purge deletes file + record.
- **Trash**: Settings → Trash, 30-day retention, then auto-purged (daily job in `KbService.onModuleInit`;
  move to a real cron if you run multiple API instances).

## 6. Gotchas (learned the hard way — respect these)

1. **`DATABASE_SYNCHRONIZE=true` wipes raw pgvector columns** on tables TypeORM manages. The vector
   tables are excluded from sync + self-heal on boot, but never enable sync on prod data.
2. **Zombie process on :3000** (Windows dev): a killed-but-lingering node serves the OLD `.env`.
   `netstat -ano | findstr :3000` → `taskkill /F /PID <pid>` before believing a config change.
3. **gpt-5.x / o-series** need `max_completion_tokens` and reject `temperature` — handled inside
   `AiService` (`usesCompletionTokens`); extend its regex for new model families.
4. **Long generation call**: `POST /leads/:id/generate` blocks ~50 s. Behind nginx/an LB, raise that
   route's timeout or move generation to a background job before go-live (PROD_DEPLOYMENT §2).
5. Embeddings are pinned to **768 dims** (`EMBED_DIM`) matching the `vector(768)` columns — changing
   the embed model means re-embedding everything (`AI_MODEL_GUIDE.md` §5).

## 7. Reference docs

- `.claude-project/docs/PROD_DEPLOYMENT.md` — dev → AWS production checklist (RDS, S3, secrets, PM2/nginx)
- `.claude-project/docs/AI_MODEL_GUIDE.md` — AI layer: models, measured costs, switch procedure
- `.claude-project/docs/PROJECT_API.md` / `PROJECT_DATABASE.md` — endpoints & schema
- `.claude-project/docs/CHANGELOG.md` — decision log

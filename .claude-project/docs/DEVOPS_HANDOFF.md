# Lead360 — DevOps Handoff (quick insight)

**For:** Riseup Labs' lead DevOps / infra owner. **Read time:** ~5 min. Full architecture: `BACKEND_DEVOPS.md`.

---

## 1. What Lead360 is (30 sec)
An **internal** web app: turns a client brief into a branded **Proposal (PDF) + Budget (Excel)**, grounded in
Riseup's past work via **RAG (AI retrieval)**. Two internal user types (Sales/PM, Admin) + external clients who
open a read-only link. It is **document- and data-heavy** and calls the **Anthropic Claude** API to generate content.

## 2. The stack you'll host
| Piece | Tech | Notes |
|---|---|---|
| API | **NestJS** (Node 20+) | REST + JWT httpOnly cookies + BullMQ workers |
| Frontend | **React Router 7** (Vite) | static/SSR build |
| Database | **PostgreSQL 16 + pgvector** | one DB for data **and** AI vectors (no separate vector service) |
| Cache/Queue | **Redis** | BullMQ jobs (ingest, embed, generate, PDF/Excel export) |
| File storage | **S3-compatible** | source docs + generated PDF/Excel |
| AI | **Anthropic Claude API** | tiered models; **this is the main variable cost** |

The repo already contains `backend/` and `frontend/` scaffolds, `docker-compose.yml` (Postgres+pgvector + Redis
for local dev), and `.env.example` in each app listing **every** variable you must set.

## 3. What YOU need to provision (the decisions that are yours)
Pick a hosting tier (details + monthly cost in `BACKEND_DEVOPS.md` §4 and `PRD.md` → Running cost):
- **Tier A — cheapest, full control:** one VPS (e.g. **Hetzner**) running Docker Compose (API + worker + Postgres + Redis + Caddy TLS) + object storage. ~$15–35/mo.
- **Tier B — managed, low-ops:** managed Postgres+pgvector (**Supabase** or **Neon**) + object storage (**Cloudflare R2**), API/worker on **Fly.io/Railway**. ~$25–70/mo.
- If Riseup has its **own servers/K8s**, host the same 4 containers there; just give the app the connection strings + secrets.

Provision + hand the app these (set in `backend/.env`, from a secrets manager — never commit):
1. **Postgres 16 with pgvector** — DB URL/creds. Enable the extension: `CREATE EXTENSION IF NOT EXISTS vector;` (the first migration also does this).
2. **Redis** — host/port/password.
3. **Object storage bucket** — endpoint + keys (see §4).
4. **JWT secrets** — two long random strings (`openssl rand -hex 32`).
5. **Anthropic API key** — see §4.
6. **Domain + TLS** for the app.

## 4. Third-party accounts to create (with links)
| Service | Why | Where | What to grab |
|---|---|---|---|
| **Anthropic (Claude API)** | AI generation | https://console.anthropic.com → API Keys | `ANTHROPIC_API_KEY`; set a **monthly spend limit** (Billing → Limits) |
| **Cloudflare R2** (recommended) | document storage, **zero egress fees** | https://dash.cloudflare.com → R2 → Create bucket → "Manage R2 API Tokens" | `S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET` |
| _or_ **Backblaze B2** | cheaper storage alt | https://www.backblaze.com/cloud-storage | S3-compatible keys |
| **Supabase** _or_ **Neon** (Tier B) | managed Postgres + pgvector | https://supabase.com / https://neon.tech | DB connection string (pgvector supported on both) |
| **Fly.io** _or_ **Railway** (Tier B) | run API + worker | https://fly.io / https://railway.app | deploy target |
| **Hetzner** (Tier A) | cheapest VPS | https://www.hetzner.com/cloud | one CPX/CCX server |
| **Sentry** (optional) | error monitoring | https://sentry.io | `SENTRY_DSN` |

Setup flow for each: create account → create the resource → copy the keys → paste into `backend/.env` (or your
secrets manager) → done. When we reach deployment I'll give you the exact per-service click-path again.

## 5. Security checklist (please confirm)
- Secrets in a **secrets manager** (Infisical/Doppler/1Password) or platform env — **never in git**.
- `COOKIE_SECURE=true` in prod (HTTPS only); httpOnly + sameSite=strict cookies.
- **Set a monthly cap on the Anthropic key** (protects against runaway AI cost).
- Presigned, short-TTL URLs for document downloads; least-privilege storage keys.
- Automated Postgres backups (managed) or nightly `pg_dump` → object storage; test a restore.
- Rate limiting on auth + generation endpoints (built into the app).

## 6. What to tell whom
- **Ops / IT manager:** "We need a small Postgres+Redis host (or a managed one), an object-storage bucket, and
  an Anthropic API key with a monthly spend cap. Budget ≈ $30–90/mo infra + a usage-based AI bill (see PRD → Running cost). It's internal-only; no customer PII beyond our own leads."
- **Finance:** "Two line items: fixed hosting (~$30–90/mo) + variable Claude AI usage (predicted in the PRD, capped by a hard limit)."
- **PM / Product:** "Environment + specs are ready; the app is being built phase by phase against `PROJECT_*` specs and the approved design. Email delivery is intentionally OFF for launch — deliverables are PDF + Excel."
- **Security/Compliance (if any):** "JWT httpOnly cookies, RBAC, audit log, secrets in a manager, data stays in
  Riseup-controlled Postgres + object storage; only prompt/context goes to Anthropic (no bulk client PII)."

## 7. Nothing to do right now
No infra is needed until we reach **D5-backend / D10-ship**. When we get there, the build will pause and say
"hand this to devops." You can pre-create the Anthropic key + storage bucket any time to save a step later.

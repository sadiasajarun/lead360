# Lead360 — AI Model Guide (current state, measured costs, how to switch)

> **Source of truth for the AI layer.** Read this before changing `AI_CHAT_MODEL` or `AI_EMBED_MODEL`.
> All numbers below are **measured** (2026-07-09, live calls + `generations` table rows), not vendor claims.

---

## 1. Current configuration

| Setting | Value | Where |
|---|---|---|
| Provider | **OpenAI Platform** (pay-per-token API; *not* ChatGPT Plus/Pro) | `backend/.env` |
| `AI_CHAT_MODEL` | **`gpt-5.4`** — all generation (proposal, budget plan, sales brief, pitch deck, section regen, readiness) | `backend/.env` |
| `AI_EMBED_MODEL` | **`text-embedding-3-small`** pinned to **768 dims** — all RAG (KB chunks + portfolio) | `backend/.env` |
| `AI_BASE_URL` | `https://api.openai.com/v1` | `backend/.env` |
| Code entry point | `backend/src/infrastructure/ai/ai.service.ts` (provider-agnostic, OpenAI SDK) | — |
| Usage audit trail | `generations` table — every AI call records **real model name + real token counts** | fixed 2026-07-09 |

History: dev started on Google **Gemini free tier** (retired 2026-07-09 — no code paths or env vars remain),
briefly `gpt-4o-mini`, briefly `gpt-5.5`, settled on **`gpt-5.4`**.

> The `'OpenAI/Gemini'` strings in `portfolio/stack-recommendation.ts` are **client-facing tech-stack
> recommendations from the Generation-Engine spec §1** — they are NOT our provider and must stay verbatim.

---

## 2. Measured per-call stats (gpt-5.4, real pipeline run)

| Call | Latency | Tokens in | Tokens out | Cost |
|---|---|---|---|---|
| Proposal (15 sections) + budget plan | 49.5 s | 3,866 | 3,086 | $0.056 |
| Sales brief | 19.0 s | 3,245 | 1,073 | $0.024 |
| Pitch deck | 11.5 s | 3,676 | 1,068 | $0.025 |
| One section regeneration | 7.8 s | 1,135 | 137 | $0.005 |
| **Full pipeline** | ~88 s total | **11,922** | **5,364** | **$0.110** |

- **Per lead** (full pipeline + ~3 regenerations): **≈ $0.12**
- **Per month** at the expected volume (4–5 leads/day ≈ 110/month): **≈ $13**
- Embeddings are noise: $0.02/1M tokens → fractions of a cent per lead.
- **Output tokens are 73% of the bill** (output costs 6× input). If cost ever matters, the lever is
  *response length*, not prompt size.
- `cached_tokens` measured **0** — our prompts have no byte-stable shared prefix yet. Making the static
  part (system prompt + rate card + portfolio context) byte-identical across calls would cut its input
  cost 90% (cached input is $0.25 vs $2.50/1M). Optional optimization, unimplemented.

## 3. Model comparison (identical proposal-shaped prompt, measured 2026-07-09)

| Model | Latency | $/1M in | $/1M out | Est. $/month @110 leads | Verdict |
|---|---|---|---|---|---|
| **`gpt-5.4`** ✅ current | **14.0 s** | 2.50 | 15.00 | **~$13** | Best quality/price/latency balance |
| `gpt-5.5` | 26.9 s | 5.00 | 30.00 | ~$26 | 2× cost AND 2× latency for one generation newer |
| `gpt-5.4-mini` | 23.1 s | 0.75 | 4.50 | ~$4 | Noticeably thinner prose — not for client-facing docs |
| `gpt-5.1` | 28.4 s | unlisted (legacy) | — | — | Slower than both, delisted from pricing — do not use |
| `gpt-5.5-pro` / `gpt-5.4-pro` | — | 30.00 | 180.00 | ~$160+ | **Not chat-completions models** (Responses API only) — incompatible with `AiService` |

Facts that shaped the choice:
- **Reasoning-token overhead is ~0** on this workload for all gpt-5.x tested (13 tokens worst case) —
  the "hidden thinking cost" argument against reasoning models does not apply here.
- At ~110 leads/month, the *total* spread between the cheapest and best model is ~$20/month.
  **Cost is not the constraint at this volume; quality and latency are.**
- Nobody has done a human side-by-side prose-quality comparison (5.4 vs 5.5) on a real Riseup brief.
  If proposal quality ever feels off, that comparison is the next step — not a bigger model by default.

## 4. How to switch chat models (future-you checklist)

1. **Edit `backend/.env`** → `AI_CHAT_MODEL=<model>`. Nothing else changes — `AiService` is provider-agnostic.
2. **Parameter compatibility is automatic**: models matching `^(gpt-5|o1|o3|o4)` get
   `max_completion_tokens` and **no** `temperature` (they reject both `max_tokens` and non-default
   temperature). Anything else gets classic `max_tokens`. See `usesCompletionTokens` in `ai.service.ts` —
   **extend that regex if a new model family appears** (e.g. `gpt-6`).
3. **Restart the backend — and kill the old process first.** On Windows a zombie `node` holding :3000
   silently serves the OLD env (this has bitten us 3+ times):
   `netstat -ano | findstr :3000` → `taskkill /F /PID <pid>` → `npm run start:dev`.
4. **Verify with one real generation**, then check the audit trail:
   `SELECT kind, model, tokens_in, tokens_out FROM generations ORDER BY created_at DESC LIMIT 5;`
   The `model` column must show the new name. Delete the test lead afterwards.
5. **Compute the new cost** from those rows: `tokens_in × $in/1M + tokens_out × $out/1M`
   (prices: https://platform.openai.com/docs/pricing). Expect output ≈ 70–75% of the bill.
6. **Watch the latency.** If a full generate exceeds ~55 s, it will 504 behind default nginx/LB
   timeouts in prod (see `PROD_DEPLOYMENT.md` §2). Slower model ⇒ background-job refactor becomes mandatory.
7. **Long-context price cliff:** gpt-5.4/5.5 double input pricing above a context threshold. Prompts sit
   at ~2–4k input tokens today; if RAG grounding grows dramatically, re-check which tier you're in.
8. Append the change + measured numbers to `CHANGELOG.md`.

### Switching provider (not just model)
- Any **OpenAI-compatible** endpoint works via `AI_BASE_URL` + `AI_API_KEY` (Ollama local, etc.).
- **Anthropic (Claude):** the Generation-Engine spec §6 nominates Claude Opus for prose. Needs an
  Anthropic API key; their OpenAI-compat endpoint covers chat but **not embeddings** — keep
  `AI_EMBED_MODEL` on OpenAI (the code uses one client, so this would need a small `AiService` split:
  chat client vs embed client).
- **Decision pending:** keep gpt-5.4 (spec §6 amended) vs. add an Anthropic key for spec compliance.

## 5. How to switch the embedding model — ⚠️ expensive, rarely worth it

Everything embedded is stored as **`vector(768)`** in Postgres (`kb_chunks.embedding`,
`portfolio_projects.embedding`, HNSW cosine indexes). The `dimensions: 768` parameter in
`AiService.embed()` pins any OpenAI embed model to that size.

To change models: (1) set `AI_EMBED_MODEL`; (2) if its native size differs and you want it, update
`EMBED_DIM` in `ai.service.ts` **and** the `vector(768)` migrations/columns; (3) **re-embed everything** —
`POST /api/kb/ingest` (or `npm run reembed-kb`) + `POST /api/portfolio/embed`; (4) old and new vectors are
**not comparable** — never mix models in the same column.

Also remember the dev trap: `DATABASE_SYNCHRONIZE=true` drops the unmanaged raw `embedding` columns on
boot; both services self-heal via `onModuleInit → ensureVectorColumn`, but embeddings must be re-run after.

## 6. Standing caveats

- 🔴 **Budget dollar figures are currently fiction** regardless of model: the rate card holds 21 invented
  day-rates until `Human-Cost-…-August-2025_.xlsx` is ingested (spec §10 violation, tracked separately).
  The model choice affects *prose quality* and *role/day estimates* — never prices (rates come from the
  DB, totals computed in code).
- 🔑 The current dev API key was shared in plain chat — **rotate it before prod** and set a usage limit.
- Every AI call is recorded in `generations` (kind, model, tokens_in, tokens_out) — use it as the audit
  trail for any future cost question. Before 2026-07-09 the column data is wrong (hardcoded `'gemini'`,
  zeroed tokens) — only trust rows after that date.

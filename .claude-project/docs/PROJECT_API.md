---
prd_hash: "29c34d6e6690430554b6addcf0aafd9c9f04410787eb4ba99f6936dfc6714f2d"
prd_version: v13
generated_at: "2026-07-06"
phase: D2-tech-spec
---

# Lead360 — API Spec (D5 builds from this)

REST, prefix `/api`. Responses wrapped by `TransformInterceptor` → `{ success, statusCode, message, data, timestamp, path }`. Auth = **JWT in httpOnly cookies** (`access_token`, `refresh_token`). Roles: `sales_pm`, `admin`. Every endpoint handles 400/401/403/404; Swagger at `/api/docs`.

## Auth  `/auth`
| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /auth/login | public | set httpOnly cookies (SetTokenInterceptor) |
| POST | /auth/refresh | public | rotate refresh token (delete old, issue new) |
| POST | /auth/logout | public | `@Public` + `RemoveTokenInterceptor`; works with expired token |
| POST | /auth/change-password | any | verify current password, set new hash, revoke all refresh tokens, re-issue cookies (SetTokenInterceptor) |
| GET | /auth/me | any | current user |

## Leads  `/leads`
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /leads | sales_pm, admin | list (filter: status, template, q, date) |
| POST | /leads | sales_pm, admin | create (wizard step 1); accepts `budgetCurrency` (server clamps to the template's allowed set — see currency note below) |
| GET | /leads/:id | sales_pm, admin | detail (SQL-scoped: a rep sees only own leads; admin sees own + any lead in the approval pipeline; else 403) |
| PATCH | /leads/:id | sales_pm, admin | update (also accepts `budgetCurrency`) |
| POST | /leads/:id/requirement | sales_pm | upload/paste brief (FileInterceptor) |
| GET | /leads/:id/readiness | sales_pm, admin | readiness score + AI client queries (generated once from the brief). **400 when the brief is empty** (no file, no text) |
| PATCH | /leads/:id/readiness/queries/:queryId | sales_pm, admin | confirm/answer or reopen a client query; recomputes readiness |
| POST | /leads/:id/generate | sales_pm, admin | generate/regenerate proposal+budget (RAG-grounded; optional `{prompt}` steers a revision). **400 when the brief is empty** (no uploaded file and no pasted text) — no AI spend on an empty brief |
| POST | /leads/:id/generate/budget | sales_pm, admin | regenerate budget resource plan only (optional `{prompt}`) |
| POST | /leads/:id/submit | sales_pm | send for approval: `generated` **or** `rejected` → `pending_approval` (sets `submitted_at`). **Admin caller → 400** (an admin has nobody to submit to). Invalid status → 400 |
| POST | /leads/:id/mark-sent | sales_pm, admin | `approved → sent` (either role). **Admin, own `generated` lead → sent directly** (still emits `lead.approved`; `submitted_at` stays NULL). Admin marking another rep's `generated` draft, or any other invalid status → 400 |
| POST | /leads/:id/mark-locked | sales_pm, admin | `sent → locked` (auto-create Project); invalid status → 400 |
| POST | /leads/:id/mark-lost | sales_pm, admin | `sent → lost` (`loss_reason` required → 400 if missing); invalid status → 400 |

## Proposals / Budgets  `/leads/:id/proposal`, `/leads/:id/budget`
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | …/proposal | any | current proposal (sections JSON) |
| POST | …/proposal/regenerate | sales_pm | delta regen (section-only) |
| GET | …/proposal/pdf | any | download branded PDF (Puppeteer) |
| GET | …/budget | sales_pm, admin | budget (milestones + lines + computed totals). Optional **`?currency=EUR`** re-prices **for display only** → `{ budget, computed, viewCurrency, converted, rate }`; nothing is written back, and an unknown currency with no FX rate on file → 400 |
| PUT | …/budget | sales_pm, admin | edit lines/adjustments (optimistic lock → 409 on stale) |
| POST | …/budget/regenerate | sales_pm | AI re-estimate role/day mix → compute |
| GET | …/budget/xlsx | any | export .xlsx (ExcelJS, live formulas) |
| GET | …/brief | sales_pm | generate-on-click Sales Brief |
| GET | …/pitch | sales_pm | generate-on-click Pitch Deck |

## Approvals (admin)  `/approvals`
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /approvals | admin | pending queue (oldest first) |
| POST | /approvals/:leadId/approve | admin | approve → lead `approved` (audit log); invalid status → 400 |
| POST | /approvals/:leadId/reject | admin | reject → lead **`rejected`** (returned to the rep, not bounced to `generated`); **note required → 400 if missing**; invalid status → 400. The note lands in the lead's comment thread as a `decision` comment |

## Rate cards  `/rate-cards`
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /rate-cards | sales_pm, admin | list the maintained day-rate card (52 roles / 8 departments, seniority-tiered) |
| GET | /rate-cards/suggest?role&seniority&currency | sales_pm, admin | suggested day-rate for the budget editor. Returns `{ role, seniority, currency, dayRateCents }`; **`dayRateCents: null` when the role is not on the card** (unknown roles are never priced). No FX rate on file for a non-sheet currency → 400 |
| POST | /rate-cards | admin | add a rate-card entry |
| PUT | /rate-cards | admin | save edited rate rows |
| POST | /rate-cards/import/preview | admin | parse a CSV/XLSX; **AI maps HEADERS only**, values parsed in code. <5 rows / unmapped required column → 400 |
| POST | /rate-cards/import/commit | admin | replace the whole card with previewed rows; too few rows → 400 |

## Settings  `/settings`
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | /settings | sales_pm, admin | all sections (defaults merged under stored overrides) |
| GET | /settings/:section | sales_pm, admin | one section (branding·approvals·templates·delivery·security·currency); unknown section → 400 |
| PUT | /settings/:section | admin | update a section (unknown keys dropped; per-section validation → 400). Sales caller → 403 |
| POST | /settings/currency/sync | admin | fetch the live USD→BDT rate and store it; FX provider unreachable/no rate → 400 |
| POST | /settings/branding/logo | admin | multipart logo upload (PNG/JPG/SVG/WebP ≤2 MB); embedded in every generated PDF. Missing/oversized/non-image → 400 |
| GET | /settings/branding/logo | **public** (`@Public`) | stream the company logo so client-facing deliverable views render without a session; 404 when no custom logo is set (app falls back to the bundled mark) |
| DELETE | /settings/branding/logo | admin | remove the custom logo, fall back to the bundled mark |

## Projects  `/projects`
| GET /projects | any | portfolio + database tabs |
| POST /projects | sales_pm | add project |
| GET /projects/:slug | any | detail |
| GET /projects/database | any | 39 real docs (preview/download via presigned URL) |

## KB / RAG  `/kb`  (internal)
| POST /kb/ingest | admin | enqueue parse→chunk→embed (skips template-author sample docs) |
| POST /kb/search | internal | metadata pre-filter + hybrid BM25+vector top-K |
| GET /kb/documents | staff | Database catalog (category + section per doc) |
| GET /kb/documents/:id/view · /download | staff | stream stored file inline / as attachment |
| POST /kb/documents/upload | staff | multipart: file + category + section + name — stored + RAG-embedded |
| PATCH /kb/documents/:id | staff | update `{title?}` and/or `{tags?}` (Notion-style; ≤10, deduped) |
| DELETE /kb/documents/:id | staff | move to Trash (30-day retention; chunks leave RAG immediately) |
| GET /kb/trash | staff | trashed docs + daysLeft |
| POST /kb/trash/:id/restore | staff | restore + re-index (re-embed) from stored file |
| DELETE /kb/trash/:id | staff | permanent delete (file + record) |
| POST /kb/trash/purge | staff | `{ids:[…]}` or `{all:true}` — bulk permanent delete |

## Auth extras
| POST /auth/verify-password | staff | re-authenticate `{password}` — guards destructive bulk actions (Database "Delete all") |
| GET /auth/me | staff | full DB profile (name falls back to email local part) — was JWT claims only |
| PATCH /auth/me | staff | update own display name `{name}` |

## Analytics  `/analytics` (admin)
| GET /analytics/overview | admin | KPIs + funnel + loss reasons. Funnel is **5 stages** (`generated → pending_approval → approved → sent → locked`, zeros included, `pct` vs the widest stage); `lost: { count, pct }` and **`rejected: { count, pct }`** are side-branches, not stages |

## Screen ↔ Endpoint map (D2 artifact; D6/D7 wire these)
- `leads` → GET /leads · `lead-detail` → GET /leads/:id (+ proposal/budget/brief/pitch) · `new-lead-*` → POST /leads, /requirement, /readiness, /generate · `approvals` → GET /approvals + approve/reject · `overview` → GET /analytics/overview · `projects` → /projects(+/database) · `settings` → users/rates/templates/branding · client `*-view` → GET proposal/budget (read-only).

## Security notes (carry into D5)
- refreshToken httpOnly+secure+sameSite=strict; **JWT_SECRET required (no fallback)**; token rotation on refresh; logout via RemoveTokenInterceptor.
- Rate-limit auth + generation; presigned URLs (short TTL) for document downloads; **escape user text** (comments) — XSS.

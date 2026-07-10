# Lead360 — Changelog

Single, human-readable trace of significant changes. **Policy:** every phase/decision appends a dated entry here;
`PIPELINE_STATUS.md` holds the phase state; the PRD carries versioned revision blocks (v1…). After the product is
live, **any change goes through an A/B check** (compare against the previous behavior/metrics) before it's adopted,
and gets an entry here.

## 2026-07-10 — Rejected status, 9-currency budgets, live FX sync, public logo, API sweep
**Lead status machine**
- Added a seventh status **`rejected`**. A rejected lead no longer bounces back to `generated` — it
  keeps its own status so a returned lead stays distinguishable from an untouched draft; the rep
  revises and resubmits from `rejected` (`RESUBMITTABLE = [generated, rejected]`). Enum order:
  `generated · pending_approval · approved · rejected · sent · locked · lost`.
- **Admins no longer submit for approval** (`POST /leads/:id/submit` → 400 for an admin): an admin IS
  the approver. An admin's own `generated` lead goes **straight to `sent`** via `mark-sent`, still
  emitting `lead.approved` so its deliverables are archived like an approved rep lead (`submitted_at`
  stays NULL). An admin cannot `mark-sent` another rep's `generated` draft (400 — must queue).
- The reject note is written into the lead's comment thread as a `decision` comment. UI (`StatusPill.tsx`):
  Generated · Awaiting Approval · Approved · Rejected · Sent to Client · Locked · Lost.

**Currency**
- Budgets now price in **9 currencies** (USD, BDT, GBP, EUR, CAD, AUD, CNY, JPY, INR). Default **BDT
  for `local`, USD otherwise**; the rep may override on `POST /leads` / `PATCH /leads/:id`
  (unsupported code → 400). **USD and BDT are read verbatim from the head-cost sheet's own columns**
  (never USD × FX for BDT); the other seven convert at the synced live rate.
- `GET /leads/:id/budget?currency=EUR` re-prices **for display only** (`{ budget, computed,
  viewCurrency, converted, rate }`); nothing is written back, and the budget table goes read-only
  whenever `viewCurrency !== budget.currency`.

**Settings & branding**
- `POST /settings/currency/sync` (admin) pulls a live USD→BDT rate from a **configurable `FX_API_URL`**
  (default open.er-api.com) — see the spec-reversal note under Fixed/§10. The `currency` section stores
  `{ usdBdt, vatPercent, syncedAt, syncSource, rates }`.
- Company logo endpoints: `POST/DELETE /settings/branding/logo` (admin, PNG/JPG/SVG/WebP ≤2 MB) and
  **`GET /settings/branding/logo` is `@Public`** so client-facing deliverable views render the logo
  without a session (404 → app falls back to the bundled mark). The logo is embedded in every
  generated proposal PDF.

**Security**
- **Empty-brief guard**: `POST /leads/:id/generate` and the readiness endpoint return **400** when
  there is neither an uploaded file nor pasted requirement text — no AI spend on an empty brief.

**Tooling**
- `npm run test:api-sweep` (`backend/test/api-sweep.mjs`) — 59 checks against a running backend
  (status machine, RBAC, cross-rep isolation, currency defaults/overrides, budget conversion,
  loss-reason validation, empty-brief guard, settings RBAC, analytics contract), reading credentials
  from `_fixtures.yaml`. Never triggers AI. Currently 59/59 passing.
- `npm run backfill:rejected` (`backend/src/database/backfill-rejected.ts`) — one-off, idempotent:
  adds `'rejected'` to the Postgres enum and re-labels leads rejected under the old behaviour, keyed
  off the most recent recorded decision in `approvals`.
- `GET /analytics/overview` now returns a **`rejected: { count, pct }`** side-branch alongside `lost`;
  the funnel stays 5 stages.

**Fixed**
- **Admin self-approve bug**: an admin submission used to auto-approve (Generated → Approved), letting
  an admin un-reject a lead they had just rejected. `submit` now rejects admin callers outright.
- **Login length-oracle**: removed `@MinLength(6)` from `LoginDto.password` — a short wrong password
  returned 400 (validation) while a long wrong password returned 401, and it locked out any account
  whose password predates the current policy. Strength is enforced only where passwords are created.
- **Proposal cover printed `$184,100.00`** instead of `$184,100` — whole-dollar totals no longer show
  trailing cents on the cover.
- **`docker-compose` advertised a Redis dependency that does not exist** — nothing connects to Redis;
  the service was removed rather than left running to imply a dependency. `POSTGRES_*` now read from
  the root `.env`.

## 2026-07-10 — Head-cost rate card, budget currency, real Settings, comments, avatars
- 🔓 **The authored head-cost spreadsheet arrived** and is now the single source of cost (spec §10),
  committed at `backend/data/rate-sources/Head-Cost-…(August-2025).xlsx`. New `npm run ingest:head-cost`
  rebuilds `rate_cards`: **52 roles × 8 departments**, monthly/daily/hourly in **both BDT and USD**.
  Verified cent-for-cent against the sheet in both currencies. Supersedes `ingest:rates` (medians from
  past budgets — the numbers matched, but the sheet is the truth).
  - **BDT prices are the sheet's own BDT columns, never USD × FX** (user decision) — each column is
    rounded independently in the sheet.
  - Seniority is **parsed from the role name** (`Sr.`/`Jr.`/lead/architect); the sheet has no column.
  - `day_rate_cents` kept as a deprecated mirror of `daily_usd_cents` so older budget code resolves.
- **Per-lead budget currency.** `leads.budget_currency`; `resolveBudgetCurrency()` enforces the rule
  **server-side**: Global/Agency/Design-Portfolio always price in USD; only a **Local** lead may pick
  BDT. Generation reads the matching column, prompts the model in that currency, and stamps the budget.
  Verified across all 6 template×currency combinations.
- **Bulk rate import** (`/rate-cards/import/preview` → `/import/commit`): the AI maps **column HEADERS
  only** — every value is parsed from the file in code, so a hallucination can mis-map a column (visible
  in the preview) but can never invent a price. Deterministic keyword fallback when AI is unavailable.
  Guards: refuses <5 rows, transactional replace, audit-logged. Fixed a header-detection bug where a
  merged title band outscored the real header row.
- **Settings is real.** New `org_settings` module (branding · approvals · templates · delivery ·
  security · currency), `GET/PUT /settings/:section` with per-section validation; `GET /audit`;
  `PATCH /auth/me/preferences`; `GET /users` + `PATCH /users/:id/role|active`. Guards verified: an admin
  cannot demote/deactivate themselves or remove the **last active admin**; deactivated users can't log
  in; Sales reads settings but gets 403 on writes and on the audit log. Every write is audit-logged.
  The Settings page now has **zero "Not configured" banners and zero dead buttons** (39 buttons audited).
- ⚠️ **Spec reversal:** §10 said "no live FX lookups". `POST /settings/currency/sync` now pulls a live
  USD→BDT rate (open.er-api.com; verified 123.33). Safe because **BDT budget prices still come from the
  sheet's BDT columns** — the synced rate is display/conversion only. Recorded so nobody "fixes" it back.
- **Comments**: shared `lead_comments` thread. Sales posts; an admin's approve/reject **note lands in the
  same thread**, colour-coded (green Approved / red Rejected). Reject requires a note (400 without).
  Visible on Lead Detail (both roles) and read-only on Approvals. Thread visibility follows the lead (403).
- 🐞 **Avatar uploaded but never displayed.** A plain `<img src>` to the authenticated avatar endpoint is
  cross-origin and arrives **without the cookie → 401 → broken image**. Now fetched as a blob through the
  axios client (cookies + 401-refresh) via `useAvatarUrl()`, falling back to initials on failure. Job
  title field removed (no backend).
- 🐞 **Seven endpoints excluded admins** (`@Roles(SALES_PM)` only): mark-sent/locked/lost, PATCH lead,
  POST /projects, proposal regenerate, delivery. Admins run leads exactly like Sales, so all seven now
  accept both roles. Verified by running a full lifecycle as admin.

## 2026-07-10 — Admin shell, RBAC scoping, invitations, Approvals + Overview rebuilt
- 🐞 **Root cause of "admin gets switched to the Sales view"**: `routes.ts` had `/leads/:id`,
  `/projects`, `/settings` inside the Sales-only `ProtectedLayout`, and the admin nav pointed at them.
  Admin now owns `/admin/leads`, `/admin/leads/:id`, `/admin/leads/new`, `/admin/projects`,
  `/admin/settings` (same role-aware components, explicit route ids). `ProtectedLayout` **redirects
  admins** to their equivalent page, so even a hand-typed Sales URL can't escape the shell. Both
  "Switch view" links removed. Admin nav gained **Projects** + icons. New `useRoleBase()` hook keeps
  shared pages linking inside the right shell.
- **Lead visibility, enforced in SQL** (`lead.repository.search` + new `findVisible` for detail —
  a rep could previously open another rep's lead by URL):
  - `sales_pm` → **own leads only** (reps can't see each other's pipelines).
  - `admin` → own leads + any lead that has **ever been submitted** (`submitted_at IS NOT NULL`).
    Keyed on `submitted_at`, **not** status: rejection returns a lead to `generated`, and keying on
    status would have hidden the very leads the admin just rejected. Caught by a live round-trip test.
  - New `leads.submitted_at` column, set on submit; also powers the Approvals "waiting" age.
- **Leads page**: status filter + Clear (URL-persisted, validates the param), colored status pills
  (Locked distinct from Approved), delete with a confirm modal, role-aware links.
- **Lead detail**: admin Approve/Reject bar when a lead is pending.
- **Admin credentials → `admin@admin.com` / `Admin@123`** (fixtures + existing row migrated, refresh
  tokens revoked; old password now 401s).
- **Invitations** (`invitations` table, SHA-256 token hash, 7-day expiry, single-use):
  `GET /users` (team), `POST /users/invite` → returns a one-time signup link, `DELETE
  /users/invitations/:id`, public `GET /users/invite/:token` + `POST /users/accept-invite`.
  Shared password policy (8+, upper, lower, digit, special) in `common/utils/password-policy.ts`,
  mirrored to the frontend. ⚠️ **No mail transport and `EMAIL_ENABLED=false`**, so `invite` reports
  `emailSent: false` and hands the admin a copyable link — it never pretends to have sent an email.
  Verified: weak password → 400, accept → 201, token reuse → 400, new rep logs in and sees 0 leads.
- **Admin Settings** page built (18 panels, 3 groups). Profile / Security / Rates & Currency /
  Knowledge Base are genuinely wired; Preferences, Templates, Approvals, Branding, Delivery, Audit
  render the real UI **disabled with a "Not configured" banner** (no fake saves, no invented rows).
- **Approvals + Overview rebuilt to their HTML designs**. Approvals: queue table (client/lead,
  template pill, submitted-by avatar, value, submitted, waiting age with >48h urgency), side-by-side
  proposal/budget review panel, note-required-to-reject. Overview: 4 KPI cards + **horizontal bar
  graph** for pipeline-by-stage (all 5 stages, zeros included, `pct` vs widest) + Lost "leaked"
  branch + loss-reason bars. Analytics gained `avgCycleDays`, `approvalTurnaroundHours`,
  `revenueAtStakeCents` (all `null`-able → UI shows "—", never a fake zero) and a normalized funnel.
  Honestly omitted/disabled: KPI delta chips (no history), date-range filter (no backend), sales
  comments (no backend), loss-reason drill-down (no route).

## 2026-07-10 — Illustrated diagrams + cover polish (Generation Engine v4)
- **Diagrams now look like Riseup's real figures**, not plain boxes: shared icon/palette library
  (`backend/src/common/utils/diagram-icons.ts` + mirrored `frontend/app/components/diagramIcons.tsx`,
  25 validated inline-SVG icons, 6-colour accent palette). Enriched schema: per-node `icon` (vocabulary-
  constrained so it can't hallucinate names), figure `subtitle`, and a bottom `focus`/`footer` strip
  with chip pills. Renderers rebuilt in PDF + web: accent-tinted node cards, numbered badges, orange
  flow arrows, in-figure heading band, tinted focus strip. Print-safe (inline SVG/CSS, `page-break-
  inside: avoid`); degrades gracefully for old proposals (no icon → `check`, no subtitle/strip → omitted).
- **Cover summary shortened**: new `coverTagline` section (1–2 sentences, ≤200 chars) replaces the
  dumped executive-summary paragraph on the hero + PDF cover. Fallback chain for old proposals:
  `coverTagline` → `outcome` → first *sentence* of the exec summary. Excluded from numbered sections.
- **Hero project name + cover summary are inline-editable** (pencil on hover): name persists to the
  lead via `PATCH /leads/:id`; tagline saves through the existing section-save plumbing.
- **"Engagement" (template name) removed** from the web hero and the PDF meta row — internal jargon.
- **Comparable-work cards are always clickable**: exact/substring title match → the project's
  riseuplabs.com page; else best word-overlap match (≥2 significant shared words); else the
  portfolio index. Applied in both renderers, including old proposals with no `url`.
- Verified by regenerating the user's Blitze lead (78s): tagline 147 chars vs 1,241-char exec summary,
  3 illustrated figures with icons + focus chips, 15-page PDF, comparables linked, no Engagement field.

## 2026-07-10 — Generation Engine v3: reference-fidelity (diagnosed against the real Blitz proposal)
- Diagnosed the user's rejected "Blitze" output against `Blitz_Clone_Technical_Proposal_Games_Scope.docx`.
  The diagrams **were** present (Figures 1–2 in the PDF); the real gaps were structural:
  1. `technicalApproach` rendered as a flat STAGE|DETAIL table — the reference uses **numbered named
     subsections** (4.1 Modular Platform Approach … 4.5 Admin, Compliance & Anti-Cheat).
  2. No **domain tables** (reference has Selected Game Scope + Game Inventory w/ type & complexity).
  3. Only 2 diagrams — reference has a **third domain control flow** (Wallet & Withdrawal).
  4. `developmentMethodology` was prose — reference tabulates **Step 1…Step 6**.
  5. Captions doubled ("Figure 1: Figure 1: …") when the model included its own prefix.
- **Category-aware RAG**: `retrieveContext(query, limit, category)` now reserves half the budget for
  chunks from *that template's real delivered Proposal documents* (`d.category = $cat AND
  meta->>'section' = 'Proposal'`), so a Global lead is grounded in Global proposals' structure/voice.
- **Prompt v3**: named subsections; methodology as `{step, description}[]`; new optional
  `domainTables` ({title, headers, rows}) and `controlFlowDiagram`; explicit "titles must not start
  with Figure N:" rule.
- **Renderers**: `technicalApproach` → numbered subsections (`5.1 …`, ordinal derived from the
  section's own position) in PDF + web; `domainTables` and `controlFlowDiagram` render; **dynamic
  figure numbering** (absent diagrams don't consume a number); `stripCaptionPrefix()` kills the dupe.
- **Verified by regenerating the user's actual Blitze lead** (82s, 21 sections): 6 named subsections,
  6-step methodology table, 2 domain tables (Scope Tiers 3 rows; Game Inventory 15 rows), 3 figures —
  *System Architecture Overview · Asynchronous Tournament Workflow · Wallet and Withdrawal Control
  Flow* — 13-page PDF, no duplicate captions.

## 2026-07-10 — Generation Engine v2: real rates, diagrams, cover+ToC PDF, editable financials
- 🔓 **§10 unblocked — invented rates purged.** New `npm run ingest:rates` parses the REAL Riseup
  budget spreadsheets ("head cost" docs: 8 corpus Budget xlsx + FIFA) — 106 rate rows → **33
  role/seniority entries**, median per-day BDT → USD at the spec's fixed 120. `rateFor()` now returns
  null for unknown roles and generation **skips the line** (logged) instead of inventing a price.
  First real budget: 25 lines, **$38,481** for an eLearning module (vs the absurd $788,900 before).
- **Prompt overhaul (reference-grade output)**: sections sized to match Riseup's delivered proposals
  (exec summary now ~1,200 chars vs ~500); explicit writing-quality contract (plain confident business
  English, no AI-filler vocabulary, concrete named tech/methods); new sections: **paymentTerms**,
  **changeRequest** (no monetary rates — card is the source), **architectureDiagram** (groups+flows)
  and **workflowDiagram** (numbered steps) rendered as print-safe flow-box figures in web + PDF;
  **comparableProjects auto-link** to riseuplabs.com portfolio pages via fuzzy title match (no match
  → honestly unlinked). maxTokens 8k→14k.
- **PDF**: cover page (logo, TECHNICAL [& FINANCIAL] PROPOSAL kicker, title, Version 1.0, tech
  keywords, Prepared by: Riseup Labs, date) + **clickable Table of Contents** (internal anchors —
  verified `Dest` entries in the PDF). 11 pages on the bench run; all markers verified via pdf-parse.
- **Web (ProposalDocument)**: matching cover info; CTA → **"Let's build."**; **AI-review warning
  banner** (amber, top of doc): "AI-generated draft — review before sending. Double-check: budget
  figures & day rates · technical requirements coverage · timeline commitments · client names and
  terminology."; comparable-work cards hyperlink; **Financial Proposal units/days editable inline**
  (live recompute, Save via the same budget PUT the Budget tab uses, optimistic-lock preserved);
  Payment Terms & Change Request are normal editable/deletable/regenerable sections; diagram
  sections regenerate/delete but hide the JSON editor.
- Bench: full generate 76s on gpt-5.4, 19 sections incl. 5-group architecture + 7-step workflow.
  (Renderer work executed by a subagent to spec; both typechecks clean.)

## 2026-07-09 — Portfolio filters, pagination everywhere, GLOBAL SEARCH, profile fix, SVG logo
- **Portfolio tab, riseuplabs.com-style**: service-category pill bar (AI, Website, Mobile Apps, Web
  Systems, eLearning, eCommerce, Games, AR/VR/MR, eGov, MIS, UN-NGO — pills with zero matches auto-hide),
  **Technology** dropdown (21 scraped stack values) and **Industry** dropdown (= project categories,
  per user decision — the scraped `industryTags` turned out to be client orgs like UNICEF/WHO).
- **Pagination with page-size selector (20/40/60)** on the portfolio grid AND the Database lists;
  every filter/search/page-size change resets to page 1 (no stranded empty pages).
- **Global search (topbar, both layouts)** replaces the dead input: debounced multi-keyword search
  across **leads, portfolio + manual projects, proposals, client requirements, budgets**; ranked by
  matched-keyword count, grouped with type icons, capped 5/group. Click = act: lead → lead detail,
  project → its live/riseuplabs link, document → opens via the authenticated viewer. **Search history**
  (localStorage, 8 entries, dedup) with **Clear all**. Edge cases: 300 ms debounce + out-of-order
  response guard, per-source failure isolation, min-2-chars, Escape/click-outside, empty & error states.
- 🐞 **Profile was broken two ways**: `GET /auth/me` returned only JWT claims (no name — the Settings
  Name field went blank on every reload) and Save was fake (`setMsg('Saved.')`). Now: `/auth/me` reads
  the DB profile, **name falls back to the email's local part** (farah.karim@… → "farah.karim") until
  set, `PATCH /auth/me` persists, Save refreshes the auth store. Live-verified.
- Riseup **SVG logo** added to `frontend/public/` + `backend/assets/` (from the riseuplabs.com CDN).

## 2026-07-09 — Database v5: Drive-sourced header stats, Owner column, Notion-grade tags
- **Header (Database tab)** now shows section totals ("N client requirements · N proposals · N budgets"),
  the source — “Proposal & Budget Database” (Google Drive) — and **last synced** (max `createdAt`
  across docs, i.e. the last time the database actually changed).
- **Owner column**: who generated (lead's sales owner, resolved through the approval event via
  `submittedById` → UserService) or manually added (upload resolves the current user's name — the JWT
  carries no name, so the controller looks it up). Pre-existing corpus docs default to **Riseup Labs**.
- **Tags → Notion behavior** under a **"Client"** column heading: the cell shows ONLY tag chips
  (dashed "Add tag" when empty — no permanent extra chip eating space). Clicking the cell opens a
  Notion-style popup: current tags removable (× / Backspace), "Select an option or create one" list
  of the category's saved tags (colored, stable per name — same tag looks identical across a
  category's sub-navs), inline create. Column labels (Client / Owner / Date) sit in the list header.
- Add-project category dropdown: **search box moved to the bottom** (menu opens upward, so the input
  stays adjacent to the trigger — user UX request).

## 2026-07-09 — Add-project modal: portfolio-grade fields, tech chips, merged categories, link
- Inline Add-project form → **modal** (`components/modals/AddProjectModal.tsx`) with close/Cancel.
- Fields now match the portfolio shape: **Name**, **Summary**, **Tech stack as chips** (type + Enter —
  "React Native ⏎ Node.js ⏎"; blur keeps an un-entered chip; backspace removes last), **Category
  multi-select** (searchable dropdown, checkboxes, create-new inline), **Link** (live site or
  riseuplabs.com page; https:// auto-prefixed; server validates with `@IsUrl` → 400 on garbage).
- **Category merge** (`utils/categoryMerge.ts`): the 57 raw portfolio tags contain many spellings of
  the same thing (Mobile App/Application/App Development; Lifestyle ×3; the "Information Mangement
  System" typo; IMS; eCommerce/e-commerce; Software/Software Development…) — the dropdown shows one
  canonical label per concept. Source data untouched; merge is presentation-level.
- Backend: `projects.link` column + DTO validation; manually added project cards now **link out**
  like portfolio cards. Verified live (create with categories+link → listed; bad URL → 400).
- Noted gap: **no DELETE /projects endpoint exists** (manual projects can't be removed from the UI).

## 2026-07-09 — Projects page: real portfolio wired in; fake Re-sync removed; UI fixes
- 🐞 The Portfolio tab read the `projects` table (0 rows — won-lead/manual projects) while the header
  claimed "synced from riseuplabs.com/portfolio"; the actual **64 scraped `portfolio_projects`** (the
  RAG stack-evidence base) were invisible, and **Re-sync was a fake toast**. Fixed: the tab now shows
  won/manual projects first + a "Riseup portfolio (64)" showcase grid (cards link to riseuplabs.com;
  search covers title/tech/category); header count is real; **Re-sync removed** (re-syncs happen from
  the dev environment via `POST /portfolio/ingest`).
- **Add project** form got a **Cancel** button (was un-dismissable).
- Database polish per user: tags moved to a **fixed straight column** (all "Add tag" chips align);
  sort dropdown dropped the redundant "Date — newest first" (Default already is latest-first).

## 2026-07-09 — Database tab v4: URL-persistent nav, dates, tags, search/sort/pagination
- **Reload keeps your place**: Projects tab + Database category + sub-nav live in the URL
  (`?tab=database&cat=Global&sec=Budget`), restored exactly on refresh.
- **Date column** per file: original **Drive-export file date** backfilled for the 36 corpus docs
  (13 distinct dates, Jan–Jul 2026 — `cp -p` re-copy of `data/kb-seed/` preserves them for fresh
  clones); **approval date** stamped when a lead's docs are filed; **added-on date** for manual
  uploads. (No live Google-Drive API sync — no credentials; the export's file dates are the source.)
- **Notion-style tags**: optional per-file chips (colored, stable per name). "Add tag" popover =
  type-to-create or pick from the pool; **pools are per-category** — a tag created under Agency →
  Client requirements is offered across Agency's sub-navs but never appears under Global/Local.
  Stored in `kb_documents.meta.tags`; PATCH accepts `{title?, tags?}` (≤10, 24-char, case-insens dedupe).
- **Dedicated search box** per list — matches file name **or tag**. **Sort dropdown**: Default
  (latest first) · Date ↑/↓ · A–Z · Z–A. **Pagination** at >20 files (20/page, footer with prev/next).
- Long titles truncate with … and show the full name on hover (native tooltip).
- Select-all now selects the filtered result set; the password+DELETE_ALL guard still keys off the
  *entire* sub-nav list, so a filtered "select all → delete" is a normal confirm, not a DELETE_ALL.

## 2026-07-09 — Database tab v3: selection & bulk actions, cursor policy, icon polish
- **Row checkboxes + select-all header** on every Database list (all categories/sub-navs). Bulk actions on
  selection: **Download (n)** (sequential authenticated downloads; skips catalog-only refs) and **Delete (n)**
  (confirm → Trash). Selecting **every** file arms **Delete all (n)** which requires the user's **password**
  (new `POST /auth/verify-password` re-auth endpoint, bcrypt server-side, `/auth/` excluded from the 401-refresh
  interceptor so a wrong password can't log you out) **and typing `DELETE_ALL`**.
- **Cursor policy reversed** (my earlier misread of the user's request): static text now shows the ARROW
  (no I-beam "writing" caret) while staying selectable; all clickables show the HAND pointer; inputs keep
  the I-beam; disabled → not-allowed. Site-wide in `app.css`.
- **File-type tiles**: removed the written PDF/DOCX/XLSX column; new `FileTypeBadge` atom (colored extension
  tile, file-manager style) used in Database + Trash. Preview/Download are now **icon-only** buttons.
- **Missing corpus files supplied by user & ingested**: `Scope of Work_Survivor Alliance… .pdf` (Global) and
  `ToR - Strengthening IPEMIS.pdf` (Local) — stored, embedded (1 + 30 chunks), copied into `data/kb-seed/`,
  and the two stale file-less "Reference" catalog rows purged. Zero reference-only rows remain.

## 2026-07-09 — Database tab v2: sub-navs, add/rename/trash, GitHub-portable storage
- **Sub-navs per template** (Projects → Database): Agency & Design Portfolio → *Client requirements | Proposal*;
  Global & Local → *+ Budget*. One section shown at a time; per-sub-nav **Add** button → modal with
  drag-&-drop + file-name field. Every added file is stored, downloadable, and **immediately embedded into RAG**.
- **Rename** (pencil → inline edit) and **Delete** (warning modal) on every file row.
- **Trash** (Settings → Trash): soft-delete with **30-day retention**; restore / purge one / purge selected /
  empty-all (each purge confirms). Daily auto-purge job. Key semantics: **trashed = forgotten** — chunks +
  embeddings are removed at delete-time (and retrieval also joins on `deleted_at IS NULL` as belt-and-braces);
  **restore re-learns** the file (re-extract + re-embed). Verified end-to-end via a 9-step API lifecycle test.
- 🐞 Found & fixed: `addGeneratedDoc` (approval → Database filing) **never indexed into RAG** — approved
  proposals/budgets were stored but not learned. Now extracts + embeds; re-approval replaces stale chunks.
- **Approval hook extended**: on approve, the lead's **client requirement** (brief attachments, or pasted text
  as .txt) is filed alongside the proposal PDF; **budget xlsx only for Global/Local** (combined templates carry
  it inside the proposal). Storage local-delete was a silent no-op — fixed (purged files now leave the disk).
- **Purged**: the 2 junk "Untitled document" PDFs (Design Portfolio) and 3 synthetic AP-automation test docs
  (violated the v13 Riseup-only provenance rule; trashed, auto-purge in 30 days).
- **GitHub-portable storage**: the Riseup corpus now lives **committed** at `backend/data/kb-seed/<Category>/<Section>/`
  (35 files, 37 MB); `npm run ingest:riseup` reads it by default (Downloads-folder dependency removed).
  `uploads/` stays runtime-only/gitignored. New **`SETUP.md`** (clone → running, fresh vs carry-over paths)
  + PROD_DEPLOYMENT §3b (data-migration paths, trash-job scaling note). ⚠️ Repo must stay **private** —
  the corpus is real client material.
- Upload/rename/trash endpoints are open to **Sales + Admin** (was admin-only upload).

## 2026-07-09 — Settled on **gpt-5.4**; fixed false model/token telemetry
- **Model benchmark** (identical proposal-shaped prompt, measured not estimated):

  | model | latency | price in/out per 1M | verdict |
  |---|---|---|---|
  | `gpt-5.5` | 26.9s | $5.00 / $30.00 | 2× cost & 2× latency of 5.4 |
  | `gpt-5.4` | **14.0s** | **$2.50 / $15.00** | **chosen** |
  | `gpt-5.4-mini` | 23.1s | $0.75 / $4.50 | thinner prose; not client-facing |
  | `gpt-5.1` | 28.4s | unlisted (legacy) | slower than both, no price edge — rejected |

  Reasoning tokens were **0** on all of them for this workload, so no hidden "thinking" cost.
- `AI_CHAT_MODEL=gpt-5.4`. Provider stays OpenAI; embeddings unchanged (`text-embedding-3-small` @768).
- 🐞 **Telemetry was lying.** `generation.service.ts` hardcoded `model: 'gemini'` in **5 places** (dead since the
  OpenAI migration) and recorded `tokensIn: 0, tokensOut: 0` for **budget / section / brief / pitch** — only the
  proposal call reported real usage. Cost analysis built on that data was wrong. Fixed: added `AiService.model`
  getter; every call site now records the true model + real token counts. `generateBudget()` returns its usage
  instead of swallowing it, and the budget call made inside `generateProposal()` now gets its own `Generation` row.
- **Measured full pipeline on gpt-5.4** (proposal+budget 49.5s, brief 19.0s, pitch 11.5s, section regen 7.8s):
  11,922 in / 5,364 out = **$0.110**; with ~3 regens ≈ **$0.12/lead** → **~$13/month** at 4–5 leads/day.
  **Output tokens are 73% of the bill** — prompt size is not the lever, response length is.
- ⚠️ Open: the ~50s blocking `POST /generate` will exceed a 60s nginx/LB idle timeout in prod. Needs a background
  job (202 + poll) or SSE streaming before deploy.
- ⚠️ Watch: 5.4/5.5 have a long-context price tier (~2× input) above a context threshold; prompts sit at ~2–4k today.

## 2026-07-09 — Upgraded generation model to gpt-5.5 (+ reasoning-model parameter compatibility)
- Audited what was actually running: **one chat model did everything** — `gpt-4o-mini` (proposal sections, budget resource
  plan, sales brief, pitch deck, per-section regenerate, readiness queries) + `text-embedding-3-small` @768 for all RAG.
  4o-mini was **my** default choice when wiring OpenAI, not a requirement; it's the weakest model the key can reach.
- Key is an OpenAI **Platform API** key (`sk-proj-…`, pay-per-token) — *not* ChatGPT Plus/Pro, which grant no API access.
  It can see 126 models incl. gpt-5.x, gpt-4.1, o1/o3/o4.
- **`AiService` made parameter-aware.** Verified by live call: `gpt-5.5` **rejects `max_tokens`** (demands
  `max_completion_tokens`) and **rejects non-default `temperature`**; `gpt-5.5-pro` is **not a chat-completions model** at
  all (Responses API only). Now the right token parameter is chosen per model (`/^(gpt-5|o1|o3|o4)/`), temperature is never
  sent, and an empty response with `finish_reason=length` raises a clear "exhausted budget on reasoning" error instead of
  failing silently.
- **Switched `AI_CHAT_MODEL=gpt-5.5`.** Verified end-to-end: proposal → 201, **15 sections in 99s**, prose visibly grounded
  in RAG (cites SAP S/4HANA + OCR + Node/Python/React from the ingested reference); the same call's budget generation also
  succeeded (7 lines, $127,400) with no silent failure. Embeddings stay on `text-embedding-3-small`.
- Trade-off recorded: ~99s/proposal and materially higher token cost vs 4o-mini. Spec §6's Claude Opus 4.8 remains
  unreachable on an OpenAI key (needs an Anthropic key) — still an open conflict.

## 2026-07-09 — Spec §4.3 + §5: FIFA budget export with live formulas, and per-template output routing
- **Budget export now equals the format the system generates** (§4.3). `exportXlsx` rebuilt: merged
  `"Cost Breakdown for Item N / <Milestone>"` banner, the 9-column FIFA header, **department-grouped rows** (Sl./name only
  on a group's first row), **one sheet per milestone** (+ a Summary sheet when there are several), a `Note: … Timeline = n
  weeks` row, and Arial-10 / `$#,##0` / bordered formatting.
  **All values are REAL formulas, not baked numbers:** `H{r}=E*F*G`, `I{first}=SUM(H{first}:H{last})` per department group,
  grand total `=SUM(I…)`, and contingency/discount/VAT/total chained off the total cell — so the file recomputes in
  Excel/Sheets. Verified by reading the generated workbook back with ExcelJS.
- **Output routing (§5).** Agency & Design Portfolio deliver ONE combined document: **the Budget tab is gone** and the
  budget renders inside the proposal as a **Financial Proposal** section (Estimated Cost Breakdown table + Payment Terms
  30/30/30/10 + Change Request USD 150/man-day · 25/man-hour, per §3.3/§3.4). Global & Local keep **separate Proposal and
  Budget tabs**. The CR rate is labelled as a default until a "CR Rate" rate-card entry exists (honest per §10).
- New-Lead wizard: the Generate step's "View lead" button is now just **"View"**.

## 2026-07-09 — Generation-Engine spec §9.1 + §1: portfolio RAG + evidence-cited stack resolution
Adopting `Lead360_Generation_Engine_Prompt.md`. Decisions taken with the user: section contracts come from the **real
template .docx** (not the spec's §3 lists, which differ); output = **DOCX/XLSX per §5 while keeping the PDF**.
- **New `portfolio` module.** Scrapes `riseuplabs.com/portfolio` + every case-study page (cheerio). Real projects are
  discriminated by the `❏ Label : Value` meta table — **64 projects ingested, 85 service/marketing pages skipped** out of
  149 candidates. Idempotent by `detail_url` (re-ingest kept the count at 64). Embedded into `portfolio_projects.embedding`
  (pgvector 768) for top-K similarity.
- **§1 stack resolution.** The portfolio publishes **no tech stack**, so it's derived from the spec's stack-recommendation
  table (transcribed verbatim, `stack-recommendation.ts` — the only place a default stack may be asserted).
  `POST /portfolio/resolve-stack` returns the stack **with per-technology evidence citing real portfolio URLs**, the matched
  rule, and warnings for any rule-only technology with no portfolio backing (auditable per §10 "no filler").
- **Two correctness bugs found & fixed while testing** (both would have failed acceptance §8.8):
  1. substring matching let `'ar'` match inside "Le**ar**ning" and the platform string "Website and Mobile" outrank the
     category — an eLearning project resolved to Unity/AR. Fixed with word-boundary matching + **field-weighted scoring**
     (Category ≫ Platform) and single most-specific rule instead of a union.
  2. `resolveStack` cross-referenced the *union of retrieved categories*, so a VR brief resolved to a Laravel/Moodle stack.
     Now the **brief** is the primary signal; comparables supply evidence + a secondary dominant-category signal.
- **Bug: `synchronize:true` drops the unmanaged `embedding` column on every boot** (same trap as `kb_chunks`), silently
  wiping the vectors. Added `onModuleInit` self-heal + `POST /portfolio/embed` to re-embed without re-scraping.
- Verified: eLearning brief → eLearning (LMS) + 3 real citations; VR brief → AR/VR/MR rule (flags C#/Maya/3DS Max/Blender
  as uncited); Game brief → Games (mobile/casino), fully cited (Blackjack 21, Jeeto Online, Game Plan).
- **BLOCKED:** §2/§4 (rate card) — `Human-Cost-…-August-2025_.xlsx` does not exist on this machine. The 21 seeded day-rates
  are invented and remain an active §10 violation until that file lands.

## 2026-07-09 — Proposal sections are editable + deletable (per point / per table row)
- **Inline editing per section**, shape-aware via new `ProposalSectionEditor`:
  - prose → textarea; **bullet points** → each point editable with add/remove; **table rows** → every cell editable with
    add/remove row. Save/Cancel per section.
- **Delete any section** (with confirm) — removes it from the proposal and the PDF.
- Backend: `PUT /leads/:id/proposal/section` (`{key, value}` — value stored as-is, shape preserved) and
  `DELETE /leads/:id/proposal/section/:key`; `ProposalService.setSection` / new `removeSection`.
- Section header now carries **Edit · Regenerate · Delete** (internal view only; the client proposal-view stays
  read-only since it passes no handlers).
- Verified end-to-end: prose edit, string[] edit (stayed an array), object[] edit (kept `{layer, detail}` shape), and
  section delete all persisted correctly.

## 2026-07-09 — Proposal: real PDF download, logo, bigger headings, architecture, per-section regenerate
- **Download PDF now downloads the real generated PDF** (was opening the client view in a tab). New
  `GET /leads/:id/proposal/pdf` renders the branded document via Puppeteer and streams it; the frontend fetches it as a
  **blob through the authenticated client** and saves `{Lead}-Proposal.pdf`. Verified: `Content-Type: application/pdf`,
  `%PDF-` header, 163 KB.
- **Shared `proposal-html.util`** now backs BOTH the on-approval deliverable and the on-demand PDF (removed the duplicate
  private renderer). Made it **shape-aware**: object-arrays → tables, string-arrays → lists, strings → paragraphs — so
  the structured proposal renders properly in the PDF instead of raw JSON.
- **Logo** — real `riseup-logo.png` in the proposal header (frontend `public/`, and base64-embedded in the PDF from
  `backend/assets/`; ⚠️ prod must ship `backend/assets`).
- **Bigger, bolder headings** — section titles are now 26–28px extrabold with a filled orange number badge (screen), and
  22px extrabold with a badge in the PDF.
- **High-Level Architecture section** added to the proposal (AI emits `architecture` as `{layer, detail}` rows; rendered
  as a table on screen + in the PDF). Verified: 5 rows generated.
- **Per-section regenerate with a prompt** — each section has a *Regenerate* control that takes a plain-English
  instruction; `POST /leads/:id/generate/section` rewrites only that section **keeping its JSON shape**. Verified: exec
  summary rewritten to lead with the 80%-touchless outcome as instructed.

## 2026-07-08 — Fix: Database Preview/Download didn't work (auth on cross-port <a> links)
- Root cause: the Database Preview/Download were plain `<a href="http://localhost:3000/api/...">` links. A cross-port
  top-level navigation can't reliably carry the httpOnly cookie and can't trigger the 401-refresh, so it 401'd / showed a
  JSON error instead of the file.
- Fix: new `openKbFile(id, mode, filename)` fetches the file through the **authenticated axios client** (withCredentials
  + 401-refresh interceptor) as a **blob**, then opens it in a new tab (Preview) or triggers a download. Backend
  view/download endpoints confirmed 200 with correct content-type/disposition.
- Also cleaned the UI: seeded catalog rows with no stored file now show a clear **"Reference"** tag instead of
  Preview/Download buttons that only toasted. (Uploaded docs + generated deliverables are the ones that download.)

## 2026-07-08 — Sales Brief + Pitch Deck: AI-generated content + design-matched UI
- Both were placeholders; now they're real AI artifacts generated on demand from the proposal (with RAG grounding).
- **Sales Brief** = internal pitch pack (8 sections: what we're proposing · why it matters · key highlights · talking
  points · objections & responses table · comparable Riseup projects · 60-second pitch · suggested close). New
  `POST /leads/:id/generate/brief`; stored on `proposals.sales_brief`. UI matches the design (numbered `brief-sec`
  sections, objections table, primary-bordered quote) with the `genempty` "Generate brief" empty state.
- **Pitch Deck** = 13-slide 16:9 deck (cover, problem, solution, how-it-works, architecture, phases, proof, team,
  stack, objections, pricing, next step). New `POST /leads/:id/generate/pitch`; stored on `proposals.pitch_deck`. UI is
  the 2-col dark-slide grid from the design + "Generate slides" empty state.
- Added `sales_brief`/`pitch_deck` jsonb to the Proposal entity; `getProposal` returns both. New shared
  `SalesBriefPitch.tsx` (SalesBriefView + PitchDeckView). Verified: brief → 8 keys; deck → 13 slides. Removed the old
  raw-requirement Sales Brief placeholder.

## 2026-07-08 — Switched AI provider to OpenAI (env-only, provider-agnostic paid off)
- Because the AI layer is OpenAI-compatible, moving from Gemini → **OpenAI** was env-only + a tiny code tweak: the key
  var is now provider-neutral **`AI_API_KEY`** (falls back to `GEMINI_API_KEY`). `.env`: `AI_BASE_URL=https://api.openai.com/v1`,
  `AI_CHAT_MODEL=gpt-4o-mini`, `AI_EMBED_MODEL=text-embedding-3-small` (pinned to 768 dims to match the pgvector column).
- Cleared the old Gemini embeddings (different vector space) so semantic search stays consistent; new ingests embed with
  OpenAI. Verified end-to-end on OpenAI: ingest → embedded; generate → 10 proposal sections + 6-line AI budget ($129,550).
- ⚠️ OpenAI is **pay-per-use** (unlike the Gemini free tier) — usage is billed. Key lives in `backend/.env` (gitignored);
  rotate/limit it since it was shared in chat.

## 2026-07-08 — AI budget generation + RAG learning loop (self-improving proposals & budgets)
- **Budget is now auto-generated with the proposal** (was manual). On `generate`, after the proposal the AI infers a
  delivery **resource plan** (department/role/seniority/units/days) in Riseup's FIFA format. **Rates come from the rate
  card, never the LLM** (`RateCardService.rateFor`), and the app computes every total. Verified end-to-end: a global
  ATEC brief → 7 lines (PM, designer, backend senior+mid, frontend, devops, QA) at seeded rates → **$103,900** computed.
- **RAG grounding for both** proposal and budget — `kb.retrieveContext` passes the top matching past-Riseup passages
  into both prompts (the budget prompt also lists valid rate-card roles so the AI picks real ones).
- **Learning loop (the "learn from project data" ask):** each generated budget records **role-day samples** keyed by
  template (`RoleDaySample`); `RateCardService.learnedDays(template)` averages them and injects them as baselines into the
  next budget prompt — so estimates improve as more projects are generated. Verified: samples persisted (global: Backend
  Engineer avg 60d, UI/UX 25d, …). Frontend: the Generate button now says "proposal + budget" and refetches the budget.
- Wiring: `GenerationModule` imports Budget + RateCard; `BudgetService.applyGeneratedPlan` (system-generated, no lock
  check) replaces lines + recomputes; JSON-mode + 8k tokens keep generation reliable.

## 2026-07-08 — Proposal document rebuilt to match client/proposal-view.page.html
- `ProposalDocument` rewritten to the polished client-proposal design: **sticky section-nav TOC** (numbered, with
  scrollspy), **dark radial-gradient hero** (RISEUP LABS + title + tagline + Prepared-for/Engagement/Timeline/Investment
  meta), **eyebrow-numbered sections** (01 badge + title) with a warm intro card for the summary, an **Investment**
  block with the big total, and a dark **CTA**. Plus Jakarta Sans, warm palette (#FBF7F3/#EAE4DE/#EA5400/#1A1715).
- Lead Detail Proposal tab renders it in **embed style** (no TOC, matching the design's `?embed=1` iframe); the client
  proposal-view renders the full two-column doc (TOC + article, container widened to 1180px).

## 2026-07-08 — Proposal + Budget views rebuilt to the real Riseup structure
- **Proposal view = branded document.** New shared `ProposalDocument` (cover: RISEUP LABS + title + prepared-for/
  contact/engagement/investment, then numbered sections) used by the Lead Detail Proposal tab AND the client
  proposal-view (was a plain cover + raw keys). Sections now use the **canonical Riseup headings** taken from real
  Riseup proposal DOCX files: 1 Executive Summary · 2 Project Understanding · 3 Proposed Scope · 4 Proposed Technical
  Approach · 5 Proposed Technical Stack · 6 Development Methodology · 7 Deliverables · 8 Testing & QA · 9 Assumptions &
  Boundaries · 10 Conclusion. Generation prompt + the PDF renderer emit/render these keys in this order.
- **Budget view rebuilt** to match the design: AI "how this was built" note, dark **Cost Breakdown · {dept}** header
  with the live grand total, **Sl.** + **Type (seniority)** columns, **seniority auto-fills the rate from the rate card**
  (`GET /rate-cards/suggest`), **Export .xlsx** button, and the delivery-timeline note. Live recompute + optimistic-lock
  save unchanged.
- **Fixed AI JSON truncation flakiness:** gemini-2.5-flash (a thinking model) sometimes truncated the JSON at 3500
  tokens → parse error. Now uses **JSON mode** (`response_format: json_object`) + 8000-token headroom. Re-tested: full
  10-section proposal returns reliably.

## 2026-07-08 — Prod-deploy guide + uploadable/downloadable DB docs + default cursor
- **`PROD_DEPLOYMENT.md`** added — a keep-and-follow checklist for moving off the free dev stack to paid AWS prod:
  RDS Postgres + pgvector, migrations with `synchronize` OFF, paid AI key (provider-agnostic swap), S3 storage, Secrets
  Manager, EC2/ECS + HTTPS/cookies, Puppeteer/Chromium on the server, SES, monitoring, CI/CD, plus a go-live sequence.
- **Database documents now uploadable + viewable/downloadable:** new admin `POST /kb/documents/upload` (FileInterceptor)
  stores the file (downloadable via existing `/kb/documents/:id/{view,download}`) AND extracts→chunks→**embeds** it for
  RAG. Shared `extract-text.util` (pdf/docx/txt); KbService `indexText` refactor shared by ingest + upload. Frontend:
  admin **"Add document"** form (category/section + file) in the Database tab; uploaded docs show working View/Download.
  Verified end-to-end (upload → `downloadable/parsed/embedded` true → appears downloadable → file streams back). The 38
  seeded catalog entries stay reference-only until their real files are uploaded this way.
- **Cursor preference:** buttons, links, `[role=button|tab]` now use the **default arrow** cursor (not the pointer
  finger); disabled → `not-allowed`. Global rule in `app/styles/app.css`.

## 2026-07-08 — Parts B + C: DB prod-readiness (migrations + Rate Card) & auth hardening (all $0)
**B — Database production-readiness (code-only):**
- **Real migrations authored + validated.** Generated `InitialSchema` (all 21 tables) against a throwaway empty Neon DB,
  hand-wrote `AddKbEmbedding` (pgvector extension + `kb_chunks.embedding vector(768)` + HNSW cosine index). Ran the full
  chain (EnableVectorExtension → InitialSchema → AddKbEmbedding) on a fresh DB — **all executed cleanly**. Prod can now
  run `migration:run` with `synchronize` OFF (removes the boot-race fragility); dev keeps synchronize for convenience.
- **Rate Card module built + wired** (un-orphans `RateCard`/`RoleDaySample`): `GET /rate-cards`, `GET /rate-cards/suggest`
  (budget pre-fill), `POST /rate-cards` (admin). **Seeded 21 entries** (7 roles × senior/mid/junior, USD/day). Verified:
  suggest(Backend Engineer, senior) → $450/day.
**C — Refresh-token store + revocation (code-only):**
- New `refresh_tokens` table stores a **SHA-256 hash** of each issued refresh token. On refresh the presented token must
  exist (else revoked/replayed → 401), then it's deleted (one-time rotation) before a new pair is issued; logout revokes.
- **Verified end-to-end:** rotate → 201; **reuse old token → 401** (reuse detection); new token → 201; logout → refresh
  → 401. Expired tokens are pruned opportunistically.

## 2026-07-08 — Part A: switched AI to free Google Gemini + real semantic RAG (pgvector on Neon)
- **Cost:** $0 — Gemini free tier (no card) + pgvector on the existing free Neon DB.
- **Provider-agnostic `AiService`** (replaces Anthropic-only `ClaudeService`): OpenAI SDK pointed at Gemini's
  OpenAI-compatible endpoint. `complete()`/`json()` for drafting + `embed()` for RAG. Configurable via
  `AI_BASE_URL`/`AI_CHAT_MODEL`/`AI_EMBED_MODEL` — swappable to Ollama/OpenAI with no code change. Disabled cleanly
  (503) until `GEMINI_API_KEY` is set.
- **Real RAG (was keyword-only):** on boot KbService idempotently enables `pgvector` + adds `kb_chunks.embedding
  vector(768)` + HNSW cosine index — **confirmed live on Neon** ("pgvector ready"). Chunks are embedded on ingest;
  `retrieveContext()` does cosine (`<=>`) nearest-neighbour search (keyword fallback). **Generation now injects the top
  retrieved Riseup passages into the prompt** — the actual "grounded in past work" promise.
- Backend builds + boots clean; `text-embedding-004` = 768-dim (`EMBED_DIM`). `.env`/`.env.example` updated.
- **TESTED WORKING (2026-07-08):** the pasted key was valid after all (a newer Google key format — my first test wrongly
  sent it as a Bearer token to an OAuth endpoint). Correct models for this key: **`gemini-2.5-flash`** (chat) +
  **`gemini-embedding-001`** (embeddings, pinned to 768 dims via the `dimensions` param). End-to-end proof: ingest →
  `embedded:1` (vector stored in pgvector); generate → all 9 proposal sections returned, **visibly grounded** in the
  ingested Riseup reference (SAP S/4HANA + OCR phrasing carried through). Core promise now real, $0.
- **Dev note:** with `synchronize=true`, TypeORM occasionally races the raw `embedding` column/index on boot; KbService's
  `onModuleInit` re-creates them idempotently each start (self-heals). Authoring real migrations (Part B) removes this.
- Fixed a zombie-process trap: an old keyless backend held :3000 so requests hit it (`embedded:0`) — killed, restarted clean.

## 2026-07-08 — New-Lead 5-step wizard + Lead Detail redesign (design + flow fidelity)
- **New Lead was a single form; the design is a 5-step wizard.** Rebuilt `new-lead.tsx` as **Info → Requirement →
  Readiness → Template → Generate** with the sticky stepper (numbered/checked nodes + connectors), matching each step:
  - *Info* (company/contact/email/website/optional title) → creates the lead.
  - *Requirement* (drag-&-drop dropzone + browse, per-file **Parsed** status via real upload, OR paste text).
  - *Readiness* (score /100 + gauge AT-RISK/FAIR/READY + open-queries, data-driven from `GET /leads/:id/readiness`).
  - *Template* (Global/Local/Agency/Design-Portfolio cards with preview mockups + doc-type line) → `PATCH /leads/:id`.
  - *Generate* (staged progress: retrieving/drafting/building/rendering → "Proposal ready" → View lead); calls the real
    generate API (gracefully proceeds if the AI key is absent).
- **Lead Detail redesigned** to the prototype: breadcrumb + status badge; **two-column** layout; tabs **Proposal /
  Budget / Sales Brief / Pitch Deck**; dark **proposal cover** (RISEUP LABS, headline, Prepared-for/Engagement/Timeline/
  Value); right **STATUS panel** (badge, Archived-to-Database, status-specific actions incl. Download budget Excel via
  `/budget/xlsx`, Mark sent, timeline) + **CLIENT panel** (company/contact/email/website). Sales Brief reads the real
  requirement (new `GET /leads/:id/requirement`).
- Verified the full wizard API sequence (create → upload/parse → readiness → PATCH template → generate) + detail wiring.
  Typechecks clean. Remaining fidelity pass: Settings, Login, admin pages, client views.

## 2026-07-07 — Design fidelity: Projects page + app shell rebuilt to match the HTML prototype
- User flagged the Projects/Database page (and the app broadly) drifting from `design/html/app/projects.page.html`.
- **Database tab** rebuilt to the prototype exactly: left **category rail** (Agency/Design Portfolio/Global/Local with
  Lucide icons + counts + active orange bar) × **sections** (Client requirement/Proposal/Budget with icons) × **file rows**
  (coloured file-type icon, name, uppercase ext label, **Preview + Download** buttons). Uses `lucide-react`. Downloadable
  deliverables get working Preview/Download; catalog references show a toast (source lives in the Riseup Drive).
- **Projects header** now matches: green-dot "N projects · synced from riseuplabs.com/portfolio", lock note, **Re-sync**
  + **Add project** buttons, segmented **Portfolio/Database** tabs with icons. Portfolio cards gained the cover/gradient
  + top-bar styling from the prototype (kept data-driven).
- **App shell (AppLayout)** aligned: sidebar nav icons (list/folder/settings) + active orange bar, **account menu** popup
  (Settings, Switch-to-Admin-view for admins, Sign out with icons + chevron), topbar **search icon + New Lead** button.
- Remaining pages (Leads, Lead Detail, New-Lead wizard, Settings, Login, admin, client views) to get the same fidelity
  pass next — tracked as follow-up.

## 2026-07-07 — Admin authoring + auto-approve + deliverables to Database + lead delete + downloads
Four requested features (all verified end-to-end via API):
- **Lead delete:** `DELETE /leads/:id` (soft delete; Sales+Admin) + a Delete button per row in the leads list
  (stops row-nav, confirms). Verified 200 -> subsequent GET 404.
- **Admin authoring + auto-approve:** Admin now allowed on create-lead / requirement / budget PUT / generate. Admin
  `submit` **auto-approves** (Generated -> Approved, skips the queue). Admin Leads page gained a "+ New Lead" button.
- **Approved -> Database:** new `lead.approved` event (fired by queue-approve AND admin auto-approve) -> `DeliverablesModule`
  listener builds the **budget .xlsx** (ExcelJS) + **proposal .pdf** (Puppeteer/Chromium) and files them into the Database
  (`KbService.addGeneratedDoc`, category = lead template). Failures are logged, never break approval.
- **Database view/download:** `GET /kb/documents/:id/{download,view}` stream the stored file; `listDocuments` now returns
  `downloadable`. Frontend Database rows show **View + Download** for generated deliverables, a **Reference** tag for the
  seeded catalog (no stored file). Installed Chromium for Puppeteer; added `PdfModule` + `StorageService.getObject`.
- **Bugs found & fixed by live testing:** (a) budget `replace` 500 — spreading the stale `lines` relation into
  `budget.save` orphaned the just-inserted line (budget_id -> null NOT NULL violation); now saves scalar columns only.
  (b) `TransformInterceptor` wrapped `StreamableFile` in the JSON envelope, corrupting downloads (also broke the existing
  xlsx export) — now passes files through untouched. (c) `HttpExceptionFilter` silently swallowed 500s — now logs the stack.

## 2026-07-07 — Add: Projects > Database tab (was missing vs. HTML design)
- The approved prototype's Projects page had **two tabs — Portfolio + Database** (the *Riseup Proposal & Budget
  Database*); React only had Portfolio. Restored the Database tab.
- **Backend:** `GET /kb/documents` (KB catalog list) + repo/service `listDocs`/`listDocuments`. **Seeded 38 real Riseup
  documents** into `kb_documents` from the design library — category (Agency/Design Portfolio/Global/Local) × section
  (Client requirement/Proposal/Budget) × file type — idempotent, Riseup-data-only. Section/fileType stored in `meta`.
- **Frontend:** Projects page now has **Portfolio | Database** segmented tabs. Database panel fetches from the API
  (not hardcoded, per RULE-F6), with category filter chips + counts, sections, and file-type badges (pdf/docx/xlsx/pptx).
  Read-only catalog (source files live in the Riseup Drive; download wires up when real files are ingested). Typechecks clean.

## 2026-07-07 — Feature: brief document upload (PDF/DOCX/TXT) with text extraction
- **Backend:** new `POST /leads/:id/requirement/attachments` (FileInterceptor, 10 MB cap). Stores the file via
  StorageService (local disk in dev, key `leads/{id}/brief/{ts}-{name}`), extracts text — **pdf-parse** (PDF),
  **mammoth** (DOCX), utf-8 (TXT/MD) — and merges both the file ref (`requirement.files[]`) and the extracted text
  into `requirement.sourceText` so generation can use it. Legacy `.doc` is stored but not parsed. Deps: pdf-parse,
  mammoth, @types/multer. Verified end-to-end (txt → 201, `parsed:true`, text merged, file on disk).
- **Frontend:** New-Lead brief step gains a **file picker** (multi-select, 10 MB client check, add/remove list,
  accepts pdf/doc/docx/txt/md); on submit it creates the lead, saves the pasted text, then uploads each doc.
  `uploadBriefAttachment` sends multipart (Content-Type override for the boundary). Typechecks clean.

## 2026-07-07 — Fix: Budget tab broke on every new lead (404) + gaps found in live testing
- **Budget:** `getForLead` threw 404 when a lead had no budget row (nothing ever created one), so the Budget tab showed
  an error on every freshly-created lead. Fixed: it now **lazily creates an empty budget** (USD, zero lines) so the editor
  loads and you can add lines + Save. Verified via API (create lead → GET budget → 200 with `lines:[]`). 5th live bug.
- **Identified (not yet built):** (a) brief **PDF/DOC upload** was never implemented — the brief step is a textarea only
  and the backend has **no file-upload endpoint** (no FileInterceptor anywhere); (b) **proposal generation** returns 503
  until `ANTHROPIC_API_KEY` is set. Both are follow-ups, not regressions.

## 2026-07-07 — Fix: Sales/PM login → 404 (route mismatch, found by live testing)
- `getHomeRouteForRole` sent Sales/PM to `/leads` and the sidebar "Leads" link pointed to `/leads`, but the Leads page
  is the **index route (`/`)** — there is no bare `/leads` route (only `/leads/new`, `/leads/:id`) → landed on the 404
  catch-all. Admin (`/overview`) was unaffected. Fixed: home + nav now use `/` (with `end` on the NavLink so it doesn't
  stay active on every sub-route). 4th real bug surfaced by actually running the app.

## 2026-07-07 — First real install + build (local run prep)
- **`npm install` both apps** (Node 24/npm 11). Backend install first aborted on Puppeteer's Chromium download
  (PDF-gen dep, a follow-up) → reinstalled with `PUPPETEER_SKIP_DOWNLOAD=true`. 1048 pkgs.
- **First real compile surfaced 2 backend errors** (import checks had passed; only a build catches these):
  (1) `js-yaml` missing types → added `@types/js-yaml`; (2) `budget.service.ts` ExcelJS Buffer cast → `Buffer.from(...)`.
  **Backend now builds clean** (`dist/main.js`). **Frontend builds clean** (react-router build, 44 modules).
- **Local-run config:** `app.module` + `data-source` made env-driven — `DATABASE_SYNCHRONIZE=true` (dev-only, auto-creates
  tables from entities so no authored migration is needed yet) and `DATABASE_SSL` → `{rejectUnauthorized:false}` so a
  cloud Postgres (Neon/Supabase) works. Wrote `backend/.env` (random dev JWT secrets, local storage, no AI key) +
  `frontend/.env` (API at :3000). **Redis/BullMQ confirmed unused at boot** — not a blocker.
- **DB = Neon (free cloud Postgres).** Wired the connection string into `backend/.env`; `npm run seed` created all
  tables (synchronize) + the 3 fixture users.
- **First boot surfaced 1 more real runtime bug** (only a live DataSource catches it): `autoLoadEntities` didn't load
  `Feedback`/`LearningSnapshot` (not in any `forFeature`) → `Generation#feedback` metadata crash. Fixed by registering
  both in `generation.module`. (`RateCard`/`RoleDaySample` are an orphan pair — no module yet, a known follow-up — and
  don't crash since nothing loaded references them.)
- **APP IS RUNNING & LOGIN VERIFIED.** Backend :3000 (Nest started, all routes mapped, connected to Neon), frontend
  :5173 (Vite). `POST /api/auth/login` → 201 + httpOnly `access_token`/`refresh_token` (SameSite=Strict) for both admin
  and sales; CORS `Access-Control-Allow-Origin: http://localhost:5173` confirmed. Killed a zombie 5173 dev server from a
  prior session to keep port↔CORS consistent (RULE-I4). **D7 integration is now proven live, not just structural.**

## 2026-07-06 — D6 frontend, chunk 5 (client views) → D6 COMPLETE
- **Client deliverable views** (standalone, read-only, no app shell): `present/:id/proposal` (sections) and
  `present/:id/budget` (line breakdown + totals from the computed budget). "Open client view ↗" links added on Lead
  Detail. `presentService` read-only fetches.
- **D6 frontend complete: 51 files, 13 pages, 12 routes, 0 broken imports, no duplicate routes.** Login → leads →
  new-lead → detail (budget editor + status flow + generate) → projects/settings; admin overview/approvals/leads;
  client proposal/budget views. Follow-ups: full HTML design-fidelity pass, public tokenized client links, PDF/xlsx buttons.
- Next: D8/D9 (tests) then D10 (ship). D7 integration was done inline per feature.

## 2026-07-06 — D6 frontend, chunk 4 (Admin views)
- **Role-guarded admin shell**: `ManagementLayout` (admin sidebar + "Switch to Sales view") behind
  `ProtectedAdminLayout` (redirects non-admins to Sales home, guests to /login).
- **Overview**: KPIs (total/locked/won-value/conversion) + pipeline-by-stage + loss reasons, wired to
  `/analytics/overview`. **Approvals**: pending queue with **Approve / Reject (note required)** wired to the API +
  refetch. **Admin Leads**: read-only org-wide list. Routes `/overview`, `/approvals`, `/admin/leads`; `analytics` +
  `approvals` store slices. 48 files, imports verified. Next (final D6 chunk): client deliverable views.

## 2026-07-06 — D6 frontend, chunk 3 (Projects + Settings)
- **Projects** page: fetches projects (thunk), client-side search, card grid, and an **Add-project** form wired to
  `POST /projects` (with empty/loading states). **Settings** page: profile view from the auth context (profile-update
  endpoint is a documented backend follow-up).
- Routes `/projects` + `/settings` added — the whole Sales/PM sidebar (Leads/Projects/Settings) now resolves.
  `projects` store slice added. 38 files, imports verified. Next: Admin views, then client deliverable views.

## 2026-07-06 — D6 frontend, chunk 2 (Lead Detail + Budget editor + wizard)
- **Lead Detail** page: status header + role-appropriate **status actions** (send-for-approval / mark-sent / mark-locked /
  mark-lost, and AI generate) each wired to the API and refetching; Budget + Proposal tabs.
- **BudgetEditor** component: loads the budget (thunk), edits lines (units/days/rate in $), add/remove rows, contingency/
  discount/VAT %, **live recompute mirroring the backend calculator (integer cents)**, and **Save via PUT with
  optimistic-lock 409 handling** (shows the conflict + reloads).
- **New-Lead wizard**: create lead → attach brief → navigate to detail (with required-field validation).
- Leads list rows now navigate to `/leads/:id`; "+ New Lead" button. Routes: `/leads/new`, `/leads/:id`. Store gained
  `budget` + `leadDetail` slices. 33 files, imports verified. Next: projects, settings, admin views, client views.

## 2026-07-06 — D6 frontend, chunk 1 (foundation + first screens)
- **Data layer:** enums (role/lead/template) + domain types in `~/types/*.d.ts`; axios `httpService` + **401-refresh-once
  interceptor** (RULE-I1); Redux store/typed hooks + `auth`/`leads` slices; READ ops via **`createAsyncThunk`** in services.
- **Shell + auth:** `AuthContext` (validates the httpOnly-cookie session on load), `AppLayout` (dark sidebar + topbar +
  account menu with sign-out), `ProtectedLayout` guard (loading → redirect to /login if unauthenticated).
- **Routes:** public `/login`, protected `/` (leads) behind the guard, mandatory 404 catch-all.
- **Screens:** **Login** (react-hook-form + zod, wired to `/auth/login`) and **Leads** (dispatches `fetchLeads`, with
  loading/empty/data states, integer-cents value formatting). data-testids throughout. 23 files, imports verified.
- Next: D6 chunk 2 (lead detail + budget editor, then wizard, projects, settings, admin, client views).

## 2026-07-06 — D5 backend, chunk 5 (AI layer) → D5 COMPLETE
- **ClaudeService** (`infrastructure/ai`): Anthropic wrapper, tiered Haiku/Sonnet/Opus, JSON helper, token usage;
  global module; **503 if `ANTHROPIC_API_KEY` missing** (code compiles/runs without a key — key only needed for generation).
- **Generation** module: `POST /leads/:id/generate` — Claude drafts proposal sections (Sonnet), saved to the proposal;
  **token counts recorded** on the Generation entity. (Budget AI role/day inference = documented follow-up; budget already works via the deterministic calculator + manual edit.)
- **Storage** (`infrastructure/s3`): S3-compatible adapter (R2/S3) + local fallback, **short-TTL presigned URLs**.
- **KB/RAG** module: ingest (parse→chunk→content-hash dedupe) + text retrieval now; **Riseup-data-only guard**; vector
  semantic search is the documented follow-up (needs an embeddings provider + the kb_chunk vector column).
- **Analytics** module: `GET /analytics/overview` — KPIs + funnel (stage snapshots) + loss reasons (deterministic SQL).
- Whole-backend imports verified; no bare TODOs. **D5 backend is complete.** Next: D6 (frontend — convert approved HTML to React).

## 2026-07-06 — D5 backend, chunk 4 (Approvals + Projects + Delivery)
- **Approval** module: pending queue + **approve/reject** (reject **note required**), each writes an **audit-log** entry and
  transitions the lead (Pending→Approved / Pending→Generated back to Sales), Admin-only.
- **Project** module: CRUD + portfolio search; **auto-creates a Project when a lead is Locked** — decoupled via a
  `lead.locked` **event** (`@nestjs/event-emitter`) so there's no circular import (idempotent).
- **Delivery** module: records the PDF+Excel download (email stays disabled). **Audit** service (reusable log helper).
- LeadService gained `approve`/`reject` transitions + emits `lead.locked` on `markLocked`. Wired `EventEmitterModule` +
  4 modules in `app.module`. **Closed both deferred loops.** Next: chunk 5 (KB/RAG + Claude generation + Analytics).

## 2026-07-06 — D5 backend, chunk 3 (Proposals + Budgets)
- **Budget** module: a **pure deterministic calculator** (`budget.calculator.ts`, all integer cents) — unit cost =
  units×days×rate, dept subtotals, contingency/discount(clamped ≤100%)/VAT, grand total. **Math proven = $86,000**
  on the ATEC seed (and $90,300 with +10%/−5%). Service does a **transactional line-replace guarded by an optimistic
  lock** (stale save → 409); totals recomputed server-side (never trust a client total). **.xlsx export** via ExcelJS
  (FIFA 9-column; values now, live formulas a follow-up).
- **Proposal** module: sections storage + **version history** + regenerate seam (snapshots a version now; Claude
  drafting wired in chunk 5). brief/pitch seams.
- Wired both in `app.module`; imports verified. Next: chunk 4 (Approvals + Projects + Delivery).

## 2026-07-06 — D5 backend, chunk 2 (Leads + Requirements)
- **Lead** module (repository/service/controller/module + DTOs): create, filtered + paginated list (status/template/q),
  detail, update, and the **status machine** — submit → sent → locked → lost with **transition guards** (invalid moves 400)
  and loss-reason required on Lost. Role-guarded (Sales create/act; Sales+Admin read).
- **Requirement** module: upsert brief (text + file refs), readiness score/queries (heuristic now; AI scoring in chunk 5).
- Cross-module side-effects deferred (documented): Locked → auto-create Project (chunk 4); approval records (chunk 4).
- Wired both modules in `app.module`; imports verified. Next: chunk 3 (Proposals + Budgets).

## 2026-07-06 — D5 backend, chunk 1 (security spine)
- **Core cross-cutting** (`src/core/`): `@Public`/`@Roles`/`@CurrentUser` decorators, `JwtAuthGuard` (global) + `RolesGuard`,
  `TransformInterceptor` (response envelope), `HttpExceptionFilter`.
- **Auth** (`src/modules/auth/`): JWT in **httpOnly + secure + sameSite=strict cookies**; `login`/`refresh`(rotates)/`logout`
  (via `RemoveTokenInterceptor`, works with expired token); `JwtStrategy` reads cookie first, Bearer fallback; `TokenService`.
  JWT_SECRET required at boot (no fallback).
- **User** module (repository/service extending base classes) + idempotent **seed** (`src/database/seed.ts`) that reads
  `_fixtures.yaml` and bcrypt-hashes test users. `js-yaml` dep added.
- Global auth wired in `app.module`; `/health` marked `@Public`. Structural verify: all imports resolve; auth-security gates pass.
- **Hardening follow-up (D5):** DB-backed refresh-token store + revocation on rotation (currently rotation reissues a new pair).
- Next: D5 chunk 2 (feature modules).

## 2026-07-06 — D4 database layer built
- Core **base classes** (`src/core/base/`: entity/repository/service/controller) + 6 **enums**.
- **19 TypeORM entities** per `PROJECT_DATABASE.md` (User, Lead, Requirement, Proposal(+Version), Budget(+Milestone+Line),
  Approval, Project, DocumentDelivery, AuditLog, RateCard(+RoleDaySample), KbDocument(+KbChunk), Generation(+Feedback+LearningSnapshot)).
- Safety baked in: **money as integer cents** (bigint), **optimistic lock** on Budget, **audit log**, soft-delete, UUID PKs.
- **pgvector-enable migration**; the KbChunk `embedding vector(1536)` column + HNSW index are added in D5 (KB module) via raw SQL.
- Structural verify: 19 entities, all local imports resolve. (Full `tsc` build runs once deps are installed.)
- Next: **D5-backend**.

## 2026-07-06 — Dev pipeline started (env + specs), path = /fullstack-dev (v1)
- **Pre-flight:** handoff gate PASS (PRD v13, 20 design HTML, `approved: true`, PRD hash matches).
- **D1-init:** scaffolded `backend/` (NestJS) + `frontend/` (React Router 7); declared all deps in `package.json`;
  added `docker-compose.yml` (Postgres+pgvector, Redis), root/backend/frontend `.env.example`, `.claude-rules`,
  and `design/design-intent.yaml`. No app code beyond a runnable skeleton (health endpoint, 404 route).
- **D2-tech-spec:** wrote `PROJECT_KNOWLEDGE.md`, `PROJECT_API.md`, `PROJECT_DATABASE.md` from PRD v13.
- **D3-user-stories:** wrote `user_stories/*.yaml` + `_fixtures.yaml` (test users/credentials).
- **Handoff docs:** `CONTINUE_HERE.md`, `DEVOPS_HANDOFF.md`, this changelog.
- **Stopped** at env+specs by request; next session resumes at **D4-database**.

## Earlier (PM track + design, summarized)
- **PRD** evolved v1 → **v13**: v3 enterprise redesign; v6 presale fixes; v7 two views; v8 email disabled;
  v9 settings; v10 RAG/AI architecture; v11 design/UX consistency pass; v12 logic-hardening + budgeting +
  Backend/DevOps architecture; v13 data-provenance guardrail + presentation/proposal quality.
- **Design:** approved "Riseup Studio" HTML prototype (app/management/client), gate ~7–8/8.
- **Knowledge docs added:** `DATABASE_KNOWLEDGE.md`, `RAG_AI_ARCHITECTURE.md`, `BUDGETING.md`,
  `BACKEND_DEVOPS.md`, `PRESENTATION_GUIDE.md`.
- **Data cleanup:** purged template-author (Potential Inc) sample data from prototype + docs; replaced with real
  Riseup projects; guardrail recorded in `PRESENTATION_GUIDE.md` §0.

> Keep newest entries on top. One line per meaningful change; link the PRD revision or PIPELINE phase it came from.

# Estimation Engine — Session Report, 2026-08-18

Working session covering three things: a timezone defect in the token dashboard (and the data-loss
incident that fixing it caused), the proposal/budget divergence that made one proposal quote $5,000
while the lead list showed $11,085, and a six-part rebuild of how budgets are decided. Ends with a
three-template regression run against the proposals Riseup actually delivered.

---

## 1. What was done

### 1.1 Token dashboard: "today" counted into "yesterday"

**Symptom.** The Leads page showed `TODAY 0 / $0.0000` and `YESTERDAY 446.8k / $3.37` while generations
were actively running.

**Cause.** `created_at` was `timestamp without time zone`. Neon sessions run in GMT, so `now()` wrote UTC
wall-clock, while `tokenStats()` built "start of today" from the API host's **local** clock (UTC+6). Every
generation made between local midnight and 06:00 compared as *less than* the boundary and fell into
yesterday's bucket. The same skew shifted every rendered date in the app by six hours.

**Fix.**

| File | Change |
|---|---|
| `backend/src/core/base/base.entity.ts` | `created_at` / `updated_at` / `deleted_at` are now `timestamptz` |
| `backend/src/database/migrations/1787000000000-TimestampsToTimestamptz.ts` | Converts naive columns with `AT TIME ZONE 'UTC'` (retypes without moving any instant) |
| `backend/src/database/fix-timestamptz.ts` | Same statement as a runnable script — `migration:run` cannot be used on this DB (empty `migrations` table, built by `synchronize`) |
| `backend/src/common/utils/time.util.ts` | Day boundaries computed in `APP_TIMEZONE` (`Asia/Dhaka`), so a UTC deploy host cannot reintroduce the bug |

All 78 naive columns converted; 0 remain.

### 1.2 Incident: synchronize wiped every timestamp

Editing the entity's column type while `nest start --watch` was running with `DATABASE_SYNCHRONIZE=true`
made TypeORM **drop and re-add** the three timestamp columns on all 26 sync-managed tables. Every historical
value was replaced by `DEFAULT now()` — one identical instant, `2026-08-17T21:06:32.665745+00`.

- **Lost:** creation/update dates on leads (171), generations (236), proposals (67), users, approvals, budgets.
  `deleted_at` came back all-NULL, so 106 previously deleted leads reappeared in the list.
- **Survived:** `{ synchronize: false }` entities (`kb_chunks` 2096/2096, `project_cases` 115/115) and columns
  already typed `timestamptz` (`leads.submitted_at`, `approvals.submitted_at`/`decided_at`).

**Recovered in full** from a Neon point-in-time branch (`pre-tz-wipe`, taken at 20:55 UTC) via
`backend/src/database/restore-timestamps.ts` — 3,761 rows across 25 tables. 33 rows created after the branch
point kept their current timestamps. Leads went back to 14 distinct creation days (oldest 7 Jul) and the
106 deletions were re-applied.

The restore script is guarded on the exact wipe instant, so re-running it cannot overwrite anything written
since. `DATABASE_SYNCHRONIZE=false` is now set in `.env` and `.env.example`.

> **Outstanding:** the branch connection string was shared in chat and its `neondb_owner` password is
> **identical to production's**. Rotate it in Neon → Roles, then update `DATABASE_PASSWORD`. Delete the
> `pre-tz-wipe` branch (auto-expires 25 Aug).

### 1.3 Proposal quoted $5,000, lead list showed $11,085

**Cause.** A strong comparable match (`Humm_Technical_and_Financial_Proposal_iOS_Development`, $5,000 / 7 wks)
put `decide.service.ts` into its `reuseBudget` branch: the Investment table became that project's **real quote
split by phase weeks**. The Budget sheet knew nothing about it and derived lines from the plan's own team at
rate-card cost — $11,085 — which `budget.service.ts` then wrote into `lead.valueCents`.

**Fix.** The reused quote is marked `anchoredCents`, and the plan's effort is *fitted* to it so the rate-card
roll-up equals the quoted price. Verified on the real data: `$11,085 → $5,094 subtotal → 1.85% adjustment →
exactly $5,000`, with the 2/3/2-week timeline intact.

The timeline preservation matters: `phaseWeeks()` reads the **longest line in a phase**, so scaling every line
uniformly would have silently turned a 7-week proposal into a 3-week one. Each phase keeps one line at full
duration; the rest go part-time.

### 1.4 Second bug in the same branch

The delivered PDF told the client:

> Where it goes: PM & Architecture **100%** · Mobile **0%** · Backend **0%** · QA **0%** · DevOps **0%**

`roleCost` was built from the matched project's roster priced against the rate card, and only
*Product/Project Manager* resolved — every other role priced at zero. Now built from the phases (the plan that
becomes the sheet), so the percentages always describe the money being quoted.

Also fixed: `prettyTitle()` stops a raw filename
(`Humm_Technical_and_Financial_Proposal_iOS_Development`) from appearing in client-facing copy.

---

## 2. The six changes

Agreed model: **budget is always derived from the rate card; timeline and resources are the decisions; a fixed
budget is met by reducing resources, seniority and time; a ≥80% requirement match reuses the past plan's shape.**

| # | Change | Files |
|---|---|---|
| 1 | **Budget extracted from existing input.** `Intent` gained `budgetCents` / `budgetCurrency` / `budgetHardness`, extracted by the Understand pass from text already assembled into the brief. **No new input field.** "Not Disclosed" / "TBD" / silence → null, and inferring a budget from scope is explicitly forbidden. | `intent.types.ts`, `understand.service.ts` |
| 2 | **Role normalization.** Maps case and model role names onto rate-card families. Resolution went from ~2/19 to **18/19** on the names that previously priced at zero. Card stays authoritative — synonyms expand the *query* only, never the card (rewriting the card merged "Tester" into the QA family). | `role-resolver.util.ts`, `rate-card.service.ts` |
| 3 | **Seniority ladder** parsed from the card's own `Sr./Mid/Jr.` prefixes — no new data model. | `role-resolver.util.ts` |
| 4 | **Ordered fit solver.** Levers in order: team size → seniority downgrade → allocation → residual ≤10%. Each with floors; returns `fits \| tight \| infeasible`. An unreachable budget is reported, not discounted into shape. | `generation.service.ts` |
| 5 | **Coverage-gated reuse.** Replaces raw cosine distance with weighted requirement coverage (modules 0.5, integrations 0.3, scope 0.1, template 0.1), renormalized over the dimensions a case actually carries. | `project-case.service.ts` |
| 6 | **Lever trail** into the change log — "Reduced team size by 2 heads · Downgraded UI/UX to mid · Closed the last $94 with a 1.85% adjustment." | `generation.service.ts` |

Priority when both exist: a **hard client budget outranks a comparable's anchor** — the client's own cap wins.
A **soft** budget deliberately does not anchor; fitting a plan to a number the client merely floated would
quietly rescope the work.

---

## 3. Test results

Three generations from the real client requirement documents in the seed corpus, compared against the
proposals Riseup actually delivered for the same briefs. $0.26 total, 65–78s each.

| | Generated | Delivered | Gap |
|---|---|---|---|
| **Humm** (agency) | **$13,369** · 8 wks · 12 roles · 290 person-days | **$5,000** · 6.5 wks · 3 phases | **2.7× budget** |
| **E-Learning** (local) | **BDT 5,842,323** · 26 wks · 16 roles · 1,200 person-days | ~11 wks ("2.5 months") | **2.4× timeline** |
| **Steel Welding** (global) | **$46,968** · **41 wks** · 11 roles · 1,045 person-days | Duration-based VR options (30/60/90/180 min) + budget-segment table | far over |

### What worked

- **Role resolution.** Every line in all three budgets used a real rate-card role (`Sr.Quality Assurance (QA)
  Engineer`, `Mid Graphics Designer`, `Proof Reader`, `Voice Over Artist`). Zero unresolved, zero zero-priced.
- **Budget inference restraint.** The Steel Welding brief says *"welding training is available in Bangladesh
  for as low as BDT 5,000"* — a competitor's price. Correctly **not** treated as the client's budget.
- **Single source of truth.** Proposal total = sheet total = lead value in all three.

### Reproduce

```bash
npx ts-node src/database/run-generation-suite.ts <outfile>   # 3 generations — spends tokens
npx ts-node src/database/compare-references.ts <outfile>     # text only, no tokens
```

---

## 4. Root causes and solutions

### RC1 — Scope inflation from module granularity

Understand extracted **27 modules and 15 integrations** for Humm, counting "Theme toggle" and "Reduced motion
toggle" as modules. The heuristic `modules + integrations >= 10 → large` read 42 → **large**, but the stored
real Humm case is **medium**. That single misread routed the estimate to the `agency/large` norm (*n=2, median
5 wks / $9,000*) instead of `agency/medium` (*n=19, median 8 wks / $6,700*).

**Solution.** Score scope by substance — distinct surfaces, integrations, user roles — not raw module count;
or count only top-level features. Separately, a norm bucket with n=2 should not outrank one with n=19: weight
bucket selection by sample count.

### RC2 — Nothing binds the plan to the learned norm

The band appears only in the rationale prose. Cost is a pure roll-up of whatever team the model invents, so
$13,369 against a $6,700 norm passes silently.

**Solution.** After Decide, compare the roll-up to the learned p25–p75 for the bucket. Outside it, re-fit
toward the norm using the solver from change #4 (which already exists) or surface it to the rep.

### RC3 — Reuse never fires

Two independent reasons:

1. **0 of 75 stored cases carry integrations or phases.** The coverage formula capped at 0.7, so the ≥0.8 gate
   blocked **100%** of reuse. *Fixed* — coverage now renormalizes over dimensions the case actually has.
   **This fix landed after the test run and is unverified by a live generation.**
2. Even fixed, the stored Humm case has `phases: 0`, so there is little shape left to copy.

**Solution.** Case extraction must store integrations and phases, not just modules. Until then rule 4 has
nothing to reuse. Backfilling the 75 existing cases is a data task.

### RC4 — No advisory/assessment engagement type

Steel Welding asks Riseup to *"assess and recommend the most cost-effective technology approach"* between VR
and AR. `Intent.projectType` offers only `new_build | enhance | issue_fix | deploy`, so a 1,777-character
advisory request became a 41-week build with a *"Content synthesis and simulator blueprint (16w)"* phase. The
delivered proposal sells 30/60/90/180-minute VR packages.

**Solution.** Add an `assessment` / `advisory` project type with its own phase template and a much smaller
default plan, and let it produce option tables rather than a single build plan.

### RC5 — Global/local proposals omit money by design

`engine.service.ts:234` deliberately excludes the financial and payment-terms blocks for global and local
("the money lives in the Budget tab"). But the delivered Steel Welding proposal contains a "Budget Segment /
Total" table.

**Solution.** Product decision: either include the financial block for global/local, or accept that the Budget
tab is the only money surface and confirm that matches how these proposals are sent.

### RC6 — Rate card cannot express a downgrade for key roles

15 of 34 role families have a second tier; junior exists for only 3 (all design). **Product/Project Manager,
Technical Lead, DevOps and Solution Architect exist at one tier only**, so the seniority lever cannot touch
them.

**Solution.** Add mid/junior rows for those roles in Settings → Rates. Data entry, no code.

---

## 5. Recommended order

1. Rotate the database password; delete the `pre-tz-wipe` branch.
2. Re-run the suite to verify the RC3 coverage fix fires.
3. RC1 (scope scoring) and RC2 (norm binding) — together these are most of the over-estimation.
4. RC6 rate-card tiers, then RC3 case-extraction backfill.
5. RC4 advisory project type.
6. RC5 — decide and close.

## 6. Housekeeping

- Backend dev server stopped listening during the session; `npm run start:dev` restores it.
- Three `TEST …` leads were created by the suite and can be deleted.
- `npm run lint` is broken project-wide — no ESLint config file exists. Predates this session.

# ▶ CONTINUE HERE — Lead360 build (read this first)

Hi! The environment and specs are ready. You do **not** need development knowledge — I (Claude) will
guide you step by step and do the building. This page tells you exactly how to continue and how we'll work.

---

## 1. How to resume the build
In this project folder, start a Claude Code session and type:

```
continue fullstack_dev
```

(or the exact command: `/fullstack-dev lead360 --run`)

That's it. It picks up from where we stopped — the next phase is **D4-database**. Progress is tracked in
`.claude-project/status/lead360/PIPELINE_STATUS.md` (green ✅ = done, ⬜ = to do), so it always knows where to continue.

## 2. What's already done (this checkpoint)
- **D1 — Environment**: the `backend/` (API) and `frontend/` (website) projects are created, with all libraries
  listed and ready to install; local database + cache config (`docker-compose.yml`); settings templates (`.env.example`).
- **D2 — Specs**: the technical blueprints the build follows (`docs/PROJECT_KNOWLEDGE.md`, `PROJECT_API.md`, `PROJECT_DATABASE.md`).
- **D3 — User stories**: what each user should be able to do (`user_stories/`), including test logins in `_fixtures.yaml`.
- Nothing beyond the skeleton is built yet — that's the work ahead (database → backend → frontend → wiring → tests → ship).

## 3. What's left (I'll drive each, in order)
`D4 database → D5 backend → D6 frontend → D7 connect them → D8 API tests → D9 browser tests → D10 ship`.

## 4. How I'll work with you — every step
Before I start any phase I will:
1. **Say what I'm about to do** in plain language, and roughly how long / how much it costs.
2. **Flag the risks** I see — edge cases, errors, **security & cybersecurity** concerns, **cost** impact — and
   **ask your permission** on any real decision (I won't make big/irreversible choices silently).
3. **Do the work**, then show you what changed and how to check it.
4. Keep everything **traceable**: `PIPELINE_STATUS.md` (progress) + `docs/CHANGELOG.md` (every change) stay updated.

When something must be done **by a human** (installing a tool, creating an account, hosting), I will:
- Tell you clearly: *"This part needs you / your devops — here's exactly what to click, with links."*
- Give **step-by-step instructions and links** for any 3rd-party service (database, storage, AI key, etc.).
- Never assume you know the technical bits — I'll spell them out.

## 5. Things only your **lead devops** can decide (don't worry about these yourself)
Hosting Lead360 on **Riseup Labs' own servers/cloud** is a devops decision. I've written a dedicated brief for
them — **`docs/DEVOPS_HANDOFF.md`** — covering what to provision (database, storage, cache, secrets) and the
3rd-party accounts needed. When we reach those steps I'll say *"send this to your devops"* and pause.

## 6. Two things to run once, when you're ready to test locally (I'll walk you through it)
You don't need these yet — they come up during the build, and I'll guide you:
```bash
# 1) install libraries (one time, in each app)
cd backend && npm install
cd ../frontend && npm install
# 2) start the local database + cache (needs Docker Desktop installed)
docker compose up -d
```
If you don't have Docker or Node yet, that's fine — tell me and I'll give you the download links and steps.

## 7. Test logins (after the backend + seed exist)
Test accounts live in `user_stories/_fixtures.yaml` (Sales/PM = Farah Karim, Admin = Sadia Noor). The seed
script creates them so you can log in as each role and click through. I'll remind you when they're live.

## 8. Ground rules I'm following
Cost-effective + token-careful (I check before spending), best-practice code, good UX, secure by default,
**Riseup data only** (never the template-author's sample data), and everything documented so the next person
can always pick up. Questions any time — just ask in plain words.

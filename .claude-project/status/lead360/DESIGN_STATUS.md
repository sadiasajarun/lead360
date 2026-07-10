---
project: lead360
design_path: A  # A=AI generation
template_html: null
design_version: v3

# Confirmation
selected_variation: "Riseup Studio (v3 enterprise redesign) — dark sidebar, Inter, hairlines, restrained #EA5400 on #FAFAF9"
approved: true
approved_at: 2026-07-01T00:00:00Z
canonical_design_system: ".claude-project/design/DESIGN_SYSTEM.md"
design_guide: ".claude-project/design/Lead360_DesignGuide_v3.md"

# Post-confirmation
full_html_generated: true
design_qa_passed: true

# PM-track snapshot (P3g — used by /fullstack-dev Tier 2 verification)
phase_complete: true
roles: [app, client, management]
prd_hash_at_generation: "29c34d6e6690430554b6addcf0aafd9c9f04410787eb4ba99f6936dfc6714f2d"
prd_version: "v13"
html_bundle_hash: "37f525bcf01cb43f9fc355c9e4c4d555656a6a46d4accb3e22a8362bc247426f"
generated_at: "2026-07-06T00:00:00Z"
client_deliverables: "premium + interactive (Client_Deliverable_Spec.md) — approved by user"
---

# Lead360 Design Status — v3 (Riseup Studio)

Full enterprise redesign per `Lead360_Redesign_Prompt.md`. 18 pages rebuilt across roles **app / management / client**.

- **Look:** enterprise SaaS — dark sidebar (#111), Inter, hairline borders (not shadows), small radii (8/6/4), restrained orange, KPI cards without colored strips, readiness segment bar (not gauge).
- **IA:** Dashboard = analytics; Leads = list; enforced approval loop (Submit → Approve → Send to client); funnel Generated→Pending Approval→Approved→Sent→Locked (+Lost).
- **Vocabulary:** Lead / Project (no "Deal"); "Conversion Rate"; "Approvals".
- **Client views:** tokenized, interactive, commentable + request-demo (surface back on Lead Detail). Rebuilt **premium + highly interactive** (warm Plus Jakarta, brand-forward, animated architecture, count-up pricing/budget, comment panel, demo modal) per `Client_Deliverable_Spec.md` — the internal app stays enterprise "Riseup Studio". User-approved 2026-07-01.
- **Deliverables:** Global/Local = proposal (14 sec) + separate Excel; Agency/Design = combined (11 sec, inline Financial Proposal); budget matches FIFA structure.

## v11 consistency + gap-fill pass (2026-07-06)
A full audit-driven consistency/UX pass (see PRD Revision v11):
- **Full status machine visible** on Lead Detail via a prototype-only demo switcher (Generated → Pending → Approved → Sent → Locked → Lost), each state showing correct controls; **loss-reason modal** required on Mark Lost; **Archived-to-Database / Added-to-Projects** badges.
- **Readiness** now shows both the ≥80 "Ready" and <80 states; per-query overrides consolidated into one distinct "Continue anyway (override)" action; color-blind zone labels.
- **Role switcher** account menu standardized on the sidebar chip of all 14 app+management pages (Switch to Admin/Sales view) — both views demoable end-to-end.
- **Empty + loading (skeleton) states** on both leads lists; **"All caught up"** on Approvals.
- **Consistency:** 44px table rows, unified search placeholders, status pills weight 600, **Locked** now a distinct steel color vs Approved green, dead `.preview.theme-*` CSS removed, sidebar text contrast bumped toward AA, sticky wizard steppers, unified client-doc footers.
- **Dead links:** none — management Leads "View", Approvals "Open full lead", login "Forgot password", Lead Detail website all resolved.

Prototype map: `.claude-project/design/html/index.html`.
Verified (2026-07-06): 20 HTML files, 0 dead `href="#"`, 0 `{{` template leftovers, 0 broken internal links, gate placeholder-check clean, 14/14 pages carry the account-menu/role-switcher.

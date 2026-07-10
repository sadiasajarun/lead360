# Lead360 — Domain & Reference Research

> Industry: B2B internal Sales/Presales SaaS (proposal & budget automation, RAG, deal pipeline).
> Platform: Web, desktop-first (1440px). Internal staff app + tokenized external client viewer.
> Tone: Premium, confident, "classy but lively" — must make clients excited; must make staff feel fast.

## Reference Products (analysed for UI patterns)

| Product | Category | What we borrow |
|---------|----------|----------------|
| **Linear** | Project/issue tracker | Dense-but-calm dark UI, keyboard-fast feel, command palette, subtle status pills, left rail nav |
| **Attio / Folk** | Modern CRM | Pipeline/deal records, relationship objects, flexible tables, status columns |
| **Stripe Dashboard** | Fintech ops | Editorial clarity, numbers-forward analytics, restrained accent, world-class data tables |
| **Notion / Pitch** | Docs/decks | Warm, friendly surfaces, block-based content, inline comments, approachable empty states |
| **Qwilr / PandaDoc** | Interactive proposals | The "living proposal" model: web proposal + interactive pricing + client comments + accept/CTA + view analytics |
| **Vercel / Raycast** | Dev tools | Glow accents, gradient hero, motion-on-scroll, premium dark aesthetic (matches Riseup deck) |

## Standard sections discovered per page type

- **Operational dashboard (Sales home):** top bar (search + create + profile), KPI stat row, primary work list (deals) with status columns + filters, activity/notifications, empty + loading states.
- **Record/detail workspace (Deal):** breadcrumb + title + status pill, left main content + right context rail, primary action (generate), progress/score indicator, version history, comment thread.
- **Data grid (Budget):** spreadsheet toolbar (add row, export, currency), editable cells, running totals row, per-cell comment pins, virtualized rows.
- **Analytics (Management):** KPI cards with deltas, funnel/pipeline chart, time-series line, breakdown bars (loss reasons), date-range + segment filters.
- **Client viewer (Share, special):** retains Riseup deck brand (dark, lime/purple) — animated architecture, section comments, request-demo CTA. (Brand-locked; not a design-system variable.)

## Riseup brand DNA (existing, from operations proposal deck)

- Colors: lime `#DDFE52`, brand purple `#5C4EFF`, near-black `#050505`.
- Type: Plus Jakarta Sans. Logo top-left. 16:9 premium deck feel, glow accents.
- Implication: the **client-facing proposal/budget viewer stays on this brand** regardless of chosen app theme. The 3 variations below style the **internal app shell** (dashboards, workspace, grids).

## Domain color tendencies applied

Sales/SaaS leans violet/indigo (trust + modernity); "exciting/premium" leans deep backgrounds + vivid accents; Riseup's lime is the signature spark. Each variation reinterprets violet `#5C4EFF` + lime `#DDFE52` through its archetype rules (NOT copied as fixed values).

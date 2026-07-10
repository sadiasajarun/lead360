# DESIGN_SYSTEM — Lead360 v3 · "Riseup Studio"

Enterprise SaaS. Confident, restrained, spacious, typographically deliberate (Linear / Attio / Ramp / Notion Business).
Charcoal-dominant type. Orange used **sparingly** as a single accent. Elevation comes from **hairline borders + spacing**, not shadows. Small radii. **Dark sidebar** is the signature move.

> Supersedes the v2 "Warm Workspace" system entirely. Do not carry forward: rounded-2xl, soft playful shadows, orange chrome washes, colored KPI top strips, cartoon gauge.

## Tokens

| Token | Value | Notes |
|---|---|---|
| `--bg` | `#FAFAF9` | Off-white canvas (not pure white — reduces glare) |
| `--panel` | `#FFFFFF` | Cards on top of canvas |
| `--panel-2` | `#F4F4F2` | Hover / subtle fill |
| `--sidebar` | `#111111` | **Dark sidebar** |
| `--sidebar-text` | `#B8B5B0` | Muted nav text |
| `--sidebar-text-active` | `#FFFFFF` | Active nav text |
| `--sidebar-hover` | `#1F1F1F` | Sidebar hover row |
| `--border` | `#E8E6E3` | Hairline — used everywhere instead of shadows |
| `--border-strong` | `#D4D1CC` | Table headers, section separators |
| `--text` | `#0F0F0F` | Primary charcoal |
| `--text-muted` | `#6B6660` | Secondary |
| `--text-subtle` | `#9A948E` | Tertiary / labels |
| `--primary` | `#EA5400` | Riseup orange — **sparingly**: primary buttons, one accent per section, active states. Never a background wash. |
| `--primary-soft` | `rgba(234,84,0,.08)` | Chip / hover only |
| `--primary-press` | `#CC4900` | Pressed |
| `--success` | `#0E7C5A` | |
| `--warn` | `#B8710A` | Amber, muted |
| `--danger` | `#B42318` | |
| `--info` | `#175CD3` | |

## Radii
- Cards `8px` · Buttons `6px` · Chips `4px`. **No 18px / rounded-2xl.**

## Shadows
- Almost none. Max `0 1px 2px rgba(15,15,15,0.04)`, or a bottom hairline `0 1px 0 var(--border)`. Elevation = borders + spacing.

## Typography — **Inter**
- Family: Inter (Google Fonts). Drop Plus Jakarta Sans.
- Headings **600** (not 700). Body 400/500. **Tabular numerals** for all figures (`font-variant-numeric: tabular-nums`).
- Scale: page title 22px/600 · section 15px/600 · body 14px/400 · label 12px/600 uppercase `letter-spacing:.06em` color `--text-subtle` · micro 11px.

## Density
- Table row height **44px** · Sidebar item height **36px** · Card padding **24px** · Page container padding **32px**, max-width **1400px**.

## Motion
- Functional only: 120ms opacity/transform on hover; 200ms panel transitions. **No decorative motion.** No cartoon gauge fill.

## Icons
- Lucide, stroke width **1.5**. 16px in tables/nav, 20px in headers.

## Components

### Status pill (flat, dot-led — NOT pastel-filled)
`display:inline-flex;align-items:center;gap:7px;height:24px;padding:0 10px;border:1px solid var(--border);border-radius:4px;background:var(--panel);color:var(--text);font-size:12px;font-weight:500`
+ a 6px dot on the left colored by state:
Generated `--info` · Pending Approval `--warn` · Approved `--success` · Sent `--primary` · Locked `--success` · Lost `--danger` · Rejected `--danger`.

### Buttons (radius 6px, height 36px default / 32px compact — NOT pills)
- Primary: solid `--primary`, white text; hover `--primary-press`.
- Secondary: `--panel` bg, `1px solid var(--border-strong)`, `--text`.
- Tertiary/ghost: transparent, `--text-muted` → `--text`.
- Danger: `--panel`, `1px solid var(--danger)`, `--danger` text.

### KPI card (NO colored top strip)
Bordered card, 24px padding. Label 12px uppercase `--text-subtle`, **hairline divider under the label**, number **32px/600 tabular**, delta chip inline (▲ `--success` / ▼ `--danger`, 12px).

### Table
Sticky header (bg `--panel-2`, `--border-strong` bottom, label style), **zebra-free**, hairline row dividers `--border`, row height 44px, hover row `--panel-2`, numerics right-aligned `tabular-nums`.

### Readiness display (segment bar — NOT a ring/gauge)
Horizontal bar 0–100 split into three zones: **0–60 danger**, **60–80 warn**, **80–100 success**; a marker at the score; the score shown as a **large number (28px/600)** to the right. No gradient sweep.

### Empty state
One line + one action. No illustration.

## Layouts

### 1) App Shell (Sales / PM / Management)
- **260px dark sidebar** (`--sidebar`): Riseup/Lead360 wordmark top (orange mark + white text); nav items (36px height, `--sidebar-text`; hover `--sidebar-hover`; active = `--sidebar-text-active` + a 2px orange left rule + `--sidebar-hover` bg); user chip pinned bottom.
- **Top bar** (white, bottom hairline): global search, **+ New Lead** primary (Management: no New Lead), notification bell, avatar.
- **Main**: canvas `--bg`, max-width 1400px, 32px padding.

### 2) Flow Shell (New Lead wizard)
- Minimal top bar: Riseup wordmark + centered **5-step stepper** + "Save & exit". No sidebar. Single column **720px**, 32px padding. Back / Continue pinned at the bottom.

### 3) Client Document (tokenized, public)
- Brand-locked, **no app chrome**, print-optimized. Content column + **sticky right-side action rail** (Download PDF · Add comment · Request demo). Comments open a right thread panel.

## Nav model
- **Sales/PM sidebar:** Dashboard · Leads · Projects · Settings.
- **Management sidebar:** Overview · Approvals · Leads · Projects · Settings.
- Never the word "Deal" anywhere. Use **Lead** (pre-lock) / **Project** (portfolio).

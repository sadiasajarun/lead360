# Lead360 — Pitch Deck, Proposal & Sales Playbook

> How Lead360 should generate **high-quality pitch decks and proposals** — distilled from the operations toolkit's proposal engine, adapted to Riseup Labs. Feeds the Proposal Engine + the "Pitch Deck" generator. **Read the DATA GUARDRAIL (§0) first — it is mandatory.**

---

## 0. DATA GUARDRAIL (mandatory) — Riseup Labs data only

The operations toolkit ships with its **template author's** sample data ("Potential Inc" and its example clients/people/projects). That data is a **structural reference only**. Lead360 must **NEVER** surface it — not in the product, seeds, generated proposals/decks, RAG examples, or docs.

- **Use only Riseup Labs' own data**: the real portfolio (`riseuplabs.com/portfolio`) and the real Proposal & Budget Database (`app/db/` — the 39 real files). "Similar past projects", proof slides, testimonials, and case studies must come from there.
- **Never emit** any of these (filter at generation + ingestion time): the brand "Potential Inc" / "potentialai.com"; its team names (e.g. Shin Lukas Dongsub, Siam Maruf, Riaz Uddin, and its design/full-stack/ops staff lists); its portfolio project names (**Stockify, Personal Expense Tracking, CART, 343Pet, Agrilo, DiaFit, Dexulin, Elite4Print, Hacamong, K-Talk, Maloha, Mentora, NearWork, Omni, Park Park, Silvara, Thrill, Tobeone, Tustix, Ivory**); its testimonial authors/companies (Jackson L./RealEsti, Chung Eui-sun/Alforklift, Jongwon Kim/ITTECH, Byeongguk Ko/Tobeone); its office addresses, phone numbers, and `@potentialai.com` emails.
- **Dev requirement:** the ingestion pipeline should **skip/scrub** any template-author sample doc, and the generator's few-shot/proof selection draws **only** from Riseup-owned records. Keep a small denylist (the names above) as a safety net; log if any is ever about to be emitted.
- Riseup team sample names used in the prototype (Farah Karim, Sadia Noor, Tanvir Rahman, Nabil Hasan) are **intentional Riseup placeholders** — fine to keep.

---

## 1. Pitch-deck slide sequence (what each slide does)

A strong deck runs ~12–16 slides in this order (Lead360's generator produces this; the prototype demonstrates a 13-slide version):

1. **Cover** — "Proposal for {Client}", project title, "Prepared by Riseup Labs", one credibility line (since 2009 · enterprise software & AI).
2. **Why Riseup Labs (credibility)** — 3 proof points / stats (years, team size, relevant domains). Social proof up front.
3. **The problem** — the client's pain in their words (from the requirement/brief). One tight paragraph.
4. **Our solution** — the proposed outcome in one confident paragraph.
5. **How it works** — 3–5 numbered process/flow steps (the service flow).
6. **Architecture** — the system flow (intake → AI → validation → system-of-record), human-in-the-loop noted.
7. **Scope & phases** — the milestones with week ranges (mirrors the proposal + budget).
8. **Proof — "we've done this before"** — 2–3 **real Riseup** comparable projects (from the portfolio/DB), each with why-relevant. (Never Potential Inc projects.)
9. **Your team** — the roles staffed (maps to the budget's departments/roles).
10. **Tech stack** — the concrete stack for this build.
11. **Objection handling ("You might ask…")** — the top 3 anticipated objections + crisp responses.
12. **Investment** — fixed price + milestone split (e.g. $86,000 · 30/30/40) + optional add-ons.
13. **Next step (CTA)** — a single, warm, specific call to action ("lock milestone one", "schedule the kickoff").

Optional extras when relevant: featured-work grid, client-logo wall, testimonials (real Riseup only), FAQ, contact.

## 2. Proposal section best-practices
- Lead the **Executive Summary** with problem → outcome → phased-delivery promise (2–3 short paras).
- **Understanding** restates the client's context/pains in Riseup's words; for gov/NGO (Local), map clause-by-clause to the ToR.
- **Scope** = a coverage table + explicit phase breakdown. **Technical Approach** = numbered stages; system builds add architecture + data-flow.
- **Methodology** reuses the standard spine (Discovery → Design → Build → Integration & QA → UAT → Handover).
- **Deliverables** are week/phase-tagged; **Testing & QA** lists automated + manual + UAT + sign-off criteria.
- Boilerplate sections (Assumptions, Out-of-Scope, Complimentary Support, Acceptance) are reused near-verbatim.
- Pricing shown two ways where useful: **milestone-based** (payment schedule) and **feature/scope-based**.

## 3. Sales & persuasion techniques
- **Social proof early and often:** credibility stats on the cover, a dedicated proof slide, and real case studies — all Riseup-owned.
- **Objection handling via a FAQ/objections slide:** pre-empt the top concerns (format variety, data-safety, integration difficulty, timeline, team) with concrete responses.
- **Framing:** lead with maturity (years, specialists, domains); frame gaps as "things to improve", not "problems".
- **Transparent milestones + pricing** remove financial ambiguity and de-risk the decision.
- **Warm, specific close:** name the immediate next action; make it easy to say yes ("lock milestone one before quarter-end").

## 4. Visual / deck-quality conventions
- One clear idea per slide; section title at the top; generous whitespace; consistent padding.
- Restrained accent color for numbers/badges/CTAs; hierarchy via type weight/size, not clutter.
- Bulleted slides: 3–5 short items max; avoid paragraphs on list slides.
- Real, relevant imagery/screenshots (Riseup work); embed assets (no external hot-links) for portable output.
- Deck is **presentation-ready**: readable at a glance, milestone/price crystal-clear, one CTA.
- Pre-delivery checklist: no unreplaced `{{placeholders}}`, no dead links, alt text on images, contrast ≥ 4.5:1, and **zero template-author (Potential Inc) data** (see §0).

## 5. Prototype status
The Lead-Detail **Pitch Deck** tab (`app/lead-detail.page.html`) now generates the 13-slide sequence above (cover → credibility → problem → solution → how-it-works → architecture → phases → **real-Riseup proof** → team → stack → objections → milestone pricing → next step). The proposal's "We've done this before" section cites **real Riseup projects** (HR AI Automation, ContentOS, OPS Web Application). In dev, the generator should assemble these from retrieved Riseup records per lead, not hardcode them.

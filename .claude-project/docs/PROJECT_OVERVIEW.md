# Lead360 — Project Overview

## What it is

Lead360 turns an incoming client brief into two branded deliverables — a
proposal (PDF) and a matching budget (Excel) — grounded in Riseup Labs' own past
work. An AI writes the proposal by drawing on Riseup's library of past
proposals, so the draft reads in Riseup's voice. The budget is priced from a
fixed internal rate card and calculated in code; the AI never decides prices.

## Who uses it

- **Sales/PM** — creates leads, generates proposals and budgets, and submits
  them to an admin for approval. Sees only their own leads.
- **Admin** — everything a Sales/PM can do, plus approving or rejecting other
  reps' leads and managing settings (users, rate card, currency). An admin's own
  proposals do not need approval.

## The flow, end to end

1. A rep creates a **lead** for a prospective client.
2. They **upload or paste the brief** (the client's requirements).
3. They pick a **proposal template** — Agency, Global, Local, or Design
   Portfolio — and a **budget currency**.
4. The AI **drafts the proposal**, retrieving relevant passages from Riseup's
   past proposals so the wording and examples fit Riseup's actual experience.
5. The **budget is priced from the head-cost rate card** — day rates for each
   role come straight from the card, and totals are computed in code. The AI
   does not invent any number.
6. The rep **submits for approval**.
7. An **admin approves, or rejects with a note.** A rejected lead bounces back
   to the rep, who fixes it and resubmits.
8. Once approved, the rep marks it **sent to client**.
9. The lead ends as **locked** (won — it becomes a portfolio project) or **lost**
   (with a reason recorded).

An admin's own draft skips the approval loop: it moves straight to "sent," and
the system still archives its documents as if it had been approved. An admin
cannot short-circuit another rep's draft.

## The status list

| Status (UI label) | Meaning |
|---|---|
| Generated | Draft created; not yet submitted. |
| Awaiting Approval | Submitted by a rep, waiting on an admin. |
| Approved | Admin approved; ready to send. |
| Rejected | Admin sent it back with a note; the rep revises and resubmits. |
| Sent to Client | Delivered to the prospect. |
| Locked | Won — becomes a portfolio project. |
| Lost | Did not close; a reason is recorded. |

## Where the intelligence comes from

The proposal draft is produced with retrieval-augmented generation (RAG).
Riseup's past proposals are split into chunks, converted into numeric
"embeddings," and stored so the system can find the passages most relevant to a
new brief. Those passages are fed to the AI, which is why a draft sounds like
Riseup rather than generic boilerplate. Money is deliberately kept out of what
the AI decides — pricing always comes from the rate card and code, so numbers
are auditable and never hallucinated. A role that is not on the rate card is
skipped rather than guessed.

Prices are read verbatim in USD and BDT from Riseup's head-cost sheet. The seven
other supported currencies (GBP, EUR, CAD, AUD, CNY, JPY, INR) are converted
from USD using a live exchange rate an admin syncs in Settings.

## Credentials (DEV/TEST ONLY)

These are seeded local accounts for development and testing. They are not
production accounts.

| Role | Email | Password |
|---|---|---|
| Admin | admin@admin.com | Admin@123 |
| Sales/PM | farah.karim@riseuplabs.com | Lead360!sales |
| Sales/PM | tanvir.rahman@riseuplabs.com | Lead360!sales2 |

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18, React Router 7, Redux, Tailwind CSS | Fast, modern single-page app. |
| Backend | NestJS 10 (Node.js) | Structured, layered API framework. |
| Database | PostgreSQL 16 + pgvector | Relational data plus vector search for RAG. |
| AI | OpenAI (gpt-5.4, text-embedding-3-small) | Drafts proposals and powers retrieval. |
| Documents | Puppeteer (PDF), ExcelJS (Excel) | Generates the branded deliverables. |
| Auth | JWT in httpOnly cookies | Session security without exposing tokens to scripts. |

## What is deliberately not built yet

- **Email sending** — the module exists but is switched off. Invitations produce
  a link the admin copies and sends by hand.
- **Background job queue** — long tasks run inline; no queue is wired up.
- **Slack and Zoom integrations** — shown as disabled in Settings; not
  implemented.
- **Automated end-to-end test suite** — the test harness is in place but the
  scenarios are not written yet.

## Costs

Generating a lead's proposal and budget costs about **$0.12** in AI usage,
measured. Expected volume is roughly **4–5 proposals per day**, plus
regenerations. The model choices, cost detail, and the procedure for switching
models are in `.claude-project/docs/AI_MODEL_GUIDE.md`.

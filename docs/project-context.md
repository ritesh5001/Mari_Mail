# MariMail — Project Context

> ⚓ **MariMail** is a 100% self-built marine industry intelligence + ETA-triggered email automation platform. Turns vessel movements into automated business opportunities.

---

## Mission

Build a self-contained platform combining:
1. **Marine DBMS** — vessel records, ship owner data, ISM/commercial manager contacts, port intelligence
2. **Apollo-style People Search Engine** — filtered by vessel type, port, flag, DWT, ETA
3. **Self-hosted Multi-step Campaign Engine** — auto-fires email sequences on ETA countdown, port destination, vessel type, cargo change triggers

**No ReachInbox. No Apollo. No third-party campaign tools.** Everything is built and owned inside MariMail.

---

## Tech Stack (locked)

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router, RSC, Server Actions) + React 18 + TypeScript 5 (strict) |
| Backend | Node.js 20 LTS + Express 4 + TypeScript |
| Database | PostgreSQL 15 (tsvector full-text + GIN indexes) |
| ORM | Prisma 5 |
| Cache/Queue | Redis 7 |
| Jobs | BullMQ 5 (email sending, ETA scheduler, CSV imports, warmup) |
| Email | Nodemailer 6 (Gmail OAuth2, Outlook OAuth2, SMTP) — **self-hosted, no SaaS** |
| Auth | NextAuth.js v5 (Google OAuth + Credentials) + bcryptjs (rounds: 12) |
| Styling | Tailwind CSS 3 + tailwind-merge + clsx |
| Realtime | Socket.io 4 |
| Editor | Tiptap 2 (rich email editor) |
| Charts | Recharts 2 |
| Virtual lists | react-virtual 3 |
| Drag-drop | @dnd-kit 6 |
| Payments | Stripe SDK 14 |
| Validation | Zod 3 |
| Transactional email | Resend 2 + react-email 2 |
| Error tracking | Sentry SDK 8 |
| CSV | csv-parse 5 (streaming) |
| OAuth APIs | googleapis 140, @azure/msal-node 2 |

---

## Monolith Layout

```
client/      # Next.js 14 frontend
server/      # Node.js/Express API + BullMQ workers
packages/
  db/        # Prisma schema + migrations + seed
  types/     # Shared TS types
  email/     # Nodemailer service + React Email templates
  utils/     # filterConfigToWhereClause, encryption, marine constants, ETA helpers
```

**Tooling:** pnpm workspaces + Turborepo.

---

## Design System

| Token | Hex | Use |
|---|---|---|
| `--navy` | `#0A2342` | Primary deep navy |
| `--ocean` | `#0077B6` | Accent ocean blue |
| `--gold` | `#C9A84C` | Maritime gold highlight |
| Dark mode | navy-black palette | toggle in Phase 8 |

Tailwind CSS as foundation; design tokens exported to `tailwind.config.ts`.

---

## Three-Layer Architecture

| Layer | Purpose | Tables |
|---|---|---|
| 🚢 **Vessel Intelligence DBMS** | Vessel master records, ownership chain, ETA, position | Vessel, ShipOwnerCompany, ISMManagerCompany, CommercialManagerCompany, Port, VesselETA |
| 👤 **Contact Intelligence Engine** | Apollo-style people DB with full filter builder | Contact, Company, ContactList, SavedFilter, ListContact |
| 📧 **ETA Campaign Engine** | Self-hosted multi-step email sequences auto-triggered by ETA countdown | Campaign, CampaignSequence, CampaignContact, ETATrigger, EmailEvent, EmailAccount, PortCampaignRule, CargoChangeTrigger |

Full schema → [../.claude/docs/schema.md](../.claude/docs/schema.md)
Filter system spec → [../.claude/docs/filters.md](../.claude/docs/filters.md)
ETA engine → [../.claude/docs/eta-engine.md](../.claude/docs/eta-engine.md)

---

## Build Phases (18 weeks total)

| # | Phase | Weeks | Prompt |
|---|---|---|---|
| 1 | Foundation, Auth & Monorepo | 1–2 | [phase-1.md](../.claude/phases/phase-1.md) |
| 2 | Vessel & Company DBMS | 3–4 | [phase-2.md](../.claude/phases/phase-2.md) |
| 3 | Contact Intelligence Engine | 5–6 | [phase-3.md](../.claude/phases/phase-3.md) |
| 4 | ETA System & Port Radar | 7–8 | [phase-4.md](../.claude/phases/phase-4.md) |
| 5 | Email Account & Sending Engine | 9–10 | [phase-5.md](../.claude/phases/phase-5.md) |
| 6 | Campaign Builder & ETA Sequencer | 11–13 | [phase-6.md](../.claude/phases/phase-6.md) |
| 7 | Analytics, CRM & Operator Intelligence | 14–15 | [phase-7.md](../.claude/phases/phase-7.md) |
| 8 | Billing, Admin, Polish & Launch | 16–18 | [phase-8.md](../.claude/phases/phase-8.md) |

**Workflow:** the user signals "start phase N" → Claude reads `phases/phase-N.md` → executes end-to-end against the acceptance criteria.

---

## Operating Rules

1. **Autopilot mode** is on (`.claude/settings.json` → `bypassPermissions`). Do not stop to ask permission on file edits, installs, migrations, or test runs.
2. **One phase at a time.** Do not start phase N+1 until acceptance criteria for phase N are met and the user signals to continue.
3. **Stack is locked** — do not swap libraries without explicit user approval.
4. **TypeScript strict mode** everywhere. No `any` unless justified inline.
5. **Server Components first** on the web app; use `"use client"` only where required.
6. **All API inputs validated with Zod** before hitting Prisma.
7. **Credentials at rest** — AES-256-GCM. Never log plaintext. Decrypt only inside the worker process.
8. **Every Prisma model that holds workspace data** carries `workspaceId String? @index` — `NULL` = global MariMail DB, set = workspace-private.
9. **UTC everywhere** in the DB. Convert to user timezone at the UI edge only.
10. **No third-party email/campaign SaaS** (ReachInbox, Mailgun campaign features, SendGrid Marketing, etc.) — sending is Nodemailer + Gmail/Outlook OAuth2 + SMTP only.
11. **No marketing fluff in code** — no emoji in source, no decorative comments. Comments only when WHY is non-obvious.
12. **Acceptance criteria are the contract.** Every phase ends with a checklist; the phase is "done" only when each item passes.

---

## Reference

The full plan document is in [MariMail Plan.docx](MariMail%20Plan.docx) — when in doubt, that's the source of truth. The phase prompts in `.claude/phases/` are extracted verbatim from it.

# MariMail

Marine ETA-triggered email intelligence and campaign automation.

## Structure

```text
client/      Next.js 14 App Router frontend
server/      Express API + BullMQ workers in one backend process
packages/
  db/        Prisma schema, migrations, seed, singleton client
  email/     Resend transactional email wrapper
  types/     Shared TypeScript types
  utils/     Shared tokens and helpers
docs/        Product plan and project context

## Workspace Packages

- `@marimail/db`: Prisma client, schema, migrations, and seed helpers
- `@marimail/email`: transactional email helpers for Resend
- `@marimail/types`: shared TypeScript types used by client and server
- `@marimail/utils`: shared helpers for tokens, filters, and encryption
```

## Requirements

- Node.js 20 LTS for the locked project stack
- pnpm 9
- PostgreSQL 15
- Redis 7

## Render Deployment Note

Render should use Node.js 20.19.0 or newer, Corepack-enabled pnpm, and the root workspace build before starting the server.

Recommended commands:

```bash
corepack enable && corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile && pnpm -w build
```

Dangerous maintenance scripts
--------------------------------
If you need to wipe all users and workspace-scoped data (development only), a helper script is available at `scripts/wipe-users.ts`.

Run it from the repo root with the `@marimail/db` package context so Prisma client is available:

```bash
# require explicit confirmation via env or flag
CONFIRM_WIPE=1 pnpm --filter @marimail/db exec tsx scripts/wipe-users.ts
# or
pnpm --filter @marimail/db exec tsx scripts/wipe-users.ts --yes
```

Warning: this deletes all workspaces and users and cannot be undone. Do NOT run against production unless you intentionally want to destroy production data.

The server build now compiles `packages/db`, `packages/email`, `packages/types`, and `packages/utils` before the API process starts.

## Setup

```bash
pnpm install
cp .env.example .env
cp server/.env.example server/.env
cp client/.env.example client/.env
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The dev command starts:

- Client: http://localhost:3000
- Server API: http://localhost:3001
- Backend workers: started inside the server process unless `START_WORKERS=false`

## Monolith Layout

The app uses a client/server monolith workspace layout.

- `client` owns all browser and Next.js UI code.
- `server` owns the API, Socket.io, BullMQ queue processors, scheduler workers, tracking endpoints, and all backend integrations.
- Shared code remains in `packages/*` so Prisma, email rendering, shared types, and utility helpers are still single-source.

## Phase 1

Implemented foundation pieces:

- pnpm workspace and Turborepo monorepo
- Prisma auth/workspace schema and first migration
- Register, login, refresh, forgot/reset password, verify email, logout
- Redis refresh-token rotation and password-reset token storage
- Google OAuth route through NextAuth v5
- Protected dashboard shell with sidebar, topbar, workspace switcher, and command palette

## Phase 2

Implemented marine DBMS pieces:

- Vessel, ShipOwnerCompany, ISMManagerCompany, CommercialManagerCompany, and Port Prisma models
- PostgreSQL full-text `tsvector` columns, GIN indexes, and search-vector triggers
- Workspace-scoped vessel list/detail, company detail, search, and CSV import API routes
- Vessel Finder UI with filter panel, table view, card view, bulk action controls, and CSV import entry
- Vessel detail page with specs and three-party ownership panels
- Company detail pages with linked vessel tables
- Command palette backed by the full-text search API

## Phase 3

Implemented contact intelligence pieces:

- Contact, ContactList, ListContact, and SavedFilter Prisma models
- Contact search-vector triggers, GIN indexes, department GIN index, and workspace-scoped constraints
- Contact Finder with all major filter categories, engagement score indicators, phone/LinkedIn/Salesforce indicators, and bulk action controls
- Reusable `FilterBuilder` component with grouped fields, operators, AND/OR groups, live preview, and saved-filter creation
- Contact detail page with phone/social/Salesforce/company/vessel tabs
- Static and smart contact list pages
- Contact, filter preview, saved filter, list, and contact-update APIs
- Contact CSV import with blueprint headers and company resolution

## Phase 4

Implemented ETA-triggered campaign foundation:

- Vessel ETA, campaign, sequence, ETA trigger, port rule, and cargo-change trigger Prisma models
- ETA creation and update APIs with automatic campaign matching and trigger recomputation
- Port radar feed, missed-opportunity alerts, and ETA campaign-rule settings
- Vessel detail ETA history and add-ETA workflow
- Redis-backed realtime workspace events for ETA and trigger changes

## Phase 5

Implemented email account and sending engine foundation:

- EmailAccount and WarmupLog Prisma models with sender provider/status state, DNS health, daily limits, warmup state, and rotation weight
- AES-256-GCM secret encryption helpers using `ENCRYPTION_KEY` as a required 32-byte hex key
- Inboxes API for create/update/delete, OAuth token callback storage, Nodemailer test sends, DNS checks, and warmup logs
- DNS TXT health service for SPF, DKIM, and DMARC with one-hour Redis cache
- Rotation service for ROUND_ROBIN, WEIGHTED, and LEAST_USED account selection with daily Redis send counters
- BullMQ warmup worker inside the server process that advances warmup day, updates health, and records daily warmup logs
- Dashboard inbox management page with account cards, health rings, DNS status, sent/limit progress, warmup metrics, and add-inbox wizard

## Phase 6

Implemented campaign builder and ETA sequencer foundation:

- Extended Campaign and CampaignSequence with sending inboxes, rotation, schedules, stop conditions, tracking flags, target/trigger config, tags, and A/B test fields
- Added CampaignContact, EmailEvent, and GlobalSuppression models with migration `0006_phase_6_campaign_sequencer`
- Campaign API for list/detail/create/update/activate, IPC default template, personalization preview, and trigger-rule creation
- BullMQ `eta-step` scheduling service that schedules jobs from ETATrigger step fire times and reschedules on ETA edits
- Worker `eta-step` sender that renders marine variables, picks inboxes, injects tracking, sends through Nodemailer, records SENT/FAILED/bounce events, and updates progress
- Tracking endpoints for open pixels and click redirects, inbound reply/bounce endpoints, and one-click unsubscribe API
- Dashboard campaign wizard with details, trigger config, contact targeting, inbox rotation, sequence builder, personalization preview, and activation
- Public `/unsubscribe/[token]` landing page

# PHASE 8 — Billing, Admin, Polish & Launch

**Timeline:** Weeks 16–18
**Status:** ⏳ pending — requires Phase 7 complete

---

## Agent Prompt

Final phase. Build:
- **Stripe subscription billing** with 4 marine-focused plans + ETA credit system
- **Admin panel** for global marine DB curation (vessels, companies, contacts)
- **User onboarding flow** (5 steps)
- **Dark mode** (navy-black palette)
- **Performance optimisation** (RSC, virtual lists, Redis caching)
- **Production deployment** (Vercel + Railway + Supabase)
- **CI/CD pipeline**
- **Scheduled reports & campaign digest emails**

---

## Pricing Plans

| Plan | Price | Vessels | Emails/Month | ETA Campaigns | Inboxes | Team | DB Credits |
|---|---|---|---|---|---|---|---|
| Starter | $49/mo | 50 | 5,000 | 5 | 1 | 1 | 500 (view global DB) |
| Pro | $99/mo | 250 | 25,000 | Unlimited | 5 | 5 | 2,500 |
| Business | $249/mo | 1,000 | 100,000 | Unlimited | 20 | 20 | 10,000 |
| Enterprise | Custom | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited + API |

---

## ETA Credit System

Credits are consumed when accessing the **global** MariMail DB (not workspace-owned data):
- View global vessel profile = **1 credit**
- Save to workspace = **3 credits**
- Export to CSV = **2 credits per vessel**

Replenished monthly with plan. Add-on packs: 1,000 = $19 · 5,000 = $79 · 20,000 = $249.

**Credit-deduction middleware** on:
- `GET /api/vessels/:id` (if global record — `workspaceId IS NULL`)
- `POST /api/vessels/:id/save`
- `POST /api/vessels/export`

Returns `402 Payment Required` if balance insufficient.

---

## Admin Panel — `/admin`

Admin-only (role check on User). Sections:

- **Global Vessel DB:** full CRUD on `Vessel` records where `workspaceId=NULL`; bulk import; verify; merge duplicates; link owner / ISM / commercial managers
- **Global Company DB:** CRUD on ShipOwner / ISM / Commercial Manager companies; verify; merge
- **Global Contact DB:** CRUD on `Contact` where `workspaceId=NULL`; bulk import; email verification; verify
- **Global Port DB:** add/edit Port master; `defaultServices` per port; default PortCampaignRules
- **User management:** list all users, plans, workspaces, last active; impersonate; ban; manual credit grant
- **System health:** DB status, Redis ping, BullMQ queue depths, worker status, ETA scheduler status

---

## Onboarding — `/onboarding` (5 steps)

| Step | Content |
|---|---|
| 1 | Workspace name + logo + company type + primary service (Hold Cleaning / Tank Cleaning / Hull Cleaning / Agency / Bunker / Chandler / Other) |
| 2 | Import vessels / ETAs — drag-drop CSV; download sample ETA import template; or skip |
| 3 | Import contacts — drag-drop CSV with all blueprint fields; download sample; or skip |
| 4 | Connect inbox — Gmail / Outlook / SMTP wizard embedded; or skip |
| 5 | Create first campaign — clone pre-built template based on service type from Step 1; or start from scratch |

Completion: confetti (canvas-confetti) + Workspace.onboardedAt timestamp.

---

## Dark Mode

- Toggle in user menu
- Palette: deep navy-black (`#06182E`) backgrounds + ocean-blue accents
- Persist preference in `localStorage` + DB
- No flash on load (script in `<head>`)
- All pages audited for contrast

---

## Performance Optimisation

- **RSC + Server Actions** wherever possible — minimise client JS
- **Virtual scrolling** (react-virtual) for vessel list, contact list, port radar feed
- **Redis caching:**
  - Vessel detail (TTL 5 min)
  - Port master table (TTL 1 hr)
  - Filter preview counts (TTL 30 s)
- **Image optimisation:** Next/Image for all avatars + vessel silhouettes
- **Bundle analysis:** target < 200 KB JS on /dashboard

---

## Production Deployment

| Component | Host |
|---|---|
| `client` | Vercel |
| `server` | Railway |
| Backend workers | In the `server` process |
| PostgreSQL | Supabase |
| Redis | Upstash |
| Inbound SMTP | Postfix on a small VPS OR AWS SES inbound |
| Email transactional | Resend |
| Errors | Sentry |
| Storage (avatars, CSV uploads) | Supabase Storage |

Environment promotion: `dev` → `staging` → `production`. DB migrations gated by manual approval in production.

---

## CI/CD Pipeline

GitHub Actions:
- On PR: lint + typecheck + unit tests + build
- On merge to `main`: deploy to staging
- On tag `v*`: deploy to production
- Block merge on lint / type / test failure

---

## Acceptance Criteria

- [x] Stripe Checkout (dev-mode path when `STRIPE_SECRET_KEY` absent) — `POST /api/billing/checkout {plan:"BUSINESS"}` upgraded plan; `vesselLimit` 1,000, credit balance replenished to 12,500
- [x] Credit-deduction middleware — viewing global vessel 9123456 decremented balance by 1 with `VIEW_VESSEL` ledger entry; setting balance to 0 returned `402 INSUFFICIENT_CREDITS` on next view
- [x] Admin global vessel CRUD — `POST /api/admin/global/vessels` upserted IMO 9999111 with `workspaceId=null`, `verified=true`; admin audit entry logged
- [x] Admin impersonate — `POST /api/admin/users/:id/impersonate` returned a token (`imp-<userId>-<ts>`) and wrote a `USER_IMPERSONATED` admin audit row. Yellow "Super-Admin" header banner renders in the new `/admin` layout
- [x] Onboarding flow rebuilt as 5-step wizard (Workspace → Vessels → Contacts → Inbox → Campaign) with CSV-template downloads and `canvas-confetti` on finish; saves workspace via `POST /auth/onboarding` and marks `onboardedAt`
- [x] Dark mode — Tailwind `darkMode: "class"`, no-flash bootstrap script in `<head>`, persistence in `localStorage`, `ThemeToggle` in the topbar; navy-black palette applied via `html.dark` selectors in `globals.css`
- [x] Performance — RSC on every dashboard page, lazy PDF imports, Redis caching of vessel detail (5 min) / port master (1 hr) / filter preview (30 s); `/dashboard` builds under 90 KB shared + 1–7 KB per route
- [x] `/api/health` returns OK for DB, Redis, worker, and includes BullMQ queue depths: `{email-send:0, eta-step:0, warmup:0, analytics-cron:2}`
- [x] GitHub Actions CI workflow `.github/workflows/ci.yml` runs lint + typecheck + build with Postgres 15 + Redis 7 services; blocks merge on failure
- [x] Stripe webhook handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`; gracefully responds `503 STRIPE_NOT_CONFIGURED` when secret unset. Idempotency via `BillingEvent.stripeEventId @unique`
- [x] Production deploy spec documented (Vercel client + Railway server with in-process workers + Supabase Postgres + Upstash Redis + Resend + Sentry) — environment promotion gated by manual approval; CI workflow is the staging gate
- [x] All Phase 1–7 acceptance still pass — login 200, vessel filter returns 4, port radar summary 200, analytics overview 200
- [x] Typecheck + lint + build pass workspace-wide (6 packages)
# PHASE 1 — Foundation, Auth & Monorepo Setup

**Timeline:** Weeks 1–2
**Status:** ✅ complete — 2026-05-15

---

## Agent Prompt

You are building MariMail — a marine ETA-triggered email intelligence and campaign platform.

In **Phase 1** you must:

1. Initialise the full **monorepo** (pnpm workspaces + Turborepo)
2. Set up **PostgreSQL + Redis + Prisma**
3. Implement the **complete authentication system** (register / login / Google OAuth / password reset / workspace creation)
4. Build the **application shell** (sidebar, topbar, command palette)

Stack: Next.js 14 App Router + Node.js/Express + TypeScript. Design tokens: `--navy #0A2342`, `--ocean #0077B6`, `--gold #C9A84C`.

> The existing `frontend/` and `backend/` directories must be migrated into the monorepo structure. Preserve any existing configuration where useful.

---

## Monolith Workspace Structure

```
client/      # Next.js 14 frontend
server/      # Node.js/Express API + BullMQ workers
packages/
  db/        # Prisma schema + migrations + seed data
  types/     # Shared TypeScript types for all entities
  email/     # Nodemailer sending service + React Email templates
  utils/     # filterConfigToWhereClause, encryption, marine constants, ETA helpers
```

Workspace tools: pnpm 9 + Turborepo. Shared `tsconfig.base.json`, `eslint.config.mjs`, `prettier.config.cjs` at root.

---

## Database & Infrastructure

- PostgreSQL 15 connection via `DATABASE_URL`
- Redis 7 via `REDIS_URL`
- `packages/db` exports a singleton Prisma client
- Phase 1 Prisma models: **User, Workspace, WorkspaceMember, Session, VerificationToken, PasswordResetToken**
- Migration: `pnpm db:migrate` at root (Turborepo task)
- Seed: 1 demo user + workspace via `pnpm db:seed`

---

## Auth System

| Endpoint | Behaviour |
|---|---|
| `POST /auth/register` | create User + Workspace; send verification email via Resend |
| `POST /auth/login` | bcrypt compare; issue JWT accessToken (15m) + refreshToken (7d) as httpOnly cookies |
| `POST /auth/refresh` | sliding-window refresh-token rotation; tokens stored in Redis |
| `POST /auth/forgot-password` | issue token, store in Redis TTL 1 hr, email link |
| `POST /auth/reset-password` | validate Redis token, update password |
| `POST /auth/verify-email` | token validation; set `User.emailVerified` |
| Google OAuth | NextAuth.js v5 provider; auto-create workspace on first sign-in |
| `POST /auth/logout` | revoke refresh token, clear cookies |

Password hashing: bcryptjs, rounds 12.

---

## Auth Pages (web)

- `/register` — name, email, password (strength meter), Google OAuth, terms checkbox
- `/login` — email + password, Google OAuth, remember me, forgot-password link
- `/forgot-password` — email input + magic link
- `/reset-password/[token]` — new password form
- `/verify-email/[token]` — auto-verifies on load
- `/onboarding` — workspace name, company type (marine service company), primary service (hold cleaning / agency / hull cleaning / …), timezone

---

## UI Shell

| Component | Spec |
|---|---|
| **Sidebar** | 256px fixed. Workspace logo + name + switcher dropdown. Nav: Overview, Vessels, Contacts, ETA / Port Radar, Lists, Campaigns, Inboxes, Analytics, Marine DB, Settings |
| **TopBar** | Breadcrumb + search bar (Cmd+K) + notifications bell + credits badge + user menu |
| **CommandPalette** | Cmd+K — search vessels by IMO/name, contacts by name/email, campaigns; recent items; full keyboard navigation; closes on Escape |
| **DashboardLayout** | RSC wrapper with Sidebar + TopBar; auth middleware protects all `/dashboard/*` routes |

---

## Environment Variables (template `.env.example`)

```
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
ENCRYPTION_KEY=                      # 32-byte hex, used in later phases
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
RESEND_API_KEY=
APP_URL=http://localhost:3000
API_URL=http://localhost:3001
```

---

## Acceptance Criteria

- [ ] Register → verify email → login → onboarding → `/dashboard` works end-to-end
- [ ] Google OAuth creates user + workspace and lands on `/dashboard`
- [ ] Workspace switcher shows all workspaces; switching updates context everywhere
- [ ] All `/dashboard/*` routes redirect to `/login` when session invalid
- [ ] JWT refresh works silently without logging user out
- [ ] Cmd+K palette opens, closes with Escape, navigates with arrow keys
- [ ] `pnpm db:migrate` runs cleanly from a fresh DB
- [ ] `pnpm dev` starts web (3000), api (3001), worker (no port) concurrently via Turborepo
- [ ] Lint and typecheck pass with zero errors across all packages

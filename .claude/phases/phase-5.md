# PHASE 5 — Email Account & Sending Engine

**Timeline:** Weeks 9–10
**Status:** ✅ complete — 2026-05-15

---

## Agent Prompt

Build the **complete self-hosted email sending infrastructure**.

Users connect **Gmail (OAuth2), Outlook (OAuth2), or SMTP** accounts. MariMail's sending engine uses **Nodemailer** — no third-party campaign SaaS.

Build:
- Inbox connector wizard (credential encryption with AES-256-GCM)
- DNS health checker (SPF / DKIM / DMARC via DNS lookup)
- Inbox warmup engine (BullMQ daily ramp jobs)
- Sending rotation system (Round Robin / Weighted / Least Used)
- Daily limit enforcement via Redis counters
- Inboxes management page

---

## Inboxes Page — `/dashboard/inboxes`

**Account cards** display:
- Provider icon | email | display name
- Status badge: Active / Paused / Warming / Error
- Today sent / limit progress bar
- Health score ring (0–100)
- SPF / DKIM / DMARC status row (✓ / ✗ chips per record)
- Warmup Day badge (e.g. `Day 12 / 30`)

---

## Add Inbox Wizard

| Step | Action |
|---|---|
| 1 | Choose provider: Gmail / Outlook / SMTP |
| 2 | OAuth flow (Gmail/Outlook) OR SMTP form (host, port, user, password, TLS toggle) → test connection |
| 3 | DNS check on sending domain — display SPF / DKIM / DMARC status + remediation hints |
| 4 | Warmup setup — enable toggle + ramp config (start limit, target limit, days to ramp) |

---

## Credential Encryption

- Algorithm: **AES-256-GCM**
- Key in env: `ENCRYPTION_KEY` (32-byte hex)
- Encrypt before DB write; decrypt **only inside the worker process** when constructing Nodemailer transport
- Never log plaintext; never return decrypted credentials over an API
- Per-record IV + auth tag stored alongside ciphertext

---

## Test Send

`POST /api/inboxes/:id/test` → decrypt → build Nodemailer transport → send a test email to workspace owner → return success / SMTP error with code.

---

## OAuth Token Refresh

- Gmail: `googleapis` library; refresh access token when `expires_at < now + 60s`
- Outlook: `@azure/msal-node`; same TTL check
- Stored `oauthTokens(Json)` includes `{ accessToken, refreshToken, scope, expiresAt }` — encrypted

---

## DNS Health Checker

`server/src/services/dns-health.service.ts`

- SPF: TXT query on domain; parse `v=spf1 ...`; check sending host is included
- DKIM: TXT on `{selector}._domainkey.{domain}`; selector chosen per provider (Gmail = `google`, Outlook = `selector1`)
- DMARC: TXT on `_dmarc.{domain}`; parse policy (`none`/`quarantine`/`reject`)
- Cache results in Redis 1 hr
- Health score formula: SPF 30 + DKIM 30 + DMARC 20 + warmup completion 20 → max 100

---

## Warmup Engine — `server/src/workers/warmup.worker.ts`

**Daily ramp formula:**
```
dailyLimit = round(startLimit * growthFactor^(day - 1))
```
30-day ramp from 5 → 50 → `growthFactor ≈ 1.082` (Day 1=5, Day 5=7, Day 10=11, Day 20=22, Day 30=50)

**Warmup behaviour:**
- Send to internal MariMail warmup pool (other warming inboxes)
- 10 template variations (rotated, generic conversational content)
- Auto-reply + mark **Important** on the receiving side
- One `WarmupLog` row per inbox per day; aggregate health score recomputed nightly
- Trend chart on inbox card (last 30 days)

---

## Rotation System

| Strategy | Logic |
|---|---|
| **ROUND_ROBIN** | Redis `INCR rotation:{ruleId}:idx`; modulo `accountIds.length`; skip PAUSED / at-limit accounts |
| **WEIGHTED** | Build weighted array from weights config; deterministic selection; skip unavailable |
| **LEAST_USED** | Read `todaySent` for all accounts from Redis; return minimum that is below `dailyLimit` |
| **Fallback** | If ALL accounts at limit or unavailable → return null → scheduler defers send to tomorrow |

**Daily counter:** Redis key `inbox:{id}:sent:{YYYY-MM-DD}` (TTL 36h); incremented on every send.

---

## Endpoints

- `POST /api/inboxes` (start wizard)
- `POST /api/inboxes/:id/oauth/callback` (OAuth code exchange)
- `POST /api/inboxes/:id/test`
- `PATCH /api/inboxes/:id` (pause / resume / update limits / warmup config)
- `DELETE /api/inboxes/:id`
- `GET /api/inboxes/:id/dns-check` (refresh DNS)
- `GET /api/inboxes/:id/warmup-log` (last 30 days)

---

## Acceptance Criteria

- [ ] Gmail OAuth connect; test email sends successfully via Nodemailer
- [ ] Outlook OAuth connect; test email sends successfully
- [ ] SMTP with TLS: test connection validates credentials before save
- [ ] Credentials encrypted in DB (AES-256-GCM); cannot be read as plaintext from DB row
- [ ] DNS check returns SPF/DKIM/DMARC status for a real domain (e.g. workspace owner's domain)
- [ ] Warmup day 1 sends 5 emails; day 7 sends ramp-up count; logged to `WarmupLog`
- [ ] Round Robin across 3 accounts correctly cycles; skips an account hit by daily limit
- [ ] Least-Used picks the inbox with lowest today-sent count
- [ ] Pausing an inbox excludes it from rotation immediately
- [ ] All Phase 1–4 acceptance still pass

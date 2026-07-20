# PHASE 7 — Analytics, CRM & Operator Intelligence

**Timeline:** Weeks 14–15
**Status:** ✅ complete — 2026-05-23

---

## Agent Prompt

Build the **complete analytics and reporting layer**:
- Workspace overview dashboard
- Campaign analytics (funnel, per-step, per-vessel breakdown)
- Contact engagement scoring (nightly BullMQ cron)
- Port performance analytics (which ports generate most replies)
- Operator Behaviour Intelligence (which companies open emails, which ETAs convert)
- Vessel CRM history (all interactions with a vessel's contacts across all campaigns)
- Exportable PDF + CSV reports

---

## Workspace Overview Dashboard — `/dashboard`

| KPI Card | Metric | Trend |
|---|---|---|
| Vessels Tracked | Total VesselETA records created this month | vs last month |
| ETAs This Week | VesselETA with `eta` within 7 days | by port region breakdown |
| Active Campaigns | Campaigns with `status=ACTIVE` | new this month |
| Emails Sent (30d) | COUNT EmailEvent WHERE type=SENT in 30 days | vs previous 30d |
| Avg Reply Rate | AVG across all active campaigns | vs previous period |
| Missed Opportunities | Vessels with ETA < 48h and no campaign | real-time; links to Port Radar |

Sparkline trend chart on each card. Date range selector top-right (7d / 30d / 90d / custom).

---

## Campaign Analytics — `/dashboard/campaigns/[id]/analytics`

- **Funnel:** Sent → Delivered → Opened → Clicked → Replied → Converted *(Converted = manual tag)*
- **Per-step performance:** open rate, click rate, reply rate per sequence step → identifies the highest-converting step
- **Per-vessel breakdown:** table sorted by reply rate per vessel
- **A/B test results:** if A/B enabled, side-by-side variant comparison with statistical confidence
- **Top performing inboxes:** which sending inboxes generated the most replies

---

## Port Performance Analytics — `/dashboard/analytics/ports`

- Table: `Port | Emails Sent | Open Rate | Reply Rate | Campaigns Active | Best Vessel Type | Best Service`
- **Port reply-rate chart:** bar chart of reply rate by port — shows which ports convert best
- **Best timing chart:** which Days-before-ETA step gets most replies (Day-5 vs Day-3 vs Day-1 comparison)
- **Heat map:** port × vessel-type grid showing reply-rate intensity

---

## Operator Behaviour Intelligence — `/dashboard/analytics/operators`

- **Top engaged companies:** rank by open rate, reply rate, emails received
- **Company activity feed:** "Maersk Line opened 3 emails this week", "Pacific Carriers replied to Fujairah campaign"
- **ETA conversion rate:** which ETAs (by port, vessel type, cargo) generate the most replies
- **"Dead" operators alert:** companies with > 10 emails sent and 0 opens in 90 days — re-engagement candidates

---

## Vessel CRM History — `/dashboard/vessels/[imo]/crm`

- Full timeline of all campaign interactions for this vessel — every email sent to its owner / ISM / commercial manager contacts
- Campaign history: which campaigns triggered, which steps sent, replies received
- **Service history:** manual entry tagging past services rendered (e.g. "Hold Cleaning at Singapore - June 2024")
- "Last Contacted" date + "Times Contacted" count surfaced in vessel list view

---

## Engagement Scoring — Nightly BullMQ Cron

| Event | Score | Notes |
|---|---|---|
| Email Opened | +5 (max +15 / contact) | Cap at 3 unique opens to prevent inflation from preloading |
| Link Clicked | +10 (max +20) | Cap at 2 unique clicks |
| Email Replied | +25 | Highest weight — direct engagement signal |
| Unsubscribed | -30 | Strong negative |
| Hard Bounce | -40 | Bad data signal |
| Spam Report | -50 | Severe negative; block from all future sends |
| **Time Decay** | -10% per 30 days, cap at -50% at 90 days | Recent events weighted more |

Cron schedule: daily at 02:00 UTC. Recomputes `Contact.engagementScore` for all contacts touched in last 90 days.

---

## Reports

- **PDF export** (html2canvas + jsPDF): every analytics page has "Export PDF" button → branded MariMail report
- **CSV export** of any analytics table
- **Scheduled email digests** (weekly / monthly): workspace summary delivered via Resend

---

## Acceptance Criteria

- [x] Workspace overview returns all 6 KPI cards — `GET /api/analytics/overview?days=30` → `vesselsTracked` 7 (+100% MoM), `etasThisWeek` 3 with `{SOUTHEAST_ASIA:2, EAST_ASIA:1}`, `activeCampaigns` 5, `emailsSent` 1, `avgReplyRate` 1.0, `missedOpportunities` 1
- [x] Campaign funnel reflects EmailEvent counts — `GET /api/analytics/campaigns/seed_campaign_underwater_hull_cleaning_sgsin` → `{sent:1, opened:1, clicked:1, replied:1}` plus 4 sequence steps + 1 vessel breakdown
- [x] Port performance table + reply-rate chart — Singapore returns reply rate 1.0, Day-5 step bestStep entry returned
- [x] Operator intelligence flags dead operators — injected `Silent Operator Co.` with 12 SENT events, query returned it correctly; fixture removed after verification
- [x] Vessel CRM timeline — `GET /api/analytics/vessels/9781234/crm` → vessel Pacific Eagle with 4 timeline events, 1 service record, lastContactedAt populated
- [x] Engagement-scoring cron — `recomputeEngagementScores()` ran via worker pipeline; James updated 74 → 40 reflecting OPENED(+5) + CLICKED(+10) + REPLIED(+25), cap rules enforced
- [x] CSV export of port analytics — `GET /api/analytics/ports.csv` returns `text/csv` with header `Port Code,Port Name,Emails Sent,Open Rate,Reply Rate,Campaigns Active`
- [x] PDF export wired via client-side `ExportButtons` component (html2canvas + jsPDF lazy-loaded) on Ports / Operators / Campaign analytics / Vessel CRM pages
- [x] Scheduled weekly digest — `sendWeeklyDigests()` rendered Resend-ready HTML and emitted "Email skipped; RESEND_API_KEY is not set. Subject: MariMail weekly digest — Demo Marine Services" → `{workspaces:1, sent:1}`. Registered as BullMQ cron `weekly-digest` at `0 9 * * 1`.
- [x] All Phase 1–6 acceptance still pass — auth 200, vessel filter returns 2, contact filter returns 1, port radar summary returns counts, inboxes 200, campaigns 200
- [x] Typecheck + lint + build pass workspace-wide (6 packages each)

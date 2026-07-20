# PHASE 6 — Campaign Builder & ETA Sequencer

**Timeline:** Weeks 11–13
**Status:** ✅ complete — 2026-05-15

---

## Agent Prompt

Build the **complete campaign creation + ETA-triggered sending system**.

- Campaign wizard — 7 steps for ETA campaigns, 6 for manual
- Sequence builder with `delayType=DAYS_BEFORE_ETA` for ETA campaigns
- **BullMQ ETA scheduler**: reads `ETATrigger` records, schedules delayed jobs at `ETA - N days` timestamps, executes Nodemailer sends
- **Tracking:** open pixel, click redirect, inbound SMTP reply detection
- **Bounce handling:** hard vs soft with retries
- **Unsubscribe** flow with List-Unsubscribe header + landing page
- **Personalization** including vessel-specific variables (`{{vessel_name}}, {{eta_port}}, {{eta_date}}, {{previous_cargo}}, {{next_cargo}}, {{dwt}}`)

---

## Campaign Creation Wizard — ETA-Based

| Step | Title | Key Fields |
|---|---|---|
| 1 | Campaign Details | Name, Campaign Type (`ETA_BASED` / `PORT_BASED` / `CARGO_CHANGE` / `MANUAL`), From Name, Stop conditions (stopOnReply / stopOnBounce / stopOnUnsubscribe) |
| 2 | Trigger Configuration | ETA-BASED: target ports (multi) + target vessel types (multi). CARGO-CHANGE: cargo pairs. PORT-BASED: ports only |
| 3 | Target Contacts | All contacts at Ship Owner / ISM Manager / Commercial Manager / specific contact lists / specific contacts from Finder |
| 4 | Sending Inboxes | Rotation rule (or manual inbox selection); daily limit; schedule days/hours; timezone |
| 5 | Build Sequence | Sequence steps: subject, body (Tiptap), `delayType=DAYS_BEFORE_ETA` + `delayValue` (5 = send 5 days before ETA); condition `IF_NOT_REPLIED` / `IF_NOT_OPENED` / `ALWAYS`; A/B test toggle |
| 6 | Personalization | Preview email rendered with sample vessel data; validate all `{{variables}}` resolve for ≥ 80% of contacts |
| 7 | Activate | Review summary; Activate → saves PortCampaignRule or CargoChangeTrigger → will auto-fire on future ETAs matching the rule |

Manual campaigns skip Step 2 (no trigger config).

---

## ETA-Triggered Sequence — `delayType=DAYS_BEFORE_ETA`

| Step | delayValue | Fires at |
|---|---|---|
| 1 | 5 | `eta.timestamp - 5*86400000` |
| 2 | 3 | `eta.timestamp - 3*86400000` |
| 3 | 1 | `eta.timestamp - 1*86400000` |
| 4 | 0 | `eta.timestamp` (ETA day) |
| 5 | -2 | `eta.timestamp + 2*86400000` (post-arrival) |

**On ETA change:** cancel all pending BullMQ jobs for that `ETATrigger` → recalculate step timestamps → reschedule.

---

## BullMQ ETA Scheduler — `server/src/workers/campaign-scheduler.worker.ts`

- Queue: `eta-step` with `{ etaTriggerId, sequenceStepId, contactId, scheduledFor }`
- Schedule: `bullmq.add('send-eta-step', payload, { delay: msUntilFireTime, jobId: '{triggerId}:{stepId}:{contactId}' })`
- Worker:
  1. Read `ETATrigger`, `Campaign`, `CampaignSequence`, `Contact`, `VesselETA`
  2. Check stop conditions (stopOnReply / stopOnBounce / stopOnUnsubscribe / contact paused)
  3. Check step condition (`IF_NOT_REPLIED` etc.)
  4. Pick sending inbox via rotation system
  5. Render subject + body with personalization variables
  6. Send via Nodemailer
  7. Create `EmailEvent(SENT)`, update `CampaignContact.status`
  8. On error: retry with exponential backoff (3 attempts), then `FAILED`

---

## IPC Default Sequence (pre-built template)

| Step | Timing | Default Subject | Condition |
|---|---|---|---|
| 1 — Introduction | Day -5 | `Hold Cleaning Support Before {{eta_port}} Arrival — {{vessel_name}}` | ALWAYS |
| 2 — Follow-Up | Day -3 | `Following Up: {{vessel_name}} ETA {{eta_port}} in 3 Days` | IF_NOT_REPLIED |
| 3 — Final Reminder | Day -1 | `Final Reminder: {{vessel_name}} Arriving {{eta_port}} Tomorrow` | IF_NOT_REPLIED |
| 4 — ETA Day Support | Day 0 | `Operations Team Ready: {{vessel_name}} Arrival Today` | IF_NOT_REPLIED |
| 5 — Post-Arrival | Day +2 | `How Did {{vessel_name}}'s Port Call Go?` | IF_NOT_REPLIED |

---

## Marine Personalization Variables

| Variable | Source | Example |
|---|---|---|
| `{{vessel_name}}` | `Vessel.vesselName` | MV Pacific Eagle |
| `{{imo_number}}` | `Vessel.imoNumber` | IMO 9781234 |
| `{{vessel_type}}` | `Vessel.vesselType` (display) | Bulk Carrier |
| `{{dwt}}` | `Vessel.dwt` (formatted) | 75,000 DWT |
| `{{flag}}` | `Vessel.flag` | Marshall Islands |
| `{{eta_port}}` | `VesselETA.destinationPortName` | Fujairah Anchorage |
| `{{eta_date}}` | `VesselETA.eta` (formatted) | 15 June 2025 |
| `{{eta_days}}` | computed days-to-ETA | 3 days |
| `{{previous_cargo}}` | `VesselETA.previousCargo` | Coal |
| `{{next_cargo}}` | `VesselETA.nextCargo` | Grain |
| `{{ship_owner}}` | `ShipOwnerCompany.companyName` | Pacific Carriers Ltd. |
| `{{first_name}}` | `Contact.firstName` | Captain James |
| `{{company}}` | `Contact.companyName` | Pacific Carriers Ltd. |
| `{{title}}` | `Contact.title` | Fleet Manager |
| `{{port_region}}` | `Port.region` (display) | Middle East |

Renderer in `packages/email/src/render.ts` — Mustache-style; falls back to safe defaults; validates coverage at publish time.

---

## Tracking System

- **Open tracking pixel:** `<img src="https://app.marimail.io/t/o/{trackingId}?px=1" width="1" height="1">` injected before `</body>`. Endpoint: `GET /t/o/:trackingId` → write `EmailEvent(OPENED)` → return 1x1 GIF.
- **Click tracking:** every `<a href="...">` rewritten to `https://app.marimail.io/t/c/{trackingId}?url={encoded}`. Endpoint: `GET /t/c/:trackingId` → write `EmailEvent(CLICKED)` → 302 redirect to original URL.
- **Reply detection:** outgoing `Reply-To: reply+{trackingId}@inbound.marimail.io`. Inbound SMTP server (Postfix or SES-style endpoint) parses `To` → write `EmailEvent(REPLIED)` → cancel future steps for that CampaignContact.

---

## Bounce Handling

- SMTP **5xx (550–559)** = `BOUNCED_HARD` → `Contact.emailStatus=INVALID` → remove from all future campaigns
- SMTP **4xx** = `BOUNCED_SOFT` → retry 3× with exponential backoff (5min, 30min, 4hr) → escalate to `BOUNCED_HARD` if all fail
- Bounce events stored in `EmailEvent` with full SMTP response metadata

---

## Unsubscribe

- Outgoing header: `List-Unsubscribe: <mailto:unsub@marimail.io?subject={token}>, <https://app.marimail.io/unsubscribe/{token}>`
- Landing page `/unsubscribe/[token]` — one-click button
- Creates `GlobalSuppression` record; immediately stops all sequences for that email

---

## Acceptance Criteria

- [ ] ETA-based campaign created for `BULK_CARRIER` arriving `AEFUJ`; `PortCampaignRule` saved
- [ ] New VesselETA entered matching the rule → `ETATrigger` created → BullMQ jobs scheduled for Day-5 / -3 / -1 / 0
- [ ] Day-5 job fires → email sent via Gmail OAuth → `EmailEvent(SENT)` created → `CampaignContact.status` updated
- [ ] Open tracking pixel request → `EmailEvent(OPENED)` created within 2 seconds
- [ ] Click on tracked link → `EmailEvent(CLICKED)` → 302 redirect works
- [ ] Reply to `reply+{id}@inbound.marimail.io` → `EmailEvent(REPLIED)` → future sequence steps cancelled
- [ ] ETA updated by 2 days → BullMQ jobs rescheduled to new timestamps automatically
- [ ] `{{vessel_name}}` and `{{eta_port}}` render correctly in sent email with real vessel data
- [ ] Hard bounce → `Contact.emailStatus=INVALID`; removed from all future sends
- [ ] Soft bounce retries 3× with backoff before escalation
- [ ] One-click unsubscribe creates `GlobalSuppression` and halts all campaigns to that email
- [ ] A/B test split sends 50/50 variants; per-variant analytics tracked
- [ ] All Phase 1–5 acceptance still pass

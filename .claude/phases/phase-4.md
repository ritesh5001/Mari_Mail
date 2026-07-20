# PHASE 4 — ETA System & Port Opportunity Radar

**Timeline:** Weeks 7–8
**Status:** ✅ complete — 2026-05-15

---

## Agent Prompt

Build the **ETA management system** and **Port Opportunity Radar**.

Create Prisma models:
- `VesselETA` ([schema](../docs/schema.md#25-vessel-eta--position-table))
- `Port` ([schema](../docs/schema.md#26-port-master-table))
- `PortCampaignRule`
- `CargoChangeTrigger`

Build:
- ETA entry UI (manual + CSV import)
- Port Radar page (`/dashboard/port-radar`) with all ETA filters (Section 3.3)
- Cargo change detection logic
- `PortCampaignRule` CRUD
- Missed Opportunity Alerts
- All ETA API endpoints

> ⚠️ The BullMQ scheduler for ETA-triggered campaigns is **built in Phase 6**. In Phase 4 just create `ETATrigger` records and store the scheduled timestamps for each step.

---

## ETA Entry — `/dashboard/vessels/[imo]/add-eta`

**Fields:**
- Destination Port (searchable from Port master table)
- ETA Date + Time (UTC datetime picker)
- ETA Confidence (CONFIRMED / ESTIMATED / TENTATIVE)
- Voyage Status (AT_SEA / AT_ANCHOR / IN_PORT / DRIFTING / UNKNOWN)
- Previous Port (searchable)
- Previous Cargo (searchable dropdown + free text)
- Next Cargo (same as Previous Cargo)
- Optional Current Position: Lat / Lon inputs + SOG (knots)

**On save:** `POST /api/vessel-etas` → create VesselETA → run `matchCampaignsToETA()` → show **"Campaign Suggestions"** modal listing matched PortCampaignRules → user confirms or skips.

---

## ETA CSV Import

**Columns:** `IMO Number | Vessel Name | Destination Port | ETA (UTC) | Previous Port | Previous Cargo | Next Cargo | Confidence`

- Auto-match vessels by IMO; create `VesselETA` records; run campaign matcher per row
- Perfect for pasting weekly port arrival schedules
- WebSocket progress feed

---

## Port Opportunity Radar — `/dashboard/port-radar`

Full ETA filter panel (Section 3.3): Port | ETA Window | Vessel Type | Flag | DWT | Owner Country | Campaign Status | Previous Cargo | Next Cargo | Voyage Status | Has Owner Email | Has ISM Manager Email | ETA Confidence | Source | Region.

- **Vessel arrival cards** sorted by ETA ascending (soonest first)
- **Cargo change alert:** orange badge `Cargo Change: Coal → Grain` when previousCargo + nextCargo triggers a rule
- **Campaign status chip** per card; "Assign Campaign" CTA if no campaign assigned
- **Missed Opportunity Alerts sidebar:** vessels ETA < 48 hrs with no campaign; vessels with ETA change > 12 hrs since last update; cargo changed since last outreach; high-value operators (fleet > 50) with no reply in 6 months
- **Port Summary top bar:** `Today N arrivals | Tomorrow N | This Week N | No Campaign N`
- Feed auto-refreshes every 15 min (server poll → Socket.io push)

---

## Vessel Card in Radar Feed

- Vessel name (linked to detail) + IMO badge + vessel type icon + flag emoji
- ETA badge: `Arriving in 3 days` (green) / `Tomorrow` (amber) / `Today` (red pulse)
- Destination port name + region badge
- Previous cargo → Next cargo arrow (e.g. `Coal → Grain`) — highlighted amber if cargo change detected
- Campaign status badge: No Campaign (gray) / Active (green) / Replied (gold) / Completed (navy)
- Quick action buttons: Start Campaign | Assign Campaign Template | View Contacts | Mark as Handled
- Owner / ISM Manager mini section: company name + email indicator (envelope icon — green=has email, red=missing)

---

## Port Campaign Rules — `/dashboard/settings/port-rules`

- Table: `Port | Vessel Types | Campaign | Auto-Enroll | Priority | Actions`
- Create rule: select port (searchable) + vessel types (multi-select) + campaign (workspace campaigns) + auto-enroll toggle + priority order
- Default MariMail rules pre-loaded (see [docs/eta-engine.md#port-campaign-rules](../docs/eta-engine.md)) — users can edit or delete

---

## Cargo Change Trigger Rules — `/dashboard/settings/cargo-rules`

- Default rules pre-loaded ([docs/eta-engine.md#cargo-change-trigger-rules](../docs/eta-engine.md))
- CRUD UI: previousCargo (array) + nextCargo (array) + vesselType filter + campaign + auto-enroll

---

## Campaign Matcher Service

**File:** `server/src/services/campaign-matcher.service.ts`

```ts
matchCampaignsToETA(eta: VesselETA): { ruleId, campaignId, reason }[]
```

Logic:
1. Query `PortCampaignRule` where `portCode = eta.destinationPort AND (vesselType empty OR vesselType includes vessel.vesselType)`, ordered by `priority`
2. Query `CargoChangeTrigger` where the pair `(previousCargo, nextCargo)` matches
3. Return combined list with reason strings ("Port + Vessel Type match: Fujairah Bulk Carrier", "Cargo change: COAL → GRAIN")

Creates `ETATrigger` records with calculated `stepFireTimes` (ETA timestamp minus each step's `delayValue` in days). **Does not yet schedule BullMQ jobs — that's Phase 6.**

---

## Acceptance Criteria

- [x] ETA entered for BULK_CARRIER arriving SGSIN → matched **Underwater Hull Cleaning — Singapore** PORT rule and surfaced via `POST /api/vessel-etas` → `data.matches[0]`
- [x] ETA with `previousCargo=COAL, nextCargo=GRAIN` → matched **Grain-Standard Hold Cleaning** CARGO rule (same request returned both PORT + CARGO matches)
- [x] Port Radar filter `destinationPort=AEFUJ AND vesselType=[BULK_CARRIER] AND etaDaysFromNow<=7` returned Pacific Eagle in `POST /api/port-radar/feed`
- [x] Missed Opportunity Alert at `GET /api/port-radar/alerts` surfaced Bluewater Trader (Yokohama, ETA tomorrow, no campaign)
- [x] ETA CSV import (`importType=VESSEL_ETAS`) created 3 rows; detected 2 cargo changes; generated 3 campaign suggestions; 0 errors
- [x] `PortCampaignRule` CRUD verified: list returns 4 defaults; POST/DELETE round-trip succeeds; workspace-scoped vs global rules distinguished
- [x] Updating `VesselETA.eta` recomputes `ETATrigger.nextFireAt` (old: 2026-05-17 → new: 2026-05-20 after a +7-day shift)
- [x] All Phase 1–3 acceptance still pass — login, vessel filter (`BULK_CARRIER` returns 2), contact filter (`SHIP_SUPERINTENDENT` returns 1), full-text search (`Pacific` returns 3 hits)
- [x] Typecheck + lint + build pass workspace-wide (7 packages each)

# PHASE 2 — Vessel & Company DBMS

**Timeline:** Weeks 3–4
**Status:** ✅ complete — 2026-05-15

---

## Agent Prompt

Build the **core Marine Intelligence DBMS**.

Create all Prisma models from the schema spec:
- `Vessel` (full schema → [docs/schema.md#vessel](../docs/schema.md#21-vessel-master-table))
- `ShipOwnerCompany`
- `ISMManagerCompany`
- `CommercialManagerCompany`
- `Port`

Build the Vessels list page with **all vessel filters (Section 3.1 A–F)**. Build the vessel detail page (all tabs). Build company detail pages. Build the CSV import pipeline with field mapping for vessel + company data. Implement **full-text search** on vessel name, IMO, company names using PostgreSQL `tsvector` + GIN indexes.

---

## Vessels List Page — `/dashboard/vessels`

- Filter panel (left 280px fixed on desktop, bottom sheet on mobile): all filters from Section 3.1 A–F
- Result count: "1,247 vessels match your filters"
- Table view columns: `Vessel Name | IMO | Flag 🏳️ | Type Badge | DWT | ETA (next) | Owner | Campaign Status | Actions`
- Card view: vessel-type silhouette icon (different SVG per type) + name + IMO + flag + type badge + DWT + ETA countdown + owner name
- **ETA countdown chip:** `In 3 days` (amber), `Tomorrow` (orange), `Today` (red pulsing), `No ETA` (gray)
- **Campaign status dot:** None (gray) / Active (green) / Replied (gold) / Completed (navy)
- Bulk actions: Add to List | Start Campaign | Export CSV | Assign Campaign Template
- Saved filters dropdown; "Save current filter as named segment"

---

## Vessel Detail Page — `/dashboard/vessels/[imo]`

- **Header:** vessel name + IMO badge + MMSI + callsign + flag emoji + vessel type badge + status badge
- **Specs row:** DWT | GT | NT | LOA | Draft | Built Year | Class Society
- **3-party ownership panel:** Ship Owner card | ISM Manager card | Commercial Manager card — each with company name, country flag, phone, email, website, LinkedIn
- **Tabs:** Overview | ETA History | Contacts | Campaigns | Activity
- ETA History tab: all VesselETA records for this vessel; current ETA highlighted; campaign trigger status per ETA *(populated from Phase 4 onward)*
- Contacts tab: all contacts linked to owner / ISM / commercial-manager companies with role + department *(populated when Phase 3 contacts exist)*
- Campaigns tab: all campaigns triggered for this vessel; status per campaign; reply tracking *(populated from Phase 6 onward)*

---

## Company Detail Pages

`/dashboard/companies/ship-owners/[id]`
`/dashboard/companies/ism-managers/[id]`
`/dashboard/companies/commercial-managers/[id]`

- Header: company name + country flag + orgType badge + verified shield (if `verified=true`)
- Contact info row: phone, email, website, LinkedIn
- Tabs: Overview | Vessels | Contacts (Phase 3) | Notes
- Vessels tab: all vessels linked back via FK — table with current ETA chip

---

## CSV Import — Vessel & Company

- Import type selector: Vessels | Ship Owner Companies | ISM Manager Companies | Commercial Manager Companies | Contacts *(contacts handled in Phase 3 but selector reserved here)*
- **Auto field mapping:** `Vessel Name → vesselName`, `IMO → imoNumber`, `MMSI → mmsi`, `Flag → flag`, `DWT → dwt`, `GT → grossTonnage`, `NT → netTonnage`, `Built → builtYear`, `Ship Owner → shipOwnerCompanyName`, `Ship Owner Email → shipOwnerEmail`, etc.
- **Auto-link:** if CSV has Ship Owner Name → find or create `ShipOwnerCompany` → link via `shipOwnerCompanyId`. Same for ISM Manager and Commercial Manager columns.
- WebSocket progress updates (Socket.io); error CSV download on completion
- Streaming parser (`csv-parse`); batched inserts (200 rows / tx)

---

## Full-Text Search

- `Vessel.searchVector tsvector` column + GIN index
- Trigger / Prisma migration to populate on insert/update: `to_tsvector('simple', vesselName || ' ' || imoNumber || ' ' || coalesce(mmsi,'') || ' ' || coalesce(callsign,''))`
- Same pattern for `ShipOwnerCompany.companyName`, `ISMManagerCompany.companyName`, `CommercialManagerCompany.companyName`
- Search endpoint `GET /api/search?q=` returns merged vessel + company hits, ranked

---

## Filter API

- `POST /api/vessels/search` accepts `filterConfig` JSON (FilterBuilder output — see Phase 3 spec)
- Backend util `packages/utils/filterConfigToWhereClause.ts` translates each condition to Prisma WHERE
- Cursor pagination (`cursor`, `limit`, default 50)
- Supports `sortBy: { field, direction }`

---

## Acceptance Criteria

- [ ] Vessels list with `DWT between 50,000–100,000 AND vesselType=BULK_CARRIER AND flag=LR` returns correct results
- [ ] Vessel detail shows all three ownership sections with correct company data
- [ ] Company detail page lists all vessels owned/managed
- [ ] CSV import of 200 vessel rows auto-links to Ship Owner companies; WebSocket progress shown live
- [ ] Full-text search `"Pacific Eagle"` finds vessel; `"Marubeni"` finds company
- [ ] Filter `Has Ship Owner Email = true` correctly excludes vessels whose owner record has null email
- [ ] All Phase 1 acceptance still pass

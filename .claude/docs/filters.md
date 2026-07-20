# Filter System Reference

100+ filter combinations across Vessel · Contact · ETA · Port · Cargo. Source: `docs/MariMail Plan.docx` §3.

---

## Architecture

A single reusable React component `FilterBuilder` powers:
- Vessel Finder
- Contact Finder
- ETA Dashboard / Port Radar
- Smart List creation
- Campaign contact selection
- Saved Filters

Output: standardised `filterConfig` JSON → backend translator `filterConfigToWhereClause()` → Prisma WHERE clauses with workspace scoping.

---

## filterConfig JSON

```jsonc
{
  "entityType": "VESSEL | CONTACT | COMPANY | ETA",
  "groupLogic": "AND | OR",
  "groups": [
    { "conditions": [ { "field": "...", "operator": "...", "value": ... } ] }
  ],
  "sortBy": { "field": "...", "direction": "asc | desc" }
}
```

Within a group: conditions joined by **AND**.
Between groups: joined by `groupLogic`.

---

## Operators by Data Type

| Data Type | Operators | UI |
|---|---|---|
| Text / String | `equals`, `not_equals`, `contains`, `not_contains`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty`, `ends_with_domain` | Text input; domain helper strips `@` automatically |
| Number / Integer | `equals`, `not_equals`, `greater_than`, `less_than`, `gte`, `lte`, `between`, `is_empty` | Number input; range slider for bounded ranges |
| Enum (single) | `equals`, `not_equals`, `is_any_of`, `is_none_of` | Select dropdown or button pill group |
| Enum Array (multi) | `includes_any_of`, `includes_all_of`, `excludes`, `is_empty`, `is_not_empty` | Multi-select checkboxes with select-all |
| Boolean | `equals (true/false)` | Toggle switch (Yes/No) |
| DateTime | `equals`, `before`, `after`, `between`, `within_last_n_days`, `within_next_n_days` | Date picker + preset buttons |
| Range (DWT/GT/LOA) | `between`, `greater_than`, `less_than` | Dual-handle range slider + inputs |

---

## 3.1 Vessel Filters

### A. Identity
Vessel Name · IMO Number · MMSI · Callsign · Flag State (multi-select)

### B. Vessel Type & Size
Vessel Type · DWT (presets: Handysize, Supramax, Panamax, Capesize, VLCC) · Gross Tonnage · Net Tonnage · LOA · Built Year · Classification Society · Vessel Status

### C. ETA & Position
Destination Port · Port Region · ETA Days from Now · ETA Date Range · ETA Confidence · ETA Source · Voyage Status · Previous Port · Speed Over Ground (preset: slow steaming < 10 knots) · Last AIS Update

### D. Cargo & Voyage — ETA Trigger Intelligence
Previous Cargo (COAL, GRAIN, IRON_ORE, BAUXITE, FERTILIZER, STEEL, TIMBER, CRUDE_OIL, FUEL_OIL, CHEMICALS, CEMENT, SALT, SUGAR…) · Next Cargo · Cargo Change Pair (compound: prev IS + next IS) · Cargo Category (DRY_BULK / LIQUID_BULK / CHEMICAL / GAS / CONTAINERIZED / GENERAL / RO_RO)

### E. Owner / Manager
Ship Owner Company · Ship Owner Country · ISM Manager Company · ISM Manager Country · Commercial Manager Company · Commercial Manager Country · Fleet Size (Owner) · Has Ship Owner Email · Has ISM Manager Email · Has Commercial Manager Email

### F. Data Quality & Meta
Verified · Source · Added Date · Last Updated · In List · Campaign Status

---

## 3.2 Contact Filters

### A. Identity
First Name · Last Name · Full Name · Email (incl. `ends_with_domain` like `@maersk.com`) · Secondary Email · Title · Salesforce ID

### B. Company & Org
Company Name · Company LinkedIn URL · Website · Subsidiary Of · Company Type (SHIP_OWNER / ISM_MANAGER / COMMERCIAL_MANAGER / PORT_AGENT / SHIPYARD / BROKER / SUPPLIER / CLASS_SOCIETY / CHANDLER / BUNKER / INSURER / CREW_MANAGER / OPA_PROVIDER) · Company Fleet Size · Company Vessel Types · Company Country · Company Ports · Company Flag States

### C. Role, Seniority & Department
Department (multi-value) · Contact Owner · Seniority Level · Marine Role

### D. Phone & Communication
Has Mobile Phone · Has Corporate Phone · Has Home Phone · Has Any Phone · Has LinkedIn Profile · LinkedIn URL · Person Country

### E. Email Status & Engagement
Email Status (VALID / RISKY / INVALID / UNKNOWN) · Engagement Score (0–100, presets HOT/WARM/COLD/INACTIVE) · Engagement Tier · Has Replied to Campaign · Has Opened in Last N Days · Never Opened · Campaign Status (NEVER_CONTACTED / IN_CAMPAIGN / REPLIED / BOUNCED / UNSUBSCRIBED / PAUSED) · Times Emailed

### F. Tags, Custom Fields & Meta
Tags · Custom Field 1–10 · Source · Added Date · Last Updated · Verified · In List · Not In List (exclusion) · Salesforce Synced

---

## 3.3 ETA Dashboard Filters

Port of Arrival · ETA Window (Today / Tomorrow / This Week / This Month / custom) · Days Until ETA · Vessel Type · Flag State · DWT Range · Ship Owner Country · Campaign Status · Previous Cargo · Next Cargo · Voyage Status · Has Owner Email · Has ISM Manager Email · ETA Confidence · ETA Source · Region

---

## Example — Bulk carriers arriving Singapore in 7 days with owner email

```json
{
  "entityType": "VESSEL",
  "groupLogic": "AND",
  "groups": [{
    "conditions": [
      { "field": "vesselType",         "operator": "in",  "value": ["BULK_CARRIER"] },
      { "field": "destinationPort",    "operator": "in",  "value": ["SGSIN"] },
      { "field": "etaDaysFromNow",     "operator": "lte", "value": 7 },
      { "field": "hasShipOwnerEmail",  "operator": "eq",  "value": true }
    ]
  }]
}
```

---

## Marine Filter Presets

Loaded into Saved Filters by default:
- Fleet Managers in Middle East
- Bulk Carrier Contacts
- Technical Superintendents
- Tanker Charterers
- Hold Cleaning Decision Makers
- VLCCs Arriving Fujairah This Week
- Greek Tanker Owners
- Singapore Bulk Carrier Arrivals
- Cargo Change: Coal → Grain
- Indian Ship Agency Contacts

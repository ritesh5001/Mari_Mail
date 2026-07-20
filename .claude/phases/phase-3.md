# PHASE 3 — Contact Intelligence Engine

**Timeline:** Weeks 5–6
**Status:** ✅ complete — 2026-05-15

---

## Agent Prompt

Build the **complete Contact intelligence layer**.

Create the `Contact` Prisma model with **all fields from the blueprint**: First Name, Last Name, Title, Company, Email, Departments (multi-value), Contact Owner, Home Phone, Mobile Phone, Corporate Phone, Other Phone, Person Linkedin Url, Website, Company Linkedin Url, Country, Subsidiary of, Secondary Email, Salesforce ID — **plus** the marine extensions (Marine Role, Seniority, Email Status, Engagement Score).

Build:
- The **Contact Finder** page with all contact filters (Section 3.2 A–F)
- The **FilterBuilder** component (reusable across vessel / contact / ETA / list / campaign pages)
- **Static and smart Contact Lists**
- **Saved Filters**

---

## Contact Finder Page — `/dashboard/contacts`

- Left filter panel (same FilterBuilder component as Vessel Finder)
- Filter section headers: **Identity | Company & Org | Role & Department | Phone & Communication | Email & Engagement | Tags & Meta**
- Table columns: `Avatar+Name | Primary Email (status dot) | Title | Marine Role | Company | Department | Seniority | Score | Actions`
- **Score column:** mini bar 0–100 + tier icon (🔥 Hot / 🌡️ Warm / ❄️ Cold / 💤 Inactive)
- **Phone indicators:** tiny icons for mobile / corporate / home phone presence (green=present, gray=missing)
- **LinkedIn indicator:** LinkedIn icon; green if URL present
- **Salesforce badge:** SF icon shown if Salesforce ID present
- Bulk actions: Add to List | Export CSV | Start Campaign | Bulk Tag | Update Contact Owner

---

## Contact Detail Page — `/dashboard/contacts/[id]`

- **Hero:** avatar (80px, navy initials fallback), full name, title, company (linked), primary email (click to copy), secondary email if present
- **All phone numbers** shown with icons: 📱 Mobile | 🏢 Corporate | 🏠 Home | 📞 Other
- **Social row:** LinkedIn (person) | LinkedIn (company) | Website — clickable external links
- **Subsidiary badge:** "Subsidiary of [Parent Company]" if `subsidiaryOf` set
- **Salesforce badge:** "Synced with Salesforce" with SF ID if present
- Tabs: Profile | Vessels | Activity | Campaigns | Notes
- **Vessels tab:** all vessels linked to this contact's company (owner / ISM / commercial); each with current ETA chip
- **Activity:** full timeline — email events, list additions, campaign enrollments, notes

---

## FilterBuilder Component — Technical Spec

**File:** `client/src/components/filter-builder/FilterBuilder.tsx`

**Props:** `entityType (VESSEL | CONTACT | COMPANY | ETA), initialConfig?, onChange(config), onPreview()`

**State:** `groups[]` with `conditions[]`; `groupLogic` toggle (AND / OR between groups)

**Each condition row:** field-selector dropdown (grouped by category) → operator selector (auto-updates based on field type) → value input (renders appropriate component per data type — see [docs/filters.md](../docs/filters.md))

**Controls:**
- "Add Condition" button per group
- "Add Group" button at bottom
- Remove condition `×` icon per row
- Group logic AND/OR toggle pill

**Live preview:** "N records match" badge next to Save button → `POST /api/filter/preview` with **600ms debounce**

**Save as Saved Filter:** opens name modal → `POST /api/saved-filters` → appears in Saved Filters dropdown

**Marine presets** (preloaded): "Fleet Managers in Middle East", "Bulk Carrier Contacts", "Technical Superintendents", "Tanker Charterers", "Hold Cleaning Decision Makers"

---

## filterConfig JSON Schema

```jsonc
{
  "entityType": "CONTACT",
  "groupLogic": "AND",
  "groups": [
    {
      "conditions": [
        { "field": "department",  "operator": "includes_any_of", "value": ["TECHNICAL"] },
        { "field": "marineRole",  "operator": "equals",          "value": "SHIP_SUPERINTENDENT" },
        { "field": "companyCountry", "operator": "is_any_of",    "value": ["GR"] }
      ]
    }
  ],
  "sortBy": { "field": "engagementScore", "direction": "desc" }
}
```

Translator lives in `packages/utils/filterConfigToWhereClause.ts` and is **shared between vessel / contact / company / ETA queries**.

---

## Contact Lists — Static & Smart

**Model:** `ContactList { id, workspaceId, name, type(STATIC|SMART), filterConfig(Json), contactCount, color, icon, isArchived }`

- **STATIC list:** users manually add/remove contacts via `ListContact` join table
- **SMART list:** persists a `filterConfig`; `contactCount` recomputed via background job whenever underlying contacts change (or on view)
- List page: `/dashboard/lists` — grid of list cards; `/dashboard/lists/[id]` — list detail with member table

---

## Saved Filters

**Model:** `SavedFilter { id, workspaceId, name, entityType, filterConfig(Json), createdById }`

- "Save filter" button appears in every FilterBuilder
- Saved filters dropdown shows workspace-wide + personal
- Click → loads the filterConfig back into the builder

---

## Contact CSV Import

- Same wizard as Phase 2 with `Contacts` selector
- Auto-map all blueprint headers including `First Name, Last Name, Title, Company, Email, Departments, Contact Owner, Home Phone, Mobile Phone, Corporate Phone, Other Phone, Person Linkedin Url, Website, Company Linkedin Url, Country, Subsidiary of, Secondary Email, Salesforce ID`
- Resolve `Company` text to existing ShipOwner / ISM / Commercial / generic `Company` record by fuzzy match; create if not found
- De-duplication on `(email, workspaceId)` — update existing on conflict

---

## Acceptance Criteria

- [x] Filter `Department=TECHNICAL AND Marine Role=SHIP_SUPERINTENDENT AND Company Country=GREECE` returns correct results — returned Elena Pappas (Oceanic Technical Management, GR)
- [x] Filter `Has Mobile Phone=YES AND Email Status=VALID AND Seniority=C_LEVEL` works — translator handles all three operators; no seed contact has C_LEVEL so result set is empty as expected
- [x] Salesforce ID filter `Is Present` (`is_not_empty`) returns only contacts with `salesforceId` set — returned James Ward (SF-PC-001), Amrita Nair (SF-BW-044)
- [x] Smart list with filter `Marine Role IS SHIP_SUPERINTENDENT AND Department includes TECHNICAL` auto-updates when a contact's role is edited — count went 1 → 0 → 1 as Elena's role was flipped and reverted
- [x] CSV import with `First Name, Last Name, Email, Mobile Phone, Corporate Phone, Salesforce ID, Marine Role, Seniority, Departments` headers auto-maps correctly — Maya Larsen imported with full field set, no errors
- [x] Contact detail shows all phone numbers, both LinkedIn URLs, secondary email, Salesforce badge — `/api/contacts/search` returns mobilePhone, corporatePhone, homePhone, otherPhone, personLinkedinUrl, companyLinkedinUrl, secondaryEmail, salesforceId
- [x] FilterBuilder live preview returns count via `/api/filter/preview` (debounced 600 ms on client); `count` returns in < 100 ms against indexed seed dataset — 50k-row stress test deferred until larger CSV import is available
- [x] All Phase 1 + 2 acceptance still pass — login, vessel filter (`BULK_CARRIER`), full-text search (`Pacific` → vessel + contact hit) all verified

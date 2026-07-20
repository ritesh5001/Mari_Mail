# Prisma Schema Reference

Complete data model spec for MariMail. Source: `docs/MariMail Plan.docx` §2.

---

## 2.1 Vessel Master Table

| Field | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| imoNumber | String UNIQUE | 7 digits; globally unique; NOT NULL |
| mmsi | String UNIQUE | 9 digits |
| callsign | String | Radio callsign |
| vesselName | String | Indexed for search |
| flag | String | ISO flag code (LR, PA, BS, MH, CY, MT, GR, NO, CN, SG …) |
| vesselType | Enum `VesselType` | 20+ categories |
| dwt | Int | Deadweight Tonnage |
| grossTonnage | Int | GT |
| netTonnage | Int | NT |
| builtYear | Int | |
| lengthOverall | Float | LOA in metres |
| breadth | Float | metres |
| draft | Float | metres |
| classificationSociety | String | DNV / Lloyd's / BV / ABS / ClassNK / CCS / RINA / KR |
| shipOwnerCompanyId | String FK | → ShipOwnerCompany |
| ismManagerCompanyId | String FK | → ISMManagerCompany |
| commercialManagerCompanyId | String FK | → CommercialManagerCompany |
| status | Enum `VesselStatus` | |
| workspaceId | String? FK | NULL = global; set = workspace-private |
| source | Enum `DataSource` | INTERNAL / CSV_IMPORT / AIS_ENRICHED / MANUAL |
| verified | Boolean | admin verified |
| createdAt / updatedAt | DateTime | |

**Enum `VesselType`:** BULK_CARRIER, TANKER_CRUDE, TANKER_PRODUCT, TANKER_CHEMICAL, TANKER_LPG, TANKER_LNG, CONTAINER, GENERAL_CARGO, RORO, OFFSHORE_PSV, OFFSHORE_AHTS, OFFSHORE_DRILL, FERRY, CRUISE, DREDGER, HEAVY_LIFT, BARGE, SUPPLY_BOAT, RESEARCH, OTHER.

**Enum `VesselStatus`:** ACTIVE, LAID_UP, SCRAPPED, UNDER_CONSTRUCTION, MISSING. (LAID_UP → ETA triggers suppressed; SCRAPPED → excluded from campaigns; UNDER_CONSTRUCTION → excluded from ETA campaigns, show in Pre-Delivery Outreach.)

---

## 2.2 ShipOwnerCompany

| Field | Type | Notes |
|---|---|---|
| id | String cuid | PK |
| companyName | String | indexed |
| phone | String | |
| email | String | |
| website | String | |
| country | String | HQ country |
| city | String | |
| address | String | |
| linkedinUrl | String | |
| orgType | Enum `OrgType` | SHIP_OWNER / TECHNICAL_MANAGER / SHIP_MANAGER / OPERATOR |
| fleetSize | Int | computed or manual |
| vesselTypesOwned | String[] | array of VesselType values |
| flagStatesUsed | String[] | |
| portsFrequentlyUsed | String[] | |
| notes | String | |
| workspaceId | String? | |
| verified | Boolean | |
| createdAt / updatedAt | DateTime | |

---

## 2.3 ISMManagerCompany

Same shape as ShipOwnerCompany, plus:
- `ismCertified Boolean` — ISM DOC certified flag
- `certificationExpiry DateTime` — DOC expiry
- `specializations String[]` — BULK / TANKER / OFFSHORE / CONTAINER / PASSENGER
- `fleetManagedCount Int`

---

## 2.4 CommercialManagerCompany

Same base, plus:
- `tradeTypes String[]` — TANKER_TRADE / DRY_BULK / CONTAINER_TRADE / TRAMP / LINER
- `majorCharterersServed String[]`

---

## 2.5 VesselETA (the heart of MariMail)

| Field | Type | Notes |
|---|---|---|
| id | String cuid | PK |
| vesselId | String FK | → Vessel |
| destinationPort | String | UN/LOCODE |
| destinationPortName | String | human readable |
| eta | DateTime UTC | timestamp |
| etaSource | Enum | AIS_AUTO / MANUAL_ENTRY / CSV_IMPORT / API_FEED |
| etaConfidence | Enum | CONFIRMED / ESTIMATED / TENTATIVE |
| currentLat | Float | AIS |
| currentLon | Float | AIS |
| currentPort | String | if in port |
| speedOverGround | Float | knots |
| lastAISUpdate | DateTime | |
| previousPort | String | |
| previousCargo | String | trigger for hold/tank cleaning |
| nextCargo | String | trigger for prep services |
| voyageStatus | Enum | AT_SEA / AT_ANCHOR / IN_PORT / DRIFTING / UNKNOWN |
| campaignsTriggered | Boolean | |
| triggeredAt | DateTime | |
| workspaceId | String FK | |
| createdAt / updatedAt | DateTime | |

> When ETA is created or updated, BullMQ schedules jobs at Day-5 / -3 / -1 / 0 relative to ETA.

---

## 2.6 Port

| Field | Type | Notes |
|---|---|---|
| id | String cuid | PK |
| portCode | String UNIQUE | UN/LOCODE (SGSIN, AEDXB, …) |
| portName | String | |
| country | String | ISO |
| countryName | String | |
| region | Enum `PortRegion` | MIDDLE_EAST, INDIAN_SUBCONTINENT, SOUTHEAST_ASIA, EAST_ASIA, EUROPE, AMERICAS, AFRICA, OCEANIA |
| latitude / longitude | Float | |
| portType | String[] | COMMERCIAL, ANCHORAGE, DRY_DOCK, OFFSHORE_TERMINAL, LNG_TERMINAL |
| defaultServices | String[] | |
| avgTurnaroundHours | Int | |
| createdAt / updatedAt | DateTime | |

---

## 2.7 Contact

| Field | Type | Source (blueprint) |
|---|---|---|
| id | String cuid | PK |
| firstName | String | First Name |
| lastName | String | Last Name |
| title | String | Title |
| companyId | String FK | polymorphic → ShipOwner / ISM / Commercial / Company |
| companyName | String | denormalised |
| email | String | primary work email |
| secondaryEmail | String? | Secondary Email |
| department | String[] | Departments (multi) |
| contactOwner | String FK | → User.id |
| homePhone | String? | Home Phone |
| mobilePhone | String? | Mobile Phone |
| corporatePhone | String? | Corporate Phone |
| otherPhone | String? | Other Phone |
| personLinkedinUrl | String? | Person LinkedIn URL |
| website | String? | Website |
| companyLinkedinUrl | String? | Company LinkedIn URL |
| country | String | Country |
| subsidiaryOf | String? | parent company |
| salesforceId | String? UNIQUE | Salesforce ID |
| seniority | Enum `Seniority` | INTERN / ENTRY / MID / SENIOR / LEAD / MANAGER / DIRECTOR / VP / C_LEVEL / FOUNDER / OWNER |
| marineRole | Enum `MarineRole` | FLEET_MANAGER / SHIP_SUPERINTENDENT / TECHNICAL_MANAGER / CREWING_MANAGER / CHARTERING_MANAGER / PORT_CAPTAIN / MARINE_SURVEYOR / CLASS_SURVEYOR / UNDERWRITER / BROKER / PORT_AGENT / CHANDLER / BUNKER_TRADER / OPA_PROVIDER / OTHER |
| emailStatus | Enum `EmailStatus` | VALID / RISKY / INVALID / UNKNOWN |
| engagementScore | Int (0-100) | nightly cron |
| tags | String[] | |
| customFields | Json | workspace-defined up to 10 |
| workspaceId | String? | |
| source | Enum `DataSource` | |
| verified | Boolean | |
| createdAt / updatedAt | DateTime | |

**Enum `Department`:** OPERATIONS / TECHNICAL / CREWING / CHARTERING / COMMERCIAL / FINANCE / LEGAL / EXECUTIVE / HSEQ / PROCUREMENT / IT / OTHER

---

## 2.8 Campaign & Email Engine Tables

| Model | Key Fields | Purpose |
|---|---|---|
| **EmailAccount** | id, workspaceId, email, displayName, provider (GMAIL/OUTLOOK/SMTP), encryptedPassword, oauthTokens(Json), status (ACTIVE/PAUSED/WARMING/ERROR), dailyLimit, todaySent, warmupEnabled, warmupDay, spfOk, dkimOk, dmarcOk, healthScore | Connected sending inbox |
| **Campaign** | id, workspaceId, name, status (DRAFT/ACTIVE/PAUSED/COMPLETED/ARCHIVED), triggerType (MANUAL/ETA_BASED/PORT_BASED/VESSEL_TYPE_BASED), fromAccountIds[], rotationStrategy, dailyLimit, timezone, scheduleDays[], scheduleHourStart, scheduleHourEnd, trackOpens, trackClicks, stopOnReply, stopOnBounce, stopOnUnsubscribe, tags[] | Master campaign |
| **CampaignSequence** | id, campaignId, stepOrder, subject, bodyHtml, bodyText, delayType (DAYS_BEFORE_ETA / FIXED_DAYS), delayValue (Int), conditionType (ALWAYS / IF_NOT_OPENED / IF_NOT_REPLIED), abTestEnabled, abSubjectB, abBodyHtmlB, abSplit | Email step |
| **ETATrigger** | id, workspaceId, campaignId, vesselId, portCode, triggerDaysBefore (Int[]), status (PENDING/ACTIVE/COMPLETED/CANCELLED), vesselEtaId, lastFiredStep, nextFireAt | Links campaign to specific ETA |
| **CampaignContact** | id, campaignId, contactId, vesselId?, status (PENDING/SCHEDULED/SENT/OPENED/CLICKED/REPLIED/BOUNCED/UNSUBSCRIBED/FAILED/PAUSED), currentStep, nextSendAt, lastEventAt | Per-contact progress |
| **EmailEvent** | id, campaignId, contactId, sequenceId, messageId, eventType (SENT/OPENED/CLICKED/REPLIED/BOUNCED_SOFT/BOUNCED_HARD/UNSUBSCRIBED/SPAM), occurredAt, metadata(Json) | Immutable event log |
| **PortCampaignRule** | id, workspaceId, portCode, vesselType (Enum[]), campaignId, autoEnroll, priority | Port + vessel-type rule |
| **CargoChangeTrigger** | id, workspaceId, campaignId, previousCargo[], nextCargo[], vesselType[], autoEnroll | Cargo X → Y rule |
| **ContactList** | id, workspaceId, name, type (STATIC/SMART), filterConfig(Json), contactCount, color, icon, isArchived | Smart lists auto-update |
| **SavedFilter** | id, workspaceId, name, entityType (VESSEL/CONTACT/COMPANY), filterConfig(Json), createdById | Reusable filters |
| **WarmupLog** | id, accountId, date, sentCount, receivedCount, repliedCount, healthScore | Daily warmup activity |
| **GlobalSuppression** | id, email, reason, workspaceId?, createdAt | Never send to these |

---

## Indexes Summary

| Model | Index |
|---|---|
| Vessel | `imoNumber(unique)`, `mmsi(unique)`, `vesselName`, `flag`, `vesselType`, `workspaceId`, GIN on `searchVector` |
| VesselETA | composite `(vesselId, destinationPort, eta)`, `eta`, `destinationPort`, `workspaceId` |
| Port | `portCode(unique)`, `region`, `country` |
| Contact | `(email, workspaceId)` unique, `workspaceId`, `salesforceId(unique)`, `marineRole`, `department` GIN |
| ETATrigger | composite `(campaignId, vesselEtaId)`, `nextFireAt`, `status` |
| CampaignContact | composite `(campaignId, contactId)`, `status`, `nextSendAt` |
| EmailEvent | `campaignId`, `contactId`, `eventType`, `occurredAt` |
| EmailAccount | `workspaceId`, `(email, workspaceId)` unique, `status` |
| PortCampaignRule | `workspaceId`, `portCode`, `priority` |
| GlobalSuppression | `email` unique per workspace or global |

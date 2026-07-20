# ETA Automation Engine

Port Opportunity Radar · Voyage Trigger Marketing · IPC Automation. Source: `docs/MariMail Plan.docx` §4.

---

## How the ETA Engine Works

| Step | What | Implementation |
|---|---|---|
| 1 | ETA entered (manual / CSV / AIS) | `POST /api/vessel-etas` creates `VesselETA`; runs campaign matcher |
| 2 | Campaign matcher | Checks `PortCampaignRule` for port+vesselType, `CargoChangeTrigger` for prev→next cargo |
| 3 | ETATrigger created | For each match: creates `ETATrigger` linking campaign + VesselETA; computes `stepFireTimes = eta - delayValue*86400000` per sequence step |
| 4 | BullMQ jobs scheduled | `queue.add('send-eta-step', payload, { delay: msUntilFireTime, jobId })` |
| 5 | Job fires | Worker renders email with personalisation → sends via Nodemailer → records `EmailEvent` |
| 6 | Tracking | Open pixel, click redirect, reply detection all fire `EmailEvent`s |
| 7 | ETA changes | Cancel pending jobs → recalculate timestamps → reschedule; notify workspace |

---

## Port Campaign Rules (default seed)

| Port | Vessel Types | Auto-Assigned Campaign | Service |
|---|---|---|---|
| **Fujairah (AEFUJ)** | BULK_CARRIER, GENERAL_CARGO | Hold Cleaning & Rope Access — Fujairah | Hold cleaning, rope access, hold inspection |
| **Fujairah (AEFUJ)** | TANKER_CRUDE, TANKER_PRODUCT, TANKER_CHEMICAL | Tank Cleaning — Fujairah | Tank cleaning, sludge removal, gas freeing |
| **Kandla (INKAN)** | ALL | OPA / Agency Support — Kandla | OPA provider, port agency, husbandry |
| **Mumbai (INBOM)** | ALL | Agency & Marine Services — Mumbai | Ship agency, port logistics, crew change |
| **Singapore (SGSIN)** | BULK_CARRIER, CONTAINER, GENERAL_CARGO | Underwater Hull Cleaning — Singapore | Hull cleaning, underwater inspection, prop polishing |
| **Singapore (SGSIN)** | TANKER_CRUDE, TANKER_PRODUCT | Tank Cleaning & Agency — Singapore | Tank cleaning, agency |
| **Santos (BRSSZ)** | TANKER_CRUDE, TANKER_CHEMICAL | Tank Cleaning — Santos | Specialised tank cleaning, shore reception |
| **Gibraltar (GIGIB)** | BULK_CARRIER, GENERAL_CARGO | Robot Hold Cleaning — Gibraltar | Automated hold cleaning, grain-standard prep |
| **Rotterdam (NLRTM)** | ALL | Ship Repair & Survey — Rotterdam | Dry dock, repair quotes, survey booking |
| **Hamburg (DEHAM)** | CONTAINER, RORO | Container Services — Hamburg | Reefer monitoring, lashing gear, container repairs |
| **Port Hedland (AUPHI)** | BULK_CARRIER | Bulk Carrier Services — Port Hedland | Hold cleaning, loading prep, inspection |
| **Houston (USHOU)** | TANKER_CRUDE, TANKER_LPG, TANKER_LNG | Energy Terminal Services — Houston | Gas carrier services, vapor control, terminal logistics |

---

## Cargo Change Trigger Rules (default seed)

| Previous Cargo | Next Cargo | Campaign | Why |
|---|---|---|---|
| COAL | GRAIN | Grain-Standard Hold Cleaning | Coal residue fails grain inspection |
| COAL | FERTILIZER | Chemical Hold Cleaning | Cross-contamination risk; IMSBC |
| IRON_ORE | GRAIN | Hold Cleaning + Grain Inspection Prep | Iron ore staining |
| BAUXITE | GRAIN | Grain-Standard Hold Cleaning | Bauxite dust in bilges |
| COAL | COAL | Standard Hold Cleaning | Even same cargo needs cleaning between voyages |
| CRUDE_OIL | FUEL_OIL | Tank Cleaning — Light Grade | Product change; less intensive |
| CRUDE_OIL | CHEMICALS | Chemical Tank Cleaning | Critical contamination risk |
| FUEL_OIL | CHEMICALS | Chemical Tank Cleaning | High-risk; full tank wash |
| CHEMICALS | FUEL_OIL | Tank Cleaning — Chemical to Fuel | Residue removal, rinse, inspection |
| ANY | GRAIN | Grain-Standard Hold Cleaning | Grain has strictest standards |
| ANY | FOOD_GRADE | Food-Grade Cleaning Campaign | USDA/EU food-grade certification |

---

## IPC Automation Sequence (Initial Port Communication)

| Step | Timing | Default Subject | Purpose | Condition |
|---|---|---|---|---|
| 1 — Introduction | Day -5 before ETA | `Hold Cleaning Support Before {{eta_port}} Arrival — {{vessel_name}}` | Service offer; introduce company; no pressure | ALWAYS |
| 2 — Follow-Up | Day -3 | `Following Up: {{vessel_name}} ETA {{eta_port}} in 3 Days` | Reinforce urgency; mention advantage; testimonial | IF_NOT_REPLIED |
| 3 — Final Reminder | Day -1 | `Final Reminder: {{vessel_name}} Arriving {{eta_port}} Tomorrow` | Operations readiness; ask for mobilisation instruction | IF_NOT_REPLIED |
| 4 — ETA Day | Day 0 | `Operations Team Ready: {{vessel_name}} Arrival Today` | Confirm availability; share direct call number; no hard sell | IF_NOT_REPLIED |
| 5 — Post-Arrival (optional) | Day +2 | `How Did {{vessel_name}}'s Port Call Go?` | Feedback; next-port CTA | IF_NO_REPLY |

---

## Port Opportunity Radar — `/dashboard/port-radar`

- Left panel: full ETA filter set (collapses to bottom sheet on mobile)
- Centre: live vessel arrival feed sorted by ETA ascending; refreshes every 15 min
- Top stats: Vessels arriving today / this week / with no campaign / with active campaign / awaiting reply

### Vessel Card

- Vessel name (linked) + IMO badge + vessel type icon + flag emoji
- ETA badge: `Arriving in 3 days` (green) / `Tomorrow` (amber) / `Today` (red pulse)
- Destination port name + region badge
- Previous cargo → Next cargo arrow (amber if cargo change detected)
- Campaign status badge: No Campaign (gray) / Active (green) / Replied (gold) / Completed (navy)
- Quick actions: Start Campaign | Assign Campaign Template | View Contacts | Mark as Handled
- Owner / ISM Manager mini section with email indicator

### Missed Opportunity Alerts Panel (right sidebar)

- Vessels with ETA < 2 days and no outreach
- Vessels where ETA changed > 12 hrs with no campaign update notification
- Vessels where cargo changed since last outreach
- High-value operators (fleet > 50) with no reply in 6 months

---

## Key Port Codes Reference

| Code | Port | Country | Services |
|---|---|---|---|
| AEFUJ | Fujairah Anchorage | UAE | Hold cleaning, tank cleaning, rope access, bunkering |
| AEDXB | Dubai / Jebel Ali | UAE | Ship repair, dry dock, agency, chandling |
| INKAN | Kandla | India | OPA support, port agency, hold cleaning, steel cargo |
| INBOM | Mumbai / JNPT | India | Ship agency, crew change, port logistics |
| INCHE | Chennai | India | Port agency, repairs, crew change |
| INVIZ | Visakhapatnam | India | Coal/iron ore loading, hold inspection |
| SGSIN | Singapore | Singapore | Underwater hull cleaning, tank cleaning, bunkering |
| MYPKG | Port Klang | Malaysia | Port agency, hull cleaning, repairs |
| THBKK | Laem Chabang / Bangkok | Thailand | Container services, hull cleaning |
| CNSHA | Shanghai | China | Ship repair, drydock, container services |
| CNTXG | Tianjin | China | Steel cargo, port agency, ship repair |
| KRBUS | Busan | South Korea | Ship repair, hull cleaning, container services |
| JPYOK | Yokohama / Tokyo | Japan | Ship repair, bulk carrier services |
| NLRTM | Rotterdam | Netherlands | Ship repair, drydock, cargo services |
| DEHAM | Hamburg | Germany | Container services, ship repair |
| BEANR | Antwerp | Belgium | Container, chemical tanker services |
| GIGIB | Gibraltar | Gibraltar | Robot hold cleaning, bunkering, repair |
| EGSUZ | Suez / Port Said | Egypt | Transit services, bunkering, crew change |
| BRSSZ | Santos | Brazil | Tank cleaning, agency, bulk cargo |
| USHOU | Houston | USA | Energy terminal, LNG/LPG, repairs |
| ZADUR | Durban | South Africa | Port agency, bulk cargo, hull cleaning |
| AUPHI | Port Hedland | Australia | Bulk carrier, iron ore, hull cleaning |

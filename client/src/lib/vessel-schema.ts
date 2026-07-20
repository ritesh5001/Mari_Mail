import type { VesselWithCompanies } from "@/lib/marine-data";

type VesselFieldKey = keyof VesselWithCompanies;
type VesselSchemaGroup = "Priority" | "Identity" | "AIS and Position" | "Dimensions and Capacity" | "Commercial" | "Ownership and Management" | "Builders and Class";

type CompanyLike = {
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  country?: string | null;
};

type VesselSchemaValueSource = Partial<Record<VesselFieldKey, unknown>> & {
  etas?: Array<{ eta?: Date | string | null }>;
  shipOwnerCompany?: CompanyLike | null;
  commercialManagerCompany?: CompanyLike | null;
  ismManagerCompany?: CompanyLike | null;
};

export type VesselSchemaField = {
  label: string;
  key: string;
  sourceKey?: VesselFieldKey;
  fallbackKey?: VesselFieldKey;
  group: VesselSchemaGroup;
  editable?: boolean;
};

export const VESSEL_SCHEMA_FIELDS: VesselSchemaField[] = [
  { label: "Vessel Name", key: "vesselName", sourceKey: "vesselName", group: "Priority" },
  { label: "Flag", key: "flag", sourceKey: "flag", group: "Identity" },
  { label: "IMO", key: "imoNumber", sourceKey: "imoNumber", group: "Priority" },
  { label: "ETA (UTC)", key: "etaUtc", group: "Priority", editable: false },
  { label: "Destination", key: "destination", sourceKey: "destination", group: "Priority" },
  { label: "Ship Owner", key: "shipOwner", group: "Priority", editable: false },
  { label: "Ship Owner Phone", key: "shipOwnerPhone", group: "Priority", editable: false },
  { label: "Ship Owner Email", key: "shipOwnerEmail", group: "Priority", editable: false },
  { label: "Ship Owner Website", key: "shipOwnerWebsite", group: "Priority", editable: false },
  { label: "Ship Owner Country", key: "shipOwnerCountry", group: "Priority", editable: false },
  { label: "Commercial Manager", key: "commercialManagerName", sourceKey: "commercialManagerName", group: "Priority" },
  { label: "Commercial Manager Phone", key: "commercialManagerPhone", group: "Priority", editable: false },
  { label: "Commercial Manager Email", key: "commercialManagerEmail", sourceKey: "commercialManagerEmail", group: "Priority" },
  { label: "Commercial Manager Website", key: "commercialManagerWebsite", group: "Priority", editable: false },
  { label: "Commercial Manager Country", key: "commercialManagerCountry", sourceKey: "commercialManagerCountry", group: "Priority" },
  { label: "ISM Manager", key: "ismManagerName", sourceKey: "ismManagerName", group: "Priority" },
  { label: "ISM Manager Phone", key: "ismManagerPhone", group: "Priority", editable: false },
  { label: "ISM Manager Email", key: "ismManagerEmail", sourceKey: "ismManagerEmail", group: "Priority" },
  { label: "ISM Manager Website", key: "ismManagerWebsite", group: "Priority", editable: false },
  { label: "ISM Manager Country", key: "ismManagerCountry", sourceKey: "ismManagerCountry", group: "Priority" },
  { label: "MMSI", key: "mmsi", sourceKey: "mmsi", group: "Priority" },
  { label: "Callsign", key: "callsign", sourceKey: "callsign", group: "Priority" },
  { label: "Type", key: "vesselTypeDetailed", sourceKey: "vesselTypeDetailed", fallbackKey: "vesselType", group: "Priority" },

  { label: "DWT", key: "dwt", sourceKey: "dwt", fallbackKey: "capacityDwt", group: "Priority" },
  { label: "Gross Tonnage", key: "grossTonnage", sourceKey: "grossTonnage", fallbackKey: "capacityGt", group: "Priority" },
  { label: "Net Tonnage", key: "netTonnage", sourceKey: "netTonnage", group: "Priority" },
  { label: "Built Year", key: "builtYear", sourceKey: "builtYear", group: "Priority" },
  { label: "Length", key: "lengthOverall", sourceKey: "lengthOverall", group: "Priority" },
  { label: "Global Area", key: "globalArea", sourceKey: "globalArea", group: "AIS and Position" },
  { label: "Eni", key: "eni", sourceKey: "eni", group: "Identity" },
  { label: "Speed", key: "speed", sourceKey: "speed", group: "AIS and Position" },
  { label: "Course", key: "course", sourceKey: "course", group: "AIS and Position" },
  { label: "Draught", key: "draught", sourceKey: "draught", fallbackKey: "draft", group: "AIS and Position" },
  { label: "Navigational Status", key: "navigationalStatus", sourceKey: "navigationalStatus", group: "AIS and Position" },
  { label: "Ais Class", key: "aisClass", sourceKey: "aisClass", group: "AIS and Position" },
  { label: "Width", key: "width", sourceKey: "width", fallbackKey: "breadth", group: "Dimensions and Capacity" },
  { label: "Current Port Unlocode", key: "currentPortUnlocode", sourceKey: "currentPortUnlocode", group: "AIS and Position" },
  { label: "Current Port Country", key: "currentPortCountry", sourceKey: "currentPortCountry", group: "AIS and Position" },
  { label: "Draught Max", key: "draughtMax", sourceKey: "draughtMax", group: "Dimensions and Capacity" },
  { label: "Draught Min", key: "draughtMin", sourceKey: "draughtMin", group: "Dimensions and Capacity" },
  { label: "Yard Number", key: "yardNumber", sourceKey: "yardNumber", group: "Builders and Class" },
  { label: "Capacity - Teu", key: "capacityTeu", sourceKey: "capacityTeu", group: "Dimensions and Capacity" },
  { label: "Capacity - Liquid Gas", key: "capacityLiquidGas", sourceKey: "capacityLiquidGas", group: "Dimensions and Capacity" },
  { label: "Capacity - Passengers", key: "capacityPassengers", sourceKey: "capacityPassengers", group: "Dimensions and Capacity" },
  { label: "Length Between Perpendiculars", key: "lengthBetweenPerpendiculars", sourceKey: "lengthBetweenPerpendiculars", group: "Dimensions and Capacity" },
  { label: "Depth", key: "depth", sourceKey: "depth", group: "Dimensions and Capacity" },
  { label: "Breadth Extreme", key: "breadthExtreme", sourceKey: "breadthExtreme", group: "Dimensions and Capacity" },
  { label: "Capacity - Liquid Oil", key: "capacityLiquidOil", sourceKey: "capacityLiquidOil", group: "Dimensions and Capacity" },
  { label: "Commercial Market", key: "commercialMarket", sourceKey: "commercialMarket", group: "Commercial" },
  { label: "Commercial Size Class", key: "commercialSizeClass", sourceKey: "commercialSizeClass", group: "Commercial" },
  { label: "First Ais Position Date", key: "firstAisPositionDate", sourceKey: "firstAisPositionDate", group: "AIS and Position" },
  { label: "Commercial Manager City", key: "commercialManagerCity", sourceKey: "commercialManagerCity", group: "Ownership and Management" },
  { label: "Registered Owner", key: "registeredOwnerName", sourceKey: "registeredOwnerName", group: "Ownership and Management" },
  { label: "Registered Owner Email", key: "registeredOwnerEmail", sourceKey: "registeredOwnerEmail", group: "Ownership and Management" },
  { label: "Registered Owner City", key: "registeredOwnerCity", sourceKey: "registeredOwnerCity", group: "Ownership and Management" },
  { label: "Registered Owner Country", key: "registeredOwnerCountry", sourceKey: "registeredOwnerCountry", group: "Ownership and Management" },
  { label: "Beneficial Owner", key: "beneficialOwnerName", sourceKey: "beneficialOwnerName", group: "Ownership and Management" },
  { label: "Beneficial Owner Email", key: "beneficialOwnerEmail", sourceKey: "beneficialOwnerEmail", group: "Ownership and Management" },
  { label: "Beneficial Owner City", key: "beneficialOwnerCity", sourceKey: "beneficialOwnerCity", group: "Ownership and Management" },
  { label: "Beneficial Owner Country", key: "beneficialOwnerCountry", sourceKey: "beneficialOwnerCountry", group: "Ownership and Management" },
  { label: "Technical Manager", key: "technicalManagerName", sourceKey: "technicalManagerName", group: "Ownership and Management" },
  { label: "Technical Manager Email", key: "technicalManagerEmail", sourceKey: "technicalManagerEmail", group: "Ownership and Management" },
  { label: "Technical Manager City", key: "technicalManagerCity", sourceKey: "technicalManagerCity", group: "Ownership and Management" },
  { label: "Technical Manager Country", key: "technicalManagerCountry", sourceKey: "technicalManagerCountry", group: "Ownership and Management" },
  { label: "P&i Club", key: "pAndIClubName", sourceKey: "pAndIClubName", group: "Ownership and Management" },
  { label: "P&i Club Email", key: "pAndIClubEmail", sourceKey: "pAndIClubEmail", group: "Ownership and Management" },
  { label: "P&i Club City", key: "pAndIClubCity", sourceKey: "pAndIClubCity", group: "Ownership and Management" },
  { label: "P&i Club Country", key: "pAndIClubCountry", sourceKey: "pAndIClubCountry", group: "Ownership and Management" },
  { label: "Ship Builder", key: "shipBuilderName", sourceKey: "shipBuilderName", group: "Builders and Class" },
  { label: "Ship Builder Email", key: "shipBuilderEmail", sourceKey: "shipBuilderEmail", group: "Builders and Class" },
  { label: "Ship Builder City", key: "shipBuilderCity", sourceKey: "shipBuilderCity", group: "Builders and Class" },
  { label: "Ship Builder Country", key: "shipBuilderCountry", sourceKey: "shipBuilderCountry", group: "Builders and Class" },
  { label: "Class Society", key: "classSocietyName", sourceKey: "classSocietyName", fallbackKey: "classificationSociety", group: "Builders and Class" },
  { label: "Class Society Email", key: "classSocietyEmail", sourceKey: "classSocietyEmail", group: "Builders and Class" },
  { label: "Class Society City", key: "classSocietyCity", sourceKey: "classSocietyCity", group: "Builders and Class" },
  { label: "Class Society Country", key: "classSocietyCountry", sourceKey: "classSocietyCountry", group: "Builders and Class" },
  { label: "Engine Builder", key: "engineBuilderName", sourceKey: "engineBuilderName", group: "Builders and Class" },
  { label: "Engine Builder Email", key: "engineBuilderEmail", sourceKey: "engineBuilderEmail", group: "Builders and Class" },
  { label: "Engine Builder City", key: "engineBuilderCity", sourceKey: "engineBuilderCity", group: "Builders and Class" },
  { label: "Engine Builder Country", key: "engineBuilderCountry", sourceKey: "engineBuilderCountry", group: "Builders and Class" },
  { label: "ISM Manager City", key: "ismManagerCity", sourceKey: "ismManagerCity", group: "Ownership and Management" },
  { label: "Operator", key: "operatorName", sourceKey: "operatorName", group: "Commercial" },
  { label: "Operator Email", key: "operatorEmail", sourceKey: "operatorEmail", group: "Commercial" },
  { label: "Operator City", key: "operatorCity", sourceKey: "operatorCity", group: "Commercial" },
  { label: "Operator Country", key: "operatorCountry", sourceKey: "operatorCountry", group: "Commercial" },
];

export const VESSEL_SCHEMA_HEADERS = VESSEL_SCHEMA_FIELDS.map((field) => field.label);

const VESSEL_SCHEMA_SAMPLE_VALUES: Record<string, string> = {
  "Vessel Name": "Pacific Eagle",
  IMO: "9781234",
  "ETA (UTC)": "2026-06-15T12:00:00Z",
  Destination: "SGSIN",
  MMSI: "636000111",
  Callsign: "9V1234",
  Type: "Bulk Carrier",
  DWT: "82000",
  "Gross Tonnage": "43000",
  "Net Tonnage": "25000",
  "Built Year": "2018",
  Length: "229",
  "Ship Owner": "Pacific Carriers Ltd",
  "Ship Owner Phone": "+65 6000 0100",
  "Ship Owner Email": "owner@example.com",
  "Ship Owner Website": "https://pacific.example.com",
  "Ship Owner Country": "Singapore",
  "Commercial Manager": "Pacific Commercial Ltd",
  "Commercial Manager Phone": "+65 6000 0200",
  "Commercial Manager Email": "commercial@example.com",
  "Commercial Manager Website": "https://commercial.example.com",
  "Commercial Manager Country": "Singapore",
  "ISM Manager": "Pacific ISM Ltd",
  "ISM Manager Phone": "+971 4000 0100",
  "ISM Manager Email": "ism@example.com",
  "ISM Manager Website": "https://ism.example.com",
  "ISM Manager Country": "UAE",
  Flag: "LR",
  "Global Area": "Arabian Gulf",
  Speed: "12.4",
  Course: "097",
  Draught: "7.2",
  "Navigational Status": "Under way",
  "Ais Class": "A",
  Width: "32",
  "Current Port Unlocode": "SGSIN",
  "Current Port Country": "Singapore",
  "Draught Max": "8.1",
  "Draught Min": "6.5",
  "Yard Number": "YN-102",
  "Commercial Market": "Coal",
  "Commercial Size Class": "Panamax",
  "First Ais Position Date": "2020-01-01",
  "Commercial Manager City": "Singapore",
  "ISM Manager City": "Dubai",
  Operator: "Operator Ltd.",
  "Operator Email": "operator@example.com",
  "Operator City": "Dubai",
  "Operator Country": "UAE",
};

function escapeCsvTemplateCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export const VESSEL_TEMPLATE_CSV = `${VESSEL_SCHEMA_HEADERS.join(",")}\n${VESSEL_SCHEMA_HEADERS.map((header) => escapeCsvTemplateCell(VESSEL_SCHEMA_SAMPLE_VALUES[header] ?? "")).join(",")}\n`;

function formatEnumValue(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeValue(raw: unknown) {
  if (raw === null || raw === undefined || raw === "") return "-";
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "number") return raw.toLocaleString("en");
  return String(raw);
}

function firstEta(vessel: VesselSchemaValueSource) {
  const etas = vessel.etas
    ?.map((item) => item.eta)
    .filter((eta): eta is Date | string => Boolean(eta))
    .map((eta) => (eta instanceof Date ? eta : new Date(eta)))
    .filter((eta) => !Number.isNaN(eta.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const now = Date.now();
  const eta = etas?.find((item) => item.getTime() >= now) ?? etas?.[0];
  if (!eta) return null;
  return eta.toISOString();
}

function companyValue(company: CompanyLike | null | undefined, field: keyof CompanyLike) {
  return company?.[field] ?? null;
}

export function vesselFieldValue(vessel: VesselSchemaValueSource, field: VesselSchemaField) {
  if (field.key === "etaUtc") return normalizeValue(firstEta(vessel));
  if (field.key === "shipOwner") return normalizeValue(companyValue(vessel.shipOwnerCompany, "companyName"));
  if (field.key === "shipOwnerPhone") return normalizeValue(companyValue(vessel.shipOwnerCompany, "phone"));
  if (field.key === "shipOwnerEmail") return normalizeValue(companyValue(vessel.shipOwnerCompany, "email"));
  if (field.key === "shipOwnerWebsite") return normalizeValue(companyValue(vessel.shipOwnerCompany, "website"));
  if (field.key === "shipOwnerCountry") return normalizeValue(companyValue(vessel.shipOwnerCompany, "country"));
  if (field.key === "commercialManagerName") return normalizeValue(vessel.commercialManagerName ?? companyValue(vessel.commercialManagerCompany, "companyName"));
  if (field.key === "commercialManagerPhone") return normalizeValue(companyValue(vessel.commercialManagerCompany, "phone"));
  if (field.key === "commercialManagerEmail") return normalizeValue(companyValue(vessel.commercialManagerCompany, "email") ?? vessel.commercialManagerEmail);
  if (field.key === "commercialManagerWebsite") return normalizeValue(companyValue(vessel.commercialManagerCompany, "website"));
  if (field.key === "commercialManagerCountry") return normalizeValue(companyValue(vessel.commercialManagerCompany, "country") ?? vessel.commercialManagerCountry);
  if (field.key === "ismManagerName") return normalizeValue(vessel.ismManagerName ?? companyValue(vessel.ismManagerCompany, "companyName"));
  if (field.key === "ismManagerPhone") return normalizeValue(companyValue(vessel.ismManagerCompany, "phone"));
  if (field.key === "ismManagerEmail") return normalizeValue(companyValue(vessel.ismManagerCompany, "email") ?? vessel.ismManagerEmail);
  if (field.key === "ismManagerWebsite") return normalizeValue(companyValue(vessel.ismManagerCompany, "website"));
  if (field.key === "ismManagerCountry") return normalizeValue(companyValue(vessel.ismManagerCompany, "country") ?? vessel.ismManagerCountry);

  const raw = field.sourceKey ? vessel[field.sourceKey] : null;
  const fallback = field.fallbackKey ? vessel[field.fallbackKey] : null;
  const value = raw ?? fallback;
  if (field.sourceKey === "vesselTypeDetailed" && !raw && typeof fallback === "string") {
    return formatEnumValue(fallback);
  }
  return normalizeValue(value);
}

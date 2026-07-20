import type { Prisma, Vessel, VesselType } from "@marimail/db";

type CsvRow = Record<string, string | undefined>;

export const VESSEL_CSV_HEADERS = [
  "Vessel Name",
  "IMO",
  "ETA (UTC)",
  "Destination",
  "MMSI",
  "Callsign",
  "Type",
  "DWT",
  "Gross Tonnage",
  "Net Tonnage",
  "Built Year",
  "Length",
  "Ship Owner",
  "Ship Owner Phone",
  "Ship Owner Email",
  "Ship Owner Website",
  "Ship Owner Country",
  "Commercial Manager",
  "Commercial Manager Phone",
  "Commercial Manager Email",
  "Commercial Manager Website",
  "Commercial Manager Country",
  "ISM Manager",
  "ISM Manager Phone",
  "ISM Manager Email",
  "ISM Manager Website",
  "ISM Manager Country",
  "Flag",
  "Global Area",
  "Eni",
  "Speed",
  "Course",
  "Draught",
  "Navigational Status",
  "Ais Class",
  "Width",
  "Current Port Unlocode",
  "Current Port Country",
  "Draught Max",
  "Draught Min",
  "Yard Number",
  "Capacity - Teu",
  "Capacity - Liquid Gas",
  "Capacity - Passengers",
  "Length Between Perpendiculars",
  "Depth",
  "Breadth Extreme",
  "Capacity - Liquid Oil",
  "Commercial Market",
  "Commercial Size Class",
  "First Ais Position Date",
  "Commercial Manager City",
  "Registered Owner",
  "Registered Owner Email",
  "Registered Owner City",
  "Registered Owner Country",
  "Beneficial Owner",
  "Beneficial Owner Email",
  "Beneficial Owner City",
  "Beneficial Owner Country",
  "Technical Manager",
  "Technical Manager Email",
  "Technical Manager City",
  "Technical Manager Country",
  "P&i Club",
  "P&i Club Email",
  "P&i Club City",
  "P&i Club Country",
  "Ship Builder",
  "Ship Builder Email",
  "Ship Builder City",
  "Ship Builder Country",
  "Class Society",
  "Class Society Email",
  "Class Society City",
  "Class Society Country",
  "Engine Builder",
  "Engine Builder Email",
  "Engine Builder City",
  "Engine Builder Country",
  "Ism Manager City",
  "Operator",
  "Operator Email",
  "Operator City",
  "Operator Country",
] as const;

type VesselCsvHeader = (typeof VESSEL_CSV_HEADERS)[number];

const csvAliases: Partial<Record<VesselCsvHeader, string[]>> = {
  IMO: ["Imo", "IMO Number", "imoNumber"],
  MMSI: ["Mmsi", "mmsi"],
  "Vessel Name": ["vesselName", "Name"],
  "ETA (UTC)": ["ETA UTC", "ETA", "eta"],
  Type: ["Vessel Type", "Vessel Type - Detailed", "vesselType", "vesselTypeDetailed"],
  DWT: ["Capacity - Dwt", "DWT", "dwt", "Capacity DWT", "Capacity - DWT"],
  "Gross Tonnage": ["Capacity - Gt", "GT", "grossTonnage", "Capacity - GT"],
  "Net Tonnage": ["NT", "netTonnage"],
  "Built Year": ["Built", "builtYear"],
  Length: ["Length Overall", "LOA", "lengthOverall"],
  "Ship Owner": ["Ship Owner Company", "shipOwnerCompanyName"],
  "Global Area": ["globalArea"],
  Eni: ["ENI", "eni"],
  Draught: ["Draft", "draft", "draught"],
  "Ais Class": ["AIS Class", "aisClass"],
  "Current Port Unlocode": ["Current Port UN/LOCODE", "currentPortUnlocode"],
  Callsign: ["Call Sign", "callsign"],
  "Draught Max": ["Draft Max", "draughtMax"],
  "Draught Min": ["Draft Min", "draughtMin"],
  "Length Between Perpendiculars": ["LBP", "lengthBetweenPerpendiculars"],
  "Breadth Extreme": ["Extreme Breadth", "breadthExtreme"],
  "P&i Club": ["P&I Club", "P and I Club"],
  "P&i Club Email": ["P&I Club Email", "P and I Club Email"],
  "P&i Club City": ["P&I Club City", "P and I Club City"],
  "P&i Club Country": ["P&I Club Country", "P and I Club Country"],
  "ISM Manager": ["Ism Manager", "ISM Manager Company", "ismManagerCompanyName"],
  "ISM Manager Email": ["Ism Manager Email"],
  "ISM Manager Phone": ["Ism Manager Phone"],
  "ISM Manager Website": ["Ism Manager Website"],
  "ISM Manager Country": ["Ism Manager Country"],
  "Ism Manager City": ["ISM Manager City"],
};

const vesselTypes = new Set<VesselType>([
  "BULK_CARRIER",
  "TANKER_CRUDE",
  "TANKER_PRODUCT",
  "TANKER_CHEMICAL",
  "TANKER_LPG",
  "TANKER_LNG",
  "CONTAINER",
  "GENERAL_CARGO",
  "RORO",
  "OFFSHORE_PSV",
  "OFFSHORE_AHTS",
  "OFFSHORE_DRILL",
  "FERRY",
  "CRUISE",
  "DREDGER",
  "HEAVY_LIFT",
  "BARGE",
  "SUPPLY_BOAT",
  "RESEARCH",
  "OTHER",
]);

function read(row: CsvRow, candidates: string[]) {
  for (const candidate of candidates) {
    const value = row[candidate]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function readVesselCsvValue(row: CsvRow, header: VesselCsvHeader) {
  return read(row, [header, ...(csvAliases[header] ?? [])]);
}

export function textValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function intValue(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

export function floatValue(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function vesselTypeValue(value: string | undefined): VesselType {
  const normalized = textValue(value)?.toUpperCase().replaceAll(" ", "_").replaceAll("-", "_") as VesselType | undefined;
  if (normalized && vesselTypes.has(normalized)) {
    return normalized;
  }

  const detailed = textValue(value)?.toLowerCase();
  if (!detailed) return "OTHER";
  if (detailed.includes("bulk")) return "BULK_CARRIER";
  if (detailed.includes("crude")) return "TANKER_CRUDE";
  if (detailed.includes("chemical")) return "TANKER_CHEMICAL";
  if (detailed.includes("lpg")) return "TANKER_LPG";
  if (detailed.includes("lng")) return "TANKER_LNG";
  if (detailed.includes("product") || detailed.includes("tanker")) return "TANKER_PRODUCT";
  if (detailed.includes("container")) return "CONTAINER";
  if (detailed.includes("ro-ro") || detailed.includes("roro")) return "RORO";
  if (detailed.includes("general cargo")) return "GENERAL_CARGO";
  if (detailed.includes("ferry")) return "FERRY";
  if (detailed.includes("cruise") || detailed.includes("passenger")) return "CRUISE";
  if (detailed.includes("dredger")) return "DREDGER";
  if (detailed.includes("heavy lift")) return "HEAVY_LIFT";
  if (detailed.includes("barge")) return "BARGE";
  if (detailed.includes("supply")) return "SUPPLY_BOAT";
  if (detailed.includes("research")) return "RESEARCH";
  if (detailed.includes("offshore")) return "OFFSHORE_PSV";
  return "OTHER";
}

export function vesselDataFromCsvRow(row: CsvRow) {
  const draught = floatValue(readVesselCsvValue(row, "Draught"));
  const width = floatValue(readVesselCsvValue(row, "Width"));
  const capacityDwt = intValue(readVesselCsvValue(row, "DWT"));
  const capacityGt = intValue(readVesselCsvValue(row, "Gross Tonnage"));
  const vesselTypeDetailed = textValue(readVesselCsvValue(row, "Type"));

  return {
    flag: textValue(readVesselCsvValue(row, "Flag")),
    vesselName: textValue(readVesselCsvValue(row, "Vessel Name")),
    imoNumber: textValue(readVesselCsvValue(row, "IMO")),
    mmsi: textValue(readVesselCsvValue(row, "MMSI")),
    globalArea: textValue(readVesselCsvValue(row, "Global Area")),
    eni: textValue(readVesselCsvValue(row, "Eni")),
    speed: floatValue(readVesselCsvValue(row, "Speed")),
    course: floatValue(readVesselCsvValue(row, "Course")),
    draught,
    draft: draught,
    navigationalStatus: textValue(readVesselCsvValue(row, "Navigational Status")),
    builtYear: intValue(readVesselCsvValue(row, "Built Year")),
    destination: textValue(readVesselCsvValue(row, "Destination")),
    aisClass: textValue(readVesselCsvValue(row, "Ais Class")),
    lengthOverall: floatValue(readVesselCsvValue(row, "Length")),
    width,
    breadth: width,
    dwt: capacityDwt,
    capacityDwt,
    currentPortUnlocode: textValue(readVesselCsvValue(row, "Current Port Unlocode")),
    currentPortCountry: textValue(readVesselCsvValue(row, "Current Port Country")),
    callsign: textValue(readVesselCsvValue(row, "Callsign")),
    draughtMax: floatValue(readVesselCsvValue(row, "Draught Max")),
    draughtMin: floatValue(readVesselCsvValue(row, "Draught Min")),
    yardNumber: textValue(readVesselCsvValue(row, "Yard Number")),
    vesselTypeDetailed,
    vesselType: vesselTypeValue(vesselTypeDetailed),
    grossTonnage: capacityGt,
    netTonnage: intValue(readVesselCsvValue(row, "Net Tonnage")),
    capacityGt,
    capacityTeu: intValue(readVesselCsvValue(row, "Capacity - Teu")),
    capacityLiquidGas: intValue(readVesselCsvValue(row, "Capacity - Liquid Gas")),
    capacityPassengers: intValue(readVesselCsvValue(row, "Capacity - Passengers")),
    lengthBetweenPerpendiculars: floatValue(readVesselCsvValue(row, "Length Between Perpendiculars")),
    depth: floatValue(readVesselCsvValue(row, "Depth")),
    breadthExtreme: floatValue(readVesselCsvValue(row, "Breadth Extreme")),
    capacityLiquidOil: intValue(readVesselCsvValue(row, "Capacity - Liquid Oil")),
    commercialMarket: textValue(readVesselCsvValue(row, "Commercial Market")),
    commercialSizeClass: textValue(readVesselCsvValue(row, "Commercial Size Class")),
    firstAisPositionDate: textValue(readVesselCsvValue(row, "First Ais Position Date")),
    commercialManagerName: textValue(readVesselCsvValue(row, "Commercial Manager")),
    commercialManagerEmail: textValue(readVesselCsvValue(row, "Commercial Manager Email")),
    commercialManagerCity: textValue(readVesselCsvValue(row, "Commercial Manager City")),
    commercialManagerCountry: textValue(readVesselCsvValue(row, "Commercial Manager Country")),
    registeredOwnerName: textValue(readVesselCsvValue(row, "Registered Owner")),
    registeredOwnerEmail: textValue(readVesselCsvValue(row, "Registered Owner Email")),
    registeredOwnerCity: textValue(readVesselCsvValue(row, "Registered Owner City")),
    registeredOwnerCountry: textValue(readVesselCsvValue(row, "Registered Owner Country")),
    beneficialOwnerName: textValue(readVesselCsvValue(row, "Beneficial Owner")),
    beneficialOwnerEmail: textValue(readVesselCsvValue(row, "Beneficial Owner Email")),
    beneficialOwnerCity: textValue(readVesselCsvValue(row, "Beneficial Owner City")),
    beneficialOwnerCountry: textValue(readVesselCsvValue(row, "Beneficial Owner Country")),
    technicalManagerName: textValue(readVesselCsvValue(row, "Technical Manager")),
    technicalManagerEmail: textValue(readVesselCsvValue(row, "Technical Manager Email")),
    technicalManagerCity: textValue(readVesselCsvValue(row, "Technical Manager City")),
    technicalManagerCountry: textValue(readVesselCsvValue(row, "Technical Manager Country")),
    pAndIClubName: textValue(readVesselCsvValue(row, "P&i Club")),
    pAndIClubEmail: textValue(readVesselCsvValue(row, "P&i Club Email")),
    pAndIClubCity: textValue(readVesselCsvValue(row, "P&i Club City")),
    pAndIClubCountry: textValue(readVesselCsvValue(row, "P&i Club Country")),
    shipBuilderName: textValue(readVesselCsvValue(row, "Ship Builder")),
    shipBuilderEmail: textValue(readVesselCsvValue(row, "Ship Builder Email")),
    shipBuilderCity: textValue(readVesselCsvValue(row, "Ship Builder City")),
    shipBuilderCountry: textValue(readVesselCsvValue(row, "Ship Builder Country")),
    classSocietyName: textValue(readVesselCsvValue(row, "Class Society")),
    classSocietyEmail: textValue(readVesselCsvValue(row, "Class Society Email")),
    classSocietyCity: textValue(readVesselCsvValue(row, "Class Society City")),
    classSocietyCountry: textValue(readVesselCsvValue(row, "Class Society Country")),
    classificationSociety: textValue(readVesselCsvValue(row, "Class Society")),
    engineBuilderName: textValue(readVesselCsvValue(row, "Engine Builder")),
    engineBuilderEmail: textValue(readVesselCsvValue(row, "Engine Builder Email")),
    engineBuilderCity: textValue(readVesselCsvValue(row, "Engine Builder City")),
    engineBuilderCountry: textValue(readVesselCsvValue(row, "Engine Builder Country")),
    ismManagerName: textValue(readVesselCsvValue(row, "ISM Manager")),
    ismManagerEmail: textValue(readVesselCsvValue(row, "ISM Manager Email")),
    ismManagerCity: textValue(readVesselCsvValue(row, "Ism Manager City")),
    ismManagerCountry: textValue(readVesselCsvValue(row, "ISM Manager Country")),
    operatorName: textValue(readVesselCsvValue(row, "Operator")),
    operatorEmail: textValue(readVesselCsvValue(row, "Operator Email")),
    operatorCity: textValue(readVesselCsvValue(row, "Operator City")),
    operatorCountry: textValue(readVesselCsvValue(row, "Operator Country")),
  } satisfies Partial<Prisma.VesselUncheckedCreateInput>;
}

type ExportCompany = {
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  country?: string | null;
};

type ExportVessel = Vessel & {
  etas?: Array<{ eta: Date }>;
  shipOwnerCompany?: ExportCompany | null;
  commercialManagerCompany?: ExportCompany | null;
  ismManagerCompany?: ExportCompany | null;
};

const headerToVesselField: Partial<Record<VesselCsvHeader, keyof Vessel>> = {
  Flag: "flag",
  "Vessel Name": "vesselName",
  IMO: "imoNumber",
  Destination: "destination",
  MMSI: "mmsi",
  Callsign: "callsign",
  Type: "vesselTypeDetailed",
  DWT: "dwt",
  "Gross Tonnage": "grossTonnage",
  "Net Tonnage": "netTonnage",
  "Built Year": "builtYear",
  Length: "lengthOverall",
  "Global Area": "globalArea",
  Eni: "eni",
  Speed: "speed",
  Course: "course",
  Draught: "draught",
  "Navigational Status": "navigationalStatus",
  "Ais Class": "aisClass",
  Width: "width",
  "Current Port Unlocode": "currentPortUnlocode",
  "Current Port Country": "currentPortCountry",
  "Draught Max": "draughtMax",
  "Draught Min": "draughtMin",
  "Yard Number": "yardNumber",
  "Capacity - Teu": "capacityTeu",
  "Capacity - Liquid Gas": "capacityLiquidGas",
  "Capacity - Passengers": "capacityPassengers",
  "Length Between Perpendiculars": "lengthBetweenPerpendiculars",
  Depth: "depth",
  "Breadth Extreme": "breadthExtreme",
  "Capacity - Liquid Oil": "capacityLiquidOil",
  "Commercial Market": "commercialMarket",
  "Commercial Size Class": "commercialSizeClass",
  "First Ais Position Date": "firstAisPositionDate",
  "Commercial Manager": "commercialManagerName",
  "Commercial Manager Email": "commercialManagerEmail",
  "Commercial Manager City": "commercialManagerCity",
  "Commercial Manager Country": "commercialManagerCountry",
  "Registered Owner": "registeredOwnerName",
  "Registered Owner Email": "registeredOwnerEmail",
  "Registered Owner City": "registeredOwnerCity",
  "Registered Owner Country": "registeredOwnerCountry",
  "Beneficial Owner": "beneficialOwnerName",
  "Beneficial Owner Email": "beneficialOwnerEmail",
  "Beneficial Owner City": "beneficialOwnerCity",
  "Beneficial Owner Country": "beneficialOwnerCountry",
  "Technical Manager": "technicalManagerName",
  "Technical Manager Email": "technicalManagerEmail",
  "Technical Manager City": "technicalManagerCity",
  "Technical Manager Country": "technicalManagerCountry",
  "P&i Club": "pAndIClubName",
  "P&i Club Email": "pAndIClubEmail",
  "P&i Club City": "pAndIClubCity",
  "P&i Club Country": "pAndIClubCountry",
  "Ship Builder": "shipBuilderName",
  "Ship Builder Email": "shipBuilderEmail",
  "Ship Builder City": "shipBuilderCity",
  "Ship Builder Country": "shipBuilderCountry",
  "Class Society": "classSocietyName",
  "Class Society Email": "classSocietyEmail",
  "Class Society City": "classSocietyCity",
  "Class Society Country": "classSocietyCountry",
  "Engine Builder": "engineBuilderName",
  "Engine Builder Email": "engineBuilderEmail",
  "Engine Builder City": "engineBuilderCity",
  "Engine Builder Country": "engineBuilderCountry",
  "ISM Manager": "ismManagerName",
  "ISM Manager Email": "ismManagerEmail",
  "Ism Manager City": "ismManagerCity",
  "ISM Manager Country": "ismManagerCountry",
  Operator: "operatorName",
  "Operator Email": "operatorEmail",
  "Operator City": "operatorCity",
  "Operator Country": "operatorCountry",
};

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function escapeCsv(value: unknown) {
  const cell = csvCell(value);
  return /[",\n\r]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

function companyCell(company: ExportCompany | null | undefined, field: keyof ExportCompany) {
  return company?.[field] ?? "";
}

function vesselCsvValue(vessel: ExportVessel, header: VesselCsvHeader) {
  if (header === "ETA (UTC)") return vessel.etas?.[0]?.eta?.toISOString() ?? "";
  if (header === "Ship Owner") return companyCell(vessel.shipOwnerCompany, "companyName");
  if (header === "Ship Owner Phone") return companyCell(vessel.shipOwnerCompany, "phone");
  if (header === "Ship Owner Email") return companyCell(vessel.shipOwnerCompany, "email");
  if (header === "Ship Owner Website") return companyCell(vessel.shipOwnerCompany, "website");
  if (header === "Ship Owner Country") return companyCell(vessel.shipOwnerCompany, "country");
  if (header === "Commercial Manager Phone") return companyCell(vessel.commercialManagerCompany, "phone");
  if (header === "Commercial Manager Email") return companyCell(vessel.commercialManagerCompany, "email") || vessel.commercialManagerEmail;
  if (header === "Commercial Manager Website") return companyCell(vessel.commercialManagerCompany, "website");
  if (header === "Commercial Manager Country") return companyCell(vessel.commercialManagerCompany, "country") || vessel.commercialManagerCountry;
  if (header === "ISM Manager Phone") return companyCell(vessel.ismManagerCompany, "phone");
  if (header === "ISM Manager Email") return companyCell(vessel.ismManagerCompany, "email") || vessel.ismManagerEmail;
  if (header === "ISM Manager Website") return companyCell(vessel.ismManagerCompany, "website");
  if (header === "ISM Manager Country") return companyCell(vessel.ismManagerCompany, "country") || vessel.ismManagerCountry;

  const field = headerToVesselField[header];
  if (!field) return "";
  if (header === "Type") return vessel.vesselTypeDetailed ?? vessel.vesselType;
  if (header === "DWT") return vessel.dwt ?? vessel.capacityDwt;
  if (header === "Gross Tonnage") return vessel.grossTonnage ?? vessel.capacityGt;
  return vessel[field];
}

export function vesselToCsvRow(vessel: ExportVessel) {
  return VESSEL_CSV_HEADERS.map((header) => escapeCsv(vesselCsvValue(vessel, header))).join(",");
}

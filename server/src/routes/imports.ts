import { parse } from "csv-parse/sync";
import { Router } from "express";
import { z } from "zod";
import { MARINE_DATA_ROW_FIELDS } from "@marimail/types";
import { extractWebsiteDomains, normalizeWebsiteDomain } from "@marimail/utils";
import type { EmailStatus, ETAConfidence, MarineRole, Seniority } from "@marimail/db";
import { prisma } from "@marimail/db";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { emitWorkspaceEvent } from "../services/realtime.js";
import { createETATriggers, matchCampaignsToETA } from "../services/campaign-matcher.js";
import { CONTACT_CSV_HEADERS, contactDataFromRow } from "../services/contact-data.js";
import { enqueueCsvImport, getCsvImportJob } from "../services/csv-import-queue.js";
import { ensureDestinationPort, isResolvableDestination } from "../services/port-resolution.js";
import { readVesselCsvValue, VESSEL_CSV_HEADERS, vesselDataFromCsvRow } from "../services/vessel-data.js";

export const importRouter = Router();

const importSchema = z.object({
  importType: z.enum([
    "VESSELS",
    "SHIP_OWNER_COMPANIES",
    "ISM_MANAGER_COMPANIES",
    "COMMERCIAL_MANAGER_COMPANIES",
    "CONTACTS",
    "VESSEL_ETAS",
    "MARINE_DATA_ROWS",
  ]),
  csv: z.string().min(1),
  mapping: z.record(z.string()).optional(),
});

type CsvRow = Record<string, string | undefined>;

export type ImportType = z.infer<typeof importSchema>["importType"];

type CompanyImportKind = "shipOwner" | "ismManager" | "commercialManager";
type ContactCompanyKind = "SHIP_OWNER" | "COMMERCIAL_MANAGER" | "ISM_MANAGER";
type HeaderMatchStatus = "exact" | "alias" | "suggested" | "user" | "unmapped" | "ignored";
type ImportFieldConfig = {
  label: string;
  required?: boolean;
  aliases?: string[];
};
type ImportSchemaConfig = {
  fields: ImportFieldConfig[];
};
type ImportRowError = {
  row: number;
  field: string;
  value?: string;
  message: string;
};
const IGNORE_FIELD = "__IGNORE__";

function read(row: CsvRow, candidates: string[]) {
  for (const candidate of candidates) {
    const value = row[candidate]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function normalizeHeader(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeWebsiteForStorage(value: string | null | undefined) {
  const raw = value?.trim();
  const domain = extractWebsiteDomains(raw)[0];
  if (!raw || !domain) return undefined;

  const rawDomain = normalizeWebsiteDomain(raw);
  const isCleanSingleValue = rawDomain === domain && !/[\s(),;]/.test(raw);
  if (isCleanSingleValue) {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  }

  return `https://${domain}`;
}

function parseCsvRecords(csv: string) {
  return parse(csv, {
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
  }) as string[][];
}

function normalizedDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const rows = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let i = 1; i <= b.length; i += 1) {
    let previous = i;
    for (let j = 1; j <= a.length; j += 1) {
      const next = rows[j - 1];
      rows[j - 1] = previous;
      previous =
        b[i - 1] === a[j - 1]
          ? next
          : Math.min(next + 1, previous + 1, rows[j] + 1);
    }
    rows[a.length] = previous;
  }
  return rows[a.length];
}

function fuzzyMatchScore(field: string, header: string) {
  const normalizedField = normalizeHeader(field);
  const normalizedCsvHeader = normalizeHeader(header);
  if (!normalizedField || !normalizedCsvHeader) return 0;
  if (normalizedField.includes(normalizedCsvHeader) || normalizedCsvHeader.includes(normalizedField)) return 0.86;
  const distance = normalizedDistance(normalizedField, normalizedCsvHeader);
  return 1 - distance / Math.max(normalizedField.length, normalizedCsvHeader.length);
}

function csvHeaderSamples(records: string[][], headers: string[]) {
  const samples: Record<string, string[]> = {};
  for (const [index, header] of headers.entries()) {
    samples[header] = records
      .slice(1)
      .map((record) => record[index]?.trim())
      .filter((value): value is string => Boolean(value))
      .slice(0, 3);
  }
  return samples;
}

function normalizeUserMapping(mapping: Record<string, string> | undefined, headers: string[]) {
  if (!mapping) return {};
  const headersByNormalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const normalized: Record<string, string> = {};
  for (const [header, field] of Object.entries(mapping)) {
    const realHeader = headers.includes(header) ? header : headersByNormalized.get(normalizeHeader(header));
    if (realHeader) normalized[realHeader] = field;
  }
  return normalized;
}

function buildHeaderMatches(headers: string[], importType: ImportType, mapping?: Record<string, string>) {
  const config = importSchemaConfig(importType);
  const userMapping = normalizeUserMapping(mapping, headers);
  const fieldsByLabel = new Map(config.fields.map((field) => [field.label, field]));
  const usedHeaders = new Set<string>();
  const ignoredHeaders = new Set<string>();
  const matches = new Map<string, { csvHeader?: string; status: HeaderMatchStatus }>();

  for (const [csvHeader, fieldLabel] of Object.entries(userMapping)) {
    if (fieldLabel === IGNORE_FIELD) {
      ignoredHeaders.add(csvHeader);
      usedHeaders.add(csvHeader);
      continue;
    }
    if (fieldsByLabel.has(fieldLabel)) {
      matches.set(fieldLabel, { csvHeader, status: "user" });
      usedHeaders.add(csvHeader);
    }
  }

  const availableHeaders = () => headers.filter((header) => !usedHeaders.has(header));

  for (const field of config.fields) {
    if (matches.has(field.label)) continue;
    const exact = availableHeaders().find((header) => normalizeHeader(header) === normalizeHeader(field.label));
    if (exact) {
      matches.set(field.label, { csvHeader: exact, status: "exact" });
      usedHeaders.add(exact);
      continue;
    }

    const alias = availableHeaders().find((header) =>
      (field.aliases ?? []).some((candidate) => normalizeHeader(candidate) === normalizeHeader(header)),
    );
    if (alias) {
      matches.set(field.label, { csvHeader: alias, status: "alias" });
      usedHeaders.add(alias);
      continue;
    }

    const suggested = availableHeaders()
      .map((header) => ({ header, score: Math.max(fuzzyMatchScore(field.label, header), ...(field.aliases ?? []).map((aliasValue) => fuzzyMatchScore(aliasValue, header))) }))
      .filter((item) => item.score >= 0.78)
      .sort((a, b) => b.score - a.score)[0];
    if (suggested) {
      matches.set(field.label, { csvHeader: suggested.header, status: "suggested" });
      usedHeaders.add(suggested.header);
    }
  }

  return {
    fields: config.fields.map((field) => {
      const match = matches.get(field.label);
      return {
        label: field.label,
        required: Boolean(field.required),
        aliases: field.aliases ?? [],
        matchedCsvHeader: match?.csvHeader ?? null,
        status: match?.status ?? "unmapped",
      };
    }),
    ignoredHeaders: Array.from(ignoredHeaders),
    unmappedCsvHeaders: headers.filter((header) => !usedHeaders.has(header)),
  };
}

function rowsFromMappedRecords(records: string[][], headers: string[], fields: ReturnType<typeof buildHeaderMatches>["fields"]) {
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  return records.slice(1).map((record) => {
    const row: CsvRow = {};
    for (const field of fields) {
      if (!field.matchedCsvHeader) continue;
      const index = headerIndex.get(field.matchedCsvHeader);
      if (index === undefined) continue;
      const value = record[index]?.trim();
      if (value) row[field.label] = value;
    }
    return row;
  });
}

function requiredMappingErrors(fields: ReturnType<typeof buildHeaderMatches>["fields"]) {
  return fields.filter((field) => field.required && !field.matchedCsvHeader).map((field) => field.label);
}

function rowValue(row: CsvRow, field: string) {
  return row[field]?.trim();
}

function validateRequiredRows(
  rows: CsvRow[],
  fields: ReturnType<typeof buildHeaderMatches>["fields"],
  exclude: Set<string> = new Set(),
) {
  const errors: ImportRowError[] = [];
  const requiredFields = fields
    .filter((field) => field.required && !exclude.has(field.label))
    .map((field) => field.label);
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    for (const field of requiredFields) {
      if (!rowValue(row, field)) {
        errors.push({ row: rowNumber, field, message: `${field} is required` });
      }
    }
  }
  return errors;
}

async function validateMappedRows(importType: ImportType, rows: CsvRow[], fields: ReturnType<typeof buildHeaderMatches>["fields"], workspaceId: string) {
  // For VESSELS, a missing Vessel Name is NOT a row error — the importer falls
  // back to using the IMO as the name. IMO is the only hard requirement, checked
  // explicitly below. So exclude "Vessel Name" from the generic required check.
  const errors = validateRequiredRows(
    rows,
    fields,
    importType === "VESSELS" ? new Set(["Vessel Name"]) : new Set(),
  );

  if (importType === "VESSELS") {
    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
      const imo = rowValue(row, "IMO");
      // IMO is mandatory (unique key). Missing → skip; present-but-malformed → skip.
      if (!imo) {
        errors.push({ row: rowNumber, field: "IMO", message: "IMO is required" });
      } else if (!/^\d{7}$/.test(imo)) {
        errors.push({ row: rowNumber, field: "IMO", value: imo, message: "IMO must be exactly 7 digits" });
      }
      const eta = rowValue(row, "ETA (UTC)");
      if (eta) {
        const etaDate = new Date(eta);
        if (Number.isNaN(etaDate.getTime())) {
          errors.push({ row: rowNumber, field: "ETA (UTC)", value: eta, message: "ETA must be a valid date/time" });
        }
        const destination = rowValue(row, "Destination");
        if (!destination) {
          errors.push({ row: rowNumber, field: "Destination", message: "Destination is required when ETA (UTC) is present" });
        } else if (!isResolvableDestination(destination)) {
          errors.push({ row: rowNumber, field: "Destination", value: destination, message: "Destination must contain letters or numbers" });
        }
      }
    }
  }

  if (importType === "CONTACTS") {
    for (const [index, row] of rows.entries()) {
      const email = rowValue(row, "Email");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: index + 2, field: "Email", value: email, message: "Email must be valid" });
      }
    }
  }

  if (importType === "VESSEL_ETAS") {
    // Batch the vessel-existence check: gather every syntactically-valid IMO in
    // the file and look them all up in ONE query, instead of a findFirst per row
    // (which timed out large files). Then validate rows against the result set.
    const validImos = rows
      .map((row) => rowValue(row, "IMO"))
      .filter((imo): imo is string => typeof imo === "string" && /^\d{7}$/.test(imo));
    const existingImos = new Set<string>();
    if (validImos.length > 0) {
      const found = await prisma.vessel.findMany({
        where: { imoNumber: { in: Array.from(new Set(validImos)) }, workspaceId },
        select: { imoNumber: true },
      });
      for (const v of found) existingImos.add(v.imoNumber);
    }

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
      const imo = rowValue(row, "IMO");
      if (imo && !/^\d{7}$/.test(imo)) {
        errors.push({ row: rowNumber, field: "IMO", value: imo, message: "IMO must be exactly 7 digits" });
      } else if (imo && !existingImos.has(imo)) {
        errors.push({ row: rowNumber, field: "IMO", value: imo, message: `Vessel ${imo} was not found in this workspace` });
      }
      const eta = rowValue(row, "ETA (UTC)") ?? rowValue(row, "ETA");
      if (eta && Number.isNaN(new Date(eta).getTime())) {
        errors.push({ row: rowNumber, field: "ETA (UTC)", value: eta, message: "ETA must be a valid date/time" });
      }
      const destinationPort = rowValue(row, "Destination Port");
      if (destinationPort && !isResolvableDestination(destinationPort)) {
        errors.push({ row: rowNumber, field: "Destination Port", value: destinationPort, message: "Destination Port must contain letters or numbers" });
      }
    }
  }

  if (importType === "MARINE_DATA_ROWS") {
    for (const [index, row] of rows.entries()) {
      if (Object.keys(row).length === 0) {
        errors.push({ row: index + 2, field: "Row", message: "Row has no mapped values" });
      }
    }
  }

  return errors;
}

async function buildImportPreview(input: { importType: ImportType; csv: string; mapping?: Record<string, string> }, workspaceId: string) {
  const records = parseCsvRecords(input.csv);
  if (records.length === 0) {
    return {
      detectedHeaders: [] as string[],
      csvHeaders: [] as Array<{ header: string; samples: string[] }>,
      rowCount: 0,
      schemaFields: [] as ReturnType<typeof buildHeaderMatches>["fields"],
      unmappedCsvHeaders: [] as string[],
      ignoredHeaders: [] as string[],
      missingRequiredFields: [] as string[],
      rowErrors: [{ row: 1, field: "CSV", message: "CSV is empty" }] as ImportRowError[],
      normalizedRows: [] as CsvRow[],
      previewRows: [] as CsvRow[],
      canImport: false,
    };
  }

  const headers = (records[0] ?? []).map((header) => header.trim()).filter(Boolean);
  const samples = csvHeaderSamples(records, headers);
  const headerMatches = buildHeaderMatches(headers, input.importType, input.mapping);
  const normalizedRows = rowsFromMappedRecords(records, headers, headerMatches.fields);
  const missingRequiredFields = requiredMappingErrors(headerMatches.fields);
  const rowErrors = missingRequiredFields.length > 0 ? [] : await validateMappedRows(input.importType, normalizedRows, headerMatches.fields, workspaceId);

  // Row-level errors no longer BLOCK the import — the importer already skips
  // rows that are missing required values (e.g. Vessel Name / IMO) or malformed.
  // We surface them as "these N rows will be skipped" instead. The only hard
  // blocker is an unmapped required COLUMN (missingRequiredFields), which means
  // we can't import anything meaningfully. `skippedRowCount` counts distinct
  // rows that have at least one error.
  const skippedRows = new Set(rowErrors.map((e) => e.row));
  const importableRowCount = Math.max(0, normalizedRows.length - skippedRows.size);

  return {
    detectedHeaders: headers,
    csvHeaders: headers.map((header) => ({ header, samples: samples[header] ?? [] })),
    rowCount: normalizedRows.length,
    schemaFields: headerMatches.fields,
    unmappedCsvHeaders: headerMatches.unmappedCsvHeaders,
    ignoredHeaders: headerMatches.ignoredHeaders,
    missingRequiredFields,
    rowErrors,
    skippedRowCount: skippedRows.size,
    importableRowCount,
    normalizedRows,
    previewRows: normalizedRows.slice(0, 5),
    // Can import as long as required columns are mapped AND at least one row is
    // actually importable. Rows with errors are skipped, not blocking.
    canImport: missingRequiredFields.length === 0 && importableRowCount > 0,
  };
}

const marineDataAliases: Partial<Record<(typeof MARINE_DATA_ROW_FIELDS)[number], string[]>> = {
  Imo: ["IMO", "IMO Number", "imoNumber"],
  Mmsi: ["MMSI", "mmsi"],
  "Ais Class": ["AIS Class"],
  "Capacity - Dwt": ["DWT", "Capacity DWT", "Capacity - DWT", "dwt"],
  "Capacity - Gt": ["GT", "Gross Tonnage", "Capacity - GT"],
  "Vessel Type - Detailed": ["Vessel Type", "Vessel Type Detailed", "vesselType"],
  "Class Society": ["Class", "Classification Society", "classificationSociety"],
  "Ism Manager": ["ISM Manager", "ISM Manager Company", "ismManagerCompanyName"],
  "Ism Manager Email": ["ISM Manager Email"],
  "Ism Manager City": ["ISM Manager City"],
  "Ism Manager Country": ["ISM Manager Country"],
  "Operator Country": ["Operator Country First Name"],
  "First Name": ["firstName"],
  "Last Name": ["lastName"],
  Email: ["Primary Email", "email"],
  Departments: ["Department", "department"],
  "Person Linkedin Url": ["Person LinkedIn URL", "personLinkedinUrl"],
  "Company Linkedin Url": ["Company LinkedIn URL", "companyLinkedinUrl"],
  "Subsidiary of": ["Subsidiary Of", "subsidiaryOf"],
  "Salesforce ID": ["salesforceId"],
};

const vesselPreviewAliases: Partial<Record<(typeof VESSEL_CSV_HEADERS)[number], string[]>> = {
  IMO: ["Imo", "IMO Number", "imoNumber"],
  MMSI: ["Mmsi", "mmsi"],
  "Vessel Name": ["vesselName", "Name"],
  "ETA (UTC)": ["ETA UTC", "ETA", "eta"],
  Type: ["Vessel Type", "Vessel Type - Detailed", "vesselType", "vesselTypeDetailed"],
  DWT: ["Capacity - Dwt", "Capacity DWT", "Capacity - DWT", "dwt"],
  "Gross Tonnage": ["Capacity - Gt", "GT", "grossTonnage", "Capacity - GT"],
  "Net Tonnage": ["NT", "netTonnage"],
  "Built Year": ["Built", "builtYear"],
  Length: ["Length Overall", "LOA", "lengthOverall"],
  "Ship Owner": ["Ship Owner Company", "shipOwnerCompanyName"],
  "Ship Owner Phone": ["Ship Owner Company Phone", "shipOwnerPhone"],
  "Ship Owner Email": ["Ship Owner Company Email", "shipOwnerEmail"],
  "Ship Owner Website": ["Ship Owner Company Website", "shipOwnerWebsite"],
  "Ship Owner Country": ["Ship Owner Company Country", "shipOwnerCountry"],
  "Commercial Manager": ["Commercial Manager Company", "commercialManagerCompanyName"],
  "Commercial Manager Phone": ["Commercial Manager Company Phone", "commercialManagerPhone"],
  "Commercial Manager Email": ["Commercial Manager Company Email", "commercialManagerEmail"],
  "Commercial Manager Website": ["Commercial Manager Company Website", "commercialManagerWebsite"],
  "Commercial Manager Country": ["Commercial Manager Company Country", "commercialManagerCountry"],
  "ISM Manager": ["Ism Manager", "ISM Manager Company", "ismManagerCompanyName"],
  "ISM Manager Email": ["Ism Manager Email"],
  "ISM Manager Phone": ["Ism Manager Phone"],
  "ISM Manager Website": ["Ism Manager Website"],
  "ISM Manager Country": ["Ism Manager Country"],
  "Ism Manager City": ["ISM Manager City"],
};

const contactPreviewAliases: Partial<Record<(typeof CONTACT_CSV_HEADERS)[number], string[]>> = {
  "First Name": ["firstName"],
  "Last Name": ["lastName"],
  Company: ["Company Name", "companyName"],
  Email: ["Primary Email", "email"],
  Departments: ["Department", "department"],
  "Contact Owner": ["contactOwner", "contactOwnerName"],
  "Home Phone": ["homePhone"],
  "Mobile Phone": ["mobilePhone"],
  "Corporate Phone": ["corporatePhone"],
  "Other Phone": ["otherPhone"],
  "Person Linkedin Url": ["Person LinkedIn URL", "personLinkedinUrl"],
  "Company Linkedin Url": ["Company LinkedIn URL", "companyLinkedinUrl"],
  "Subsidiary of": ["Subsidiary Of", "subsidiaryOf"],
  "Secondary Email": ["secondaryEmail"],
  "Salesforce ID": ["salesforceId"],
};

const vesselEtaFields: ImportFieldConfig[] = [
  { label: "IMO", required: true, aliases: ["IMO Number", "Imo", "imoNumber"] },
  { label: "Destination Port", required: true, aliases: ["Port", "destinationPort", "Destination"] },
  { label: "ETA (UTC)", required: true, aliases: ["ETA", "ETA UTC", "eta"] },
  { label: "Previous Port", aliases: ["previousPort"] },
  { label: "Previous Cargo", aliases: ["previousCargo"] },
  { label: "Next Cargo", aliases: ["nextCargo"] },
  { label: "Confidence", aliases: ["ETA Confidence"] },
];

const companyFields: ImportFieldConfig[] = [
  { label: "Company Name", required: true, aliases: ["Company", "Ship Owner", "ISM Manager", "Commercial Manager"] },
  { label: "Phone", aliases: ["Company Phone", "Ship Owner Phone", "ISM Manager Phone", "Commercial Manager Phone"] },
  { label: "Email", aliases: ["Company Email", "Ship Owner Email", "ISM Manager Email", "Commercial Manager Email"] },
  { label: "Website", aliases: ["Company Website", "Ship Owner Website", "ISM Manager Website", "Commercial Manager Website"] },
  { label: "Country", aliases: ["Company Country", "Ship Owner Country", "ISM Manager Country", "Commercial Manager Country"] },
  { label: "City", aliases: ["Company City", "Ship Owner City", "ISM Manager City", "Commercial Manager City"] },
  { label: "Address", aliases: ["Company Address"] },
  { label: "Linkedin Url", aliases: ["Company Linkedin Url", "Company LinkedIn URL", "linkedinUrl"] },
];

function fieldsFromHeaders<T extends readonly string[]>(
  headers: T,
  required: readonly T[number][],
  aliases: Partial<Record<T[number], string[]>> = {},
): ImportFieldConfig[] {
  const requiredSet = new Set<string>(required);
  return headers.map((label) => ({
    label,
    required: requiredSet.has(label),
    aliases: aliases[label as T[number]] ?? [],
  }));
}

function importSchemaConfig(importType: ImportType): ImportSchemaConfig {
  if (importType === "VESSELS") {
    return { fields: fieldsFromHeaders(VESSEL_CSV_HEADERS, ["Vessel Name", "IMO"], vesselPreviewAliases) };
  }
  if (importType === "CONTACTS") {
    return { fields: fieldsFromHeaders(CONTACT_CSV_HEADERS, ["First Name", "Last Name", "Email"], contactPreviewAliases) };
  }
  if (importType === "VESSEL_ETAS") {
    return { fields: vesselEtaFields };
  }
  if (importType === "MARINE_DATA_ROWS") {
    return { fields: fieldsFromHeaders(MARINE_DATA_ROW_FIELDS, [], marineDataAliases) };
  }
  return { fields: companyFields };
}

function readMarineDataValue(row: CsvRow, field: (typeof MARINE_DATA_ROW_FIELDS)[number]) {
  return read(row, [field, ...(marineDataAliases[field] ?? [])]);
}

const seniorities = new Set<Seniority>(["INTERN", "ENTRY", "MID", "SENIOR", "LEAD", "MANAGER", "DIRECTOR", "VP", "C_LEVEL", "FOUNDER", "OWNER"]);
const marineRoles = new Set<MarineRole>([
  "FLEET_MANAGER",
  "SHIP_SUPERINTENDENT",
  "TECHNICAL_MANAGER",
  "CREWING_MANAGER",
  "CHARTERING_MANAGER",
  "PORT_CAPTAIN",
  "MARINE_SURVEYOR",
  "CLASS_SURVEYOR",
  "UNDERWRITER",
  "BROKER",
  "PORT_AGENT",
  "CHANDLER",
  "BUNKER_TRADER",
  "OPA_PROVIDER",
  "OTHER",
]);
const emailStatuses = new Set<EmailStatus>(["VALID", "RISKY", "INVALID", "UNKNOWN"]);

function enumValue<T extends string>(value: string | undefined, allowed: Set<T>, fallback: T): T {
  const normalized = (value ?? fallback).toUpperCase().replaceAll(" ", "_").replaceAll("-", "_") as T;
  return allowed.has(normalized) ? normalized : fallback;
}

async function resolveCompanyByNormalizedDomain(workspaceId: string, domain: string) {
  const [shipOwners, commercialManagers, ismManagers] = await Promise.all([
    prisma.shipOwnerCompany.findMany({
      where: { workspaceId, website: { not: null } },
      select: { id: true, companyName: true, website: true },
      orderBy: { companyName: "asc" },
    }),
    prisma.commercialManagerCompany.findMany({
      where: { workspaceId, website: { not: null } },
      select: { id: true, companyName: true, website: true },
      orderBy: { companyName: "asc" },
    }),
    prisma.iSMManagerCompany.findMany({
      where: { workspaceId, website: { not: null } },
      select: { id: true, companyName: true, website: true },
      orderBy: { companyName: "asc" },
    }),
  ]);

  const match = <T extends { id: string; companyName: string; website: string | null }>(
    rows: T[],
    companyKind: ContactCompanyKind,
  ) => {
    const company = rows.find((row) => extractWebsiteDomains(row.website).includes(domain));
    return company ? { companyId: company.id, companyKind, companyName: company.companyName } : null;
  };

  return (
    match(shipOwners, "SHIP_OWNER") ??
    match(commercialManagers, "COMMERCIAL_MANAGER") ??
    match(ismManagers, "ISM_MANAGER")
  );
}

async function resolveCompanyByWebsiteDomain(workspaceId: string, website: string | null | undefined) {
  const domain = extractWebsiteDomains(website)[0];
  return domain ? resolveCompanyByNormalizedDomain(workspaceId, domain) : null;
}

async function backfillContactsForCompanyWebsite(workspaceId: string, website: string | null | undefined) {
  const domain = extractWebsiteDomains(website)[0];
  if (!domain) return 0;
  const company = await resolveCompanyByNormalizedDomain(workspaceId, domain);
  if (!company) return 0;

  const contacts = await prisma.contact.findMany({
    where: { workspaceId, website: { not: null } },
    select: { id: true, website: true },
  });

  let updated = 0;
  for (const contact of contacts) {
    if (!extractWebsiteDomains(contact.website).includes(domain)) continue;
    await prisma.contact.update({ where: { id: contact.id }, data: company });
    updated += 1;
  }
  return updated;
}

async function safeBackfillContactsForCompanyWebsite(workspaceId: string, website: string | null | undefined) {
  try {
    await backfillContactsForCompanyWebsite(workspaceId, website);
  } catch (error) {
    console.error("[import] website contact backfill failed:", error);
  }
}

async function findOrCreateCompany(
  kind: CompanyImportKind,
  workspaceId: string,
  companyName: string,
  details: { email?: string; phone?: string; website?: string; city?: string; country?: string } = {},
) {
  const companyData = Object.fromEntries(
    Object.entries({
      email: details.email,
      phone: details.phone,
      website: normalizeWebsiteForStorage(details.website),
      city: details.city,
      country: details.country,
    }).filter(([, value]) => value !== undefined),
  ) as { email?: string; phone?: string; website?: string; city?: string; country?: string };

  if (kind === "shipOwner") {
    const existing = await prisma.shipOwnerCompany.findFirst({ where: { companyName, workspaceId } });
    if (existing) {
      const company = Object.keys(companyData).length > 0 ? await prisma.shipOwnerCompany.update({ where: { id: existing.id }, data: companyData }) : existing;
      await safeBackfillContactsForCompanyWebsite(workspaceId, company.website);
      return company;
    }
    const company = await prisma.shipOwnerCompany.create({
      data: {
        companyName,
        ...companyData,
        workspaceId,
      },
    });
    await safeBackfillContactsForCompanyWebsite(workspaceId, company.website);
    return company;
  }

  if (kind === "ismManager") {
    const existing = await prisma.iSMManagerCompany.findFirst({ where: { companyName, workspaceId } });
    if (existing) {
      const company = Object.keys(companyData).length > 0 ? await prisma.iSMManagerCompany.update({ where: { id: existing.id }, data: companyData }) : existing;
      await safeBackfillContactsForCompanyWebsite(workspaceId, company.website);
      return company;
    }
    const company = await prisma.iSMManagerCompany.create({
      data: {
        companyName,
        ...companyData,
        workspaceId,
      },
    });
    await safeBackfillContactsForCompanyWebsite(workspaceId, company.website);
    return company;
  }

  const existing = await prisma.commercialManagerCompany.findFirst({ where: { companyName, workspaceId } });
  if (existing) {
    const company = Object.keys(companyData).length > 0 ? await prisma.commercialManagerCompany.update({ where: { id: existing.id }, data: companyData }) : existing;
    await safeBackfillContactsForCompanyWebsite(workspaceId, company.website);
    return company;
  }
  const company = await prisma.commercialManagerCompany.create({
    data: {
      companyName,
      ...companyData,
      workspaceId,
    },
  });
  await safeBackfillContactsForCompanyWebsite(workspaceId, company.website);
  return company;
}

async function importVesselRows(rows: CsvRow[], workspaceId: string) {
  let created = 0;
  let updated = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const vesselData = vesselDataFromCsvRow(row);
    const imoNumber = vesselData.imoNumber;
    // IMO is the unique key and is mandatory — skip rows without a valid one.
    if (!imoNumber || !/^\d{7}$/.test(imoNumber)) {
      errors.push({ row: rowNumber, message: "IMO Number must be exactly 7 digits" });
      continue;
    }
    // Vessel name is required by the schema but optional in the CSV: fall back to
    // the IMO as a placeholder name so an IMO-only row still imports (rename later).
    const vesselName = vesselData.vesselName || `IMO ${imoNumber}`;

    const shipOwnerName =
      readVesselCsvValue(row, "Ship Owner") ??
      vesselData.registeredOwnerName ??
      vesselData.beneficialOwnerName;
    const ismManagerName = vesselData.ismManagerName ?? readVesselCsvValue(row, "ISM Manager");
    const commercialManagerName = vesselData.commercialManagerName ?? readVesselCsvValue(row, "Commercial Manager");

    const shipOwner = shipOwnerName
      ? await findOrCreateCompany("shipOwner", workspaceId, shipOwnerName, {
          email: readVesselCsvValue(row, "Ship Owner Email") ?? vesselData.registeredOwnerEmail ?? vesselData.beneficialOwnerEmail,
          phone: readVesselCsvValue(row, "Ship Owner Phone"),
          website: readVesselCsvValue(row, "Ship Owner Website"),
          city: vesselData.registeredOwnerCity ?? vesselData.beneficialOwnerCity,
          country: readVesselCsvValue(row, "Ship Owner Country") ?? vesselData.registeredOwnerCountry ?? vesselData.beneficialOwnerCountry,
        })
      : null;
    const ismManager = ismManagerName
      ? await findOrCreateCompany("ismManager", workspaceId, ismManagerName, {
          email: vesselData.ismManagerEmail,
          phone: readVesselCsvValue(row, "ISM Manager Phone"),
          website: readVesselCsvValue(row, "ISM Manager Website"),
          city: vesselData.ismManagerCity,
          country: vesselData.ismManagerCountry,
        })
      : null;
    const commercialManager = commercialManagerName
      ? await findOrCreateCompany(
          "commercialManager",
          workspaceId,
          commercialManagerName,
          {
            email: vesselData.commercialManagerEmail,
            phone: readVesselCsvValue(row, "Commercial Manager Phone"),
            website: readVesselCsvValue(row, "Commercial Manager Website"),
            city: vesselData.commercialManagerCity,
            country: vesselData.commercialManagerCountry,
          },
        )
      : null;

    // Vessels are global: keyed by IMO across every workspace. If the IMO
    // exists we refresh its fields with the latest CSV values; if it doesn't
    // we create it as workspaceId=null so every workspace can see it. The
    // caller's workspaceId is deliberately NOT written onto the vessel row —
    // that would privatize a shared record.
    const existing = await prisma.vessel.findUnique({ where: { imoNumber }, select: { id: true } });
    const vessel = await prisma.vessel.upsert({
      where: { imoNumber },
      update: {
        ...vesselData,
        shipOwnerCompanyId: shipOwner?.id,
        ismManagerCompanyId: ismManager?.id,
        commercialManagerCompanyId: commercialManager?.id,
        source: "CSV_IMPORT",
      },
      create: {
        ...vesselData,
        imoNumber,
        vesselName,
        shipOwnerCompanyId: shipOwner?.id,
        ismManagerCompanyId: ismManager?.id,
        commercialManagerCompanyId: commercialManager?.id,
        workspaceId: null,
        source: "CSV_IMPORT",
      },
      select: { id: true },
    });

    const etaRaw = readVesselCsvValue(row, "ETA (UTC)");
    if (etaRaw) {
      const etaDate = new Date(etaRaw);
      if (Number.isNaN(etaDate.getTime())) {
        errors.push({ row: rowNumber, message: `Invalid ETA timestamp: ${etaRaw}` });
      } else if (!vesselData.destination) {
        errors.push({ row: rowNumber, message: "Destination is required when ETA (UTC) is present" });
      } else {
        const port = await ensureDestinationPort(vesselData.destination);
        if (!port) {
          errors.push({ row: rowNumber, message: "Destination must contain letters or numbers" });
          continue;
        }
        try {
          // Re-imports of the same CSV shouldn't stack duplicate ETA rows.
          // Match on (vessel, port, exact ETA) and update; otherwise create.
          const existingEta = await prisma.vesselETA.findFirst({
            where: {
              vesselId: vessel.id,
              destinationPort: port.portCode,
              eta: etaDate,
            },
            select: { id: true },
          });
          if (existingEta) {
            await prisma.vesselETA.update({
              where: { id: existingEta.id },
              data: {
                destinationPortName: port.portName,
                etaSource: "CSV_IMPORT",
                etaConfidence: "ESTIMATED",
              },
            });
          } else {
            await prisma.vesselETA.create({
              data: {
                vesselId: vessel.id,
                destinationPort: port.portCode,
                destinationPortName: port.portName,
                eta: etaDate,
                etaSource: "CSV_IMPORT",
                etaConfidence: "ESTIMATED",
                workspaceId,
              },
            });
          }
        } catch (error) {
          errors.push({ row: rowNumber, message: error instanceof Error ? error.message : "Unable to create ETA record" });
        }
      }
    }

    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }

    if ((index + 1) % 25 === 0 || index === rows.length - 1) {
      emitWorkspaceEvent(workspaceId, "import:progress", {
        processed: index + 1,
        total: rows.length,
        created,
        updated,
        errors: errors.length,
      });
    }
  }

  return { created, updated, errors };
}

async function importMarineDataRows(rows: CsvRow[], workspaceId: string) {
  let created = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (const [index, row] of rows.entries()) {
    const values: Record<string, string> = {};

    for (const field of MARINE_DATA_ROW_FIELDS) {
      const value = readMarineDataValue(row, field);
      if (value) {
        values[field] = value;
      }
    }

    for (const [key, rawValue] of Object.entries(row)) {
      const value = rawValue?.trim();
      if (key && value && !values[key]) {
        values[key] = value;
      }
    }

    if (Object.keys(values).length === 0) {
      errors.push({ row: index + 2, message: "Row is empty" });
      continue;
    }

    await prisma.marineDataRow.create({
      data: {
        workspaceId,
        values,
        vesselName: values["Vessel Name"],
        imoNumber: values.Imo ?? readVesselCsvValue(values, "IMO"),
        mmsi: values.Mmsi ?? readVesselCsvValue(values, "MMSI"),
        companyName: values.Company,
        email: values.Email?.toLowerCase(),
        firstName: values["First Name"],
        lastName: values["Last Name"],
        title: values.Title,
        country: values.Country,
        source: "CSV_IMPORT",
      },
    });
    created += 1;

    if ((index + 1) % 25 === 0 || index === rows.length - 1) {
      emitWorkspaceEvent(workspaceId, "import:progress", {
        processed: index + 1,
        total: rows.length,
        created,
        updated: 0,
        errors: errors.length,
      });
    }
  }

  return { created, updated: 0, errors };
}

async function resolveContactCompany(row: CsvRow, workspaceId: string) {
  const websiteMatch = await resolveCompanyByWebsiteDomain(workspaceId, read(row, ["Website", "Company Website"]));
  if (websiteMatch) return websiteMatch;

  const companyName = read(row, ["Company", "Company Name", "companyName"]);
  if (!companyName) {
    return { companyId: null, companyKind: "GENERIC" as const, companyName: "Unknown Company" };
  }

  const [shipOwner, ismManager, commercialManager] = await Promise.all([
    prisma.shipOwnerCompany.findFirst({ where: { companyName, workspaceId } }),
    prisma.iSMManagerCompany.findFirst({ where: { companyName, workspaceId } }),
    prisma.commercialManagerCompany.findFirst({ where: { companyName, workspaceId } }),
  ]);

  if (shipOwner) {
    return { companyId: shipOwner.id, companyKind: "SHIP_OWNER" as const, companyName: shipOwner.companyName };
  }
  if (ismManager) {
    return { companyId: ismManager.id, companyKind: "ISM_MANAGER" as const, companyName: ismManager.companyName };
  }
  if (commercialManager) {
    return { companyId: commercialManager.id, companyKind: "COMMERCIAL_MANAGER" as const, companyName: commercialManager.companyName };
  }

  const created = await prisma.shipOwnerCompany.create({
    data: {
      companyName,
      email: read(row, ["Company Email", "Ship Owner Email"]),
      website: normalizeWebsiteForStorage(read(row, ["Website", "Company Website"])),
      country: read(row, ["Company Country", "Country"]),
      linkedinUrl: read(row, ["Company Linkedin Url", "Company LinkedIn URL"]),
      workspaceId,
    },
  });

  return { companyId: created.id, companyKind: "SHIP_OWNER" as const, companyName: created.companyName };
}

async function importCompanyRows(rows: CsvRow[], workspaceId: string, importType: ImportType) {
  let created = 0;
  let updated = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const companyName = rowValue(row, "Company Name");
    if (!companyName) {
      errors.push({ row: rowNumber, message: "Company Name is required" });
      continue;
    }

    const data = {
      companyName,
      phone: rowValue(row, "Phone"),
      email: rowValue(row, "Email"),
      website: normalizeWebsiteForStorage(rowValue(row, "Website")),
      country: rowValue(row, "Country"),
      city: rowValue(row, "City"),
      address: rowValue(row, "Address"),
      linkedinUrl: rowValue(row, "Linkedin Url"),
      workspaceId,
    };

    if (importType === "ISM_MANAGER_COMPANIES") {
      const existing = await prisma.iSMManagerCompany.findFirst({ where: { companyName, workspaceId }, select: { id: true } });
      if (existing) {
        await prisma.iSMManagerCompany.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await prisma.iSMManagerCompany.create({ data });
        created += 1;
      }
    } else if (importType === "COMMERCIAL_MANAGER_COMPANIES") {
      const existing = await prisma.commercialManagerCompany.findFirst({ where: { companyName, workspaceId }, select: { id: true } });
      if (existing) {
        await prisma.commercialManagerCompany.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await prisma.commercialManagerCompany.create({ data });
        created += 1;
      }
    } else {
      const existing = await prisma.shipOwnerCompany.findFirst({ where: { companyName, workspaceId }, select: { id: true } });
      if (existing) {
        await prisma.shipOwnerCompany.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await prisma.shipOwnerCompany.create({ data });
        created += 1;
      }
    }

    await safeBackfillContactsForCompanyWebsite(workspaceId, data.website);

    if ((index + 1) % 25 === 0 || index === rows.length - 1) {
      emitWorkspaceEvent(workspaceId, "import:progress", {
        processed: index + 1,
        total: rows.length,
        created,
        updated,
        errors: errors.length,
      });
    }
  }

  return { created, updated, errors };
}

async function importContactRows(rows: CsvRow[], workspaceId: string, userId: string) {
  let created = 0;
  let updated = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const contactData = contactDataFromRow(row);
    const firstName = contactData.firstName;
    const lastName = contactData.lastName;
    const email = contactData.email;
    const website = normalizeWebsiteForStorage(contactData.website);

    if (!firstName || !lastName || !email) {
      errors.push({ row: rowNumber, message: "First Name, Last Name, and Email are required" });
      continue;
    }

    const company = await resolveContactCompany(row, workspaceId);
    const existing = await prisma.contact.findUnique({
      where: { email_workspaceId: { email, workspaceId } },
      select: { id: true },
    });

    try {
      await prisma.contact.upsert({
        where: { email_workspaceId: { email, workspaceId } },
        update: {
          ...contactData,
          website,
          firstName,
          lastName,
          email,
          ...company,
          contactOwnerId: userId,
          seniority: enumValue(read(row, ["Seniority", "seniority"]), seniorities, "MID"),
          marineRole: enumValue(read(row, ["Marine Role", "marineRole"]), marineRoles, "OTHER"),
          emailStatus: enumValue(read(row, ["Email Status", "emailStatus"]), emailStatuses, "UNKNOWN"),
          source: "CSV_IMPORT",
        },
        create: {
          ...contactData,
          website,
          firstName,
          lastName,
          email,
          ...company,
          contactOwnerId: userId,
          seniority: enumValue(read(row, ["Seniority", "seniority"]), seniorities, "MID"),
          marineRole: enumValue(read(row, ["Marine Role", "marineRole"]), marineRoles, "OTHER"),
          emailStatus: enumValue(read(row, ["Email Status", "emailStatus"]), emailStatuses, "UNKNOWN"),
          workspaceId,
          source: "CSV_IMPORT",
        },
      });
    } catch (error) {
      errors.push({ row: rowNumber, message: error instanceof Error ? error.message : "Unable to import contact row" });
      continue;
    }

    if (existing) updated += 1;
    else created += 1;

    if ((index + 1) % 25 === 0 || index === rows.length - 1) {
      emitWorkspaceEvent(workspaceId, "import:progress", {
        processed: index + 1,
        total: rows.length,
        created,
        updated,
        errors: errors.length,
      });
    }
  }

  return { created, updated, errors };
}

const etaConfidences = new Set<ETAConfidence>(["CONFIRMED", "ESTIMATED", "TENTATIVE"]);

async function importVesselEtaRows(rows: CsvRow[], workspaceId: string) {
  let created = 0;
  let cargoMatches = 0;
  let portMatches = 0;
  let suggestions = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const imoNumber = read(row, ["IMO Number", "IMO", "imoNumber"]);
    if (!imoNumber || !/^\d{7}$/.test(imoNumber)) {
      errors.push({ row: rowNumber, message: "IMO Number must be exactly 7 digits" });
      continue;
    }
    const vessel = await prisma.vessel.findFirst({ where: { imoNumber, workspaceId } });
    if (!vessel) {
      errors.push({ row: rowNumber, message: `Vessel ${imoNumber} not found in workspace` });
      continue;
    }
    const destinationPortRaw = read(row, ["Destination Port", "Port", "destinationPort"]);
    if (!destinationPortRaw) {
      errors.push({ row: rowNumber, message: "Destination Port is required" });
      continue;
    }
    const destinationPort = await ensureDestinationPort(destinationPortRaw);
    if (!destinationPort) {
      errors.push({ row: rowNumber, message: "Destination Port must contain letters or numbers" });
      continue;
    }
    const etaStr = read(row, ["ETA (UTC)", "ETA UTC", "ETA", "eta"]);
    if (!etaStr) {
      errors.push({ row: rowNumber, message: "ETA is required" });
      continue;
    }
    const etaDate = new Date(etaStr);
    if (Number.isNaN(etaDate.getTime())) {
      errors.push({ row: rowNumber, message: `Invalid ETA timestamp: ${etaStr}` });
      continue;
    }
    const previousCargo = read(row, ["Previous Cargo", "previousCargo"])?.toUpperCase() ?? null;
    const nextCargo = read(row, ["Next Cargo", "nextCargo"])?.toUpperCase() ?? null;
    const confidenceRaw = read(row, ["Confidence", "ETA Confidence"]);
    const confidence: ETAConfidence = confidenceRaw && etaConfidences.has(confidenceRaw.toUpperCase() as ETAConfidence)
      ? (confidenceRaw.toUpperCase() as ETAConfidence)
      : "ESTIMATED";

    const eta = await prisma.vesselETA.create({
      data: {
        vesselId: vessel.id,
        destinationPort: destinationPort.portCode,
        destinationPortName: destinationPort.portName,
        eta: etaDate,
        etaSource: "CSV_IMPORT",
        etaConfidence: confidence,
        previousPort: read(row, ["Previous Port", "previousPort"])?.toUpperCase() ?? undefined,
        previousCargo: previousCargo ?? undefined,
        nextCargo: nextCargo ?? undefined,
        workspaceId,
      },
    });
    created += 1;
    if (previousCargo && nextCargo && previousCargo !== nextCargo) cargoMatches += 1;

    const matches = await matchCampaignsToETA(eta.id);
    if (matches.length > 0) {
      const autoIds = matches.filter((m) => m.autoEnroll).map((m) => m.campaignId);
      if (autoIds.length > 0) await createETATriggers(eta.id, autoIds);
      suggestions += matches.length;
      portMatches += matches.filter((m) => m.ruleType === "PORT").length;
    }

    if ((index + 1) % 25 === 0 || index === rows.length - 1) {
      emitWorkspaceEvent(workspaceId, "import:progress", {
        processed: index + 1,
        total: rows.length,
        created,
        suggestions,
        errors: errors.length,
      });
    }
  }

  return { created, cargoMatches, portMatches, suggestions, errors };
}

export async function processCsvImport(
  input: { importType: ImportType; csv: string; mapping?: Record<string, string> },
  workspaceId: string,
  userId: string,
) {
  const preview = await buildImportPreview(input, workspaceId);

  if (!preview.canImport) {
    // canImport is now false only when required COLUMNS aren't mapped, or when
    // every row would be skipped (nothing importable). Rows with missing/invalid
    // values no longer block — the importers skip them.
    const reason =
      preview.missingRequiredFields.length > 0
        ? `Map the required column(s) first: ${preview.missingRequiredFields.join(", ")}.`
        : "No importable rows — every row is missing a required value (e.g. Vessel Name or IMO).";
    const error = new Error(reason);
    (error as Error & { preview?: typeof preview }).preview = preview;
    throw error;
  }

  const rows = preview.normalizedRows;
  emitWorkspaceEvent(workspaceId, "import:started", { total: rows.length });
  const result =
    input.importType === "VESSELS"
      ? await importVesselRows(rows, workspaceId)
      : input.importType === "CONTACTS"
        ? await importContactRows(rows, workspaceId, userId)
        : input.importType === "VESSEL_ETAS"
          ? await importVesselEtaRows(rows, workspaceId)
          : input.importType === "MARINE_DATA_ROWS"
            ? await importMarineDataRows(rows, workspaceId)
            : await importCompanyRows(rows, workspaceId, input.importType);
  emitWorkspaceEvent(workspaceId, "import:complete", result);

  return result;
}

importRouter.post("/preview", requireAuth, async (req, res, next) => {
  try {
    const input = importSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId } = (req as AuthedRequest).auth;
    let preview: Awaited<ReturnType<typeof buildImportPreview>>;
    try {
      preview = await buildImportPreview(input.data, workspaceId);
    } catch (error) {
      return sendError(res, 400, "INVALID_CSV", error instanceof Error ? error.message : "Unable to parse CSV");
    }

    return sendData(res, preview);
  } catch (error) {
    return next(error);
  }
});

importRouter.post("/csv", requireAuth, async (req, res, next) => {
  try {
    const input = importSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId, userId } = (req as AuthedRequest).auth;
    let preview: Awaited<ReturnType<typeof buildImportPreview>>;
    try {
      preview = await buildImportPreview(input.data, workspaceId);
    } catch (error) {
      return sendError(res, 400, "INVALID_CSV", error instanceof Error ? error.message : "Unable to parse CSV");
    }

    if (!preview.canImport) {
      return res.status(400).json({
        error: {
          code: "IMPORT_PREVIEW_REQUIRED",
          message: preview.missingRequiredFields.length > 0 ? `Map the required column(s) first: ${preview.missingRequiredFields.join(", ")}.` : "No importable rows — every row is missing a required value (e.g. Vessel Name or IMO).",
          details: preview,
        },
      });
    }

    const result = await processCsvImport(input.data, workspaceId, userId);

    return sendData(res, result);
  } catch (error) {
    return next(error);
  }
});

importRouter.post("/csv/jobs", requireAuth, async (req, res, next) => {
  try {
    const input = importSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId, userId } = (req as AuthedRequest).auth;
    let preview: Awaited<ReturnType<typeof buildImportPreview>>;
    try {
      preview = await buildImportPreview(input.data, workspaceId);
    } catch (error) {
      return sendError(res, 400, "INVALID_CSV", error instanceof Error ? error.message : "Unable to parse CSV");
    }

    if (!preview.canImport) {
      return res.status(400).json({
        error: {
          code: "IMPORT_PREVIEW_REQUIRED",
          message: preview.missingRequiredFields.length > 0 ? `Map the required column(s) first: ${preview.missingRequiredFields.join(", ")}.` : "No importable rows — every row is missing a required value (e.g. Vessel Name or IMO).",
          details: preview,
        },
      });
    }

    const job = await enqueueCsvImport({ ...input.data, workspaceId, userId });
    if (!job) {
      const result = await processCsvImport(input.data, workspaceId, userId);
      return sendData(res, { mode: "sync", result });
    }

    emitWorkspaceEvent(workspaceId, "import:queued", {
      jobId: job.id,
      importType: input.data.importType,
      total: preview.rowCount,
    });
    return sendData(res, {
      mode: "queued",
      jobId: job.id,
      status: "queued",
      rowCount: preview.rowCount,
    });
  } catch (error) {
    return next(error);
  }
});

importRouter.get("/csv/jobs/:jobId", requireAuth, async (req, res, next) => {
  try {
    const job = await getCsvImportJob(req.params.jobId);
    if (!job) {
      return sendError(res, 404, "IMPORT_JOB_NOT_FOUND", "Import job was not found.");
    }

    const { workspaceId } = (req as AuthedRequest).auth;
    if (job.data.workspaceId !== workspaceId) {
      return sendError(res, 404, "IMPORT_JOB_NOT_FOUND", "Import job was not found.");
    }

    const state = await job.getState();
    const progress = job.progress;
    const failedReason = job.failedReason;
    const result = job.returnvalue;
    return sendData(res, {
      jobId: job.id,
      status: state,
      progress,
      failedReason,
      result,
    });
  } catch (error) {
    return next(error);
  }
});

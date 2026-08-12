import { parse } from "csv-parse/sync";
import { Router } from "express";
import { z } from "zod";
import { MARINE_DATA_ROW_FIELDS } from "@marimail/types";
import { extractWebsiteDomains, normalizeWebsiteDomain } from "@marimail/utils";
import type { EmailStatus, ETAConfidence, MarineRole, Seniority } from "@marimail/db";
import { Prisma, prisma } from "@marimail/db";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { emitWorkspaceEvent } from "../services/realtime.js";
import { createETATriggers, matchCampaignsToETA } from "../services/campaign-matcher.js";
import { CONTACT_CSV_HEADERS, contactDataFromRow } from "../services/contact-data.js";
import {
  enqueueCsvImport,
  getCsvImportJob,
  getCsvImportQueue,
  listCsvImportJobs,
  requeueStalledCsvImports,
  retryCsvImport,
} from "../services/csv-import-queue.js";
import { ensureDestinationPort, isResolvableDestination } from "../services/port-resolution.js";
import {
  normalizeImoNumber,
  readVesselCsvValue,
  VESSEL_CSV_HEADERS,
  vesselDataFromCsvRow,
} from "../services/vessel-data.js";

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
  country: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => value === "" || /^[A-Z]{2}$/.test(value), "Country must be an ISO 2-letter code")
    .optional(),
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

async function validateMappedRows(importType: ImportType, rows: CsvRow[], fields: ReturnType<typeof buildHeaderMatches>["fields"], _workspaceId: string) {
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
      } else {
        const check = normalizeImoNumber(imo);
        if ("problem" in check) {
          errors.push({ row: rowNumber, field: "IMO", value: imo, message: check.problem });
        }
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
      // Vessels are global — look up across the whole table, not the caller's
      // workspace. Otherwise the ETA preview would flag every WADI/TAILWIND
      // row as "vessel not found" for anyone but the workspace that first
      // imported the vessel.
      const found = await prisma.vessel.findMany({
        where: { imoNumber: { in: Array.from(new Set(validImos)) } },
        select: { imoNumber: true },
      });
      for (const v of found) existingImos.add(v.imoNumber);
    }

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
      const imo = rowValue(row, "IMO");
      const imoCheck = imo ? normalizeImoNumber(imo) : null;
      if (imoCheck && "problem" in imoCheck) {
        errors.push({ row: rowNumber, field: "IMO", value: imo, message: imoCheck.problem });
      } else if (imoCheck && !existingImos.has(imoCheck.imo)) {
        errors.push({ row: rowNumber, field: "IMO", value: imo, message: `Vessel ${imoCheck.imo} is not in the database — import a vessels CSV first` });
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

/**
 * Bulk-resolves company names to ids for one company kind.
 *
 * Replaces `findOrCreateCompany`, which ran per row and — through
 * `backfillContactsForCompanyWebsite` → `resolveCompanyByNormalizedDomain` —
 * issued THREE unbounded company `findMany`s and one unbounded contact
 * `findMany` on every single call, up to three times per row. On this dataset
 * (14,777 ship-owner companies, 7,536 contacts with a website) a 500-row
 * import pulled tens of millions of rows out of Neon and took ~46 minutes.
 *
 * This resolves every distinct name in the file with a fixed number of
 * queries instead: one read, one createMany, one read-back, plus one update
 * per company that actually has new detail to write.
 */
async function bulkResolveCompanies(
  kind: CompanyImportKind,
  workspaceId: string,
  wanted: Map<string, CompanyDetails>,
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  const names = [...wanted.keys()];
  if (names.length === 0) return byName;

  // The three delegates are generated with distinct argument types, so a union
  // of them isn't callable. Their shapes are identical for the three calls used
  // here, so one narrow structural cast keeps the logic shared rather than
  // triplicated.
  const delegate = (
    kind === "shipOwner"
      ? prisma.shipOwnerCompany
      : kind === "ismManager"
        ? prisma.iSMManagerCompany
        : prisma.commercialManagerCompany
  ) as unknown as CompanyDelegate;

  const existing = await delegate.findMany({
    where: { workspaceId, companyName: { in: names } },
    select: { id: true, companyName: true },
  });
  for (const row of existing) byName.set(row.companyName, row.id);

  const missing = names.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    await delegate.createMany({
      data: missing.map((companyName) => ({
        companyName,
        ...cleanCompanyDetails(wanted.get(companyName)),
        workspaceId,
      })),
      // Concurrent imports could have created the same name between our read
      // and this write. Skipping is correct — the read-back picks it up.
      skipDuplicates: true,
    });
    const created = await delegate.findMany({
      where: { workspaceId, companyName: { in: missing } },
      select: { id: true, companyName: true },
    });
    for (const row of created) byName.set(row.companyName, row.id);
  }

  // Refresh detail on companies that already existed. Only rows that actually
  // carry new values are touched, so a re-import of unchanged data is free.
  const updates = existing
    .map((row) => ({ id: row.id, data: cleanCompanyDetails(wanted.get(row.companyName)) }))
    .filter((u) => Object.keys(u.data).length > 0);
  await runBatched(updates, (u) => delegate.update({ where: { id: u.id }, data: u.data }));

  return byName;
}

type CompanyRow = { id: string; companyName: string };

/** The slice of a Prisma company delegate `bulkResolveCompanies` actually uses. */
type CompanyDelegate = {
  findMany(args: {
    where: { workspaceId: string; companyName: { in: string[] } };
    select: { id: true; companyName: true };
  }): Promise<CompanyRow[]>;
  createMany(args: {
    data: Array<Record<string, unknown>>;
    skipDuplicates: boolean;
  }): Promise<{ count: number }>;
  update(args: { where: { id: string }; data: CompanyDetails }): Promise<unknown>;
};

type CompanyDetails = {
  email?: string;
  phone?: string;
  website?: string;
  city?: string;
  country?: string;
};

function cleanCompanyDetails(details: CompanyDetails | undefined) {
  if (!details) return {};
  return Object.fromEntries(
    Object.entries({
      email: details.email,
      phone: details.phone,
      website: normalizeWebsiteForStorage(details.website),
      city: details.city,
      country: details.country,
    }).filter(([, value]) => value !== undefined),
  ) as CompanyDetails;
}

/**
 * Runs `fn` over `items` with bounded concurrency.
 *
 * Prisma has no bulk-update-with-different-values, so per-row updates are
 * unavoidable — but they don't have to be strictly sequential. The window is
 * deliberately below Prisma's default connection-pool size: going wider would
 * queue behind the pool and start tripping `pool_timeout` rather than going
 * faster.
 */
async function runBatched<T>(items: T[], fn: (item: T) => Promise<unknown>, size = 10) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

/**
 * True when `error` is a Postgres unique-constraint violation on `field`.
 *
 * Prisma reports these as P2002 with the offending columns in
 * `meta.target`, which is a string[] on Postgres but has been a plain string
 * on other providers — both shapes are handled so this can't silently stop
 * matching.
 */
function isUniqueConstraintError(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === "string") return target.includes(field);
  return false;
}

/**
 * Links contacts to the company that owns their web domain, for a whole set of
 * domains at once.
 *
 * The per-company version of this ran inside `findOrCreateCompany` — up to
 * three times per imported row — and each call re-read every company and every
 * contact in the workspace. This reads each table once for the entire import
 * regardless of how many companies it touched.
 */
async function backfillContactsForDomains(workspaceId: string, domains: Set<string>) {
  if (domains.size === 0) return 0;

  const [shipOwners, commercialManagers, ismManagers, contacts] = await Promise.all([
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
    prisma.contact.findMany({
      where: { workspaceId, website: { not: null } },
      select: { id: true, website: true },
    }),
  ]);

  // domain -> company, resolved once. Ship owner wins, then commercial
  // manager, then ISM manager — the same precedence the per-call version used.
  const companyByDomain = new Map<string, { companyId: string; companyKind: ContactCompanyKind; companyName: string }>();
  const index = (
    rows: Array<{ id: string; companyName: string; website: string | null }>,
    companyKind: ContactCompanyKind,
  ) => {
    for (const row of rows) {
      for (const domain of extractWebsiteDomains(row.website)) {
        if (!domains.has(domain) || companyByDomain.has(domain)) continue;
        companyByDomain.set(domain, { companyId: row.id, companyKind, companyName: row.companyName });
      }
    }
  };
  index(shipOwners, "SHIP_OWNER");
  index(commercialManagers, "COMMERCIAL_MANAGER");
  index(ismManagers, "ISM_MANAGER");
  if (companyByDomain.size === 0) return 0;

  const updates: Array<{ id: string; data: { companyId: string; companyKind: ContactCompanyKind; companyName: string } }> = [];
  for (const contact of contacts) {
    for (const domain of extractWebsiteDomains(contact.website)) {
      const company = companyByDomain.get(domain);
      if (company) {
        updates.push({ id: contact.id, data: company });
        break;
      }
    }
  }

  await runBatched(updates, (u) => prisma.contact.update({ where: { id: u.id }, data: u.data }));
  return updates.length;
}

async function importVesselRows(
  rows: CsvRow[],
  workspaceId: string,
  onProgress?: ProgressFn,
  defaultCountry?: string,
) {
  const applyDefaultCountry = <T extends { flag?: string | null }>(data: T) =>
    defaultCountry && !data.flag ? { ...data, flag: defaultCountry } : data;
  let created = 0;
  let updated = 0;
  const errors: Array<{ row: number; message: string }> = [];

  // ---- Phase 1: parse every row up front. No I/O. -------------------------
  type Parsed = {
    rowNumber: number;
    imoNumber: string;
    vesselName: string;
    data: ReturnType<typeof vesselDataFromCsvRow>;
    /** The source row, kept so detail columns can be read in phase 2. */
    row: CsvRow;
    shipOwnerName?: string;
    ismManagerName?: string;
    commercialManagerName?: string;
    etaRaw?: string;
  };

  const parsed: Parsed[] = [];
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    try {
      const data = vesselDataFromCsvRow(row);
      const imoResult = normalizeImoNumber(data.imoNumber);
      if ("problem" in imoResult) {
        errors.push({ row: rowNumber, message: imoResult.problem });
        continue;
      }
      const imoNumber = imoResult.imo;
      // A spreadsheet-mangled value may have been repaired above; make sure the
      // record written to the database carries the corrected number.
      data.imoNumber = imoNumber;
      parsed.push({
        rowNumber,
        imoNumber,
        // Required by the schema but optional in the CSV — fall back to the IMO
        // so an IMO-only row still imports and can be renamed later.
        vesselName: data.vesselName || `IMO ${imoNumber}`,
        data,
        shipOwnerName:
          readVesselCsvValue(row, "Ship Owner") ??
          data.registeredOwnerName ??
          data.beneficialOwnerName,
        ismManagerName: data.ismManagerName ?? readVesselCsvValue(row, "ISM Manager"),
        commercialManagerName:
          data.commercialManagerName ?? readVesselCsvValue(row, "Commercial Manager"),
        etaRaw: readVesselCsvValue(row, "ETA (UTC)"),
        row,
      });
    } catch (error) {
      errors.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : "Could not read this row",
      });
    }
  }

  if (parsed.length === 0) return { created, updated, errors };

  // Later rows win: a file listing the same IMO twice describes one vessel,
  // and the last mention is the most complete. Deduping here also stops two
  // rows racing each other through the write phase.
  const byImo = new Map<string, Parsed>();
  for (const p of parsed) byImo.set(p.imoNumber, p);
  const records = [...byImo.values()];

  onProgress?.(Math.floor(rows.length * 0.1));

  // ---- Phase 2: resolve every company with a fixed number of queries ------
  const owners = new Map<string, CompanyDetails>();
  const isms = new Map<string, CompanyDetails>();
  const commercials = new Map<string, CompanyDetails>();

  for (const r of records) {
    if (r.shipOwnerName) {
      owners.set(r.shipOwnerName, {
        email:
          readVesselCsvValue(r.row, "Ship Owner Email") ??
          r.data.registeredOwnerEmail ??
          r.data.beneficialOwnerEmail,
        phone: readVesselCsvValue(r.row, "Ship Owner Phone"),
        website: readVesselCsvValue(r.row, "Ship Owner Website"),
        city: r.data.registeredOwnerCity ?? r.data.beneficialOwnerCity,
        country:
          readVesselCsvValue(r.row, "Ship Owner Country") ??
          r.data.registeredOwnerCountry ??
          r.data.beneficialOwnerCountry,
      });
    }
    if (r.ismManagerName) {
      isms.set(r.ismManagerName, {
        email: r.data.ismManagerEmail,
        phone: readVesselCsvValue(r.row, "ISM Manager Phone"),
        website: readVesselCsvValue(r.row, "ISM Manager Website"),
        city: r.data.ismManagerCity,
        country: r.data.ismManagerCountry,
      });
    }
    if (r.commercialManagerName) {
      commercials.set(r.commercialManagerName, {
        email: r.data.commercialManagerEmail,
        phone: readVesselCsvValue(r.row, "Commercial Manager Phone"),
        website: readVesselCsvValue(r.row, "Commercial Manager Website"),
        city: r.data.commercialManagerCity,
        country: r.data.commercialManagerCountry,
      });
    }
  }

  const [ownerIds, ismIds, commercialIds] = await Promise.all([
    bulkResolveCompanies("shipOwner", workspaceId, owners),
    bulkResolveCompanies("ismManager", workspaceId, isms),
    bulkResolveCompanies("commercialManager", workspaceId, commercials),
  ]);

  onProgress?.(Math.floor(rows.length * 0.3));

  // ---- Phase 3: resolve MMSI conflicts in memory, before any write --------
  //
  // MMSI is UNIQUE on Vessel but, unlike IMO, is not permanent: flag states
  // reissue it when a ship re-flags, so a current CSV routinely carries a
  // number that still sits on a stale record under a different IMO. The old
  // code checked for this one row at a time, which left a window the batch
  // writes below would have widened. Resolving the whole file up front makes
  // the clash unrepresentable rather than merely unlikely.
  const wantedMmsi = new Map<string, Parsed>(); // mmsi -> the row that keeps it
  for (const r of records) {
    const mmsi = r.data.mmsi;
    if (!mmsi) continue;
    const prior = wantedMmsi.get(mmsi);
    if (prior) {
      // Two rows in the same file claiming one MMSI. Last wins; the earlier
      // row imports without it rather than failing.
      prior.data.mmsi = undefined;
      errors.push({
        row: prior.rowNumber,
        message: `MMSI ${mmsi} is also claimed by IMO ${r.imoNumber} later in this file; imported without it.`,
      });
    }
    wantedMmsi.set(mmsi, r);
  }

  const imos = records.map((r) => r.imoNumber);
  const mmsiList = [...wantedMmsi.keys()];

  const [existingVessels, mmsiHolders] = await Promise.all([
    prisma.vessel.findMany({
      where: { imoNumber: { in: imos } },
      select: { id: true, imoNumber: true },
    }),
    mmsiList.length
      ? prisma.vessel.findMany({
          where: { mmsi: { in: mmsiList } },
          select: { id: true, imoNumber: true, mmsi: true },
        })
      : Promise.resolve([] as Array<{ id: string; imoNumber: string; mmsi: string | null }>),
  ]);

  const existingByImo = new Map(existingVessels.map((v) => [v.imoNumber, v.id]));

  // Release MMSIs held by a DIFFERENT vessel than the one claiming it here.
  // IMO is the durable identity, so the incoming row wins.
  const toRelease = mmsiHolders.filter((holder) => {
    const claimant = holder.mmsi ? wantedMmsi.get(holder.mmsi) : undefined;
    return claimant && claimant.imoNumber !== holder.imoNumber;
  });
  if (toRelease.length > 0) {
    await prisma.vessel.updateMany({
      where: { id: { in: toRelease.map((h) => h.id) } },
      data: { mmsi: null },
    });
    for (const holder of toRelease) {
      const claimant = holder.mmsi ? wantedMmsi.get(holder.mmsi) : undefined;
      if (!claimant) continue;
      errors.push({
        row: claimant.rowNumber,
        message: `MMSI ${holder.mmsi} was registered to IMO ${holder.imoNumber}; reassigned to IMO ${claimant.imoNumber}.`,
      });
    }
  }

  onProgress?.(Math.floor(rows.length * 0.4));

  // ---- Phase 4: write vessels --------------------------------------------
  const vesselIdByImo = new Map(existingByImo);

  const toCreate = records.filter((r) => !existingByImo.has(r.imoNumber));
  const toUpdate = records.filter((r) => existingByImo.has(r.imoNumber));

  const companyLinks = (r: Parsed) => ({
    shipOwnerCompanyId: r.shipOwnerName ? (ownerIds.get(r.shipOwnerName) ?? null) : null,
    ismManagerCompanyId: r.ismManagerName ? (ismIds.get(r.ismManagerName) ?? null) : null,
    commercialManagerCompanyId: r.commercialManagerName
      ? (commercialIds.get(r.commercialManagerName) ?? null)
      : null,
  });

  if (toCreate.length > 0) {
    await prisma.vessel.createMany({
      data: toCreate.map((r) => ({
        ...applyDefaultCountry(r.data),
        imoNumber: r.imoNumber,
        vesselName: r.vesselName,
        ...companyLinks(r),
        // Vessels are global: created with workspaceId null so every workspace
        // sees them. Writing the importer's workspaceId would privatise a
        // shared record.
        workspaceId: null,
        source: "CSV_IMPORT" as const,
      })),
      skipDuplicates: true,
    });
    const fresh = await prisma.vessel.findMany({
      where: { imoNumber: { in: toCreate.map((r) => r.imoNumber) } },
      select: { id: true, imoNumber: true },
    });
    for (const v of fresh) vesselIdByImo.set(v.imoNumber, v.id);
    created = fresh.filter((v) => !existingByImo.has(v.imoNumber)).length;
  }

  await runBatched(toUpdate, async (r) => {
    try {
      await prisma.vessel.update({
        where: { imoNumber: r.imoNumber },
        data: { ...applyDefaultCountry(r.data), ...companyLinks(r), source: "CSV_IMPORT" },
      });
      updated += 1;
    } catch (error) {
      // Last-resort fallback. Phase 3 should have cleared every MMSI clash,
      // but a concurrent import could take one in between. Retrying without
      // the field imports the row rather than losing it — the MMSI is the one
      // value we can safely drop, since IMO is the identity.
      if (isUniqueConstraintError(error, "mmsi")) {
        const { mmsi: _dropped, ...withoutMmsi } = r.data;
        await prisma.vessel.update({
          where: { imoNumber: r.imoNumber },
          data: { ...applyDefaultCountry(withoutMmsi), ...companyLinks(r), source: "CSV_IMPORT" },
        });
        updated += 1;
        errors.push({
          row: r.rowNumber,
          message: `MMSI ${r.data.mmsi} was taken by another vessel; imported without it.`,
        });
        return;
      }
      errors.push({
        row: r.rowNumber,
        message: error instanceof Error ? error.message : "Could not import this row",
      });
    }
  });

  onProgress?.(Math.floor(rows.length * 0.7));

  // ---- Phase 5: ETAs ------------------------------------------------------
  const withEta = records.filter((r) => r.etaRaw);
  if (withEta.length > 0) {
    // One lookup per distinct destination instead of one per row.
    const portCache = new Map<string, { portCode: string; portName: string } | null>();
    const resolvePort = async (destination: string) => {
      if (!portCache.has(destination)) {
        // The batch country is passed so a destination missing from the registry
        // is filed under that country rather than "Unknown" — otherwise the row
        // imports fine and is then invisible to Port Radar's country filter.
        portCache.set(destination, await ensureDestinationPort(destination, defaultCountry));
      }
      return portCache.get(destination) ?? null;
    };

    for (const r of withEta) {
      const etaDate = new Date(r.etaRaw as string);
      if (Number.isNaN(etaDate.getTime())) {
        errors.push({ row: r.rowNumber, message: `Invalid ETA timestamp: ${r.etaRaw}` });
        continue;
      }
      if (!r.data.destination) {
        errors.push({ row: r.rowNumber, message: "Destination is required when ETA (UTC) is present" });
        continue;
      }
      const vesselId = vesselIdByImo.get(r.imoNumber);
      if (!vesselId) continue;

      try {
        const port = await resolvePort(r.data.destination);
        if (!port) {
          errors.push({ row: r.rowNumber, message: "Destination must contain letters or numbers" });
          continue;
        }
        // ONE current voyage per vessel.
        //
        // This used to key on (vessel, destinationPort), on the theory that a
        // new destination meant a new voyage worth its own row. In practice a
        // ship's declared destination changes constantly while it's under way —
        // re-routed, re-chartered, or simply corrected — and every upload that
        // carried a different port left the previous row behind. The radar then
        // listed the same ship two or three times, each with a stale ETA and no
        // way to tell which was current.
        //
        // An upload is a snapshot of where each ship is heading NOW, so the
        // vessel is the key: whatever we already hold for it gets overwritten,
        // port included. Any campaign trigger stays attached to that row and
        // therefore follows the voyage rather than pointing at an abandoned leg.
        const existingEta = await prisma.vesselETA.findFirst({
          where: { vesselId },
          orderBy: [{ eta: "desc" }, { createdAt: "desc" }],
          select: { id: true },
        });
        const etaFields = {
          destinationPort: port.portCode,
          destinationPortName: port.portName,
          eta: etaDate,
          etaSource: "CSV_IMPORT" as const,
          etaConfidence: "ESTIMATED" as const,
          workspaceId: null,
        };
        if (existingEta) {
          await prisma.vesselETA.update({ where: { id: existingEta.id }, data: etaFields });
        } else {
          await prisma.vesselETA.create({ data: { vesselId, ...etaFields } });
        }
      } catch (error) {
        errors.push({
          row: r.rowNumber,
          message: error instanceof Error ? error.message : "Unable to create ETA record",
        });
      }
    }
  }

  onProgress?.(Math.floor(rows.length * 0.9));

  // ---- Phase 6: link contacts to companies, ONCE for the whole file -------
  const domains = new Set<string>();
  for (const details of [...owners.values(), ...isms.values(), ...commercials.values()]) {
    const domain = extractWebsiteDomains(normalizeWebsiteForStorage(details.website))[0];
    if (domain) domains.add(domain);
  }
  try {
    await backfillContactsForDomains(workspaceId, domains);
  } catch (error) {
    // Cosmetic linkage — never worth failing an import over.
    console.error("[import] contact/company backfill failed:", error);
  }

  onProgress?.(rows.length - 1);
  emitWorkspaceEvent(workspaceId, "import:progress", {
    processed: rows.length,
    total: rows.length,
    created,
    updated,
    errors: errors.length,
  });

  return { created, updated, errors };
}

async function importMarineDataRows(rows: CsvRow[], workspaceId: string, onProgress?: ProgressFn) {
  let created = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (const [index, row] of rows.entries()) {
    onProgress?.(index);
    // Guarded per row: an unexpected throw here used to escape the loop
    // and fail the whole job, discarding every row already imported. A row
    // that cannot be imported is recorded and skipped instead.
    try {
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
    } catch (error) {
      errors.push({
        row: index + 2,
        message: error instanceof Error ? error.message : "Could not import this row",
      });
    }
  }

  return { created, updated: 0, errors };
}

type CompanyRef = { companyId: string | null; companyKind: ContactCompanyKind | "GENERIC"; companyName: string };

/**
 * Every company in the workspace, indexed by web domain and by name.
 *
 * Built ONCE per import. `resolveContactCompany` used to call
 * `resolveCompanyByNormalizedDomain` per row, which read all three company
 * tables (14,777 ship owners alone on this dataset) and linear-scanned them —
 * then issued three more `findFirst`s for the name fallback. A 500-contact
 * import therefore read ~2.2 million company rows to resolve 500 companies.
 *
 * The two precedence orders below are NOT the same, and both are deliberate:
 * they preserve exactly what the per-row version did.
 */
type CompanyLookup = {
  byDomain: Map<string, CompanyRef>;
  byName: Map<string, CompanyRef>;
};

async function buildCompanyLookup(workspaceId: string): Promise<CompanyLookup> {
  const select = { id: true, companyName: true, website: true } as const;
  const [shipOwners, commercialManagers, ismManagers] = await Promise.all([
    prisma.shipOwnerCompany.findMany({ where: { workspaceId }, select }),
    prisma.commercialManagerCompany.findMany({ where: { workspaceId }, select }),
    prisma.iSMManagerCompany.findMany({ where: { workspaceId }, select }),
  ]);

  const byDomain = new Map<string, CompanyRef>();
  const byName = new Map<string, CompanyRef>();

  const addDomains = (
    rows: Array<{ id: string; companyName: string; website: string | null }>,
    companyKind: ContactCompanyKind,
  ) => {
    for (const row of rows) {
      for (const domain of extractWebsiteDomains(row.website)) {
        if (byDomain.has(domain)) continue;
        byDomain.set(domain, { companyId: row.id, companyKind, companyName: row.companyName });
      }
    }
  };
  const addNames = (
    rows: Array<{ id: string; companyName: string }>,
    companyKind: ContactCompanyKind,
  ) => {
    for (const row of rows) {
      if (byName.has(row.companyName)) continue;
      byName.set(row.companyName, { companyId: row.id, companyKind, companyName: row.companyName });
    }
  };

  // Domain precedence: ship owner, then commercial manager, then ISM manager.
  addDomains(shipOwners, "SHIP_OWNER");
  addDomains(commercialManagers, "COMMERCIAL_MANAGER");
  addDomains(ismManagers, "ISM_MANAGER");

  // Name precedence: ship owner, then ISM manager, then commercial manager.
  addNames(shipOwners, "SHIP_OWNER");
  addNames(ismManagers, "ISM_MANAGER");
  addNames(commercialManagers, "COMMERCIAL_MANAGER");

  return { byDomain, byName };
}

async function resolveContactCompany(row: CsvRow, workspaceId: string, lookup: CompanyLookup): Promise<CompanyRef> {
  for (const domain of extractWebsiteDomains(read(row, ["Website", "Company Website"]))) {
    const match = lookup.byDomain.get(domain);
    if (match) return match;
  }

  const companyName = read(row, ["Company", "Company Name", "companyName"]);
  if (!companyName) {
    return { companyId: null, companyKind: "GENERIC" as const, companyName: "Unknown Company" };
  }

  const named = lookup.byName.get(companyName);
  if (named) return named;

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

  const ref: CompanyRef = {
    companyId: created.id,
    companyKind: "SHIP_OWNER" as const,
    companyName: created.companyName,
  };
  // Register it so later rows in the same file reuse it rather than creating a
  // duplicate — the per-row version re-queried and found it, this one must be
  // told.
  lookup.byName.set(created.companyName, ref);
  for (const domain of extractWebsiteDomains(created.website)) {
    if (!lookup.byDomain.has(domain)) lookup.byDomain.set(domain, ref);
  }
  return ref;
}

async function importCompanyRows(rows: CsvRow[], workspaceId: string, importType: ImportType, onProgress?: ProgressFn) {
  let created = 0;
  let updated = 0;
  const errors: Array<{ row: number; message: string }> = [];
  const touchedDomains = new Set<string>();

  for (const [index, row] of rows.entries()) {
    onProgress?.(index);
    // Guarded per row: an unexpected throw here used to escape the loop
    // and fail the whole job, discarding every row already imported. A row
    // that cannot be imported is recorded and skipped instead.
    try {
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

      // Domains are collected and linked once after the loop. Running the
      // backfill per row re-read every company and every contact in the
      // workspace on each iteration — the same blowup that made vessel
      // imports take 46 minutes.
      const domain = extractWebsiteDomains(data.website)[0];
      if (domain) touchedDomains.add(domain);

      if ((index + 1) % 25 === 0 || index === rows.length - 1) {
        emitWorkspaceEvent(workspaceId, "import:progress", {
          processed: index + 1,
          total: rows.length,
          created,
          updated,
          errors: errors.length,
        });
      }
    } catch (error) {
      errors.push({
        row: index + 2,
        message: error instanceof Error ? error.message : "Could not import this row",
      });
    }
  }

  try {
    await backfillContactsForDomains(workspaceId, touchedDomains);
  } catch (error) {
    // Cosmetic linkage — never worth failing an import over.
    console.error("[import] contact/company backfill failed:", error);
  }

  return { created, updated, errors };
}

async function importContactRows(rows: CsvRow[], workspaceId: string, userId: string, onProgress?: ProgressFn) {
  // Read every company once, up front. See `buildCompanyLookup`.
  const companyLookup = await buildCompanyLookup(workspaceId);
  let created = 0;
  let updated = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (const [index, row] of rows.entries()) {
    onProgress?.(index);
    // Guarded per row: an unexpected throw here used to escape the loop
    // and fail the whole job, discarding every row already imported. A row
    // that cannot be imported is recorded and skipped instead.
    try {
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

      const company = await resolveContactCompany(row, workspaceId, companyLookup);
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
    } catch (error) {
      errors.push({
        row: index + 2,
        message: error instanceof Error ? error.message : "Could not import this row",
      });
    }
  }

  return { created, updated, errors };
}

const etaConfidences = new Set<ETAConfidence>(["CONFIRMED", "ESTIMATED", "TENTATIVE"]);

async function importVesselEtaRows(rows: CsvRow[], workspaceId: string, onProgress?: ProgressFn) {
  let created = 0;
  let updated = 0;
  let cargoMatches = 0;
  let portMatches = 0;
  let suggestions = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (const [index, row] of rows.entries()) {
    onProgress?.(index);
    // Guarded per row: an unexpected throw here used to escape the loop
    // and fail the whole job, discarding every row already imported. A row
    // that cannot be imported is recorded and skipped instead.
    try {
      const rowNumber = index + 2;
      const imoResult = normalizeImoNumber(read(row, ["IMO Number", "IMO", "imoNumber"]));
      if ("problem" in imoResult) {
        errors.push({ row: rowNumber, message: imoResult.problem });
        continue;
      }
      const imoNumber = imoResult.imo;
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

      // One current voyage per vessel — see the note in importVesselRows. This
      // importer used to create unconditionally, so re-uploading a schedule
      // stacked a fresh row for every ship on every run.
      const etaData = {
        destinationPort: destinationPort.portCode,
        destinationPortName: destinationPort.portName,
        eta: etaDate,
        etaSource: "CSV_IMPORT" as const,
        etaConfidence: confidence,
        previousPort: read(row, ["Previous Port", "previousPort"])?.toUpperCase() ?? undefined,
        previousCargo: previousCargo ?? undefined,
        nextCargo: nextCargo ?? undefined,
        workspaceId,
      };
      const priorEta = await prisma.vesselETA.findFirst({
        where: { vesselId: vessel.id },
        orderBy: [{ eta: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      });
      const eta = priorEta
        ? await prisma.vesselETA.update({ where: { id: priorEta.id }, data: etaData })
        : await prisma.vesselETA.create({ data: { vesselId: vessel.id, ...etaData } });
      if (priorEta) updated += 1;
      else created += 1;
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
    } catch (error) {
      errors.push({
        row: index + 2,
        message: error instanceof Error ? error.message : "Could not import this row",
      });
    }
  }

  return { created, updated, cargoMatches, portMatches, suggestions, errors };
}

/** Called once per row with its zero-based index. */
export type ProgressFn = (rowIndex: number) => void;

/**
 * Wraps a raw progress sink in a throttle.
 *
 * The sink writes to Redis (`job.updateProgress`), and Upstash bills per
 * command — a 5,000-row import calling it per row would cost 5,000 writes on
 * its own. Emitting at most once per second and once per whole percent keeps it
 * to ~100 writes for any import size while still looking live on screen. The
 * final row always reports, so a finished job never shows 99%.
 */
function throttleProgress(
  total: number,
  sink: (done: number, total: number) => void,
): ProgressFn {
  let lastAt = 0;
  let lastPct = -1;
  return (rowIndex) => {
    const done = rowIndex + 1;
    const pct = total > 0 ? Math.floor((done / total) * 100) : 0;
    const now = Date.now();
    if (done < total && pct === lastPct && now - lastAt < 1_000) return;
    lastPct = pct;
    lastAt = now;
    sink(done, total);
  };
}

/**
 * Turns a raw driver error into something an operator can act on.
 *
 * A failed import used to surface the Prisma exception verbatim — e.g.
 * "Invalid `prisma.vessel.upsert()` invocation: Unique constraint failed on
 * the fields: (`mmsi`)" — which says nothing about which row, which vessel, or
 * what to do about it.
 */
function describeImportFailure(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const target = (error.meta as { target?: unknown } | undefined)?.target;
    const fields = Array.isArray(target) ? target.join(", ") : String(target ?? "");
    switch (error.code) {
      case "P2002":
        return `Two rows in this file share the same ${fields || "unique value"}, or it is already used by another record. The import stopped so nothing was overwritten.`;
      case "P2003":
        return "A row referenced a record that doesn't exist (foreign key). Check that companies and ports in this file are valid.";
      case "P2000":
        return `A value in column "${fields}" is too long for the database column.`;
      case "P2025":
        return "A record this import expected to find was deleted while it was running. Re-run the import.";
      default:
        return `Database error ${error.code}: ${error.message.split("\n").pop()?.trim() ?? error.message}`;
    }
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return "A row had a value the database rejected as the wrong type — check for text in a numeric column.";
  }
  if (error instanceof Error) {
    if (/timeout|ETIMEDOUT|ECONNRESET/i.test(error.message)) {
      return "The database connection timed out during this import. Re-run it — completed rows are not duplicated.";
    }
    return error.message;
  }
  return "The import failed for an unknown reason.";
}

export async function processCsvImport(
  input: { importType: ImportType; csv: string; mapping?: Record<string, string>; country?: string },
  workspaceId: string,
  userId: string,
  onProgress?: (done: number, total: number) => void,
) {
  const defaultCountry = input.country?.trim().toUpperCase() || undefined;
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
  const report = onProgress ? throttleProgress(rows.length, onProgress) : undefined;

  let result: { created: number; updated?: number; errors: Array<{ row: number; message: string }> };
  try {
    result =
      input.importType === "VESSELS"
        ? await importVesselRows(rows, workspaceId, report, defaultCountry)
        : input.importType === "CONTACTS"
          ? await importContactRows(rows, workspaceId, userId, report)
          : input.importType === "VESSEL_ETAS"
            ? await importVesselEtaRows(rows, workspaceId, report)
            : input.importType === "MARINE_DATA_ROWS"
              ? await importMarineDataRows(rows, workspaceId, report)
              : await importCompanyRows(rows, workspaceId, input.importType, report);
  } catch (error) {
    // Importers guard each row, so reaching here means a batch-level failure.
    // Rethrow with a message that names the actual problem — the raw Prisma
    // exception that used to land in `failedReason` told an operator nothing.
    throw new Error(describeImportFailure(error), { cause: error });
  }

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

/**
 * Every recent import for the caller's workspace, for the live status page.
 * Registered BEFORE `/csv/jobs/:jobId` so the literal path isn't swallowed by
 * the parameterised one.
 */
importRouter.get("/csv/jobs", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const jobs = await listCsvImportJobs(workspaceId);
    return sendData(res, { jobs, queueAvailable: getCsvImportQueue() !== null });
  } catch (error) {
    return next(error);
  }
});

/**
 * Manual escape hatch for a job wedged in `active` — the state a crashed or
 * paused worker leaves behind, which with `concurrency: 1` blocks every import
 * behind it. Safe to call at any time: the underlying remove refuses while a
 * worker still holds the job's lock, so a genuinely-running import cannot be
 * disturbed.
 */
importRouter.post("/csv/jobs/requeue-stalled", requireAuth, async (_req, res, next) => {
  try {
    const requeued = await requeueStalledCsvImports();
    return sendData(res, { requeued });
  } catch (error) {
    return next(error);
  }
});

/**
 * Re-runs a failed import from the CSV stored on the original job, so a job
 * that died partway through doesn't require finding and re-uploading the file.
 */
importRouter.post("/csv/jobs/:jobId/retry", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const outcome = await retryCsvImport(req.params.jobId, workspaceId);
    if (!outcome.ok) {
      return outcome.reason === "not-found"
        ? sendError(res, 404, "IMPORT_JOB_NOT_FOUND", "Import job was not found.")
        : sendError(
            res,
            400,
            "IMPORT_JOB_NOT_FAILED",
            "Only a failed import can be retried.",
          );
    }
    return sendData(res, { jobId: outcome.jobId });
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

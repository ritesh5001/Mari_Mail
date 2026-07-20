#!/usr/bin/env tsx
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { extractWebsiteDomains, normalizeCompanyName } from "../packages/utils/src/index";

type CsvRow = Record<string, string | undefined>;
type CompanyKind = "shipOwner" | "ismManager" | "commercialManager";
type CompanyRecord = {
  id: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  workspaceId: string | null;
};
type CompanyDetails = {
  companyName: string;
  email?: string;
  phone?: string;
  website?: string;
  country?: string;
  city?: string;
};

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--write");
const csvArg = process.argv.find((arg) => arg.startsWith("--csv="));
const defaultCsvPath = ["All_Country_Ship_Details_Compiled.csv", "../All_Country_Ship_Details_Compiled.csv"]
  .map((candidate) => path.resolve(process.cwd(), candidate))
  .find((candidate) => fs.existsSync(candidate));
const csvPath = path.resolve(process.cwd(), csvArg?.slice("--csv=".length) || defaultCsvPath || "All_Country_Ship_Details_Compiled.csv");

function parseCsv(content: string): CsvRow[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        currentField += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") index += 1;
      currentRow.push(currentField);
      if (currentRow.some((value) => value.trim())) rows.push(currentRow);
      currentRow = [];
      currentField = "";
      continue;
    }
    currentField += char;
  }
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((value) => value.trim())) rows.push(currentRow);
  }

  const headers = rows[0]?.map((header) => header.trim()) ?? [];
  return rows.slice(1).map((row) => {
    const record: CsvRow = {};
    headers.forEach((header, index) => {
      record[header] = row[index]?.trim();
    });
    return record;
  });
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || ["-", "n/a", "na", "none", "null"].includes(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

function read(row: CsvRow, field: string) {
  return cleanText(row[field]);
}

function normalizeWebsiteForStorage(value: string | null | undefined) {
  const domain = extractWebsiteDomains(value)[0];
  return domain ? `https://${domain}` : undefined;
}

function workspaceKey(workspaceId: string | null) {
  return workspaceId ?? "global";
}

function companyKey(workspaceId: string | null, value: string) {
  return `${workspaceKey(workspaceId)}:${value}`;
}

function companyNameKeyValue(value: string) {
  return normalizeCompanyName(value) ?? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function hasValue(value: string | null | undefined) {
  return Boolean(cleanText(value));
}

function mergeData(existing: CompanyRecord, details: CompanyDetails) {
  const data: Partial<CompanyDetails> = {};
  if (!hasValue(existing.email) && details.email) data.email = details.email;
  if (!hasValue(existing.phone) && details.phone) data.phone = details.phone;
  if (!hasValue(existing.website) && details.website) data.website = details.website;
  if (!hasValue(existing.country) && details.country) data.country = details.country;
  if (!hasValue(existing.city) && details.city) data.city = details.city;
  return data;
}

async function listCompanies(kind: CompanyKind): Promise<CompanyRecord[]> {
  const select = {
    id: true,
    companyName: true,
    email: true,
    phone: true,
    website: true,
    country: true,
    city: true,
    workspaceId: true,
  };
  if (kind === "shipOwner") return prisma.shipOwnerCompany.findMany({ select });
  if (kind === "ismManager") return prisma.iSMManagerCompany.findMany({ select });
  return prisma.commercialManagerCompany.findMany({ select });
}

async function createCompany(kind: CompanyKind, workspaceId: string | null, details: CompanyDetails) {
  const data = { ...details, workspaceId };
  if (kind === "shipOwner") return prisma.shipOwnerCompany.create({ data });
  if (kind === "ismManager") return prisma.iSMManagerCompany.create({ data });
  return prisma.commercialManagerCompany.create({ data });
}

async function updateCompany(kind: CompanyKind, id: string, data: Partial<CompanyDetails>) {
  if (kind === "shipOwner") return prisma.shipOwnerCompany.update({ where: { id }, data });
  if (kind === "ismManager") return prisma.iSMManagerCompany.update({ where: { id }, data });
  return prisma.commercialManagerCompany.update({ where: { id }, data });
}

function createCompanyBatch(kind: CompanyKind, data: Array<CompanyDetails & { id: string; workspaceId: string | null }>) {
  if (kind === "shipOwner") return prisma.shipOwnerCompany.createMany({ data, skipDuplicates: true });
  if (kind === "ismManager") return prisma.iSMManagerCompany.createMany({ data, skipDuplicates: true });
  return prisma.commercialManagerCompany.createMany({ data, skipDuplicates: true });
}

function updateCompanyOperation(kind: CompanyKind, id: string, data: Partial<CompanyDetails>) {
  if (kind === "shipOwner") return prisma.shipOwnerCompany.update({ where: { id }, data });
  if (kind === "ismManager") return prisma.iSMManagerCompany.update({ where: { id }, data });
  return prisma.commercialManagerCompany.update({ where: { id }, data });
}

async function runTransactions(label: string, operations: Prisma.PrismaPromise<unknown>[], chunkSize = 100) {
  for (let index = 0; index < operations.length; index += chunkSize) {
    const chunk = operations.slice(index, index + chunkSize);
    await prisma.$transaction(chunk);
    console.log(`${label}: ${Math.min(index + chunk.length, operations.length)}/${operations.length}`);
  }
}

function generatedId(kind: CompanyKind) {
  return `backfill_${kind}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function indexCompany(
  company: CompanyRecord,
  byName: Map<CompanyKind, Map<string, CompanyRecord>>,
  byDomain: Map<CompanyKind, Map<string, CompanyRecord>>,
  kind: CompanyKind,
) {
  const name = companyNameKeyValue(company.companyName);
  if (name) byName.get(kind)?.set(companyKey(company.workspaceId, name), company);
  for (const domain of extractWebsiteDomains(company.website)) {
    byDomain.get(kind)?.set(companyKey(company.workspaceId, domain), company);
  }
}

function companyDetailsFromRow(row: CsvRow, kind: CompanyKind): CompanyDetails | null {
  if (kind === "shipOwner") {
    const companyName = read(row, "Ship Owner");
    if (!companyName) return null;
    return {
      companyName,
      email: read(row, "Ship Owner Email"),
      phone: read(row, "Ship Owner Phone"),
      website: normalizeWebsiteForStorage(read(row, "Ship Owner Website")),
      country: read(row, "Ship Owner Country"),
    };
  }
  if (kind === "ismManager") {
    const companyName = read(row, "ISM Manager") ?? read(row, "Ism Manager");
    if (!companyName) return null;
    return {
      companyName,
      email: read(row, "ISM Manager Email") ?? read(row, "Ism Manager Email"),
      phone: read(row, "ISM Manager Phone") ?? read(row, "Ism Manager Phone"),
      website: normalizeWebsiteForStorage(read(row, "ISM Manager Website") ?? read(row, "Ism Manager Website")),
      country: read(row, "ISM Manager Country") ?? read(row, "Ism Manager Country"),
      city: read(row, "ISM Manager City") ?? read(row, "Ism Manager City"),
    };
  }
  const companyName = read(row, "Commercial Manager");
  if (!companyName) return null;
  return {
    companyName,
    email: read(row, "Commercial Manager Email"),
    phone: read(row, "Commercial Manager Phone"),
    website: normalizeWebsiteForStorage(read(row, "Commercial Manager Website")),
    country: read(row, "Commercial Manager Country"),
    city: read(row, "Commercial Manager City"),
  };
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const vessels = await prisma.vessel.findMany({
    select: {
      id: true,
      imoNumber: true,
      workspaceId: true,
      shipOwnerCompanyId: true,
      ismManagerCompanyId: true,
      commercialManagerCompanyId: true,
    },
  });
  const vesselByImo = new Map(vessels.map((vessel) => [vessel.imoNumber, vessel]));

  const byName = new Map<CompanyKind, Map<string, CompanyRecord>>([
    ["shipOwner", new Map()],
    ["ismManager", new Map()],
    ["commercialManager", new Map()],
  ]);
  const byDomain = new Map<CompanyKind, Map<string, CompanyRecord>>([
    ["shipOwner", new Map()],
    ["ismManager", new Map()],
    ["commercialManager", new Map()],
  ]);
  for (const kind of ["shipOwner", "ismManager", "commercialManager"] as const) {
    for (const company of await listCompanies(kind)) {
      indexCompany(company, byName, byDomain, kind);
    }
  }

  const stats = {
    dryRun,
    rows: rows.length,
    matchedVesselRows: 0,
    rowsWithAnyWebsite: 0,
    recoveredWebsiteDomains: new Set<string>(),
    companiesCreated: 0,
    companiesUpdated: 0,
    vesselLinksUpdated: 0,
    missingImoRows: 0,
  };

  const lastRowByImo = new Map<string, CsvRow>();
  for (const row of rows) {
    const imoNumber = read(row, "IMO") ?? read(row, "Imo");
    const vessel = imoNumber ? vesselByImo.get(imoNumber) : undefined;
    if (!vessel) {
      stats.missingImoRows += 1;
      continue;
    }
    stats.matchedVesselRows += 1;
    lastRowByImo.set(imoNumber, row);

    const websiteDomains = [
      ...extractWebsiteDomains(read(row, "Ship Owner Website")),
      ...extractWebsiteDomains(read(row, "Commercial Manager Website")),
      ...extractWebsiteDomains(read(row, "ISM Manager Website") ?? read(row, "Ism Manager Website")),
    ];
    if (websiteDomains.length > 0) stats.rowsWithAnyWebsite += 1;
    for (const domain of websiteDomains) stats.recoveredWebsiteDomains.add(domain);
  }

  const companyCreates: Record<CompanyKind, Array<CompanyDetails & { id: string; workspaceId: string | null }>> = {
    shipOwner: [],
    ismManager: [],
    commercialManager: [],
  };
  const companyUpdates: Record<CompanyKind, Array<{ id: string; data: Partial<CompanyDetails> }>> = {
    shipOwner: [],
    ismManager: [],
    commercialManager: [],
  };
  const vesselUpdates: Array<{
    id: string;
    field: "shipOwnerCompanyId" | "ismManagerCompanyId" | "commercialManagerCompanyId";
    companyId: string;
  }> = [];

  function findOrCreateCompany(kind: CompanyKind, workspaceId: string | null, details: CompanyDetails) {
  const name = companyNameKeyValue(details.companyName);
    const domains = extractWebsiteDomains(details.website);
    const domainMatch = domains.map((domain) => byDomain.get(kind)?.get(companyKey(workspaceId, domain))).find(Boolean);
    const nameMatch = name ? byName.get(kind)?.get(companyKey(workspaceId, name)) : undefined;
    const existing = domainMatch ?? nameMatch;

    if (existing) {
      const data = mergeData(existing, details);
      if (Object.keys(data).length > 0) {
        stats.companiesUpdated += 1;
        companyUpdates[kind].push({ id: existing.id, data });
        Object.assign(existing, data);
      }
      indexCompany(existing, byName, byDomain, kind);
      return existing;
    }

    stats.companiesCreated += 1;
    const created = { id: generatedId(kind), ...details, workspaceId };
    companyCreates[kind].push(created);
    indexCompany(created, byName, byDomain, kind);
    return created;
  }

  for (const row of lastRowByImo.values()) {
    const imoNumber = read(row, "IMO") ?? read(row, "Imo");
    const vessel = imoNumber ? vesselByImo.get(imoNumber) : undefined;
    if (!vessel) continue;

    for (const kind of ["shipOwner", "ismManager", "commercialManager"] as const) {
      const details = companyDetailsFromRow(row, kind);
      if (!details) continue;
      const company = await findOrCreateCompany(kind, vessel.workspaceId, details);
      const field =
        kind === "shipOwner"
          ? "shipOwnerCompanyId"
          : kind === "ismManager"
            ? "ismManagerCompanyId"
            : "commercialManagerCompanyId";
      if (vessel[field] !== company.id) {
        stats.vesselLinksUpdated += 1;
        vessel[field] = company.id;
        vesselUpdates.push({ id: vessel.id, field, companyId: company.id });
      }
    }
  }

  if (!dryRun) {
    for (const kind of ["shipOwner", "ismManager", "commercialManager"] as const) {
      for (let index = 0; index < companyCreates[kind].length; index += 1000) {
        const chunk = companyCreates[kind].slice(index, index + 1000);
        if (chunk.length === 0) continue;
        await createCompanyBatch(kind, chunk);
        console.log(`${kind} creates: ${Math.min(index + chunk.length, companyCreates[kind].length)}/${companyCreates[kind].length}`);
      }
    }

    for (const kind of ["shipOwner", "ismManager", "commercialManager"] as const) {
      await runTransactions(
        `${kind} updates`,
        companyUpdates[kind].map(({ id, data }) => updateCompanyOperation(kind, id, data)),
      );
    }

    const vesselUpdateFields = ["shipOwnerCompanyId", "ismManagerCompanyId", "commercialManagerCompanyId"] as const;
    for (const field of vesselUpdateFields) {
      const updates = vesselUpdates.filter((update) => update.field === field);
      const column = Prisma.raw(`"${field}"`);
      for (let index = 0; index < updates.length; index += 1000) {
        const chunk = updates.slice(index, index + 1000);
        if (chunk.length === 0) continue;
        const values = Prisma.join(chunk.map((update) => Prisma.sql`(${update.id}, ${update.companyId})`));
        await prisma.$executeRaw(
          Prisma.sql`UPDATE "Vessel" AS v SET ${column} = data.company_id FROM (VALUES ${values}) AS data(id, company_id) WHERE v.id = data.id`,
        );
        console.log(`${field} links: ${Math.min(index + chunk.length, updates.length)}/${updates.length}`);
      }
    }
  }

  console.log({
    ...stats,
    recoveredWebsiteDomains: stats.recoveredWebsiteDomains.size,
    csvPath,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { unstable_cache } from "next/cache";
import { Prisma, prisma } from "@marimail/db";
import { requireContactWorkspaceId } from "@/lib/contact-data";
import {
  associationSummaryFromMatches,
  associationVesselInclude,
  buildContactMatchIndex,
  candidateContactsForVessel,
  listAssociatedContactsForVessel,
  listContactsForVessels,
  workspaceScope,
  type AssociatedContactRow,
} from "@/lib/association-data";
import { buildVesselFilterClauses } from "@/lib/marine-data";
import { VESSEL_SCHEMA_FIELDS, vesselFieldValue } from "@/lib/vessel-schema";
import { matchVesselContacts, type MatchConfidence, type MatchedRole, type MatchSource, type VesselContactMatch } from "@/lib/vessel-contact-matcher";
import type {
  MarineVesselContactView,
  MarineVesselRowView,
} from "@/lib/marine-row-views";

export const VESSEL_PAGE_SIZE = 100;

const vesselInclude = {
  ...associationVesselInclude,
  etas: {
    where: { eta: { gte: new Date() } },
    orderBy: { eta: "asc" },
    take: 1,
    select: { eta: true, destinationPort: true, destinationPortName: true },
  },
} as const;

type MarineDbVessel = Prisma.VesselGetPayload<{ include: typeof vesselInclude }>;

export type MarineVesselRow = {
  vessel: MarineDbVessel;
  associatedContactCount: number;
  matchedValues: string[];
  matchedRoles: MatchedRole[];
  matchedSources: MatchSource[];
  matchConfidences: MatchConfidence[];
  matches: VesselContactMatch[];
};

export type MarineVesselPageSummary = {
  totalVessels: number;
  displayedVessels: number;
  totalContactsMatched: number;
  totalDomainsMatched: number;
};

export type MarineVesselPage = {
  rows: MarineVesselRow[];
  summary: MarineVesselPageSummary;
  pagination: { page: number; pageSize: number; totalPages: number; total: number };
  query: string;
};

export type MarineVesselContactRow = AssociatedContactRow;

export type MarineVesselContactsResult = {
  rows: MarineVesselContactRow[];
};

function buildQTextClause(q: string): Prisma.VesselWhereInput | null {
  if (!q) return null;
  const textMatch = { contains: q, mode: "insensitive" as const };
  return {
    OR: [
      { vesselName: textMatch },
      { imoNumber: textMatch },
      { flag: textMatch },
      { vesselTypeDetailed: textMatch },
      { commercialManagerName: textMatch },
      { ismManagerName: textMatch },
      { operatorName: textMatch },
      { registeredOwnerName: textMatch },
      { beneficialOwnerName: textMatch },
      { technicalManagerName: textMatch },
      { shipOwnerCompany: { companyName: textMatch } },
      { ismManagerCompany: { companyName: textMatch } },
      { commercialManagerCompany: { companyName: textMatch } },
    ],
  };
}

// Workspace-wide totals across the entire filtered dataset (not just the visible
// page). Loads vessels with the lite `vesselInclude` (no etas), builds match
// signals, runs ONE targeted contact query, then runs the matcher to count
// distinct contactIds and matchedValues. Tractable for ~100k vessels because the
// per-row projection is small.
async function computeMarineTotals(
  workspaceId: string,
  where: Prisma.VesselWhereInput,
): Promise<{ contactsMatched: number; matchValues: number }> {
  try {
    const vessels = await prisma.vessel.findMany({ where, include: vesselInclude });
    if (vessels.length === 0) return { contactsMatched: 0, matchValues: 0 };

    const contacts = await listContactsForVessels(workspaceId, vessels);
    if (contacts.length === 0) return { contactsMatched: 0, matchValues: 0 };

    const contactIndex = buildContactMatchIndex(contacts);
    const contactIds = new Set<string>();
    const matchedValues = new Set<string>();
    for (const vessel of vessels) {
      const matches = matchVesselContacts(candidateContactsForVessel(vessel, contactIndex), vessel);
      for (const m of matches) {
        contactIds.add(m.contactId);
        matchedValues.add(m.matchedValue);
      }
    }
    return { contactsMatched: contactIds.size, matchValues: matchedValues.size };
  } catch (err) {
    console.error("[marine-db] computeMarineTotals failed:", err);
    return { contactsMatched: 0, matchValues: 0 };
  }
}

export type ListMarineVesselsParams = {
  page?: number;
  q?: string;
  searchParams?: Record<string, string | string[] | undefined>;
};

export async function listMarineVesselRows(params: ListMarineVesselsParams = {}): Promise<MarineVesselPage> {
  const { workspaceId } = await requireContactWorkspaceId();
  return listMarineVesselRowsCached(workspaceId, params);
}

const listMarineVesselRowsCached = unstable_cache(
  async (workspaceId: string, params: ListMarineVesselsParams): Promise<MarineVesselPage> => {
    return listMarineVesselRowsImpl(workspaceId, params);
  },
  ["marine-vessel-rows"],
  { revalidate: 60, tags: ["marine-vessels"] },
);

async function listMarineVesselRowsImpl(
  workspaceId: string,
  params: ListMarineVesselsParams,
): Promise<MarineVesselPage> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const q = (params.q ?? "").trim();
  const filterClauses = params.searchParams ? buildVesselFilterClauses(params.searchParams) : [];
  const qClause = buildQTextClause(q);

  const where: Prisma.VesselWhereInput = {
    AND: [workspaceScope(workspaceId), ...filterClauses, ...(qClause ? [qClause] : [])],
  };

  const empty: MarineVesselPage = {
    rows: [],
    summary: { totalVessels: 0, displayedVessels: 0, totalContactsMatched: 0, totalDomainsMatched: 0 },
    pagination: { page, pageSize: VESSEL_PAGE_SIZE, totalPages: 0, total: 0 },
    query: q,
  };

  try {
    const total = await prisma.vessel.count({ where });
    if (total === 0) return empty;

    const totalPages = Math.max(1, Math.ceil(total / VESSEL_PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * VESSEL_PAGE_SIZE;

    const [vessels, totals] = await Promise.all([
      prisma.vessel.findMany({
        where,
        include: vesselInclude,
        orderBy: { vesselName: "asc" },
        skip,
        take: VESSEL_PAGE_SIZE,
      }),
      computeMarineTotals(workspaceId, where),
    ]);

    const contacts = await listContactsForVessels(workspaceId, vessels);
    const contactIndex = buildContactMatchIndex(contacts);

    const rows: MarineVesselRow[] = vessels.map((vessel) => {
      const matches = matchVesselContacts(candidateContactsForVessel(vessel, contactIndex), vessel);
      const summary = associationSummaryFromMatches(matches);
      return {
        vessel,
        ...summary,
        matches,
      };
    });

    return {
      rows,
      summary: {
        totalVessels: total,
        displayedVessels: rows.length,
        totalContactsMatched: totals.contactsMatched,
        totalDomainsMatched: totals.matchValues,
      },
      pagination: { page: safePage, pageSize: VESSEL_PAGE_SIZE, totalPages, total },
      query: q,
    };
  } catch (err) {
    console.error("[marine-db] listMarineVesselRows failed:", err);
    return empty;
  }
}

export async function listMarineVesselContacts(vesselId: string): Promise<MarineVesselContactsResult | null> {
  const { workspaceId } = await requireContactWorkspaceId();
  const rows = await listAssociatedContactsForVessel(workspaceId, vesselId);
  if (!rows) return null;
  return { rows };
}

export function toMarineVesselRowView(row: MarineVesselRow): MarineVesselRowView {
  const v = row.vessel;
  const schemaValues = Object.fromEntries(
    VESSEL_SCHEMA_FIELDS.map((field) => [field.label, vesselFieldValue(v, field)]),
  );

  return {
    vesselId: v.id,
    imoNumber: v.imoNumber ?? null,
    vesselName: v.vesselName ?? "(unnamed vessel)",
    schemaValues,
    associatedContactCount: row.associatedContactCount,
    matchedValues: row.matchedValues,
    matchedRoles: row.matchedRoles,
    matchedSources: row.matchedSources,
    matchConfidences: row.matchConfidences,
  };
}

export function toMarineVesselContactView(row: MarineVesselContactRow): MarineVesselContactView {
  const c = row.contact;
  const fullName =
    [c.firstName, c.lastName].filter((p): p is string => Boolean(p)).join(" ").trim() ||
    c.email ||
    "(no name)";
  return {
    contactId: c.id,
    fullName,
    email: c.email ?? null,
    companyName: c.companyName ?? null,
    jobTitle: c.title ?? null,
    marineRole: c.marineRole ?? null,
    country: c.country ?? null,
    website: c.website ?? null,
    matchedValue: row.match.matchedValue,
    matchedSource: row.match.matchedSource,
    confidence: row.match.confidence,
    matchedCompanies: row.matchedCompanies.map((m) => ({
      companyName: m.companyName,
      role: m.role,
    })),
  };
}

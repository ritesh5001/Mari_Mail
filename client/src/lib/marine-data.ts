import { notFound } from "next/navigation";
import {
  Prisma,
  prisma,
  VesselType,
  VesselStatus,
  ETAConfidence,
  VoyageStatus,
} from "@marimail/db";
import { getServerSession } from "@/lib/api";
import { associationVesselInclude, countAssociatedContactsForVessels } from "@/lib/association-data";

type SearchParams = Record<string, string | string[] | undefined>;

/** Parse a comma-joined or repeated query param into a trimmed string list. */
function parseList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function str(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Build a Prisma numeric range filter from min/max query params. */
function rangeWhere(
  min: string | string[] | undefined,
  max: string | string[] | undefined,
): { gte?: number; lte?: number } | undefined {
  const lo = typeof min === "string" && min.trim() !== "" ? Number(min) : NaN;
  const hi = typeof max === "string" && max.trim() !== "" ? Number(max) : NaN;
  const filter: { gte?: number; lte?: number } = {};
  if (Number.isFinite(lo)) filter.gte = lo;
  if (Number.isFinite(hi)) filter.lte = hi;
  return Object.keys(filter).length ? filter : undefined;
}

const VESSEL_TYPE_VALUES = new Set<string>(Object.values(VesselType));
const VESSEL_STATUS_VALUES = new Set<string>(Object.values(VesselStatus));
const ETA_CONFIDENCE_VALUES = new Set<string>(Object.values(ETAConfidence));
const VOYAGE_STATUS_VALUES = new Set<string>(Object.values(VoyageStatus));

function parseBool(value: string | string[] | undefined): boolean {
  const v = str(value).toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function parseDate(value: string | string[] | undefined): Date | null {
  const v = str(value);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Structured vessel filter clauses (type, flag, status, ranges, owner/manager/operator)
 * shared by the Vessels page and the Marine DB page. The free-text `q` search and the
 * workspace scope are applied separately by each caller.
 */
export function buildVesselFilterClauses(searchParams: SearchParams): Prisma.VesselWhereInput[] {
  const clauses: Prisma.VesselWhereInput[] = [];

  const flags = parseList(searchParams.flag).map((f) => f.toUpperCase());
  if (flags.length) clauses.push({ flag: { in: flags } });

  const types = parseList(searchParams.vesselType).filter((t) => VESSEL_TYPE_VALUES.has(t));
  if (types.length) clauses.push({ vesselType: { in: types as VesselType[] } });

  const statuses = parseList(searchParams.status).filter((s) => VESSEL_STATUS_VALUES.has(s));
  if (statuses.length) clauses.push({ status: { in: statuses as VesselStatus[] } });

  const dwt = rangeWhere(searchParams.dwtMin, searchParams.dwtMax);
  if (dwt) clauses.push({ dwt });
  const gt = rangeWhere(searchParams.gtMin, searchParams.gtMax);
  if (gt) clauses.push({ grossTonnage: gt });
  const built = rangeWhere(searchParams.builtMin, searchParams.builtMax);
  if (built) clauses.push({ builtYear: built });
  const loa = rangeWhere(searchParams.loaMin, searchParams.loaMax);
  if (loa) clauses.push({ lengthOverall: loa });

  const owner = str(searchParams.owner);
  if (owner) {
    const m = { contains: owner, mode: "insensitive" as const };
    clauses.push({
      OR: [
        { registeredOwnerName: m },
        { beneficialOwnerName: m },
        { shipOwnerCompany: { companyName: m } },
      ],
    });
  }

  const manager = str(searchParams.manager);
  if (manager) {
    const m = { contains: manager, mode: "insensitive" as const };
    clauses.push({
      OR: [
        { ismManagerName: m },
        { commercialManagerName: m },
        { technicalManagerName: m },
      ],
    });
  }

  const operator = str(searchParams.operator);
  if (operator) clauses.push({ operatorName: { contains: operator, mode: "insensitive" } });

  // Identity — exact-ish match on AIS identifiers. MMSI / callsign are short
  // codes users copy-paste, so `contains` is closer to what they mean than
  // strict equality (a leading zero mis-paste still hits).
  const mmsi = str(searchParams.mmsi);
  if (mmsi) clauses.push({ mmsi: { contains: mmsi, mode: "insensitive" } });
  const callsign = str(searchParams.callsign);
  if (callsign) clauses.push({ callsign: { contains: callsign, mode: "insensitive" } });

  // Size / capacity — extra ranges beyond DWT/GT/Built/LOA already handled above.
  const netTonnage = rangeWhere(searchParams.netTonMin, searchParams.netTonMax);
  if (netTonnage) clauses.push({ netTonnage });
  const teu = rangeWhere(searchParams.teuMin, searchParams.teuMax);
  if (teu) clauses.push({ capacityTeu: teu });
  const beam = rangeWhere(searchParams.beamMin, searchParams.beamMax);
  if (beam) {
    // Beam is stored in two overlapping columns depending on source dataset.
    // Match either — the vessel is one physical ship, so a match on either
    // column is a real match.
    clauses.push({ OR: [{ width: beam }, { breadth: beam }] });
  }

  // AIS / position context — free-text on the fields Port Radar surfaces.
  const globalArea = str(searchParams.globalArea);
  if (globalArea) clauses.push({ globalArea: { contains: globalArea, mode: "insensitive" } });
  const navStatus = str(searchParams.navStatus);
  if (navStatus) clauses.push({ navigationalStatus: { contains: navStatus, mode: "insensitive" } });
  const currentPortCountry = str(searchParams.currentPortCountry);
  if (currentPortCountry) {
    clauses.push({ currentPortCountry: { contains: currentPortCountry, mode: "insensitive" } });
  }

  // Ownership / management — extra parties beyond the existing owner/manager
  // pair. Each is a free-text substring — same shape as `owner`/`manager`.
  const registeredOwner = str(searchParams.registeredOwner);
  if (registeredOwner) {
    clauses.push({ registeredOwnerName: { contains: registeredOwner, mode: "insensitive" } });
  }
  const beneficialOwner = str(searchParams.beneficialOwner);
  if (beneficialOwner) {
    clauses.push({ beneficialOwnerName: { contains: beneficialOwner, mode: "insensitive" } });
  }
  const technicalManager = str(searchParams.technicalManager);
  if (technicalManager) {
    clauses.push({ technicalManagerName: { contains: technicalManager, mode: "insensitive" } });
  }
  const pAndIClub = str(searchParams.pAndIClub);
  if (pAndIClub) clauses.push({ pAndIClubName: { contains: pAndIClub, mode: "insensitive" } });

  // Builders & class — free-text on the fields the classification / build data.
  const classSociety = str(searchParams.classSociety);
  if (classSociety) {
    clauses.push({ classSocietyName: { contains: classSociety, mode: "insensitive" } });
  }
  const shipBuilder = str(searchParams.shipBuilder);
  if (shipBuilder) {
    clauses.push({ shipBuilderName: { contains: shipBuilder, mode: "insensitive" } });
  }
  const engineBuilder = str(searchParams.engineBuilder);
  if (engineBuilder) {
    clauses.push({ engineBuilderName: { contains: engineBuilder, mode: "insensitive" } });
  }

  // --- ETA & voyage filters (applied to upcoming ETAs only) ---
  const now = new Date();
  const etaConditions: Prisma.VesselETAWhereInput[] = [{ eta: { gte: now } }];

  const etaFrom = parseDate(searchParams.etaFrom);
  const etaTo = parseDate(searchParams.etaTo);
  if (etaFrom || etaTo) {
    const range: { gte?: Date; lte?: Date } = { gte: etaFrom ?? now };
    if (etaTo) range.lte = etaTo;
    etaConditions[0] = { eta: range };
  }

  const destCountries = parseList(searchParams.destCountry)
    .map((c) => c.toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  if (destCountries.length) {
    etaConditions.push({ port: { is: { country: { in: destCountries } } } });
  }

  const destPorts = parseList(searchParams.destPort).map((p) => p.toUpperCase());
  if (destPorts.length) etaConditions.push({ destinationPort: { in: destPorts } });

  const etaConfidences = parseList(searchParams.etaConfidence).filter((c) => ETA_CONFIDENCE_VALUES.has(c));
  if (etaConfidences.length) {
    etaConditions.push({ etaConfidence: { in: etaConfidences as ETAConfidence[] } });
  }

  const voyageStatuses = parseList(searchParams.voyageStatus).filter((v) => VOYAGE_STATUS_VALUES.has(v));
  if (voyageStatuses.length) {
    etaConditions.push({ voyageStatus: { in: voyageStatuses as VoyageStatus[] } });
  }

  const hasEta = parseBool(searchParams.hasEta);
  const etaFilterActive =
    hasEta ||
    etaFrom !== null ||
    etaTo !== null ||
    destPorts.length > 0 ||
    destCountries.length > 0 ||
    etaConfidences.length > 0 ||
    voyageStatuses.length > 0;

  if (etaFilterActive) {
    clauses.push({ etas: { some: { AND: etaConditions } } });
  }

  // --- Cargo / commercial ---
  const market = str(searchParams.market);
  if (market) clauses.push({ commercialMarket: { contains: market, mode: "insensitive" } });

  const sizeClass = str(searchParams.sizeClass);
  if (sizeClass) clauses.push({ commercialSizeClass: { contains: sizeClass, mode: "insensitive" } });

  // --- Data quality ---
  if (parseBool(searchParams.verified)) clauses.push({ verified: true });
  if (parseBool(searchParams.hasMmsi)) clauses.push({ mmsi: { not: null } });
  if (parseBool(searchParams.hasEmail)) {
    clauses.push({
      OR: [
        { registeredOwnerEmail: { not: null } },
        { beneficialOwnerEmail: { not: null } },
        { commercialManagerEmail: { not: null } },
        { ismManagerEmail: { not: null } },
        { technicalManagerEmail: { not: null } },
        { operatorEmail: { not: null } },
        { shipOwnerCompany: { email: { not: null } } },
        { ismManagerCompany: { email: { not: null } } },
        { commercialManagerCompany: { email: { not: null } } },
      ],
    });
  }

  return clauses;
}

const vesselInclude = {
  ...associationVesselInclude,
} as const;

const vesselDetailInclude = {
  shipOwnerCompany: true,
  ismManagerCompany: true,
  commercialManagerCompany: true,
  etas: {
    orderBy: { eta: "desc" },
    include: {
      port: { select: { portCode: true, portName: true, region: true } },
      triggers: {
        select: {
          id: true,
          status: true,
          nextFireAt: true,
          campaign: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const satisfies Prisma.VesselInclude;

export type VesselWithCompanies = Prisma.VesselGetPayload<{ include: typeof vesselInclude }> & {
  associatedContactCount?: number;
  etas?: Array<{ eta: Date; destinationPort?: string | null; destinationPortName?: string | null }>;
  _count?: { etaTriggers: number };
};
export type VesselWithEtas = Prisma.VesselGetPayload<{ include: typeof vesselDetailInclude }>;

function scope(workspaceId: string): Prisma.VesselWhereInput {
  return {
    OR: [{ workspaceId }, { workspaceId: null }],
  };
}

function companyScope(workspaceId: string) {
  return {
    OR: [{ workspaceId }, { workspaceId: null }],
  };
}

export async function requireWorkspaceId() {
  const session = await getServerSession();
  if (!session?.activeWorkspace) {
    notFound();
  }
  return session.activeWorkspace.id;
}

async function requireWorkspaceContext() {
  const session = await getServerSession();
  if (!session?.activeWorkspace) {
    notFound();
  }
  return {
    workspaceId: session.activeWorkspace.id,
    targetPortCountry: session.activeWorkspace.targetPortCountry,
  };
}

export async function listVessels(searchParams: Record<string, string | string[] | undefined>) {
  const { workspaceId, targetPortCountry } = await requireWorkspaceContext();
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const textMatch = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const numericQuery = q && /^\d+(\.\d+)?$/.test(q) ? Number(q) : null;
  const intQuery = numericQuery !== null && Number.isInteger(numericQuery) ? numericQuery : null;
  // When the user picks countries in the filter panel, the filter takes
  // over from the workspace default — otherwise a Togo-default user
  // picking Singapore would AND both and get nothing.
  const filterCountries = parseList(searchParams.destCountry)
    .map((c) => c.toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  const targetCountryClause: Prisma.VesselWhereInput | null =
    filterCountries.length > 0
      ? null
      : targetPortCountry
        ? { etas: { some: { port: { is: { country: targetPortCountry } } } } }
        : null;

  const where: Prisma.VesselWhereInput = {
    AND: [
      scope(workspaceId),
      targetCountryClause ?? {},
      textMatch
        ? {
            OR: [
              { vesselName: textMatch },
              { imoNumber: textMatch },
              { mmsi: textMatch },
              { callsign: textMatch },
              { flag: textMatch },
              { globalArea: textMatch },
              { eni: textMatch },
              { navigationalStatus: textMatch },
              { destination: textMatch },
              { aisClass: textMatch },
              { yardNumber: textMatch },
              { vesselTypeDetailed: textMatch },
              { commercialMarket: textMatch },
              { commercialSizeClass: textMatch },
              { firstAisPositionDate: textMatch },
              { currentPortUnlocode: textMatch },
              { currentPortCountry: textMatch },
              { commercialManagerName: textMatch },
              { commercialManagerEmail: textMatch },
              { commercialManagerCity: textMatch },
              { commercialManagerCountry: textMatch },
              { registeredOwnerName: textMatch },
              { registeredOwnerEmail: textMatch },
              { registeredOwnerCity: textMatch },
              { registeredOwnerCountry: textMatch },
              { beneficialOwnerName: textMatch },
              { beneficialOwnerEmail: textMatch },
              { beneficialOwnerCity: textMatch },
              { beneficialOwnerCountry: textMatch },
              { technicalManagerName: textMatch },
              { technicalManagerEmail: textMatch },
              { technicalManagerCity: textMatch },
              { technicalManagerCountry: textMatch },
              { pAndIClubName: textMatch },
              { pAndIClubEmail: textMatch },
              { pAndIClubCity: textMatch },
              { pAndIClubCountry: textMatch },
              { shipBuilderName: textMatch },
              { shipBuilderEmail: textMatch },
              { shipBuilderCity: textMatch },
              { shipBuilderCountry: textMatch },
              { classSocietyName: textMatch },
              { classSocietyEmail: textMatch },
              { classSocietyCity: textMatch },
              { classSocietyCountry: textMatch },
              { engineBuilderName: textMatch },
              { engineBuilderEmail: textMatch },
              { engineBuilderCity: textMatch },
              { engineBuilderCountry: textMatch },
              { ismManagerName: textMatch },
              { ismManagerEmail: textMatch },
              { ismManagerCity: textMatch },
              { ismManagerCountry: textMatch },
              { operatorName: textMatch },
              { operatorEmail: textMatch },
              { operatorCity: textMatch },
              { operatorCountry: textMatch },
              { classificationSociety: textMatch },
              { shipOwnerCompany: { companyName: textMatch } },
              { shipOwnerCompany: { email: textMatch } },
              { shipOwnerCompany: { phone: textMatch } },
              { shipOwnerCompany: { website: textMatch } },
              { shipOwnerCompany: { country: textMatch } },
              { shipOwnerCompany: { city: textMatch } },
              { ismManagerCompany: { companyName: textMatch } },
              { ismManagerCompany: { email: textMatch } },
              { ismManagerCompany: { phone: textMatch } },
              { ismManagerCompany: { website: textMatch } },
              { ismManagerCompany: { country: textMatch } },
              { ismManagerCompany: { city: textMatch } },
              { commercialManagerCompany: { companyName: textMatch } },
              { commercialManagerCompany: { email: textMatch } },
              { commercialManagerCompany: { phone: textMatch } },
              { commercialManagerCompany: { website: textMatch } },
              { commercialManagerCompany: { country: textMatch } },
              { commercialManagerCompany: { city: textMatch } },
              ...(intQuery !== null
                ? [
                    { dwt: intQuery },
                    { grossTonnage: intQuery },
                    { netTonnage: intQuery },
                    { builtYear: intQuery },
                    { capacityDwt: intQuery },
                    { capacityGt: intQuery },
                    { capacityTeu: intQuery },
                    { capacityLiquidGas: intQuery },
                    { capacityPassengers: intQuery },
                    { capacityLiquidOil: intQuery },
                  ]
                : []),
              ...(numericQuery !== null
                ? [
                    { speed: numericQuery },
                    { course: numericQuery },
                    { draught: numericQuery },
                    { lengthOverall: numericQuery },
                    { breadth: numericQuery },
                    { width: numericQuery },
                    { draughtMax: numericQuery },
                    { draughtMin: numericQuery },
                    { lengthBetweenPerpendiculars: numericQuery },
                    { depth: numericQuery },
                    { breadthExtreme: numericQuery },
                    { draft: numericQuery },
                  ]
                : []),
            ],
          }
        : {},
      ...buildVesselFilterClauses(searchParams),
    ],
  };

  try {
    const now = new Date();
    const [vessels, count] = await Promise.all([
      prisma.vessel.findMany({
        where,
        include: {
          ...vesselInclude,
          etas: {
            where: { eta: { gte: now } },
            orderBy: { eta: "asc" },
            take: 1,
            select: { eta: true, destinationPort: true, destinationPortName: true },
          },
          _count: {
            select: { etaTriggers: true },
          },
        },
        orderBy: { vesselName: "asc" },
        take: 100,
      }),
      prisma.vessel.count({ where }),
    ]);
    const associationCounts = await countAssociatedContactsForVessels(workspaceId, vessels);
    return {
      vessels: vessels.map((vessel) => ({
        ...vessel,
        associatedContactCount: associationCounts.get(vessel.id) ?? 0,
      })),
      count,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[vessels] listVessels failed:", err);
    return { vessels: [] as VesselWithCompanies[], count: 0, error: message };
  }
}

export async function getVesselByImo(imo: string) {
  // Vessel detail is reference data — same visibility model as Port Radar,
  // which shows ETAs (and thus vessel names/IMOs) across every workspace.
  // Scoping the detail page to the current workspace only 404'd every vessel
  // clicked from Port Radar that happened to originate in a peer workspace.
  // Contacts shown on this page are still workspace-scoped separately.
  await requireWorkspaceId();
  const now = new Date();
  const vessel = await prisma.vessel.findFirst({
    where: { imoNumber: imo },
    include: {
      ...vesselDetailInclude,
      etas: {
        ...vesselDetailInclude.etas,
        where: { eta: { gte: now } },
        orderBy: { eta: "asc" },
      },
    },
  });

  if (!vessel) {
    notFound();
  }

  return vessel;
}

export async function getCompanyDetail(kind: "ship-owners" | "ism-managers" | "commercial-managers", id: string) {
  const workspaceId = await requireWorkspaceId();

  const company =
    kind === "ship-owners"
      ? await prisma.shipOwnerCompany.findFirst({ where: { id, ...companyScope(workspaceId) } })
      : kind === "ism-managers"
        ? await prisma.iSMManagerCompany.findFirst({ where: { id, ...companyScope(workspaceId) } })
        : await prisma.commercialManagerCompany.findFirst({ where: { id, ...companyScope(workspaceId) } });

  if (!company) {
    notFound();
  }

  const vessels = await prisma.vessel.findMany({
    where: {
      AND: [
        scope(workspaceId),
        kind === "ship-owners"
          ? { shipOwnerCompanyId: id }
          : kind === "ism-managers"
            ? { ismManagerCompanyId: id }
            : { commercialManagerCompanyId: id },
      ],
    },
    include: vesselInclude,
    orderBy: { vesselName: "asc" },
  });

  return { company, vessels };
}

export function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

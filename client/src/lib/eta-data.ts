import { notFound } from "next/navigation";
import { Prisma, prisma, ETAConfidence, VoyageStatus } from "@marimail/db";
import { getServerSession } from "@/lib/api";
import { associationVesselInclude } from "@/lib/association-data";
import { buildVesselFilterClauses } from "@/lib/marine-data";

export async function requireEtaWorkspaceId() {
  const session = await getServerSession();
  if (!session?.activeWorkspace) {
    notFound();
  }
  return {
    workspaceId: session.activeWorkspace.id,
    userId: session.user.id,
    targetPortCountry: session.activeWorkspace.targetPortCountry,
  };
}

/**
 * Returns the workspace's `port.country = ?` clause, or `{}` when the
 * workspace hasn't picked a target country yet. Use this anywhere we used
 * to hardcode the country (formerly `INDIA_PORT_WHERE`).
 */
function countryClause(country: string | null | undefined): Prisma.VesselETAWhereInput {
  return country ? { port: { is: { country } } } : {};
}

export type RadarEta = Prisma.VesselETAGetPayload<{
  include: {
    vessel: {
      include: typeof associationVesselInclude;
    };
    port: {
      select: {
        portCode: true;
        portName: true;
        region: true;
        country: true;
        latitude: true;
        longitude: true;
      };
    };
    triggers: {
      select: {
        id: true;
        status: true;
        nextFireAt: true;
        campaign: { select: { id: true; name: true } };
      };
    };
  };
}>;


// Shared paged-feed result shape for the newly-added and missed feeds so the
// API routes and the SSR page can treat all three feeds uniformly.
export type PagedFeed = {
  etas: RadarEta[];
  count: number;
  page: number;
  pageSize: number;
};

function etaVisibilityWhere(workspaceId: string): Prisma.VesselETAWhereInput {
  return {
    OR: [
      { workspaceId },
      // Global (super-admin-authored) ETAs are visible to every workspace's
      // Port Radar — that's what makes "admin ETA edits propagate to all
      // users" actually work.
      { workspaceId: null },
      { vessel: { workspaceId } },
      { vessel: { workspaceId: null } },
    ],
  };
}

function etaWindowUpper(window: string, now: Date) {
  if (window === "all") return null;
  if (window === "today") return new Date(now.getTime() + 86_400_000);
  if (window === "tomorrow") return new Date(now.getTime() + 2 * 86_400_000);
  if (window === "month") return new Date(now.getTime() + 30 * 86_400_000);
  return new Date(now.getTime() + 7 * 86_400_000);
}

function buildPortStats(etas: RadarEta[]) {
  const stats = new Map<
    string,
    {
      portCode: string;
      total: number;
      live: number;
      urgent: number;
      nextEta: Date | null;
    }
  >();
  const in48h = new Date(Date.now() + 48 * 3_600_000);

  for (const eta of etas) {
    const existing = stats.get(eta.destinationPort) ?? {
      portCode: eta.destinationPort,
      total: 0,
      live: 0,
      urgent: 0,
      nextEta: null,
    };
    existing.total += 1;
    if (eta.currentLat !== null && eta.currentLon !== null) existing.live += 1;
    if (eta.eta <= in48h) existing.urgent += 1;
    if (!existing.nextEta || eta.eta < existing.nextEta)
      existing.nextEta = eta.eta;
    stats.set(eta.destinationPort, existing);
  }

  return Array.from(stats.values()).sort((a, b) =>
    a.portCode.localeCompare(b.portCode),
  );
}

function parseListParam(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function parseDateParam(value: string | string[] | undefined): Date | null {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const ETA_CONFIDENCE_VALUES = new Set<string>(Object.values(ETAConfidence));
const VOYAGE_STATUS_VALUES = new Set<string>(Object.values(VoyageStatus));

export const PORT_RADAR_PAGE_SIZES = [25, 50, 100, 200, 500] as const;
export const PORT_RADAR_DEFAULT_PAGE_SIZE = 25;

export function clampPageSize(value: string | string[] | undefined): number {
  const raw = Number(typeof value === "string" ? value : NaN);
  return PORT_RADAR_PAGE_SIZES.includes(raw as (typeof PORT_RADAR_PAGE_SIZES)[number])
    ? raw
    : PORT_RADAR_DEFAULT_PAGE_SIZE;
}

export function clampPage(value: string | string[] | undefined): number {
  const raw = Number(typeof value === "string" ? value : NaN);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

// Allowlist mapping a sortable Port Radar column key → a Prisma orderBy for the
// VesselETA feed. Anything not listed (or absent) falls back to the feed's
// default ETA ordering. Vessel columns route through the `vessel` relation.
function radarOrderBy(
  searchParams: Record<string, string | string[] | undefined>,
  fallback: Prisma.VesselETAOrderByWithRelationInput = { eta: "asc" },
): Prisma.VesselETAOrderByWithRelationInput | Prisma.VesselETAOrderByWithRelationInput[] {
  const sort = typeof searchParams.sort === "string" ? searchParams.sort : "";
  const dir: "asc" | "desc" = searchParams.dir === "desc" ? "desc" : "asc";
  switch (sort) {
    case "eta":
    case "etaUtc":
      return { eta: dir };
    case "destination":
      return { destinationPort: dir };
    case "added":
      return { createdAt: dir };
    case "voyage":
      return { voyageStatus: dir };
    case "vesselName":
      return { vessel: { vesselName: dir } };
    case "imo":
      return { vessel: { imoNumber: dir } };
    case "type":
      return { vessel: { vesselType: dir } };
    case "flag":
      return { vessel: { flag: dir } };
    default:
      return fallback;
  }
}

/**
 * Every filter surfaced by the frontend VesselFilterPanel maps into a Prisma
 * clause here — either on the ETA row directly (destination, ETA window,
 * confidence, voyage status) or nested through `vessel: { ... }` for vessel
 * attributes (type, size, owner/manager, data quality). The previous version
 * silently ignored every param except `port`, `vesselType`, and `window`, so
 * clicking Apply on the filter panel appeared to do nothing.
 */
export async function listPortRadarFeed(
  searchParams: Record<string, string | string[] | undefined>,
  options: { includeAllCountries?: boolean; page?: number; pageSize?: number } = {},
) {
  const { workspaceId, targetPortCountry } = await requireEtaWorkspaceId();
  // Super-admin view: drop the workspace's target-country restriction so the
  // radar shows every ETA in the DB, not just India (or whatever the workspace
  // is scoped to). Regular users still see only their country's arrivals.
  const effectiveTargetCountry = options.includeAllCountries ? null : targetPortCountry;

  const port =
    typeof searchParams.port === "string"
      ? searchParams.port.trim().toUpperCase()
      : "";
  // No upper cap on the default ETA window — Port Radar shows every future
  // ETA on file so long-lead schedules (weeks out) don't disappear from the
  // count. Users still filter by explicit `?window=today|tomorrow|week|month`
  // or by the ETA-window date pickers in the filter panel when they want a
  // narrower view.
  const window =
    typeof searchParams.window === "string" ? searchParams.window.trim() : "all";
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";

  const now = new Date();
  const upper = etaWindowUpper(window, now);

  // ETA-level clauses (apply to the VesselETA row itself)
  const etaClauses: Prisma.VesselETAWhereInput[] = [];
  const etaFrom = parseDateParam(searchParams.etaFrom);
  const etaTo = parseDateParam(searchParams.etaTo);
  if (etaFrom || etaTo) {
    const range: { gte?: Date; lte?: Date } = { gte: etaFrom ?? now };
    if (etaTo) range.lte = etaTo;
    etaClauses.push({ eta: range });
  } else {
    etaClauses.push({ eta: upper ? { gte: now, lte: upper } : { gte: now } });
  }

  const destCountries = parseListParam(searchParams.destCountry)
    .map((c) => c.toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  if (destCountries.length) {
    etaClauses.push({ port: { is: { country: { in: destCountries } } } });
  }

  const destPorts = parseListParam(searchParams.destPort).map((p) => p.toUpperCase());
  if (destPorts.length) etaClauses.push({ destinationPort: { in: destPorts } });

  const etaConfidences = parseListParam(searchParams.etaConfidence).filter((c) =>
    ETA_CONFIDENCE_VALUES.has(c),
  );
  if (etaConfidences.length) {
    etaClauses.push({ etaConfidence: { in: etaConfidences as ETAConfidence[] } });
  }

  const voyageStatuses = parseListParam(searchParams.voyageStatus).filter((v) =>
    VOYAGE_STATUS_VALUES.has(v),
  );
  if (voyageStatuses.length) {
    etaClauses.push({ voyageStatus: { in: voyageStatuses as VoyageStatus[] } });
  }

  if (q) {
    etaClauses.push({
      OR: [
        { vessel: { vesselName: { contains: q, mode: "insensitive" } } },
        { vessel: { imoNumber: { contains: q } } },
        { destinationPort: { contains: q, mode: "insensitive" } },
        { destinationPortName: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  // Vessel-level clauses (type, flag, status, size, owner/manager, data
  // quality). Delegate to the shared helper used by the Vessels page — same
  // filter surface, same behavior.
  const vesselClauses = buildVesselFilterClauses(searchParams);
  const vesselWhere: Prisma.VesselETAWhereInput =
    vesselClauses.length > 0 ? { vessel: { AND: vesselClauses } } : {};

  const where: Prisma.VesselETAWhereInput = {
    AND: [
      etaVisibilityWhere(workspaceId),
      // Only apply the workspace's target country when the user hasn't
      // picked their own countries — otherwise the two AND together and
      // filter everything out (see marine-data.ts for the same pattern).
      destCountries.length > 0 ? {} : countryClause(effectiveTargetCountry),
      port ? { destinationPort: port } : {},
      vesselWhere,
      ...etaClauses,
    ],
  };

  // Only the visible page is fetched. Loading the whole feed (up to 5000 rows)
  // and slicing in the browser cost ~13s on a 1.2k-ETA workspace: the rows
  // themselves are one round trip, but each vessel's owner/manager companies
  // then feed a per-vessel OR tree in the contact-association query (~1900
  // clauses of un-indexable ILIKE). Paging first cuts both.
  const pageSize = options.pageSize ?? clampPageSize(searchParams.pageSize);
  const page = options.page ?? clampPage(searchParams.page);

  try {
    const [etas, count, ports] = await Promise.all([
      prisma.vesselETA.findMany({
        where,
        orderBy: radarOrderBy(searchParams, { eta: "asc" }),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          vessel: {
            include: associationVesselInclude,
          },
          port: {
            select: {
              portCode: true,
              portName: true,
              region: true,
              country: true,
              latitude: true,
              longitude: true,
            },
          },
          triggers: {
            select: {
              id: true,
              status: true,
              nextFireAt: true,
              campaign: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.vesselETA.count({ where }),
      prisma.port.findMany({
        where: effectiveTargetCountry ? { country: effectiveTargetCountry } : {},
        orderBy: { portName: "asc" },
        take: options.includeAllCountries ? 1000 : 200,
        select: {
          portCode: true,
          portName: true,
          country: true,
          countryName: true,
          region: true,
          latitude: true,
          longitude: true,
        },
      }),
    ]);
    return { etas, count, ports, portStats: buildPortStats(etas), page, pageSize };
  } catch (err) {
    console.error("[eta] listPortRadarFeed failed:", err);
    return { etas: [], count: 0, ports: [], portStats: [], page, pageSize };
  }
}

/**
 * ETAs from the most recent upload batch — everything created in a
 * cluster of near-simultaneous `createdAt` values, until the next batch
 * comes in. Detected heuristically (Option A) by walking the newest 500
 * ETAs by createdAt and finding the largest inter-row time gap; rows
 * above the gap are the current batch. A stray single manual entry
 * (< MIN_BATCH_SIZE rows above the gap) is folded into the previous
 * batch so one lone add doesn't hide the last real import.
 *
 * IMPORTANT — batch detection runs on the GLOBAL visibility set (not
 * per-workspace-country). Otherwise, users in different countries would
 * see different "most recent batches" whenever admin uploads a mixed
 * batch: whoever's country happens to have the newest row would see one
 * boundary, and other users would see an older, still-more-recent-than
 * their country batch as "new". Everyone must agree on which upload is
 * the current one; only the visible rows within that batch are then
 * country-filtered per user.
 *
 * Returns the same `RadarEta` shape as `listPortRadarFeed` so the
 * existing PortRadarArrivals table can render it unchanged.
 */
export async function listLatestBatchEtas(
  workspaceId: string,
  targetPortCountry: string | null,
  searchParams: Record<string, string | string[] | undefined> = {},
  options: { includeAllCountries?: boolean; page?: number; pageSize?: number } = {},
): Promise<PagedFeed> {
  const MIN_BATCH_SIZE = 5;
  const SCAN_WINDOW = 500;
  const pageSize = options.pageSize ?? PORT_RADAR_DEFAULT_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const now = new Date();
  // Reuse the same vessel-level filter surface as the main feed so a
  // filter (e.g. BULK_CARRIER) narrows both tables consistently.
  const vesselClauses = buildVesselFilterClauses(searchParams);
  const vesselWhere: Prisma.VesselETAWhereInput =
    vesselClauses.length > 0 ? { vessel: { AND: vesselClauses } } : {};
  try {
    // Step 1 — LIGHTWEIGHT boundary detection. Fetch only id + createdAt for
    // the newest candidates (no vessel/port/trigger joins). This is a cheap
    // index scan; the expensive company/contact joins are deferred to step 2
    // where we only pull the batch rows.
    const lightCandidates = await prisma.vesselETA.findMany({
      where: {
        AND: [
          etaVisibilityWhere(workspaceId),
          { eta: { gte: now } },
          vesselWhere,
        ],
      },
      orderBy: { createdAt: "desc" },
      take: SCAN_WINDOW,
      select: { id: true, createdAt: true },
    });

    if (lightCandidates.length === 0) return { etas: [], count: 0, page, pageSize };

    // Detect the boundary using createdAt gaps.
    let boundary = lightCandidates.length;
    let biggestGap = 0;
    for (let i = 1; i < lightCandidates.length; i++) {
      const gap =
        lightCandidates[i - 1].createdAt.getTime() -
        lightCandidates[i].createdAt.getTime();
      if (gap > biggestGap) {
        biggestGap = gap;
        boundary = i;
      }
    }

    const MIN_GAP_MS = 5 * 60 * 1000;
    const meaningfulGap = biggestGap >= MIN_GAP_MS;
    let batchIds: string[];
    if (!meaningfulGap) {
      batchIds = lightCandidates.map((c) => c.id);
    } else if (boundary < MIN_BATCH_SIZE) {
      let nextBiggestGap = 0;
      let nextBoundary = lightCandidates.length;
      for (let i = boundary + 1; i < lightCandidates.length; i++) {
        const gap =
          lightCandidates[i - 1].createdAt.getTime() -
          lightCandidates[i].createdAt.getTime();
        if (gap > nextBiggestGap) {
          nextBiggestGap = gap;
          nextBoundary = i;
        }
      }
      batchIds = lightCandidates.slice(0, nextBoundary).map((c) => c.id);
    } else {
      batchIds = lightCandidates.slice(0, boundary).map((c) => c.id);
    }

    if (batchIds.length === 0) return { etas: [], count: 0, page, pageSize };

    // Step 2 — Fetch full data for ONLY the requested page of batch rows (plus
    // country scope). Batch detection above is global; the country filter is
    // applied here, so we also count the country-scoped batch to get the true
    // total for pagination. skip/take over the fixed batchId set with a stable
    // createdAt ordering yields a correct, cheap page.
    const batchWhere: Prisma.VesselETAWhereInput = {
      AND: [
        { id: { in: batchIds } },
        options.includeAllCountries ? {} : countryClause(targetPortCountry),
      ],
    };
    const [batch, count] = await Promise.all([
      prisma.vesselETA.findMany({
        where: batchWhere,
        // Batch DETECTION above stays on createdAt; only the visible page's
        // display order honours the user's chosen sort (default createdAt desc).
        orderBy: radarOrderBy(searchParams, { createdAt: "desc" }),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          vessel: { include: associationVesselInclude },
          port: {
            select: {
              portCode: true,
              portName: true,
              region: true,
              country: true,
              latitude: true,
              longitude: true,
            },
          },
          triggers: {
            select: {
              id: true,
              status: true,
              nextFireAt: true,
              campaign: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.vesselETA.count({ where: batchWhere }),
    ]);

    return { etas: batch, count, page, pageSize };
  } catch (err) {
    console.error("[eta] listLatestBatchEtas failed:", err);
    return { etas: [], count: 0, page, pageSize };
  }
}

/**
 * Cheap tab-badge totals for the three Port Radar feeds, without fetching any
 * full rows. Used by the SSR page so it can render tab counts while loading only
 * the active tab's first page. `missed` and `upcoming` are plain counts; `newly`
 * reuses the batch id-scan (id + createdAt only) then counts the country-scoped
 * batch — the same numbers the feeds themselves report.
 */
export async function getPortRadarTabCounts(
  workspaceId: string,
  targetPortCountry: string | null,
  searchParams: Record<string, string | string[] | undefined> = {},
  options: { includeAllCountries?: boolean } = {},
): Promise<{ missed: number; newly: number; upcoming: number }> {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 3_600_000);
  const effectiveCountry = options.includeAllCountries ? null : targetPortCountry;
  const vesselClauses = buildVesselFilterClauses(searchParams);
  const vesselWhere: Prisma.VesselETAWhereInput =
    vesselClauses.length > 0 ? { vessel: { AND: vesselClauses } } : {};

  try {
    const [missed, upcoming, newly] = await Promise.all([
      prisma.vesselETA.count({
        where: {
          AND: [
            etaVisibilityWhere(workspaceId),
            countryClause(effectiveCountry),
            { eta: { gte: now, lte: in48h } },
            { triggers: { none: {} } },
          ],
        },
      }),
      prisma.vesselETA.count({
        where: {
          AND: [
            etaVisibilityWhere(workspaceId),
            countryClause(effectiveCountry),
            { eta: { gte: now } },
            vesselWhere,
          ],
        },
      }),
      (async () => {
        const light = await prisma.vesselETA.findMany({
          where: { AND: [etaVisibilityWhere(workspaceId), { eta: { gte: now } }, vesselWhere] },
          orderBy: { createdAt: "desc" },
          take: 500,
          select: { id: true, createdAt: true },
        });
        if (light.length === 0) return 0;
        let boundary = light.length;
        let biggest = 0;
        for (let i = 1; i < light.length; i += 1) {
          const gap = light[i - 1].createdAt.getTime() - light[i].createdAt.getTime();
          if (gap > biggest) {
            biggest = gap;
            boundary = i;
          }
        }
        const batchIds = biggest >= 5 * 60 * 1000 ? light.slice(0, boundary).map((c) => c.id) : light.map((c) => c.id);
        if (batchIds.length === 0) return 0;
        return prisma.vesselETA.count({
          where: { AND: [{ id: { in: batchIds } }, countryClause(effectiveCountry)] },
        });
      })(),
    ]);
    return { missed, newly, upcoming };
  } catch (err) {
    console.error("[eta] getPortRadarTabCounts failed:", err);
    return { missed: 0, newly: 0, upcoming: 0 };
  }
}

export async function getPortRadarSummary(workspaceId: string, targetPortCountry: string | null) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000);
  const endOfTomorrow = new Date(startOfToday.getTime() + 2 * 86_400_000);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 86_400_000);

  try {
    const scopedWhere: Prisma.VesselETAWhereInput = {
      AND: [etaVisibilityWhere(workspaceId), countryClause(targetPortCountry)],
    };
    const [today, tomorrow, thisWeek, noCampaign, activeCampaign] =
      await Promise.all([
        prisma.vesselETA.count({
          where: {
            AND: [scopedWhere, { eta: { gte: startOfToday, lt: endOfToday } }],
          },
        }),
        prisma.vesselETA.count({
          where: {
            AND: [
              scopedWhere,
              { eta: { gte: endOfToday, lt: endOfTomorrow } },
            ],
          },
        }),
        prisma.vesselETA.count({
          where: {
            AND: [scopedWhere, { eta: { gte: startOfToday, lt: endOfWeek } }],
          },
        }),
        prisma.vesselETA.count({
          where: {
            AND: [
              scopedWhere,
              { eta: { gte: now }, triggers: { none: {} } },
            ],
          },
        }),
        prisma.vesselETA.count({
          where: {
            AND: [
              scopedWhere,
              {
                eta: { gte: now },
                triggers: { some: { status: { in: ["PENDING", "ACTIVE"] } } },
              },
            ],
          },
        }),
      ]);
    return { today, tomorrow, thisWeek, noCampaign, activeCampaign };
  } catch (err) {
    console.error("[eta] getPortRadarSummary failed:", err);
    return {
      today: 0,
      tomorrow: 0,
      thisWeek: 0,
      noCampaign: 0,
      activeCampaign: 0,
    };
  }
}

/**
 * Missed opportunities: ETAs arriving within 48h that have NO campaign
 * trigger assigned — the "act now" list. Returns the full RadarEta shape so
 * the same PortRadarArrivals table can render it (checkbox-select +
 * add-to-list included). Country-scoped like the main feed.
 */
export async function getMissedOpportunityAlerts(
  workspaceId: string,
  targetPortCountry: string | null,
  opts: { page?: number; pageSize?: number; sort?: string; dir?: string } = {},
): Promise<PagedFeed> {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 3_600_000);
  const pageSize = opts.pageSize ?? PORT_RADAR_DEFAULT_PAGE_SIZE;
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.VesselETAWhereInput = {
    AND: [
      etaVisibilityWhere(workspaceId),
      countryClause(targetPortCountry),
      { eta: { gte: now, lte: in48h } },
      { triggers: { none: {} } },
    ],
  };
  try {
    const [etas, count] = await Promise.all([
      prisma.vesselETA.findMany({
        where,
        orderBy: radarOrderBy({ sort: opts.sort, dir: opts.dir }, { eta: "asc" }),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          vessel: { include: associationVesselInclude },
          port: {
            select: {
              portCode: true,
              portName: true,
              region: true,
              country: true,
              latitude: true,
              longitude: true,
            },
          },
          triggers: {
            select: {
              id: true,
              status: true,
              nextFireAt: true,
              campaign: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.vesselETA.count({ where }),
    ]);
    return { etas, count, page, pageSize };
  } catch (err) {
    console.error("[eta] getMissedOpportunityAlerts failed:", err);
    return { etas: [], count: 0, page, pageSize };
  }
}

export async function listPorts() {
  return prisma.port.findMany({ orderBy: { portName: "asc" } });
}

export async function listCampaignsForWorkspace(workspaceId: string) {
  return prisma.campaign.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      triggerType: true,
      defaultDaysBefore: true,
    },
  });
}

export async function listPortRules(workspaceId: string) {
  return prisma.portCampaignRule.findMany({
    where: { OR: [{ workspaceId }, { workspaceId: null }] },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    include: {
      campaign: { select: { id: true, name: true, status: true } },
      port: { select: { portCode: true, portName: true } },
    },
  });
}

export async function listCargoRules(workspaceId: string) {
  return prisma.cargoChangeTrigger.findMany({
    where: { OR: [{ workspaceId }, { workspaceId: null }] },
    orderBy: { createdAt: "desc" },
    include: { campaign: { select: { id: true, name: true, status: true } } },
  });
}

export async function getVesselWithEtas(
  imoNumber: string,
  workspaceId: string,
) {
  const now = new Date();
  return prisma.vessel.findFirst({
    where: { imoNumber, workspaceId },
    include: {
      shipOwnerCompany: true,
      ismManagerCompany: true,
      commercialManagerCompany: true,
      etas: {
        where: { eta: { gte: now } },
        orderBy: { eta: "asc" },
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
    },
  });
}

import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { Prisma, prisma, ETAConfidence, VoyageStatus } from "@marimail/db";
import { getServerSession } from "@/lib/api";
import { associationVesselInclude } from "@/lib/association-data";
import { buildVesselFilterClauses } from "@/lib/marine-data";
import {
  requestedCountries,
  resolveCountryFilter,
  scopeToList,
  workspaceCountryScope,
  type CountryScope,
} from "@/lib/country-scope";

export type { CountryScope };
export { scopeToList, resolveCountryFilter, requestedCountries };

export async function requireEtaWorkspaceId() {
  const session = await getServerSession();
  if (!session?.activeWorkspace) {
    notFound();
  }
  // Country scope for Port Radar: prefer the plan's multi-country allowlist
  // (chosen at signup, e.g. 2 countries), else fall back to the legacy single
  // targetPortCountry, else null (no restriction — un-scoped workspace).
  const allowed = session.activeWorkspace.allowedCountries ?? [];
  const countryScope = workspaceCountryScope(session.activeWorkspace);

  return {
    workspaceId: session.activeWorkspace.id,
    userId: session.user.id,
    targetPortCountry: session.activeWorkspace.targetPortCountry,
    allowedCountries: allowed,
    countryScope,
  };
}

/**
 * Returns the `port.country` clause for a country scope: `{ in: [...] }` for a
 * multi-country plan allowlist, `= country` for a single legacy country, or
 * `{}` (no restriction) when the workspace hasn't picked any.
 */
export function countryClause(scope: CountryScope): Prisma.VesselETAWhereInput {
  // An EMPTY array means "no country qualifies" and must match nothing. It used
  // to return `{}` (unrestricted) — harmless while empty arrays never occurred,
  // but `resolveCountryFilter` now produces one whenever a user requests only
  // countries their plan doesn't grant, and `{}` there would hand them the
  // entire database. Only `null`/`undefined` means unrestricted.
  if (Array.isArray(scope)) return { port: { is: { country: { in: scope } } } };
  return scope ? { port: { is: { country: scope } } } : {};
}

/** Same scope, applied directly to the Port model (`port.findMany`). */
export function portCountryWhere(scope: CountryScope): Prisma.PortWhereInput {
  // Same empty-array rule as `countryClause` — see the note there.
  if (Array.isArray(scope)) return { country: { in: scope } };
  return scope ? { country: scope } : {};
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
        countryName: true;
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

function etaVisibilityWhere(_workspaceId: string): Prisma.VesselETAWhereInput {
  // ETAs and vessels are both global by design (see the 20260722010000 +
  // 20260722020000 migrations). The former per-workspace visibility OR ran a
  // nested `vessel: { workspaceId }` join that forced Postgres off the eta
  // index and cost 3s+ on the port-radar feed, so it's now an empty clause.
  // Kept as a function so callers don't have to change; the arg is unused.
  return {};
}

function etaWindowUpper(window: string, now: Date) {
  if (window === "all") return null;
  if (window === "today") return new Date(now.getTime() + 86_400_000);
  if (window === "tomorrow") return new Date(now.getTime() + 2 * 86_400_000);
  if (window === "month") return new Date(now.getTime() + 30 * 86_400_000);
  return new Date(now.getTime() + 7 * 86_400_000);
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

function isTrue(value: string | string[] | undefined): boolean {
  const v = (typeof value === "string" ? value : "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
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
/**
 * Every filter the Upcoming feed applies EXCEPT the country scope.
 *
 * Split out so the per-country chip counts and the feed itself are built from
 * one expression: a chip that says "Brazil 312" and a table that then shows 280
 * is worse than no chip at all, and that drift is exactly what happens when two
 * call sites assemble the same filter list by hand.
 */
function upcomingFeedClauses(
  searchParams: Record<string, string | string[] | undefined>,
  workspaceId: string,
): Prisma.VesselETAWhereInput[] {
  const port =
    typeof searchParams.port === "string" ? searchParams.port.trim().toUpperCase() : "";
  const window =
    typeof searchParams.window === "string" ? searchParams.window.trim() : "all";
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const now = new Date();
  const upper = etaWindowUpper(window, now);

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

  // "Missed opportunities" is now a filter chip, not a dedicated tab: ETAs
  // with no campaign trigger attached.
  if (isTrue(searchParams.noCampaign)) {
    etaClauses.push({ triggers: { none: {} } });
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
  // quality). Delegate to the shared helper used by the Vessels page.
  const vesselClauses = buildVesselFilterClauses(searchParams);
  const vesselWhere: Prisma.VesselETAWhereInput =
    vesselClauses.length > 0 ? { vessel: { AND: vesselClauses } } : {};

  return [
    etaVisibilityWhere(workspaceId),
    port ? { destinationPort: port } : {},
    vesselWhere,
    ...etaClauses,
  ];
}

export async function listPortRadarFeed(
  searchParams: Record<string, string | string[] | undefined>,
  options: { includeAllCountries?: boolean; page?: number; pageSize?: number } = {},
) {
  const { workspaceId, countryScope } = await requireEtaWorkspaceId();
  // Super-admin view: drop the workspace's country restriction so the radar
  // shows every ETA in the DB. Regular users stay scoped to the countries their
  // plan grants (allowedCountries), or the legacy single targetPortCountry.
  const effectiveTargetCountry = options.includeAllCountries ? null : countryScope;

  // Requested countries are CLAMPED to the plan's grant, never substituted for
  // it — see `resolveCountryFilter`.
  const effectiveCountries = resolveCountryFilter(
    requestedCountries(searchParams),
    effectiveTargetCountry,
  );

  const where: Prisma.VesselETAWhereInput = {
    AND: [countryClause(effectiveCountries), ...upcomingFeedClauses(searchParams, workspaceId)],
  };

  // Only the visible page is fetched. Loading the whole feed (up to 5000 rows)
  // and slicing in the browser cost ~13s on a 1.2k-ETA workspace: the rows
  // themselves are one round trip, but each vessel's owner/manager companies
  // then feed a per-vessel OR tree in the contact-association query (~1900
  // clauses of un-indexable ILIKE). Paging first cuts both.
  const pageSize = options.pageSize ?? clampPageSize(searchParams.pageSize);
  const page = options.page ?? clampPage(searchParams.page);

  try {
    const [etas, count] = await Promise.all([
      prisma.vesselETA.findMany({
        // One SQL statement instead of one per relation. The default strategy
        // issues a separate round trip for vessel, each of the three company
        // relations, port, triggers and campaign — seven in total. Postgres
        // answers each in under a millisecond, but the database is remote
        // (~76ms RTT), so the page was paying ~1.1s in latency for ~5ms of work.
        relationLoadStrategy: "join",
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
              countryName: true,
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
    // `ports` and `portStats` used to be returned alongside these. Neither
    // consumer — the SSR page nor the pager API — ever read them, so every page
    // load and every "Next" click paid for a second query plus a full pass over
    // the rows to build stats that were thrown away.
    return { etas, count, page, pageSize };
  } catch (err) {
    console.error("[eta] listPortRadarFeed failed:", err);
    return { etas: [], count: 0, page, pageSize };
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
/**
 * Newly-added ETAs (most recent upload batch).
 *
 * The workspace id and country scope are derived HERE rather than accepted as
 * parameters. They used to be passed in, and the two call sites disagreed: the
 * page passed the plan's `allowedCountries` scope while the pagination route
 * passed the legacy single `targetPortCountry`. Because `countryClause(null)`
 * means "no restriction", any workspace whose `targetPortCountry` was unset —
 * which is every workspace provisioned through the admin country-access
 * endpoint — got correctly-scoped results on page 1 and then EVERY country in
 * the database from page 2 onward. Deriving internally makes that class of
 * drift impossible.
 */
export async function listLatestBatchEtas(
  searchParams: Record<string, string | string[] | undefined> = {},
  options: { includeAllCountries?: boolean; page?: number; pageSize?: number } = {},
): Promise<PagedFeed> {
  const { workspaceId, countryScope } = await requireEtaWorkspaceId();
  // The "Newly added" tab used to ignore `?destCountry` completely, so picking
  // a country in the filter panel changed the Upcoming tab and silently did
  // nothing here. Both tabs now read the same clamped scope.
  const targetPortCountry: CountryScope = resolveCountryFilter(
    requestedCountries(searchParams),
    options.includeAllCountries ? null : countryScope,
  );
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
        countryClause(targetPortCountry),
      ],
    };
    const [batch, count] = await Promise.all([
      prisma.vesselETA.findMany({
        // Single JOIN rather than a round trip per relation — see the note in
        // listPortRadarFeed.
        relationLoadStrategy: "join",
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
              countryName: true,
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
/**
 * Tab badge counts. Like listLatestBatchEtas, the workspace + country scope are
 * derived here so a caller can't pass a stale/wrong entitlement and make the
 * badge disagree with the table it labels.
 */
/** How far back "recently departed" looks when counting hidden past arrivals. */
export const PORT_RADAR_PAST_WINDOW_DAYS = 30;

export async function getPortRadarTabCounts(
  searchParams: Record<string, string | string[] | undefined> = {},
  options: { includeAllCountries?: boolean } = {},
): Promise<{ newly: number; upcoming: number; past: number }> {
  const { workspaceId, countryScope } = await requireEtaWorkspaceId();
  const now = new Date();
  // Counts must use the SAME clamped scope as the feeds, or the badge promises
  // 435 rows and the table shows 312.
  const effectiveCountry = resolveCountryFilter(
    requestedCountries(searchParams),
    options.includeAllCountries ? null : countryScope,
  );
  const vesselClauses = buildVesselFilterClauses(searchParams);
  const vesselWhere: Prisma.VesselETAWhereInput =
    vesselClauses.length > 0 ? { vessel: { AND: vesselClauses } } : {};

  // Arrivals the Upcoming feed is hiding purely because they already happened.
  // An import of yesterday's schedule lands entirely in here, and without a
  // number to point at, the page just looks like most of the upload vanished.
  const pastFrom = new Date(now.getTime() - PORT_RADAR_PAST_WINDOW_DAYS * 86_400_000);

  try {
    const [upcoming, newly, past] = await Promise.all([
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
        // Batch detection is global (every user must agree on which upload is
        // "current"), but the COUNT is country-scoped. That used to mean two
        // serial round trips: scan for the boundary, then count the scoped
        // subset. Pulling each candidate's port country down with the scan — one
        // JOIN, one round trip — lets both the boundary and the scoped count be
        // computed here in JS instead.
        const light = await prisma.vesselETA.findMany({
          relationLoadStrategy: "join",
          where: { AND: [etaVisibilityWhere(workspaceId), { eta: { gte: now } }, vesselWhere] },
          orderBy: { createdAt: "desc" },
          take: 500,
          select: { createdAt: true, port: { select: { country: true } } },
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
        const batch = biggest >= 5 * 60 * 1000 ? light.slice(0, boundary) : light;
        // Mirror countryClause: an array scope matches any listed country, a
        // string scope matches exactly one, null/undefined means unrestricted.
        const allowed = Array.isArray(effectiveCountry)
          ? new Set(effectiveCountry)
          : effectiveCountry
            ? new Set([effectiveCountry])
            : null;
        if (!allowed) return batch.length;
        return batch.filter((row) => row.port && allowed.has(row.port.country)).length;
      })(),
      prisma.vesselETA.count({
        where: {
          AND: [
            etaVisibilityWhere(workspaceId),
            countryClause(effectiveCountry),
            { eta: { gte: pastFrom, lt: now } },
            vesselWhere,
          ],
        },
      }),
    ]);
    return { newly, upcoming, past };
  } catch (err) {
    console.error("[eta] getPortRadarTabCounts failed:", err);
    return { newly: 0, upcoming: 0, past: 0 };
  }
}

export async function getPortRadarSummary(workspaceId: string, targetPortCountry: CountryScope) {
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

// The old getMissedOpportunityAlerts helper (ETAs ≤48h with no campaign
// trigger) was folded into listPortRadarFeed as the ?noCampaign=1 filter,
// so the Missed Opportunities filter chip composes cleanly with any ETA
// window instead of being a hard-coded 48h list.

export async function listPorts() {
  return prisma.port.findMany({ orderBy: { portName: "asc" } });
}

/**
 * Ports that can be plotted on the Port Radar map, for a country scope.
 *
 * The port registry is reference data — coordinates change when a port is
 * added, i.e. effectively never — but this ran on every single page load,
 * spending a full round trip against a remote database to return the same
 * few dozen rows. Cached for an hour and keyed by the scope, so a country's
 * port list is fetched once and then reused across users and reloads.
 */
export async function listMapPorts(scope: CountryScope, includeAllCountries: boolean) {
  // Three distinct cases, three distinct keys. "none" (granted no country →
  // no ports) must never collide with "unscoped" (no restriction → every
  // port), or one would serve the other's rows out of the cache.
  const scopeList = scopeToList(scope);
  const key = includeAllCountries
    ? "all"
    : scopeList === null
      ? "unscoped"
      : scopeList.length === 0
        ? "none"
        : scopeList.join(",");
  const load = unstable_cache(
    async () =>
      prisma.port.findMany({
        where: {
          AND: [
            includeAllCountries ? {} : portCountryWhere(scope),
            { latitude: { not: null }, longitude: { not: null } },
          ],
        },
        orderBy: { portName: "asc" },
        take: 2000,
        select: { portCode: true, portName: true, countryName: true, latitude: true, longitude: true },
      }),
    ["port-radar-map-ports", key],
    { revalidate: 3600, tags: ["ports"] },
  );
  return load();
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

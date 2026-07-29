import { prisma } from "@marimail/db";
import {
  getPortRadarCountryBreakdown,
  getPortRadarTabCounts,
  listLatestBatchEtas,
  listPortRadarFeed,
  portCountryWhere,
  requireEtaWorkspaceId,
  scopeToList,
  PORT_RADAR_DEFAULT_PAGE_SIZE,
  type PagedFeed,
} from "@/lib/eta-data";
import { serializeRadarEta } from "@/lib/port-radar-serialize";
import { PortRadarTabs, type PortRadarTabKey } from "@/components/marine/PortRadarTabs";
import { VesselFilterPanel } from "@/components/marine/VesselFilterPanel";
import { getServerSession } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function PortRadarPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { countryScope: workspaceCountryScope } = await requireEtaWorkspaceId();
  const session = await getServerSession();
  const isSuperAdmin = session?.user.isSuperAdmin ?? false;
  // Super-admin sees every ETA on record (across all countries). Regular users
  // stay scoped to the countries their plan grants (allowedCountries).
  const countryScope = isSuperAdmin ? null : workspaceCountryScope;

  // Cheap tab-badge totals + the port list for the map — no full feed rows yet.
  const [counts, countryBreakdown, ports] = await Promise.all([
    getPortRadarTabCounts(searchParams, {
      includeAllCountries: isSuperAdmin,
    }),
    getPortRadarCountryBreakdown(searchParams, {
      includeAllCountries: isSuperAdmin,
    }),
    // Ports for the map. Only ports WITH coordinates are usable — the sole
    // consumer filters on exactly that — so the filter moves into the query.
    // The old `take: 200` spent its budget alphabetically across the whole
    // grant, and countries with large port registries (JP 1503, US 848, GB 504)
    // exhausted it before a two-country user's second country appeared at all.
    prisma.port.findMany({
      where: {
        AND: [
          isSuperAdmin ? {} : portCountryWhere(countryScope),
          { latitude: { not: null }, longitude: { not: null } },
        ],
      },
      orderBy: { portName: "asc" },
      take: 2000,
      select: { portCode: true, portName: true, countryName: true, latitude: true, longitude: true },
    }),
  ]);

  // Default to the most urgent tab that has content: newly → upcoming.
  // (The old "missed opportunities" tab was folded into the filter panel as a
  // chip — see VesselFilterPanel's ETA & voyage section — so it no longer
  // competes for the default here.)
  const initialTab: PortRadarTabKey = counts.newly > 0 ? "newly" : "upcoming";

  // Load ONLY the initial tab's first page server-side for a fast first paint.
  const pageSize = PORT_RADAR_DEFAULT_PAGE_SIZE;
  let initial: PagedFeed;
  if (initialTab === "newly") {
    initial = await listLatestBatchEtas(searchParams, {
      includeAllCountries: isSuperAdmin,
      page: 1,
      pageSize,
    });
  } else {
    const feed = await listPortRadarFeed(searchParams, {
      includeAllCountries: isSuperAdmin,
      page: 1,
      pageSize,
    });
    initial = { etas: feed.etas, count: feed.count, page: feed.page, pageSize: feed.pageSize };
  }

  // The tab used to be labelled `ports[0].countryName` — the country owning the
  // alphabetically-first port name in a truncated list, which for a multi-
  // country workspace named ONE of them and hid the rest ("Upcoming Brazil
  // arrivals" over a table half full of Indian arrivals). Naming a single
  // country is only honest when the grant is a single country.
  // Name a country in the tab ONLY when the grant is exactly one country —
  // that's the single case where one name describes the whole table. Multi-
  // country grants get the neutral label plus the switcher chips below it.
  const grantedCountries = scopeToList(countryScope);
  const countryLabel =
    !isSuperAdmin && grantedCountries?.length === 1
      ? (ports.find((port) => port.countryName)?.countryName ?? null)
      : null;
  const portsWithCoordinates = ports.map((port) => port.portCode);

  // Contact counts load lazily client-side after rows render, so seed with 0.
  const initialRows = initial.etas.map((eta) => serializeRadarEta(eta, 0));

  return (
    <div className="space-y-5">
      <VesselFilterPanel
        searchParams={searchParams}
        basePath="/dashboard/port-radar"
        orientation="modal"
        isSuperAdmin={isSuperAdmin}
      />

      <PortRadarTabs
        countryLabel={countryLabel}
        countryBreakdown={countryBreakdown}
        isSuperAdmin={isSuperAdmin}
        portsWithCoordinates={portsWithCoordinates}
        counts={counts}
        initialTab={initialTab}
        initialRows={initialRows}
        initialCount={initial.count}
        pageSize={pageSize}
      />
    </div>
  );
}

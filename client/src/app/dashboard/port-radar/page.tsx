import { prisma } from "@marimail/db";
import {
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
  const [counts, ports] = await Promise.all([
    getPortRadarTabCounts(searchParams, {
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

  // Always open on Upcoming arrivals.
  //
  // This used to default to "newly" whenever that tab had ANY rows, which made
  // the page actively misleading: "newly added" is the most recent upload
  // BATCH, so a workspace with 317 upcoming arrivals would land on a tab
  // showing 2 and look like the product had almost no data in it. The batch
  // view is a "what just landed" check, not the headline — it keeps its tab and
  // its count badge, one click away.
  const initialTab: PortRadarTabKey = "upcoming";

  // Load ONLY the opening tab's first page server-side for a fast first paint;
  // the other tab fetches lazily when it's first opened.
  const pageSize = PORT_RADAR_DEFAULT_PAGE_SIZE;
  const feed = await listPortRadarFeed(searchParams, {
    includeAllCountries: isSuperAdmin,
    page: 1,
    pageSize,
  });
  const initial: PagedFeed = {
    etas: feed.etas,
    count: feed.count,
    page: feed.page,
    pageSize: feed.pageSize,
  };

  // Name a country in the tab ONLY when the grant is exactly one country —
  // the single case where one name honestly describes the whole table. It used
  // to be `ports[0].countryName`, i.e. whichever country owned the
  // alphabetically-first port in a truncated list, which for a multi-country
  // workspace named ONE of them and silently hid the rest.
  const grantedCountries = scopeToList(countryScope);
  const countryLabel =
    !isSuperAdmin && grantedCountries?.length === 1
      ? (ports.find((port) => port.countryName)?.countryName ?? null)
      : null;

  // Whether a row's country is worth showing in the table. True for a
  // super-admin (who sees every country) and for any grant covering more than
  // one — otherwise every row would repeat the same word.
  const showCountryColumn = isSuperAdmin || (grantedCountries?.length ?? 0) > 1;
  const portsWithCoordinates = ports.map((port) => port.portCode);

  // Contact counts load lazily client-side after rows render, so seed with 0.
  const initialRows = initial.etas.map((eta) => serializeRadarEta(eta, 0));

  return (
    <div className="space-y-5">
      <VesselFilterPanel
        searchParams={searchParams}
        basePath="/dashboard/port-radar"
        orientation="modal"
      />

      <PortRadarTabs
        countryLabel={countryLabel}
        showCountryColumn={showCountryColumn}
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

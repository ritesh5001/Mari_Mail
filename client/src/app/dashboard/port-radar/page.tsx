import { prisma } from "@marimail/db";
import {
  getMissedOpportunityAlerts,
  getPortRadarTabCounts,
  listLatestBatchEtas,
  listPortRadarFeed,
  requireEtaWorkspaceId,
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
  const { workspaceId, targetPortCountry } = await requireEtaWorkspaceId();
  const session = await getServerSession();
  const isSuperAdmin = session?.user.isSuperAdmin ?? false;
  // Super-admin sees every ETA on record (across all countries), not just
  // the workspace's target country. Regular users stay scoped to their country.
  const countryScope = isSuperAdmin ? null : targetPortCountry;

  // Cheap tab-badge totals + the port list for the map — no full feed rows yet.
  const [counts, ports] = await Promise.all([
    getPortRadarTabCounts(workspaceId, targetPortCountry, searchParams, {
      includeAllCountries: isSuperAdmin,
    }),
    prisma.port.findMany({
      where: isSuperAdmin || !targetPortCountry ? {} : { country: targetPortCountry },
      orderBy: { portName: "asc" },
      take: isSuperAdmin ? 1000 : 200,
      select: { portCode: true, portName: true, countryName: true, latitude: true, longitude: true },
    }),
  ]);

  // Default to the most urgent tab that has content: missed → newly → upcoming.
  const initialTab: PortRadarTabKey =
    counts.missed > 0 ? "missed" : counts.newly > 0 ? "newly" : "upcoming";

  // Load ONLY the initial tab's first page server-side for a fast first paint.
  const pageSize = PORT_RADAR_DEFAULT_PAGE_SIZE;
  let initial: PagedFeed;
  if (initialTab === "missed") {
    initial = await getMissedOpportunityAlerts(workspaceId, countryScope, { page: 1, pageSize });
  } else if (initialTab === "newly") {
    initial = await listLatestBatchEtas(workspaceId, countryScope, searchParams, {
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

  const countryLabel = isSuperAdmin ? "All" : ports[0]?.countryName ?? "All";
  const portsWithCoordinates = ports
    .filter((port) => port.latitude !== null && port.longitude !== null)
    .map((port) => port.portCode);

  // Contact counts load lazily client-side after rows render, so seed with 0.
  const initialRows = initial.etas.map((eta) => serializeRadarEta(eta, 0));

  return (
    <div className="space-y-5">
      <VesselFilterPanel
        searchParams={searchParams}
        basePath="/dashboard/port-radar"
        orientation="horizontal"
      />

      <PortRadarTabs
        countryLabel={countryLabel}
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

import {
  getMissedOpportunityAlerts,
  listLatestBatchEtas,
  listPortRadarFeed,
  requireEtaWorkspaceId,
} from "@/lib/eta-data";
import { countAssociatedContactsForVessels } from "@/lib/association-data";
import { type IndiaRadarEta } from "@/components/marine/PortRadarArrivals";
import { PortRadarTabs } from "@/components/marine/PortRadarTabs";
import { VesselFilterPanel } from "@/components/marine/VesselFilterPanel";
import { getServerSession } from "@/lib/api";

export const dynamic = "force-dynamic";

function serializeEta(
  eta: Awaited<ReturnType<typeof listPortRadarFeed>>["etas"][number],
  associatedContactCount: number,
): IndiaRadarEta {
  return {
    id: eta.id,
    vesselId: eta.vessel.id,
    eta: eta.eta.toISOString(),
    createdAt: eta.createdAt.toISOString(),
    destinationPort: eta.destinationPort,
    destinationPortName: eta.destinationPortName,
    currentLat: eta.currentLat,
    currentLon: eta.currentLon,
    speedOverGround: eta.speedOverGround,
    lastAISUpdate: eta.lastAISUpdate?.toISOString() ?? null,
    voyageStatus: eta.voyageStatus,
    previousCargo: eta.previousCargo,
    nextCargo: eta.nextCargo,
    vessel: {
      id: eta.vessel.id,
      imoNumber: eta.vessel.imoNumber,
      vesselName: eta.vessel.vesselName,
      vesselType: eta.vessel.vesselType,
      flag: eta.vessel.flag,
    },
    associatedContactCount,
    triggers: eta.triggers.map((trigger) => ({ status: trigger.status })),
  };
}

export default async function PortRadarPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { workspaceId, targetPortCountry } = await requireEtaWorkspaceId();
  const session = await getServerSession();
  const isSuperAdmin = session?.user.isSuperAdmin ?? false;
  // Super-admin sees every ETA on record (across all countries), not just
  // the workspace's target country. Regular users stay scoped to whatever
  // country their workspace is set up for.
  const countryScope = isSuperAdmin ? null : targetPortCountry;
  const [{ etas, count, ports, page, pageSize }, alerts, latestBatch] = await Promise.all([
    listPortRadarFeed(searchParams, { includeAllCountries: isSuperAdmin }),
    getMissedOpportunityAlerts(workspaceId, countryScope),
    listLatestBatchEtas(workspaceId, countryScope, searchParams, {
      includeAllCountries: isSuperAdmin,
    }),
  ]);
  const countryLabel = isSuperAdmin ? "All" : ports[0]?.countryName ?? "All";

  // Merge vessels from all three tables into a single association-count query
  // so every table shows the same associated-contact numbers without extra
  // round trips. Dedupe by vessel id — the three feeds overlap heavily, and
  // the association query cost scales with unique vessels (each contributes
  // clauses to a large un-indexable OR tree), so deduping is a real speedup.
  const vesselById = new Map<string, (typeof etas)[number]["vessel"]>();
  for (const e of [...etas, ...latestBatch, ...alerts]) {
    if (!vesselById.has(e.vessel.id)) vesselById.set(e.vessel.id, e.vessel);
  }
  const associatedContactCounts = await countAssociatedContactsForVessels(
    workspaceId,
    Array.from(vesselById.values()),
  );
  const radarEtas = etas.map((eta) => serializeEta(eta, associatedContactCounts.get(eta.vessel.id) ?? 0));
  const latestBatchRadarEtas = latestBatch.map((eta) =>
    serializeEta(eta, associatedContactCounts.get(eta.vessel.id) ?? 0),
  );
  const missedRadarEtas = alerts.map((eta) =>
    serializeEta(eta, associatedContactCounts.get(eta.vessel.id) ?? 0),
  );
  const portsWithCoordinates = new Set(
    ports
      .filter((port) => port.latitude !== null && port.longitude !== null)
      .map((port) => port.portCode),
  );

  return (
    <div className="space-y-5">
      <VesselFilterPanel
        searchParams={searchParams}
        basePath="/dashboard/port-radar"
        orientation="horizontal"
      />

      {/* The three feeds (missed opportunities / newly added / upcoming) as
          tabs, matching the ListViews tab pattern. */}
      <PortRadarTabs
        countryLabel={countryLabel}
        isSuperAdmin={isSuperAdmin}
        portsWithCoordinates={Array.from(portsWithCoordinates)}
        missed={missedRadarEtas}
        newlyAdded={latestBatchRadarEtas}
        upcoming={radarEtas}
        upcomingCount={count}
        page={page}
        pageSize={pageSize}
      />
    </div>
  );
}

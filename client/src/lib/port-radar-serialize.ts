import type { RadarEta } from "@/lib/eta-data";
import type { IndiaRadarEta } from "@/components/marine/PortRadarArrivals";

/**
 * Serializes a full ETA row (from any of the three Port Radar feeds) into the
 * plain `IndiaRadarEta` shape the client table consumes. Shared by the SSR page
 * and the browser-callable feed API routes so there is exactly one copy of the
 * mapping. `associatedContactCount` is passed in separately because contact
 * counts are now loaded lazily (a second request) rather than computed inline.
 */
export function serializeRadarEta(
  eta: RadarEta,
  associatedContactCount = 0,
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

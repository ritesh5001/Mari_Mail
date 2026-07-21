import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/api";
import { getMissedOpportunityAlerts } from "@/lib/eta-data";
import { serializeRadarEta } from "@/lib/port-radar-serialize";
import { parseFeedRequest } from "../shared";

export const dynamic = "force-dynamic";

// Missed-opportunity alerts (arriving < 48h, no campaign) — one page at a time.
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.activeWorkspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isSuperAdmin = session.user.isSuperAdmin ?? false;
  const { page, pageSize } = await parseFeedRequest(request);
  // Super-admin sees every country's missed alerts; regular users stay scoped.
  const countryScope = isSuperAdmin ? null : session.activeWorkspace.targetPortCountry;

  const { etas, count } = await getMissedOpportunityAlerts(
    session.activeWorkspace.id,
    countryScope,
    { page, pageSize },
  );

  return NextResponse.json({
    etas: etas.map((eta) => serializeRadarEta(eta)),
    count,
    page,
    pageSize,
  });
}

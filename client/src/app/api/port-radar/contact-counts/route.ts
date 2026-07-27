import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/api";
import { countAssociatedContactsForVesselIds } from "@/lib/association-data";

export const dynamic = "force-dynamic";

// Lazy per-page contact counts. The client renders a page of ETA rows first,
// then POSTs those rows' vessel ids here to fill in the "Contacts" badge, so the
// expensive association query no longer blocks first paint. Mirrors
// app/api/associations/contacts/counts/route.ts.
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.activeWorkspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workspaceId = session.activeWorkspace.id;

  const body = (await request.json().catch(() => null)) as { vesselIds?: unknown } | null;
  const vesselIds = Array.isArray(body?.vesselIds)
    ? Array.from(new Set(body.vesselIds.filter((id): id is string => typeof id === "string"))).slice(0, 100)
    : [];

  if (vesselIds.length === 0) {
    return NextResponse.json({ counts: {} });
  }

  // Cached (workspace + vessel-id set, 60s TTL). Vessel lookup inside is
  // unscoped — global (admin-authored) ETAs can reference vessels from any
  // workspace — but the count is workspace-filtered downstream (only this
  // workspace's contacts are matched), so nothing leaks.
  const counts = await countAssociatedContactsForVesselIds(workspaceId, vesselIds);
  return NextResponse.json({ counts });
}

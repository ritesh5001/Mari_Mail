import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/api";
import { listLatestBatchEtas } from "@/lib/eta-data";
import { serializeRadarEta } from "@/lib/port-radar-serialize";
import { parseFeedRequest } from "../shared";

export const dynamic = "force-dynamic";

// Newly-added ETAs (most recent upload batch) — one page at a time.
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.activeWorkspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isSuperAdmin = session.user.isSuperAdmin ?? false;
  const { searchParams, page, pageSize } = await parseFeedRequest(request);

  // Country scope is derived inside listLatestBatchEtas from the workspace's
  // plan entitlement — do NOT pass it in, that's what caused the scope leak.
  const { etas, count } = await listLatestBatchEtas(searchParams, {
    includeAllCountries: isSuperAdmin,
    page,
    pageSize,
  });

  return NextResponse.json({
    etas: etas.map((eta) => serializeRadarEta(eta)),
    count,
    page,
    pageSize,
  });
}

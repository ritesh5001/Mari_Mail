import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/api";
import { listPortRadarFeed } from "@/lib/eta-data";
import { serializeRadarEta } from "@/lib/port-radar-serialize";
import { parseFeedRequest } from "../shared";

export const dynamic = "force-dynamic";

// Upcoming arrivals feed — one page at a time for the client-side pager.
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.activeWorkspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isSuperAdmin = session.user.isSuperAdmin ?? false;
  const { searchParams, page, pageSize } = await parseFeedRequest(request);

  const { etas, count } = await listPortRadarFeed(searchParams, {
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

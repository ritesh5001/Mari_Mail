import { NextResponse } from "next/server";
import { prisma } from "@marimail/db";
import { getServerSession } from "@/lib/api";
import {
  listMarineVesselContacts,
  toMarineVesselContactView,
} from "@/lib/marine-row-data";
import type { MarineVesselContactsResponse } from "@/lib/marine-row-views";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { vesselId: string } },
) {
  const session = await getServerSession();
  if (!session?.activeWorkspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ds = await prisma.dataSourceSettings.findUnique({ where: { id: "singleton" } });
  if (ds && !ds.internalEnabled) {
    return NextResponse.json({ rows: [], internalDisabled: true } as MarineVesselContactsResponse & { internalDisabled: true });
  }

  const result = await listMarineVesselContacts(params.vesselId);
  if (!result) {
    return NextResponse.json({ error: "Vessel not found" }, { status: 404 });
  }
  const payload: MarineVesselContactsResponse = {
    rows: result.rows.map(toMarineVesselContactView),
  };
  return NextResponse.json(payload);
}

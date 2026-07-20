import { NextResponse } from "next/server";
import { prisma } from "@marimail/db";
import { getServerSession } from "@/lib/api";
import {
  associatedContactRowsForVessels,
  associationVesselInclude,
  listContactsForVessels,
  workspaceScope,
} from "@/lib/association-data";
import { toMarineVesselContactView } from "@/lib/marine-row-data";
import type { MarineVesselContactView } from "@/lib/marine-row-views";

export const dynamic = "force-dynamic";

type HistogramResponse = {
  histogram: Array<{ role: string; count: number }>;
  totalMatched: number;
  totalWithRole: number;
};

// Full canonical order of marine roles; the histogram surfaces all of them so
// the picker in the UI can show "0" chips and still support selection.
const ALL_MARINE_ROLES = [
  "FLEET_MANAGER",
  "SHIP_SUPERINTENDENT",
  "TECHNICAL_MANAGER",
  "CREWING_MANAGER",
  "CHARTERING_MANAGER",
  "PORT_CAPTAIN",
  "MARINE_SURVEYOR",
  "CLASS_SURVEYOR",
  "UNDERWRITER",
  "BROKER",
  "PORT_AGENT",
  "CHANDLER",
  "BUNKER_TRADER",
  "OPA_PROVIDER",
  "OTHER",
] as const;

type RowsResponse = { rows: MarineVesselContactView[] };

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession();
  const workspaceId = session?.activeWorkspace?.id;
  const userId = session?.user?.id;
  if (!workspaceId || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const list = await prisma.contactList.findFirst({
    where: { id: params.id, ...workspaceScope(workspaceId), ownerId: userId },
    select: { id: true },
  });
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  const vessels = await prisma.vessel.findMany({
    where: {
      AND: [workspaceScope(workspaceId), { listMemberships: { some: { listId: list.id } } }],
    },
    include: associationVesselInclude,
  });

  const url = new URL(request.url);
  const roleParams = url.searchParams.getAll("role");
  const rolesParam = url.searchParams.get("roles");
  const selectedRoles = new Set<string>(
    [...roleParams, ...(rolesParam ? rolesParam.split(",") : [])]
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  const wantRows = selectedRoles.size > 0;

  if (vessels.length === 0) {
    if (wantRows) {
      return NextResponse.json({ rows: [] } satisfies RowsResponse);
    }
    return NextResponse.json({
      histogram: ALL_MARINE_ROLES.map((role) => ({ role, count: 0 })),
      totalMatched: 0,
      totalWithRole: 0,
    } satisfies HistogramResponse);
  }

  const contacts = await listContactsForVessels(workspaceId, vessels);
  const rowsByVessel = associatedContactRowsForVessels(vessels, contacts);

  // Dedupe by contactId across all vessels; keep first match for match metadata.
  const seen = new Map<string, ReturnType<typeof toMarineVesselContactView>>();
  for (const rows of rowsByVessel.values()) {
    for (const row of rows) {
      if (seen.has(row.contact.id)) continue;
      seen.set(row.contact.id, toMarineVesselContactView(row));
    }
  }
  const all = Array.from(seen.values());

  if (wantRows) {
    const filtered = all.filter((c) => c.marineRole && selectedRoles.has(c.marineRole));
    return NextResponse.json({ rows: filtered } satisfies RowsResponse);
  }

  const counts = new Map<string, number>();
  let totalWithRole = 0;
  for (const c of all) {
    if (!c.marineRole) continue;
    totalWithRole += 1;
    counts.set(c.marineRole, (counts.get(c.marineRole) ?? 0) + 1);
  }
  // Always emit every canonical role — zero-count chips are still selectable,
  // and the ordering (present-first, then the canonical order) keeps the
  // frequently used roles at the top of the picker.
  const histogram = ALL_MARINE_ROLES.map((role) => ({ role, count: counts.get(role) ?? 0 })).sort(
    (a, b) => b.count - a.count,
  );

  return NextResponse.json({
    histogram,
    totalMatched: all.length,
    totalWithRole,
  } satisfies HistogramResponse);
}

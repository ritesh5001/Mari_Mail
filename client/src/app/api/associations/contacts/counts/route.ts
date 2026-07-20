import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/api";
import { countAssociatedVesselsForContacts } from "@/lib/association-data";
import type { AssociationCountsResponse } from "@/lib/marine-row-views";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.activeWorkspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { contactIds?: unknown } | null;
  const contactIds = Array.isArray(body?.contactIds)
    ? body.contactIds.filter((id): id is string => typeof id === "string")
    : [];

  if (contactIds.length === 0) {
    return NextResponse.json({ counts: {} } satisfies AssociationCountsResponse);
  }

  const counts = await countAssociatedVesselsForContacts(
    session.activeWorkspace.id,
    Array.from(new Set(contactIds)).slice(0, 100),
  );
  const payload: AssociationCountsResponse = {
    counts: Object.fromEntries(counts.entries()),
  };
  return NextResponse.json(payload);
}

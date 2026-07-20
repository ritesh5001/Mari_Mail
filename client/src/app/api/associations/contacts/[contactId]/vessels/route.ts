import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/api";
import {
  listAssociatedVesselsForContact,
  toAssociatedVesselView,
} from "@/lib/association-data";
import type { AssociatedVesselsResponse } from "@/lib/marine-row-views";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { contactId: string } },
) {
  const session = await getServerSession();
  if (!session?.activeWorkspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await listAssociatedVesselsForContact(session.activeWorkspace.id, params.contactId);
  if (!rows) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const payload: AssociatedVesselsResponse = {
    rows: rows.map(toAssociatedVesselView),
  };
  return NextResponse.json(payload);
}

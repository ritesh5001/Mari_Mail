import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { BlocklistAdmin } from "@/components/lists/BlocklistAdmin";
import { apiUrl, getServerSession } from "@/lib/api";
import type { BlocklistDTO } from "@/lib/blocklist-types";

export const dynamic = "force-dynamic";

async function loadBlocklist(): Promise<BlocklistDTO | null> {
  const res = await fetch(`${apiUrl}/api/blocklist`, {
    headers: { Cookie: cookies().toString() },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { data: BlocklistDTO };
  return payload.data;
}

/**
 * Moved here from /dashboard/blocked. A blocklist is a standing rule about who
 * this workspace never contacts — that is a setting, not a data set you browse,
 * and it belongs beside the other campaign rules rather than next to Vessels
 * and Revealed contacts. The old URL redirects.
 */
export default async function BlockedSettingsPage() {
  const session = await getServerSession();
  if (!session?.activeWorkspace) notFound();

  const initial = await loadBlocklist();
  if (!initial) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
        Failed to load your blocked list. Make sure the API server is running.
      </div>
    );
  }

  return <BlocklistAdmin initial={initial} />;
}

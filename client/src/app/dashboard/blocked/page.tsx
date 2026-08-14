import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { apiUrl, getServerSession } from "@/lib/api";
import { BlocklistAdmin } from "@/components/lists/BlocklistAdmin";

export const dynamic = "force-dynamic";

export type BlockDTO = {
  id: string;
  kind: "CONTACT" | "COMPANY";
  value: string;
  label: string | null;
  contactId: string | null;
  reason: string | null;
  createdAt: string;
};

export type BlocklistDTO = {
  blocks: BlockDTO[];
  counts: { contacts: number; companies: number };
};

async function loadBlocklist(): Promise<BlocklistDTO | null> {
  const res = await fetch(`${apiUrl}/api/blocklist`, {
    headers: { Cookie: cookies().toString() },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { data: BlocklistDTO };
  return payload.data;
}

export default async function BlockedPage() {
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

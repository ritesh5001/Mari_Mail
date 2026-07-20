import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiUrl, getServerSession } from "@/lib/api";
import { InboxesManager } from "@/components/inboxes/InboxesManager";

export const dynamic = "force-dynamic";

type InboxDTO = Parameters<typeof InboxesManager>[0]["initialInboxes"][number];

async function loadInboxes(): Promise<InboxDTO[] | null> {
  const cookieHeader = cookies().toString();
  const response = await fetch(`${apiUrl}/api/inboxes`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { data: { accounts: InboxDTO[] } };
  return payload.data.accounts;
}

export default async function InboxesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const inboxes = (await loadInboxes()) ?? [];
  const oauth = typeof searchParams.oauth === "string" ? searchParams.oauth : null;

  return (
    <InboxesManager
      initialInboxes={inboxes}
      userEmail={session.user.email}
      oauthStatus={oauth}
    />
  );
}

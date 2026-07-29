import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiUrl, getServerSession } from "@/lib/api";
import { InboxesManager } from "@/components/inboxes/InboxesManager";

export const dynamic = "force-dynamic";

type InboxDTO = Parameters<typeof InboxesManager>[0]["initialInboxes"][number];

/**
 * Load result is a discriminated union, not `InboxDTO[] | null`.
 *
 * The caller used to do `(await loadInboxes()) ?? []`, which collapsed "the
 * request failed" into "you have no inboxes". A user with mailboxes already
 * connected would be told to connect their first one — and on this page that
 * means re-entering SMTP credentials or redoing OAuth for something that was
 * never actually missing.
 */
type LoadResult = { ok: true; inboxes: InboxDTO[] } | { ok: false };

async function loadInboxes(): Promise<LoadResult> {
  try {
    const cookieHeader = cookies().toString();
    const response = await fetch(`${apiUrl}/api/inboxes`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (!response.ok) return { ok: false };
    const payload = (await response.json()) as { data: { accounts: InboxDTO[] } };
    return { ok: true, inboxes: payload.data.accounts ?? [] };
  } catch {
    return { ok: false };
  }
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

  const result = await loadInboxes();
  const oauth = typeof searchParams.oauth === "string" ? searchParams.oauth : null;

  return (
    <InboxesManager
      initialInboxes={result.ok ? result.inboxes : []}
      loadFailed={!result.ok}
      userEmail={session.user.email}
      oauthStatus={oauth}
    />
  );
}

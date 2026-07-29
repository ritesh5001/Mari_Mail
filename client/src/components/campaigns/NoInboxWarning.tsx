import { cookies } from "next/headers";
import Link from "next/link";
import { cache } from "react";
import { AlertTriangle } from "lucide-react";
import { apiUrl } from "@/lib/api";

/**
 * A workspace with no sending mailbox cannot create or activate a campaign —
 * the API rejects both with `NO_SENDING_MAILBOX`. Until now that only surfaced
 * as an error toast at the end of the builder, after the user had already
 * picked a list, written the steps and set the schedule. This banner moves the
 * blocker to the top of the campaign pages, where it costs nothing to fix.
 *
 * Cached per request so the cold and ETA pages don't each pay a round-trip.
 */
const hasSendingInbox = cache(async (): Promise<boolean> => {
  try {
    const response = await fetch(`${apiUrl}/api/inboxes`, {
      headers: { Cookie: cookies().toString() },
      cache: "no-store",
    });
    // A failed lookup must not invent a blocker. Warning someone who *does*
    // have inboxes connected is worse than staying quiet — they'd go
    // re-authorise a mailbox that was never missing.
    if (!response.ok) return true;
    const payload = (await response.json()) as { data?: { accounts?: unknown[] } };
    return (payload.data?.accounts?.length ?? 0) > 0;
  } catch {
    return true;
  }
});

export async function NoInboxWarning() {
  if (await hasSendingInbox()) return null;

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-500/10">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          No sending mailbox connected
        </p>
        <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-200/70">
          Campaigns send from your own mailbox, so you&rsquo;ll need to connect one before you can
          create or launch a campaign. It takes about a minute.
        </p>
      </div>
      <Link
        href="/dashboard/inboxes"
        className="shrink-0 rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-semibold text-[#ffffff] transition-colors hover:bg-accent-600"
      >
        Connect inbox
      </Link>
    </div>
  );
}

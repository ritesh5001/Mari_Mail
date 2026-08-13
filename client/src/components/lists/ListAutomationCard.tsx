import { CalendarClock, CheckCircle2, PauseCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ListAutomation } from "@/lib/contact-data";

/**
 * What is topping this list up on its own.
 *
 * Without this the contact count simply moves overnight and nothing on the page
 * says why — the filter, the rate and the schedule all live in the admin area,
 * so from the list itself people appear from nowhere. Shown per list, on the
 * list it actually feeds.
 */

/** The drip cron runs at 07:00 UTC; say when that next falls in local time. */
function nextRunLabel(): string {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(7, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  const hours = (next.getTime() - now.getTime()) / 3_600_000;
  const when = next.toLocaleString(undefined, {
    weekday: "short", hour: "2-digit", minute: "2-digit",
  });
  return `${when} (in ${hours < 1 ? "under an hour" : `${Math.round(hours)}h`})`;
}

const TONE = {
  ACTIVE: {
    box: "border-emerald-300 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-400/10",
    text: "text-emerald-900 dark:text-emerald-200",
    Icon: CalendarClock,
  },
  PAUSED: {
    box: "border-slate-300 bg-slate-50 dark:border-white/15 dark:bg-white/[0.04]",
    text: "text-slate-700 dark:text-white/70",
    Icon: PauseCircle,
  },
  COMPLETED: {
    box: "border-sky-300 bg-sky-50 dark:border-sky-400/30 dark:bg-sky-400/10",
    text: "text-sky-900 dark:text-sky-200",
    Icon: CheckCircle2,
  },
  FAILED: {
    box: "border-rose-300 bg-rose-50 dark:border-rose-400/30 dark:bg-rose-400/10",
    text: "text-rose-900 dark:text-rose-200",
    Icon: TriangleAlert,
  },
} as const;

export function ListAutomationCard({
  automations,
  isSuperAdmin,
}: {
  automations: ListAutomation[];
  isSuperAdmin: boolean;
}) {
  if (automations.length === 0) return null;

  return (
    <section className="space-y-2">
      {automations.map((a) => {
        const tone = TONE[a.status];
        const remaining =
          a.totalMatches !== null ? Math.max(0, a.totalMatches - a.added) : null;
        const daysLeft =
          remaining !== null && a.dailyLimit > 0 ? Math.ceil(remaining / a.dailyLimit) : null;
        const pct =
          a.totalMatches && a.totalMatches > 0
            ? Math.min(100, (a.added / a.totalMatches) * 100)
            : null;

        return (
          <div key={a.id} className={`rounded-lg border p-4 shadow-sm ${tone.box}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <tone.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.text}`} />
                <div>
                  <p className={`text-sm font-semibold ${tone.text}`}>
                    {a.status === "ACTIVE"
                      ? `Automation running — adding ${a.dailyLimit} contacts a day`
                      : a.status === "PAUSED"
                        ? "Automation paused"
                        : a.status === "COMPLETED"
                          ? "Automation finished — no more matches"
                          : "Automation stopped"}
                  </p>
                  <p className={`mt-0.5 text-[11px] opacity-80 ${tone.text}`}>
                    Matching {a.filterSummary}
                  </p>
                </div>
              </div>
              {isSuperAdmin ? (
                <Link
                  href="/dashboard/admin/contact-source/drips"
                  className={`shrink-0 rounded-md border border-current/20 px-2.5 py-1 text-[11px] font-medium ${tone.text} hover:opacity-80`}
                >
                  Manage
                </Link>
              ) : null}
            </div>

            <dl className={`mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-4 ${tone.text}`}>
              <div>
                <dt className="opacity-70">Added so far</dt>
                <dd className="mt-0.5 text-sm font-semibold">{a.added.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="opacity-70">Per day</dt>
                <dd className="mt-0.5 text-sm font-semibold">{a.dailyLimit}</dd>
              </div>
              <div>
                <dt className="opacity-70">Last run</dt>
                <dd className="mt-0.5 text-sm font-semibold">
                  {a.lastRunAt
                    ? `${new Date(a.lastRunAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}${
                        a.lastRunAdded !== null ? ` · +${a.lastRunAdded}` : ""
                      }`
                    : "not yet"}
                </dd>
              </div>
              <div>
                <dt className="opacity-70">{a.status === "ACTIVE" ? "Next run" : "Status"}</dt>
                <dd className="mt-0.5 text-sm font-semibold">
                  {a.status === "ACTIVE" ? nextRunLabel() : a.status.toLowerCase()}
                </dd>
              </div>
            </dl>

            {pct !== null ? (
              <div className="mt-3">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-current/15">
                  <div
                    className="h-full rounded-full bg-current"
                    style={{ width: `${Math.max(pct, 1)}%` }}
                  />
                </div>
                <p className={`mt-1 text-[11px] opacity-80 ${tone.text}`}>
                  {a.added.toLocaleString()} of {a.totalMatches?.toLocaleString()} matches
                  {daysLeft !== null && a.status === "ACTIVE" && daysLeft > 0
                    ? ` — about ${daysLeft.toLocaleString()} day${daysLeft === 1 ? "" : "s"} to go at this rate`
                    : ""}
                </p>
              </div>
            ) : null}

            {/* Reveals that found nothing, or people already on the list, cost
                nothing — but a long run of them is worth noticing. */}
            {a.skipped > 0 ? (
              <p className={`mt-2 text-[11px] opacity-70 ${tone.text}`}>
                {a.revealed.toLocaleString()} revealed · {a.skipped.toLocaleString()} skipped as
                already known or unavailable (no credits spent)
              </p>
            ) : null}

            {a.lastError ? (
              <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                {a.lastError}
              </p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CoinsIcon, MailOpen, PhoneCall, Waypoints } from "lucide-react";
import { ACTIVITY_PAGE_SIZE, getActivity, type ActivityKind } from "@/lib/activity-data";
import { getServerSession } from "@/lib/api";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const KIND_ICON = {
  credit: CoinsIcon,
  phone: PhoneCall,
  drip: Waypoints,
  reply: MailOpen,
} as const;

const KIND_LABEL: Record<ActivityKind, string> = {
  credit: "Credits",
  phone: "Phone reveals",
  drip: "Drips",
  reply: "Replies",
};

const FILTERS = ["all", "credit", "phone", "drip", "reply"] as const;

/**
 * The full activity history.
 *
 * Paged by timestamp rather than offset. The feed merges four independently
 * ordered tables, so "skip 30" has no shared meaning across them — but "older
 * than this instant" does, and it stays correct even when new events land
 * between page views.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getServerSession();
  if (!session?.activeWorkspace) notFound();

  const kindParam = typeof searchParams.kind === "string" ? searchParams.kind : "all";
  const kind = (FILTERS as readonly string[]).includes(kindParam) ? kindParam : "all";
  const before = typeof searchParams.before === "string" ? searchParams.before : null;

  // Over-fetch by one to learn whether another page exists without a count
  // query over four tables.
  const items = await getActivity(
    session.activeWorkspace.id,
    ACTIVITY_PAGE_SIZE + 1,
    before,
    kind as ActivityKind | "all",
  );
  const hasMore = items.length > ACTIVITY_PAGE_SIZE;
  const visible = items.slice(0, ACTIVITY_PAGE_SIZE);
  const nextCursor = hasMore ? visible[visible.length - 1]?.at : null;

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Activity</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-white/50">
            Credits, phone reveals, drip runs and replies across this workspace.
          </p>
        </div>

        <nav className="flex flex-wrap gap-1.5">
          {FILTERS.map((value) => {
            const active = kind === value;
            return (
              <Link
                key={value}
                href={value === "all" ? "/dashboard/activity" : `/dashboard/activity?kind=${value}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  active
                    ? "border-accent-500 bg-accent-500/10 text-accent-700 dark:text-accent-300"
                    : "border-slate-200 text-slate-600 hover:border-accent-300 hover:text-accent-600 dark:border-white/10 dark:text-white/60 dark:hover:border-accent-400/40 dark:hover:text-accent-300",
                )}
              >
                {value === "all" ? "Everything" : KIND_LABEL[value as ActivityKind]}
              </Link>
            );
          })}
        </nav>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        {visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500 dark:text-white/45">
            {kind === "all"
              ? "No activity yet. Reveals, drip runs and replies show up here."
              : `No ${KIND_LABEL[kind as ActivityKind].toLowerCase()} recorded yet.`}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {visible.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const row = (
                <div className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-500/10 text-accent-600 dark:text-accent-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-white/45">
                      {item.detail ? `${item.detail} · ` : ""}
                      {new Date(item.at).toLocaleString()}
                    </p>
                  </div>
                  {item.delta !== null ? (
                    <span
                      className={cn(
                        "shrink-0 text-sm font-semibold tabular-nums",
                        item.delta >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-slate-500 dark:text-white/45",
                      )}
                    >
                      {item.delta > 0 ? "+" : ""}
                      {item.delta.toLocaleString("en-US")}
                    </span>
                  ) : null}
                </div>
              );
              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="block transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    >
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {nextCursor ? (
          <div className="border-t border-slate-100 px-5 py-3 text-right dark:border-white/[0.06]">
            <Link
              href={{
                pathname: "/dashboard/activity",
                query: {
                  ...(kind === "all" ? {} : { kind }),
                  before: new Date(nextCursor).toISOString(),
                },
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-600 dark:text-accent-300"
            >
              Older
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}

import Link from "next/link";
import { CalendarClock, Ship, Sparkles } from "lucide-react";

export type RecentlyAddedEta = {
  id: string;
  vesselImo: string;
  vesselName: string;
  vesselType: string;
  flag: string | null;
  destinationPortCode: string;
  destinationPortName: string;
  etaIso: string;
  createdAtIso: string;
  source: string;
};

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatEta(iso: string, timeZone: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Horizontal card strip that highlights ETAs added in the last 24 hours.
 * Server-rendered (no interactivity) so it stays cheap even when the main
 * table is heavy. Clicking a card jumps to the vessel detail page.
 */
export function RecentlyAddedEtasStrip({
  etas,
  timeZone,
}: {
  etas: RecentlyAddedEta[];
  timeZone: string;
}) {
  if (etas.length === 0) return null;
  return (
    <section className="rounded-lg border border-ocean/30 bg-ocean/5 p-4 dark:border-ocean/40 dark:bg-ocean/10">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-ocean" />
        <p className="text-sm font-semibold text-slate-950 dark:text-white">
          Newly added arrivals
        </p>
        <span className="rounded-full bg-ocean/15 px-2 py-0.5 text-[11px] font-semibold text-ocean">
          {etas.length}
        </span>
        <p className="ml-auto text-[11px] text-slate-500 dark:text-white/60">
          ETAs added in the last 24 h
        </p>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {etas.map((eta) => (
          <Link
            key={eta.id}
            href={`/dashboard/vessels/${eta.vesselImo}`}
            className="flex min-w-[240px] max-w-[280px] shrink-0 flex-col gap-1.5 rounded-md border border-slate-200 bg-white p-3 shadow-sm transition hover:border-ocean dark:border-white/10 dark:bg-white/[0.03]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-950 dark:text-white">
                <Ship className="h-3.5 w-3.5 text-ocean" />
                <span className="truncate" title={eta.vesselName}>
                  {eta.vesselName || eta.vesselImo}
                </span>
              </span>
              <span className="shrink-0 text-[10px] font-medium text-slate-400 dark:text-white/40">
                {timeAgo(eta.createdAtIso)}
              </span>
            </div>
            <p className="truncate text-[11px] text-slate-500 dark:text-white/50" title={eta.destinationPortName}>
              {eta.destinationPortName}{" "}
              <span className="text-slate-400">({eta.destinationPortCode})</span>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                <CalendarClock className="h-3 w-3" />
                {formatEta(eta.etaIso, timeZone)}
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-white/10 dark:bg-transparent dark:text-white/50">
                {formatEnum(eta.vesselType)}
              </span>
              {eta.flag ? (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-white/10 dark:bg-transparent dark:text-white/50">
                  {eta.flag}
                </span>
              ) : null}
              <span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/[0.06] dark:text-white/50">
                {formatEnum(eta.source)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

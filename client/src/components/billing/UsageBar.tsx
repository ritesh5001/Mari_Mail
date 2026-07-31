import { UNLIMITED } from "@marimail/utils/plans";
import { cn } from "@/lib/cn";

/**
 * One usage meter: used vs the plan's limit.
 *
 * Colour is a secondary encoding only — the numbers above the bar always state
 * the position exactly, so the meter reads correctly in greyscale, under
 * colour-blindness, and in forced-colours mode.
 */
export function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  // Enterprise limits are a sentinel, not a real ceiling. Drawing a bar at
  // 0.0000004% would be noise pretending to be information.
  const unlimited = limit >= UNLIMITED;
  const pct = unlimited || limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const over = !unlimited && used >= limit;
  const near = !unlimited && !over && pct >= 80;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-white/50">{label}</span>
        <span className="text-xs tabular-nums text-slate-500 dark:text-white/45">
          <span className="font-semibold text-slate-900 dark:text-white">
            {used.toLocaleString("en-US")}
          </span>
          {unlimited ? " / unlimited" : ` / ${limit.toLocaleString("en-US")}`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.08]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            over ? "bg-red-500" : near ? "bg-amber-500" : "bg-accent-500",
          )}
          style={{ width: `${unlimited ? 0 : Math.max(pct, used > 0 ? 2 : 0)}%` }}
        />
      </div>
      {over ? (
        <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
          Limit reached — upgrade to add more.
        </p>
      ) : null}
    </div>
  );
}

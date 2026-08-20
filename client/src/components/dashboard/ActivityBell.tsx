"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CoinsIcon, MailOpen, PhoneCall, Waypoints } from "lucide-react";
import type { ActivityItem, ActivityKind } from "@/lib/activity-data";
import { cn } from "@/lib/cn";

const KIND_ICON: Record<ActivityKind, typeof Bell> = {
  credit: CoinsIcon,
  phone: PhoneCall,
  drip: Waypoints,
  reply: MailOpen,
};

/**
 * Compact relative time: "2m", "7h", "3d".
 *
 * Computed on the client after mount rather than during render — the server
 * and the browser evaluate `Date.now()` at different moments, and rendering a
 * relative time in both places is a guaranteed hydration mismatch.
 */
function useRelativeTime(at: Date | string) {
  const [label, setLabel] = useState<string | null>(null);
  // Depend on the epoch value, not the Date object: React Server Components
  // hand over a fresh Date instance on every payload, so an object dependency
  // would restart the interval on each render.
  const time = new Date(at).getTime();
  useEffect(() => {
    const format = () => {
      const seconds = Math.max(0, (Date.now() - time) / 1000);
      if (seconds < 60) return "now";
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
      if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
      return `${Math.floor(seconds / 86_400)}d`;
    };
    setLabel(format());
    const timer = setInterval(() => setLabel(format()), 60_000);
    return () => clearInterval(timer);
  }, [time]);
  return label;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const Icon = KIND_ICON[item.kind];
  const relative = useRelativeTime(item.at);

  const body = (
    <>
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-500/10 text-accent-600 dark:text-accent-300">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-slate-900 dark:text-white">
          {item.title}
        </span>
        {item.detail ? (
          <span className="block truncate text-xs text-slate-500 dark:text-white/45">
            {item.detail}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-right">
        {item.delta !== null ? (
          <span
            className={cn(
              "block text-xs font-semibold tabular-nums",
              item.delta >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-slate-500 dark:text-white/45",
            )}
          >
            {item.delta > 0 ? "+" : ""}
            {item.delta.toLocaleString("en-US")}
          </span>
        ) : null}
        {/* Empty until the effect runs; reserving no width would make the row
            jump on mount. */}
        <span className="block text-[11px] tabular-nums text-slate-400 dark:text-white/30">
          {relative ?? " "}
        </span>
      </span>
    </>
  );

  const className = "flex items-start gap-2.5 rounded-md px-2 py-2 text-left";

  if (!item.href) {
    return <div className={className}>{body}</div>;
  }
  return (
    <Link
      href={item.href}
      className={cn(className, "transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.05]")}
    >
      {body}
    </Link>
  );
}

/**
 * The header bell.
 *
 * Items are handed down from the dashboard layout, which is a server
 * component — the same way the onboarding progress reaches the shell. That
 * keeps the aggregation on the server with direct database access and means
 * there is no `/api/activity` endpoint to build, secure and version.
 *
 * Opens on click rather than hover: the workspace switcher beside it is
 * hover-driven and small, and two overlapping hover panels in the same corner
 * fight each other.
 */
export function ActivityBell({ items }: { items: ActivityItem[] }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapper}>
      <button
        type="button"
        aria-label="Activity"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.08] dark:hover:text-white"
      >
        <Bell className="h-4 w-4" />
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-1 shadow-[0_18px_50px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0F0D14] dark:shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
          <p className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-white/35">
            Activity
          </p>

          {items.length === 0 ? (
            <p className="px-2 pb-3 pt-1 text-sm text-slate-500 dark:text-white/45">
              Nothing yet. Reveals, drip runs and replies show up here.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {items.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </div>
          )}

          <Link
            href="/dashboard/activity"
            onClick={() => setOpen(false)}
            className="mt-1 block border-t border-slate-100 px-2 py-2.5 text-center text-xs font-semibold text-accent-600 hover:bg-slate-50 dark:border-white/[0.06] dark:text-accent-300 dark:hover:bg-white/[0.05]"
          >
            See all activity
          </Link>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Date-range control for the Overview.
 *
 * Was a set of <Link>s, so every range change was a full navigation that blew
 * away the whole KPI grid and re-ran the Suspense fallback. Now it's a shallow
 * `replace` inside a transition: the previous numbers stay on screen (dimmed)
 * while the new ones stream in, which reads as instant instead of a flash.
 */
export function RangeSwitcher({ ranges, active }: { ranges: number[]; active: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function select(range: number) {
    if (range === active) return;
    const next = new URLSearchParams(params.toString());
    next.set("range", String(range));
    startTransition(() => {
      router.replace(`/dashboard?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 transition-opacity dark:border-white/10 dark:bg-white/[0.04] ${
        pending ? "opacity-60" : ""
      }`}
      role="group"
      aria-label="Select date range"
      aria-busy={pending}
    >
      {ranges.map((range) => {
        const isActive = range === active;
        return (
          <button
            key={range}
            type="button"
            onClick={() => select(range)}
            aria-pressed={isActive}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              isActive
                ? "bg-accent-500 text-[#ffffff] shadow-sm"
                : "text-slate-600 hover:bg-white hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/[0.08] dark:hover:text-white"
            }`}
          >
            {range}d
          </button>
        );
      })}
    </div>
  );
}

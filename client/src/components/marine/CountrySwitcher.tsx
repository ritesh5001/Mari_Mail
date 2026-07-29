"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";

export type CountryBreakdown = { country: string; countryName: string; count: number };

/**
 * One-click country switching for a workspace whose plan grants more than one.
 *
 * Before this, a two-country workspace got a single undifferentiated feed with
 * a tab named after whichever country happened to own the alphabetically-first
 * port. The only way to see one market at a time was the Destination-country
 * multi-select buried in the filter modal — which also listed all 210 countries
 * in the world, most of them unavailable.
 *
 * Writes the same `?destCountry` param the filter panel uses, so the two stay
 * in sync rather than fighting. The server clamps that param to the plan's
 * grant regardless of what arrives (see `resolveCountryFilter`); this control
 * only ever offers countries the workspace actually has.
 */
export function CountrySwitcher({ countries }: { countries: CountryBreakdown[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const selected = (searchParams?.get("destCountry") ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  const total = countries.reduce((sum, c) => sum + c.count, 0);

  const select = (country: string | null) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (country) params.set("destCountry", country);
    else params.delete("destCountry");
    // Paging is per-filter; keeping ?page=3 while switching country lands the
    // user on an empty page of a smaller result set.
    params.delete("page");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `/dashboard/port-radar?${qs}` : "/dashboard/port-radar", {
        scroll: false,
      });
    });
  };

  // A multi-country selection (made in the filter panel) can't be represented
  // by a single chip — show nothing active rather than lying about which.
  const activeCountry = selected.length === 1 ? selected[0] : null;
  const allActive = selected.length === 0;

  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center gap-2 transition-opacity",
        pending && "opacity-60",
      )}
      role="group"
      aria-label="Filter arrivals by country"
    >
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-white/35">
        Country
      </span>

      <Chip label="All" count={total} active={allActive} onClick={() => select(null)} />
      {countries.map((entry) => (
        <Chip
          key={entry.country}
          label={entry.countryName}
          count={entry.count}
          active={activeCountry === entry.country}
          onClick={() => select(entry.country)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-accent-500 bg-accent-500 text-[#ffffff]"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.08]",
      )}
    >
      {label}
      <span
        className={cn(
          "text-xs tabular-nums",
          // The count is a secondary detail; it must not compete with the
          // country name for attention at either state.
          active ? "text-[#ffffff]/75" : "text-slate-400 dark:text-white/40",
        )}
      >
        {count}
      </span>
    </button>
  );
}

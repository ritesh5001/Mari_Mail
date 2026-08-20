"use client";

import { cn } from "@/lib/cn";
import { VESSEL_TYPE_CATEGORIES, formatVesselEnum } from "@/lib/vessel-filter-options";

/**
 * Vessel types as grouped toggle chips.
 *
 * Replaces a `<select multiple>` — a control that requires ctrl/cmd-click to
 * pick more than one, silently drops the whole selection on a plain click, and
 * showed raw enum names (`TANKER_CRUDE`) in a 7-row scroll box. Nothing about
 * it said "leave empty for all types" either, so an empty box read as an
 * unfinished form rather than the default.
 *
 * Grouped by the same categories the Port Radar filter uses, so "Tanker" means
 * the same set of hulls in both places.
 */
export function VesselTypePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const selected = new Set(value);

  function toggle(type: string) {
    const next = new Set(selected);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange(Array.from(next));
  }

  function toggleCategory(types: string[]) {
    const allOn = types.every((type) => selected.has(type));
    const next = new Set(selected);
    for (const type of types) {
      if (allOn) next.delete(type);
      else next.add(type);
    }
    onChange(Array.from(next));
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-white/45">
          {value.length === 0
            ? "Applies to every vessel type."
            : `${value.length} type${value.length === 1 ? "" : "s"} selected.`}
        </p>
        {value.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-accent-600 dark:text-white/45 dark:hover:text-accent-300"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="space-y-2.5">
        {VESSEL_TYPE_CATEGORIES.map((category) => {
          const allOn = category.types.every((type) => selected.has(type));
          return (
            <div key={category.label}>
              <button
                type="button"
                onClick={() => toggleCategory(category.types)}
                className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 transition-colors hover:text-accent-600 dark:text-white/35 dark:hover:text-accent-300"
              >
                {category.label}
                {category.types.length > 1 ? (allOn ? " · none" : " · all") : ""}
              </button>
              <div className="flex flex-wrap gap-1.5">
                {category.types.map((type) => {
                  const on = selected.has(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(type)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        on
                          ? "border-accent-500 bg-accent-500/10 text-accent-700 dark:text-accent-300"
                          : "border-slate-200 text-slate-600 hover:border-accent-300 hover:text-accent-600 dark:border-white/10 dark:text-white/60 dark:hover:border-accent-400/40 dark:hover:text-accent-300",
                      )}
                    >
                      {formatVesselEnum(type)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

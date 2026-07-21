"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import type { SortDirection, SortState } from "@/hooks/useClientSort";

/**
 * A clickable `<th>` that drives table sorting. Drop-in replacement for a plain
 * `<th>Label</th>` — pass the column's `sortKey`, the current `sort` state, and
 * an `onSort(key)` handler (from useClientSort's `toggle`, or a server-sort
 * callback). Shows a neutral / up / down caret reflecting the active column.
 *
 * Works for both client-side (useClientSort) and server-side sorting — the
 * parent decides what `onSort` does. When `sort` is null or points elsewhere the
 * column shows the neutral caret.
 */
export function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const direction: SortDirection | null = active ? sort!.direction : null;
  const justify =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <th className={`whitespace-nowrap px-4 py-3 ${className}`} aria-sort={ariaSort(direction)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group inline-flex w-full items-center gap-1 ${justify} text-left font-semibold uppercase tracking-wide transition-colors hover:text-ocean ${
          active ? "text-ocean" : ""
        }`}
        title={`Sort by ${label}`}
      >
        <span>{label}</span>
        {direction === "asc" ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
        ) : direction === "desc" ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-30 group-hover:opacity-60" />
        )}
      </button>
    </th>
  );
}

function ariaSort(direction: SortDirection | null): "ascending" | "descending" | "none" {
  if (direction === "asc") return "ascending";
  if (direction === "desc") return "descending";
  return "none";
}

"use client";

import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";
export type SortState = { key: string; direction: SortDirection } | null;

/** Value we know how to compare. Nullish always sorts last regardless of dir. */
type Comparable = string | number | boolean | Date | null | undefined;

/**
 * Client-side table sort for tables that hold all their rows in memory.
 *
 * `accessors` maps a column's sortKey to the comparable value for a row. Any
 * key without an accessor falls back to `row[key]`. Clicking the same column
 * toggles asc → desc; clicking a new column starts at asc. The sort is stable
 * (equal rows keep their original order) and nullish/empty values sort last.
 *
 * Returns the sorted rows plus the current sort state and a `toggle(key)`
 * handler to wire into <SortableHeader onSort>.
 */
export function useClientSort<T>(
  rows: T[],
  accessors: Record<string, (row: T) => Comparable> = {},
  initial: SortState = null,
) {
  const [sort, setSort] = useState<SortState>(initial);

  const toggle = (key: string) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null; // third click clears the sort
    });
  };

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const accessor =
      accessors[sort.key] ?? ((row: T) => (row as Record<string, unknown>)[sort.key] as Comparable);
    const dir = sort.direction === "asc" ? 1 : -1;
    // Decorate-sort-undecorate keeps it stable via the original index tiebreak.
    return rows
      .map((row, index) => ({ row, index, value: accessor(row) }))
      .sort((a, b) => {
        const cmp = compareValues(a.value, b.value);
        return cmp !== 0 ? cmp * dir : a.index - b.index;
      })
      .map((entry) => entry.row);
  }, [rows, sort, accessors]);

  return { sorted, sort, toggle };
}

function compareValues(a: Comparable, b: Comparable): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  // Nullish/empty always sink to the bottom, regardless of direction.
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (a instanceof Date || b instanceof Date) {
    return Number(new Date(a as Date)) - Number(new Date(b as Date));
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") {
    return a === b ? 0 : a ? 1 : -1;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

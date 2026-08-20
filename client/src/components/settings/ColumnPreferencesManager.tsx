"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";
import {
  COLUMN_PREFS_VERSION,
  marineDbColumns,
  portRadarColumns,
  vesselTableColumns,
  type StoredColumnPrefs,
  type TableColumn,
} from "@/lib/table-columns";

/**
 * The tables that persist column preferences.
 *
 * `tableId` must match the string each table passes to `useColumnPreferences`,
 * because that is what forms the localStorage key — get it wrong and this page
 * would report on a key nothing writes.
 */
const TABLES: Array<{ tableId: string; label: string; href: string; columns: () => TableColumn[] }> =
  [
    { tableId: "port-radar", label: "Port Radar arrivals", href: "/dashboard/port-radar", columns: portRadarColumns },
    { tableId: "vessels", label: "Vessels", href: "/dashboard/vessels", columns: vesselTableColumns },
    { tableId: "marine-db", label: "Marine DB", href: "/dashboard/marine-db", columns: marineDbColumns },
  ];

const STORAGE_PREFIX = "marimail-cols-";

type Row = {
  tableId: string;
  label: string;
  href: string;
  total: number;
  visible: number;
  customised: boolean;
};

export function ColumnPreferencesManager() {
  // Written after mount only — localStorage during render would desync SSR
  // from the first client paint, the same rule useColumnPreferences follows.
  const [rows, setRows] = useState<Row[] | null>(null);

  const read = useCallback(() => {
    setRows(
      TABLES.map((table) => {
        const all = table.columns();
        const movable = all.filter((column) => !column.locked);
        const defaults = movable.filter((column) => !column.defaultHidden).length;

        let visible = defaults;
        let customised = false;
        try {
          const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${table.tableId}`);
          if (raw) {
            const parsed = JSON.parse(raw) as StoredColumnPrefs;
            if (parsed?.v === COLUMN_PREFS_VERSION && Array.isArray(parsed.order)) {
              visible = parsed.order.filter((pref) => pref.visible).length;
              customised = true;
            }
          }
        } catch {
          // Corrupted entry reads as "not customised", matching the hook's
          // own fallback rather than reporting a state the table won't show.
        }

        return {
          tableId: table.tableId,
          label: table.label,
          href: table.href,
          total: movable.length,
          visible,
          customised,
        };
      }),
    );
  }, []);

  useEffect(() => {
    read();
  }, [read]);

  function reset(tableId: string) {
    try {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${tableId}`);
    } catch {
      // Nothing to do — the row simply stays as it was.
    }
    read();
  }

  if (rows === null) return null;

  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-white/[0.06] dark:border-white/10">
      {rows.map((row) => (
        <li key={row.tableId} className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-white">{row.label}</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-white/45">
              {row.visible} of {row.total} optional columns shown
              {row.customised ? " · customised" : " · using defaults"}
            </p>
          </div>
          {row.customised ? (
            <button
              type="button"
              onClick={() => reset(row.tableId)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-accent-400 hover:text-accent-600 dark:border-white/10 dark:text-white/70 dark:hover:border-accent-400/50 dark:hover:text-accent-300"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          ) : null}
          <Link
            href={row.href}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent-600 dark:text-accent-300"
          >
            Open
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

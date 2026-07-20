"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COLUMN_PREFS_VERSION,
  type ColumnPref,
  type StoredColumnPrefs,
  type TableColumn,
} from "@/lib/table-columns";

const STORAGE_PREFIX = "marimail-cols-";

export type OrderedColumn = { col: TableColumn; visible: boolean };

export type UseColumnPreferences = {
  /** Render list: locked columns first, then movable columns that are visible, in order. */
  columns: TableColumn[];
  /** Every movable column (visible or not), in order, for the customizer UI. */
  orderedAll: OrderedColumn[];
  /** Locked columns shown (read-only) at the top of the customizer. */
  lockedColumns: TableColumn[];
  /** False during SSR and the first client paint — render schema defaults until true. */
  hydrated: boolean;
  setVisible: (id: string, visible: boolean) => void;
  reorder: (fromId: string, toId: string) => void;
  /** Batch-commit a working copy from the customizer. */
  save: (order: ColumnPref[]) => void;
  reset: () => void;
};

function defaultOrder(movable: TableColumn[]): ColumnPref[] {
  return movable.map((col) => ({ id: col.id, visible: !col.defaultHidden }));
}

function mergeStored(stored: ColumnPref[], movable: TableColumn[]): ColumnPref[] {
  const byId = new Map(movable.map((col) => [col.id, col]));
  const result: ColumnPref[] = [];
  const seen = new Set<string>();
  for (const pref of stored) {
    if (byId.has(pref.id) && !seen.has(pref.id)) {
      result.push({ id: pref.id, visible: pref.visible });
      seen.add(pref.id);
    }
  }
  // Append columns added to the schema after the prefs were saved.
  for (const col of movable) {
    if (!seen.has(col.id)) {
      result.push({ id: col.id, visible: !col.defaultHidden });
    }
  }
  return result;
}

export function useColumnPreferences(
  tableId: string,
  allColumns: TableColumn[],
): UseColumnPreferences {
  const storageKey = `${STORAGE_PREFIX}${tableId}`;

  const lockedColumns = useMemo(() => allColumns.filter((c) => c.locked), [allColumns]);
  const movableColumns = useMemo(() => allColumns.filter((c) => !c.locked), [allColumns]);
  const movableById = useMemo(
    () => new Map(movableColumns.map((col) => [col.id, col])),
    [movableColumns],
  );

  // Seed with schema defaults so SSR HTML matches the first client render.
  const [order, setOrder] = useState<ColumnPref[]>(() => defaultOrder(movableColumns));
  const [hydrated, setHydrated] = useState(false);

  // Apply persisted prefs after mount (never read localStorage during render).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredColumnPrefs;
        if (parsed && parsed.v === COLUMN_PREFS_VERSION && Array.isArray(parsed.order)) {
          setOrder(mergeStored(parsed.order, movableColumns));
        }
      }
    } catch {
      // Corrupted prefs — fall back to defaults already in state.
    }
    setHydrated(true);
  }, [storageKey, movableColumns]);

  const persist = useCallback(
    (next: ColumnPref[]) => {
      try {
        const payload: StoredColumnPrefs = { v: COLUMN_PREFS_VERSION, order: next };
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        // Ignore quota / unavailable storage.
      }
    },
    [storageKey],
  );

  const commit = useCallback(
    (next: ColumnPref[]) => {
      setOrder(next);
      persist(next);
    },
    [persist],
  );

  const setVisible = useCallback(
    (id: string, visible: boolean) => {
      commit(order.map((p) => (p.id === id ? { ...p, visible } : p)));
    },
    [commit, order],
  );

  const reorder = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const next = [...order];
      const fromIdx = next.findIndex((p) => p.id === fromId);
      const toIdx = next.findIndex((p) => p.id === toId);
      if (fromIdx === -1 || toIdx === -1) return;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      commit(next);
    },
    [commit, order],
  );

  const save = useCallback(
    (next: ColumnPref[]) => {
      commit(mergeStored(next, movableColumns));
    },
    [commit, movableColumns],
  );

  const reset = useCallback(() => {
    const next = defaultOrder(movableColumns);
    setOrder(next);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [movableColumns, storageKey]);

  const columns = useMemo(() => {
    const visibleMovable = order
      .filter((p) => p.visible)
      .map((p) => movableById.get(p.id))
      .filter((c): c is TableColumn => Boolean(c));
    return [...lockedColumns, ...visibleMovable];
  }, [order, movableById, lockedColumns]);

  const orderedAll = useMemo<OrderedColumn[]>(
    () =>
      order
        .map((p) => {
          const col = movableById.get(p.id);
          return col ? { col, visible: p.visible } : null;
        })
        .filter((entry): entry is OrderedColumn => Boolean(entry)),
    [order, movableById],
  );

  return { columns, orderedAll, lockedColumns, hydrated, setVisible, reorder, save, reset };
}

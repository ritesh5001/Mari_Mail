"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { ColumnPref, TableColumn } from "@/lib/table-columns";
import type { OrderedColumn } from "@/hooks/useColumnPreferences";

type Props = {
  title: string;
  lockedColumns: TableColumn[];
  orderedAll: OrderedColumn[];
  onClose: () => void;
  onSave: (order: ColumnPref[]) => void;
  onReset: () => void;
};

export function ColumnCustomizer({
  title,
  lockedColumns,
  orderedAll,
  onClose,
  onSave,
  onReset,
}: Props) {
  const [working, setWorking] = useState<OrderedColumn[]>(() => orderedAll.map((o) => ({ ...o })));
  const [search, setSearch] = useState("");
  const dragId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const searching = search.trim().length > 0;
  const term = search.trim().toLowerCase();

  const visibleList = useMemo(
    () =>
      searching
        ? working.filter(
            (o) =>
              o.col.label.toLowerCase().includes(term) ||
              (o.col.group ?? "").toLowerCase().includes(term),
          )
        : working,
    [working, searching, term],
  );

  /**
   * The list, cut into its schema groups.
   *
   * The vessel table carries 100+ columns and rendered them as one flat scroll,
   * so finding "Gross tonnage" meant reading past eighty unrelated fields.
   * Groups are emitted in first-appearance order rather than sorted, so the
   * headings follow the column order the table itself uses.
   *
   * Only while not searching: a filtered list is already short, and splitting
   * three matches under three headings is noise.
   */
  const groups = useMemo(() => {
    if (searching) return null;
    const out: Array<{ label: string; items: OrderedColumn[] }> = [];
    const byLabel = new Map<string, { label: string; items: OrderedColumn[] }>();
    for (const entry of visibleList) {
      const label = entry.col.group ?? "Other";
      let bucket = byLabel.get(label);
      if (!bucket) {
        bucket = { label, items: [] };
        byLabel.set(label, bucket);
        out.push(bucket);
      }
      bucket.items.push(entry);
    }
    return out.length > 1 ? out : null;
  }, [visibleList, searching]);

  const visibleCount = working.filter((o) => o.visible).length + lockedColumns.length;

  function toggle(id: string) {
    setWorking((prev) => prev.map((o) => (o.col.id === id ? { ...o, visible: !o.visible } : o)));
  }

  function setAll(visible: boolean) {
    setWorking((prev) => prev.map((o) => ({ ...o, visible })));
  }

  function setGroup(items: OrderedColumn[], visible: boolean) {
    const ids = new Set(items.map((o) => o.col.id));
    setWorking((prev) => prev.map((o) => (ids.has(o.col.id) ? { ...o, visible } : o)));
  }

  /**
   * Move a column one place up or down.
   *
   * Reordering used to be drag-and-drop only, which is unusable with a
   * keyboard and fiddly with a trackpad in a 380px-wide scrolling panel.
   * Dragging still works; this is the accessible path to the same result.
   */
  function move(id: string, direction: -1 | 1) {
    setWorking((prev) => {
      const index = prev.findIndex((o) => o.col.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  function handleDrop(targetId: string) {
    const from = dragId.current;
    dragId.current = null;
    setDragOverId(null);
    if (!from || from === targetId) return;
    setWorking((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((o) => o.col.id === from);
      const toIdx = next.findIndex((o) => o.col.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }

  function handleSave() {
    onSave(working.map((o) => ({ id: o.col.id, visible: o.visible })));
    onClose();
  }

  function handleReset() {
    onReset();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-[380px] flex-col border-l border-slate-200 bg-white shadow-xl dark:border-[#202026] dark:bg-[#0B0B0E]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-[#202026]">
          <div>
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white/90">{title}</h2>
            <p className="text-xs text-slate-500 dark:text-white/45">{visibleCount} columns shown</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-white/45 dark:hover:bg-[#17171C]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search + bulk actions */}
        <div className="space-y-2 border-b border-slate-200 px-5 py-3 dark:border-[#202026]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/35" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search columns…"
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-ocean dark:border-[#262631] dark:bg-[#08080B] dark:text-white/85 dark:focus:border-accent-300"
            />
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-white/55">
            <button onClick={() => setAll(true)} className="hover:text-ocean dark:hover:text-accent-300">
              Show all
            </button>
            <button onClick={() => setAll(false)} className="hover:text-ocean dark:hover:text-accent-300">
              Hide all
            </button>
            {searching ? (
              <span className="ml-auto text-slate-400 dark:text-white/35">
                Clear search to reorder
              </span>
            ) : null}
          </div>
        </div>

        {/* Column list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {lockedColumns.length > 0 ? (
            <div className="mb-2">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/35">
                Pinned
              </p>
              {lockedColumns.map((col) => (
                <div
                  key={col.id}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-500 dark:text-white/45"
                >
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate">{col.label}</span>
                </div>
              ))}
            </div>
          ) : null}

          {groups
            ? groups.map((group) => {
                const anyHidden = group.items.some((o) => !o.visible);
                return (
                  <div key={group.label} className="mb-2">
                    <div className="flex items-center gap-2 px-2 pb-1">
                      <p className="flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/35">
                        {group.label}
                      </p>
                      <button
                        onClick={() => setGroup(group.items, anyHidden)}
                        className="text-[11px] font-semibold text-slate-400 hover:text-accent-600 dark:text-white/30 dark:hover:text-accent-300"
                      >
                        {anyHidden ? "Show all" : "Hide all"}
                      </button>
                    </div>
                    {group.items.map((entry) => (
                      <ColumnRow
                        key={entry.col.id}
                        entry={entry}
                        searching={searching}
                        dragOverId={dragOverId}
                        onDragStart={() => {
                          dragId.current = entry.col.id;
                        }}
                        onDragOver={(e) => {
                          if (searching) return;
                          e.preventDefault();
                          setDragOverId(entry.col.id);
                        }}
                        onDragLeave={() =>
                          setDragOverId((cur) => (cur === entry.col.id ? null : cur))
                        }
                        onDrop={() => handleDrop(entry.col.id)}
                        onDragEnd={() => {
                          dragId.current = null;
                          setDragOverId(null);
                        }}
                        onToggle={() => toggle(entry.col.id)}
                        onMove={(dir) => move(entry.col.id, dir)}
                      />
                    ))}
                  </div>
                );
              })
            : visibleList.map((entry) => (
                <ColumnRow
                  key={entry.col.id}
                  entry={entry}
                  searching={searching}
                  dragOverId={dragOverId}
                  onDragStart={() => {
                    dragId.current = entry.col.id;
                  }}
                  onDragOver={(e) => {
                    if (searching) return;
                    e.preventDefault();
                    setDragOverId(entry.col.id);
                  }}
                  onDragLeave={() => setDragOverId((cur) => (cur === entry.col.id ? null : cur))}
                  onDrop={() => handleDrop(entry.col.id)}
                  onDragEnd={() => {
                    dragId.current = null;
                    setDragOverId(null);
                  }}
                  onToggle={() => toggle(entry.col.id)}
                  onMove={(dir) => move(entry.col.id, dir)}
                />
              ))}
          {visibleList.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-400 dark:text-white/35">No columns match.</p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 dark:border-[#202026]">
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-ocean dark:text-white/55 dark:hover:text-accent-300"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-[#262631] dark:text-white/70 dark:hover:bg-[#17171C]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-ocean dark:bg-accent-600 dark:hover:bg-accent-500"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One column row: drag handle, label, reorder buttons, visibility switch.
 *
 * The up/down buttons appear on hover or keyboard focus. They exist because
 * drag-and-drop was previously the only way to reorder — impossible without a
 * pointer, and awkward inside a narrow scrolling panel even with one.
 */
function ColumnRow({
  entry,
  searching,
  dragOverId,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onToggle,
  onMove,
}: {
  entry: OrderedColumn;
  searching: boolean;
  dragOverId: string | null;
  onDragStart: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onToggle: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const id = entry.col.id;
  return (
    <div
      draggable={!searching}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "group flex items-center gap-1.5 rounded-md px-2 py-2 text-sm",
        dragOverId === id
          ? "bg-ocean/10 dark:bg-accent-500/15"
          : "hover:bg-slate-50 dark:hover:bg-[#111116]",
      )}
    >
      <GripVertical
        className={cn(
          "h-4 w-4 shrink-0 text-slate-300 dark:text-white/25",
          searching ? "opacity-30" : "cursor-grab group-hover:text-slate-400",
        )}
      />
      <span
        className={cn(
          "flex-1 truncate",
          entry.visible ? "text-slate-800 dark:text-white/85" : "text-slate-400 dark:text-white/35",
        )}
      >
        {entry.col.label}
      </span>

      {!searching ? (
        <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            onClick={() => onMove(-1)}
            aria-label={`Move ${entry.col.label} up`}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onMove(1)}
            aria-label={`Move ${entry.col.label} down`}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : null}

      <button
        role="switch"
        aria-checked={entry.visible}
        aria-label={entry.visible ? `Hide ${entry.col.label}` : `Show ${entry.col.label}`}
        onClick={onToggle}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          entry.visible ? "bg-ocean dark:bg-accent-500" : "bg-slate-200 dark:bg-[#26262e]",
        )}
      >
        <span
          className={cn(
            "inline-flex h-4 w-4 items-center justify-center rounded-full bg-white shadow transition-transform",
            entry.visible ? "translate-x-4" : "translate-x-0.5",
          )}
        >
          {entry.visible ? (
            <Eye className="h-2.5 w-2.5 text-ocean" />
          ) : (
            <EyeOff className="h-2.5 w-2.5 text-slate-400" />
          )}
        </span>
      </button>
    </div>
  );
}

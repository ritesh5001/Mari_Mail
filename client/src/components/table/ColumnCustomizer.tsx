"use client";

import { useMemo, useRef, useState } from "react";
import { Eye, EyeOff, GripVertical, Lock, RotateCcw, Search, X } from "lucide-react";
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
    () => (searching ? working.filter((o) => o.col.label.toLowerCase().includes(term)) : working),
    [working, searching, term],
  );

  const visibleCount = working.filter((o) => o.visible).length + lockedColumns.length;

  function toggle(id: string) {
    setWorking((prev) => prev.map((o) => (o.col.id === id ? { ...o, visible: !o.visible } : o)));
  }

  function setAll(visible: boolean) {
    setWorking((prev) => prev.map((o) => ({ ...o, visible })));
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
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
              <span className="ml-auto text-slate-400 dark:text-white/35">Clear search to reorder</span>
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

          {visibleList.map((entry) => {
            const id = entry.col.id;
            return (
              <div
                key={id}
                draggable={!searching}
                onDragStart={() => {
                  dragId.current = id;
                }}
                onDragOver={(e) => {
                  if (searching) return;
                  e.preventDefault();
                  setDragOverId(id);
                }}
                onDragLeave={() => setDragOverId((cur) => (cur === id ? null : cur))}
                onDrop={() => handleDrop(id)}
                onDragEnd={() => {
                  dragId.current = null;
                  setDragOverId(null);
                }}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-2 text-sm",
                  dragOverId === id ? "bg-ocean/10 dark:bg-accent-500/15" : "hover:bg-slate-50 dark:hover:bg-[#111116]",
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
                <button
                  role="switch"
                  aria-checked={entry.visible}
                  aria-label={entry.visible ? `Hide ${entry.col.label}` : `Show ${entry.col.label}`}
                  onClick={() => toggle(id)}
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
          })}
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

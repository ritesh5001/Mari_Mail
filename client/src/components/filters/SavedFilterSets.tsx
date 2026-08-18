"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkPlus, Check, ChevronDown, Loader2, Pencil, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

export type SavedFilterEntityType = "VESSEL" | "CONTACT" | "COMPANY" | "ETA";

type SavedSet = { id: string; name: string; filterConfig: unknown };

/**
 * Save a filter, load it back later. Shared by every filter panel.
 *
 * This started life inside the contact search panel, hardwired to
 * `entityType: "CONTACT"` and to that panel's filter shape. Port Radar wanted
 * the same affordance, and the choice was to copy ~200 lines or to make this
 * one entity-agnostic — a second copy would have been a second set of
 * outside-click and rename bugs to fix twice.
 *
 * The contract is deliberately dumb about what a filter IS: the caller hands
 * over whatever JSON it wants persisted and gets that JSON back on load, so a
 * panel can change its filter shape without touching this file. Callers
 * normalise on the way back in, since a set saved months ago may predate
 * fields the panel has since gained.
 */
export function SavedFilterSets({
  entityType,
  value,
  hasFilter,
  onLoad,
  disabled,
  namePlaceholder = "e.g. My saved filter",
  mode = "both",
}: {
  entityType: SavedFilterEntityType;
  /** The JSON to persist when the user saves. */
  value: unknown;
  /** Whether there is anything worth saving — gates the Save button. */
  hasFilter: boolean;
  /** Receives the raw stored JSON; the caller normalises it. */
  onLoad: (filterConfig: unknown) => void;
  disabled?: boolean;
  namePlaceholder?: string;
  /**
   * Which halves to render.
   *
   * Saving belongs next to the filter being saved — inside the modal — while
   * loading belongs in the toolbar, where recalling a set should not cost a
   * trip through the modal first. Splitting one component rather than writing
   * two keeps the fetch, the outside-click handling and the naming popover in
   * a single place.
   *
   * "both" is the original toolbar control, still used by the contact filter.
   */
  mode?: "both" | "picker" | "save";
}) {
  const [sets, setSets] = useState<SavedSet[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [naming, setNaming] = useState<null | { mode: "create" } | { mode: "rename"; id: string }>(null);
  const [name, setName] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/saved-filters?entityType=${entityType}`);
      if (!res.ok) return;
      const body = (await res.json()) as {
        data?: { filters?: Array<{ id: string; name: string; filterConfig: unknown }> };
      };
      setSets(
        (body.data?.filters ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          filterConfig: row.filterConfig,
        })),
      );
    } catch {
      /* a missing preset list is not worth an error state */
    }
  }, [entityType]);

  useEffect(() => {
    void load();
  }, [load]);

  // Close the dropdown on outside click. Capture phase on purpose: deleting a
  // set unmounts its row synchronously, and a bubble-phase listener would then
  // test a detached node, read it as an outside click, and close the dropdown
  // out from under the user mid-manage.
  useEffect(() => {
    if (!open && !naming) return;
    function onDoc(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
        setNaming(null);
      }
    }
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [open, naming]);

  /**
   * Create a set, or update one in place.
   *
   * Updating goes through PATCH. It used to be DELETE followed by POST, which
   * left a window where a failed create had already destroyed the set with
   * nothing to undo from — losing a filter someone spent minutes building
   * because a request timed out is not a trade worth making for one route.
   */
  async function save(target?: { id: string; keepName?: boolean }) {
    const trimmed = name.trim();
    if (!target && trimmed.length < 2) return;
    setSaving(true);
    setError(null);
    try {
      const res = target
        ? await apiFetch(`/api/saved-filters/${target.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(target.keepName ? {} : { name: trimmed }),
              filterConfig: value,
            }),
          })
        : await apiFetch("/api/saved-filters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmed, entityType, filterConfig: value }),
          });

      if (!res.ok) {
        setError("Could not save that set.");
        return;
      }
      const payload = (await res.json()) as { data?: { id?: string } };
      setName("");
      setNaming(null);
      if (payload.data?.id) setLoadedId(payload.data.id);
      await load();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  /** A set already using the typed name — the overwrite candidate. */
  const nameClash = sets.find(
    (set) => set.name.trim().toLowerCase() === name.trim().toLowerCase() && naming?.mode === "create",
  );

  async function remove(id: string) {
    const res = await apiFetch(`/api/saved-filters/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSets((prev) => prev.filter((set) => set.id !== id));
      if (loadedId === id) setLoadedId(null);
    }
  }

  const loadedName = loadedId ? (sets.find((set) => set.id === loadedId)?.name ?? null) : null;

  return (
    <div ref={boxRef} className="relative flex items-center gap-2">
      {mode !== "save" ? (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex w-[124px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[12px] font-medium text-slate-700 shadow-sm transition hover:border-accent-400 hover:text-accent-600 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:border-accent-400/60"
      >
        <Bookmark className="h-3.5 w-3.5 shrink-0 text-accent-500" />
        <span className="min-w-0 flex-1 truncate text-left">
          {loadedName ? loadedName : `Saved sets${sets.length ? ` (${sets.length})` : ""}`}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform dark:text-white/40 ${open ? "rotate-180" : ""}`}
        />
      </button>
      ) : null}

      {/* Gated on `hasFilter` so empty presets never reach the dropdown. */}
      {mode !== "picker" ? (
      <button
        type="button"
        onClick={() => {
          setNaming({ mode: "create" });
          setName(loadedName ?? "");
          setOpen(false);
        }}
        disabled={disabled || !hasFilter}
        title={hasFilter ? "Save this filter as a set" : "Add some filters first"}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-accent-500/25 bg-accent-500/10 px-2.5 py-2 text-[12px] font-semibold text-accent-600 shadow-sm transition hover:bg-accent-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent-500/10 disabled:hover:text-accent-600 dark:text-accent-200 dark:disabled:hover:text-accent-200"
      >
        <BookmarkPlus className="h-3.5 w-3.5" />
        {mode === "save" ? "Save set" : "Save"}
      </button>
      ) : null}

      {naming ? (
        <div className="absolute right-0 top-full z-[70] mt-1 w-[340px] rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl dark:border-white/10 dark:bg-[#101013]">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
            {naming.mode === "rename" ? "Rename set" : "Name this filter set"}
          </label>
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void save(naming.mode === "rename" ? { id: naming.id } : undefined);
                }
                if (event.key === "Escape") {
                  setNaming(null);
                  setName("");
                }
              }}
              placeholder={namePlaceholder}
              className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-800 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            />
            <button
              type="button"
              onClick={() => void save(naming.mode === "rename" ? { id: naming.id } : undefined)}
              disabled={saving || name.trim().length < 2 || Boolean(nameClash)}
              className="inline-flex items-center gap-1 rounded-md bg-accent-500 px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-accent-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setNaming(null);
                setName("");
              }}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/[0.05]"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* A name that is already taken used to create a second set with the
              same label, leaving two indistinguishable rows in the dropdown.
              Offer the two things the user could actually mean instead. */}
          {nameClash ? (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-[11px] text-amber-900 dark:text-amber-200">
                &ldquo;{nameClash.name}&rdquo; already exists.
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void save({ id: nameClash.id, keepName: true })}
                  disabled={saving}
                  className="rounded-md bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
                >
                  Update it
                </button>
                <button
                  type="button"
                  onClick={() => setName(`${name.trim()} (copy)`)}
                  className="rounded-md border border-amber-300 px-2 py-1 text-[11px] font-medium text-amber-900 transition hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-500/15"
                >
                  Save as new
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">{error}</p>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className="absolute right-0 top-full z-[60] mt-1 w-[280px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#101013]">
          {sets.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-slate-500 dark:text-white/50">
              No saved sets yet. Configure filters and hit{" "}
              <span className="font-semibold text-accent-600 dark:text-accent-300">Save</span>.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {sets.map((set) => {
                const isLoaded = loadedId === set.id;
                return (
                  <li
                    key={set.id}
                    className={`group flex items-center gap-1 px-1.5 py-0.5 ${isLoaded ? "bg-accent-500/[0.06]" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onLoad(set.filterConfig);
                        setLoadedId(set.id);
                        setOpen(false);
                      }}
                      className="flex flex-1 items-center gap-2 truncate rounded px-2 py-1.5 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50 hover:text-accent-600 dark:text-white/80 dark:hover:bg-white/[0.05] dark:hover:text-accent-200"
                      title="Load this set"
                    >
                      {isLoaded ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-accent-500" />
                      ) : (
                        <Bookmark className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-white/40" />
                      )}
                      <span className="truncate">{set.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNaming({ mode: "rename", id: set.id });
                        setName(set.name);
                        setOpen(false);
                      }}
                      aria-label={`Rename ${set.name}`}
                      className="rounded p-1.5 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-accent-600 dark:hover:bg-white/[0.05]"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(set.id)}
                      aria-label={`Delete ${set.name}`}
                      className="rounded p-1.5 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

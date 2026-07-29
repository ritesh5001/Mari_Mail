"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkPlus, Filter, Loader2, Search, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

/**
 * Filter shape for the role picker. Callers hold this in state and re-fetch
 * when it changes; the panel is fully controlled so the parent decides when
 * to debounce, when to fire, etc.
 */
export type RoleFilter = {
  includeTitles: string[];
  excludeTitles: string[];
  includeCompanies: string[];
  excludeCompanies: string[];
  seniorities: string[];
};

/** Debounced live-suggestions loader — see RoleFilterPanel.fetchTitleSuggestions. */
type SuggestFn = (draft: string) => Promise<string[]>;

export const EMPTY_ROLE_FILTER: RoleFilter = {
  includeTitles: [],
  excludeTitles: [],
  includeCompanies: [],
  excludeCompanies: [],
  seniorities: [],
};

/**
 * Curated maritime-role suggestions that show up in the include-title
 * dropdown before the user has typed anything specific. Kept as a fallback
 * / initial state; the live suggestion loader takes over once the user
 * starts typing.
 */
const DEFAULT_TITLE_SUGGESTIONS = [
  "Fleet Manager",
  "Operations Manager",
  "Technical Superintendent",
  "Marine Superintendent",
  "Chartering Manager",
  "Broker",
  "Procurement Manager",
  "Purchase Manager",
  "Crewing Manager",
  "HSE Manager",
  "Vetting Manager",
  "Port Captain",
  "Commercial Manager",
  "Managing Director",
  "General Manager",
  "CEO",
  "COO",
];

// Seniority chips were removed from the UI on request — the filter surface
// stayed too crowded and users weren't reaching for them. The `seniorities`
// field is still on RoleFilter and still shipped to the server (Apollo can
// filter by seniority when we ask), but nothing in this component sets it
// anymore. Kept the type so old saved filters keep validating.

export function RoleFilterPanel({
  value,
  onChange,
  onApply,
  suggestionsFromResults,
  companySuggestionsFromResults,
  fetchTitleSuggestions,
  fetchCompanySuggestions,
  fetchAllTitles,
  fetchAllCompanies,
  disabled,
}: {
  value: RoleFilter;
  onChange: (next: RoleFilter) => void;
  onApply: () => void;
  // Titles that showed up in the last set of results — merged into the
  // dropdown so the user can pick a title they just saw instead of guessing.
  suggestionsFromResults?: string[];
  // Same idea for companies — feed distinct company names from the latest
  // Apollo rows so the exclude/include-company pickers show real matches.
  companySuggestionsFromResults?: string[];
  // Live-suggestions loader for the include-title input. Called with the
  // typed draft (debounced by the ChipInput) — return top-N matching titles.
  fetchTitleSuggestions?: SuggestFn;
  // Live-suggestions loader for the company pickers. Optional — without it,
  // suggestions fall back to `companySuggestionsFromResults` filtered locally.
  fetchCompanySuggestions?: SuggestFn;
  // Select-all loaders. Fetch every title / every company Apollo has for
  // these vessels' companies, in one shot. Powers the Select-all pill on
  // the Include-titles / Include-companies chip inputs.
  fetchAllTitles?: () => Promise<string[]>;
  fetchAllCompanies?: () => Promise<string[]>;
  disabled?: boolean;
}) {
  const totalActive =
    value.includeTitles.length +
    value.excludeTitles.length +
    value.includeCompanies.length +
    value.excludeCompanies.length +
    value.seniorities.length;

  function patch(part: Partial<RoleFilter>) {
    onChange({ ...value, ...part });
  }

  function clearAll() {
    onChange(EMPTY_ROLE_FILTER);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-ocean" />
        <p className="text-sm font-semibold text-slate-950 dark:text-white">Campaign by Role</p>
        {totalActive > 0 ? (
          <span className="rounded-full bg-ocean/10 px-2 py-0.5 text-[11px] font-semibold text-ocean">
            {totalActive}
          </span>
        ) : null}
        <p className="w-full text-xs text-slate-500 dark:text-white/60">
          Filter people at your vessels&rsquo; owner / manager companies. Search is free — only revealing an email or phone spends a credit.
        </p>

        {/* Saved filter sets — save the current include/exclude titles + companies
            as a named preset and reload it with one click next time. */}
        <div className="w-full">
          <SavedFilterSets value={value} onLoad={onChange} disabled={disabled} />
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <ChipInput
          label="Include job titles"
          placeholder="e.g. Fleet Manager, Chartering Manager"
          values={value.includeTitles}
          onChange={(next) => patch({ includeTitles: next })}
          suggestions={mergeSuggestions(DEFAULT_TITLE_SUGGESTIONS, suggestionsFromResults ?? [])}
          onFetchSuggestions={fetchTitleSuggestions}
          onFetchAllForSelectAll={fetchAllTitles}
          tone="include"
          disabled={disabled}
        />

        <ChipInput
          label="Exclude job titles"
          placeholder="e.g. Intern, Trainee"
          values={value.excludeTitles}
          onChange={(next) => patch({ excludeTitles: next })}
          suggestions={mergeSuggestions(DEFAULT_TITLE_SUGGESTIONS, suggestionsFromResults ?? [])}
          onFetchSuggestions={fetchTitleSuggestions}
          tone="exclude"
          disabled={disabled}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <ChipInput
            label="Include companies"
            placeholder="e.g. V.Group, Anglo-Eastern"
            values={value.includeCompanies}
            onChange={(next) => patch({ includeCompanies: next })}
            suggestions={companySuggestionsFromResults ?? []}
            onFetchSuggestions={fetchCompanySuggestions}
            onFetchAllForSelectAll={fetchAllCompanies}
            tone="include"
            disabled={disabled}
            emptyHint="Type a company name to filter results."
          />
          <ChipInput
            label="Exclude companies"
            placeholder="e.g. Third-party surveyors"
            values={value.excludeCompanies}
            onChange={(next) => patch({ excludeCompanies: next })}
            suggestions={companySuggestionsFromResults ?? []}
            onFetchSuggestions={fetchCompanySuggestions}
            tone="exclude"
            disabled={disabled}
            emptyHint="Type a company name to hide its rows."
          />
        </div>

      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {totalActive > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            disabled={disabled}
            className="text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-50 dark:text-white/60"
          >
            Clear all
          </button>
        ) : null}
        {/* Search is always enabled — an empty include-title list is the
            "all titles at these companies" Apollo default, which is a real,
            useful search on its own. Only the in-flight `disabled` prop
            (parent-owned) can dim it. */}
        <button
          type="button"
          onClick={onApply}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md bg-ocean px-4 py-2 text-xs font-semibold text-white hover:bg-ocean/90 disabled:opacity-60"
        >
          <Search className="h-3.5 w-3.5" />
          Search
        </button>
      </div>
    </section>
  );
}

// --- Saved filter sets -----------------------------------------------------

type SavedSet = { id: string; name: string; filterConfig: RoleFilter };

/**
 * Save the current Role filter (include/exclude titles + companies) as a named
 * preset, and reload any saved preset with one click. Backed by the generic
 * SavedFilter table (entityType CONTACT) via /api/saved-filters.
 */
function SavedFilterSets({
  value,
  onLoad,
  disabled,
}: {
  value: RoleFilter;
  onLoad: (next: RoleFilter) => void;
  disabled?: boolean;
}) {
  const [sets, setSets] = useState<SavedSet[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const hasFilter =
    value.includeTitles.length +
      value.excludeTitles.length +
      value.includeCompanies.length +
      value.excludeCompanies.length >
    0;

  async function load() {
    try {
      const res = await apiFetch("/api/saved-filters?entityType=CONTACT");
      if (!res.ok) return;
      const body = (await res.json()) as { data?: { filters?: Array<{ id: string; name: string; filterConfig: unknown }> } };
      const rows = body.data?.filters ?? [];
      setSets(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          filterConfig: normalizeRoleFilter(r.filterConfig),
        })),
      );
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/saved-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          entityType: "CONTACT",
          filterConfig: {
            includeTitles: value.includeTitles,
            excludeTitles: value.excludeTitles,
            includeCompanies: value.includeCompanies,
            excludeCompanies: value.excludeCompanies,
            seniorities: value.seniorities,
          },
        }),
      });
      if (res.ok) {
        setName("");
        setNaming(false);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await apiFetch(`/api/saved-filters/${id}`, { method: "DELETE" });
    if (res.ok) setSets((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div ref={boxRef} className="relative mt-2 flex flex-wrap items-center gap-2">
      {/* Saved sets dropdown */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-ocean hover:text-ocean disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70"
      >
        <Bookmark className="h-3.5 w-3.5" />
        Saved sets{sets.length ? ` (${sets.length})` : ""}
      </button>

      {/* Save current filter */}
      {naming ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setNaming(false);
                setName("");
              }
            }}
            placeholder="Set name…"
            className="w-36 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-accent-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || name.trim().length < 2}
            className="rounded-md bg-[#4F6DFF] px-2 py-1 text-xs font-semibold text-white hover:bg-[#3B4FE6] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setNaming(false);
              setName("");
            }}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          disabled={disabled || !hasFilter}
          title={hasFilter ? "Save the current filters as a reusable set" : "Add some filters first"}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:border-ocean hover:text-ocean disabled:opacity-40 dark:border-white/15 dark:text-white/60"
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
          Save set
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-[60] mt-1 w-72 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#101013]">
          {sets.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-400 dark:text-white/40">
              No saved sets yet. Build a filter and click &ldquo;Save set&rdquo;.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {sets.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-2 py-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      onLoad(normalizeRoleFilter(s.filterConfig));
                      setOpen(false);
                    }}
                    className="flex-1 truncate rounded px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-ocean dark:text-white/75 dark:hover:bg-white/[0.05]"
                    title="Load this set"
                  >
                    {s.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    aria-label={`Delete ${s.name}`}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Coerce arbitrary saved JSON back into a full RoleFilter (missing arrays → []). */
function normalizeRoleFilter(raw: unknown): RoleFilter {
  const r = (raw ?? {}) as Partial<RoleFilter>;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    includeTitles: arr(r.includeTitles),
    excludeTitles: arr(r.excludeTitles),
    includeCompanies: arr(r.includeCompanies),
    excludeCompanies: arr(r.excludeCompanies),
    seniorities: arr(r.seniorities),
  };
}

function mergeSuggestions(base: string[], extra: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const s of [...base, ...extra]) {
    const key = s.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(s.trim());
  }
  return merged;
}

function ChipInput({
  label,
  placeholder,
  values,
  onChange,
  suggestions,
  onFetchSuggestions,
  tone,
  disabled,
  emptyHint,
  onFetchAllForSelectAll,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  onFetchSuggestions?: SuggestFn;
  tone: "include" | "exclude";
  disabled?: boolean;
  /** Text shown in the empty-state slot (draft empty, no suggestions yet). */
  emptyHint?: string;
  /**
   * Optional loader invoked when the user clicks Select-all. Should return
   * every distinct entry the field's data source knows about (e.g. every
   * title Apollo has at these vessels' companies). When present, Select-all
   * awaits this fetch and merges the returned pool into `values` — the pill
   * populates the field with the full universe, not just the 17 curated
   * fallbacks. Without this callback Select-all falls back to whatever is
   * already in the local pool (curated defaults + live-typed results).
   */
  onFetchAllForSelectAll?: () => Promise<string[]>;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  // Set while Select-all is fetching the full pool via onFetchAllForSelectAll,
  // so we can show a spinner on the pill and prevent double-clicks racing.
  const [selectAllLoading, setSelectAllLoading] = useState(false);
  // Tracks WHICH query produced the current live suggestions. Without the
  // `query` marker the previous search's results linger and get shown
  // (unfiltered) whenever the user starts typing a new query — that's the
  // "second search shows old results until I leave and come back" bug.
  // Now we treat live suggestions as authoritative only when
  // `liveSuggestions.query === draft.trim()`.
  const [liveSuggestions, setLiveSuggestions] = useState<{ query: string; items: string[] }>({
    query: "",
    items: [],
  });
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Close the suggestions dropdown when focus leaves the whole chip cell.
  useEffect(() => {
    if (!focused) return;
    function onDocClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [focused]);

  // Debounced live-suggestions fetch. Fires 250ms after the user stops
  // typing; empty draft returns to the curated/static list only. Every time
  // the query changes we clear stale results immediately so the popover
  // doesn't flash the previous search's items while the new fetch is in
  // flight.
  useEffect(() => {
    if (!onFetchSuggestions) return;
    const q = draft.trim();
    if (!q) {
      setLiveSuggestions({ query: "", items: [] });
      setLoadingSuggestions(false);
      return;
    }
    // Invalidate stale suggestions the moment the query changes — the "still
    // showing 'Technical Fleet Manager' hits while I type 'fleet'" bug.
    setLiveSuggestions((prev) => (prev.query === q ? prev : { query: "", items: [] }));
    let cancelled = false;
    setLoadingSuggestions(true);
    const timer = setTimeout(async () => {
      try {
        const results = await onFetchSuggestions(q);
        if (!cancelled) setLiveSuggestions({ query: q, items: results });
      } catch {
        if (!cancelled) setLiveSuggestions({ query: q, items: [] });
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, onFetchSuggestions]);

  function commit(raw: string) {
    const value = raw.trim();
    if (!value) return;
    const seen = new Set(values.map((v) => v.toLowerCase()));
    if (seen.has(value.toLowerCase())) return;
    onChange([...values, value]);
    setDraft("");
  }

  function removeAt(idx: number) {
    onChange(values.filter((_, i) => i !== idx));
  }

  // Live suggestions take precedence once the user has typed something AND
  // the fetched results correspond to the current draft. Anything else falls
  // through to the curated / suggestions-from-results list, filtered locally
  // by the draft.
  const draftTrimmed = draft.trim();
  const chosen = new Set(values.map((v) => v.toLowerCase()));
  const liveMatches =
    draftTrimmed && liveSuggestions.query === draftTrimmed ? liveSuggestions.items : null;
  const source = liveMatches ?? suggestions;
  const filteredSuggestions = source
    .filter((s) => !chosen.has(s.toLowerCase()))
    .filter((s) => {
      // Live results are already server-filtered for the exact draft; only
      // local-filter the static fallback list.
      if (liveMatches) return true;
      if (!draftTrimmed) return true;
      return s.toLowerCase().includes(draftTrimmed.toLowerCase());
    });

  // The pool Select-all operates over — every distinct suggestion this input
  // already knows about (curated + live-typed + parent-provided), regardless
  // of the current draft filter. When `onFetchAllForSelectAll` is provided,
  // that pool is a MINIMUM: the click also fetches the full universe from
  // Apollo and merges it in, so a fresh page load (where the pool is just
  // the 17 fallback titles) still fills the field with everything Apollo has
  // at these companies. Dedup case-insensitively so "Fleet Manager" (static)
  // and "fleet manager" (live) don't both count.
  const selectAllPool = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of [...suggestions, ...liveSuggestions.items]) {
      const trimmed = s.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
    return out;
  })();
  const allSelected =
    selectAllPool.length > 0 && selectAllPool.every((s) => chosen.has(s.toLowerCase()));

  async function toggleSelectAll() {
    if (allSelected) {
      // Deselect: remove every pool entry from the committed values. No fetch
      // needed — we're only touching what's already in view.
      const poolKeys = new Set(selectAllPool.map((s) => s.toLowerCase()));
      onChange(values.filter((v) => !poolKeys.has(v.toLowerCase())));
      return;
    }

    // Select: start from the local pool, then (if the caller supplied a
    // fetcher) enrich with the full Apollo universe before committing. The
    // fetch is awaited so the user sees the chip field fill up in one
    // atomic write — not "17 static, then 50 more a moment later".
    let fullPool = selectAllPool;
    if (onFetchAllForSelectAll) {
      setSelectAllLoading(true);
      try {
        const fetched = await onFetchAllForSelectAll();
        const seen = new Set(selectAllPool.map((s) => s.toLowerCase()));
        for (const item of fetched) {
          const trimmed = item.trim();
          if (!trimmed) continue;
          const key = trimmed.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          fullPool = [...fullPool, trimmed];
        }
      } catch {
        // Fetch failure falls back to whatever's in the local pool — better
        // to add SOMETHING than to swallow the click silently.
      } finally {
        setSelectAllLoading(false);
      }
    }

    const seen = new Set(values.map((v) => v.toLowerCase()));
    const toAdd: string[] = [];
    for (const s of fullPool) {
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      toAdd.push(s);
    }
    if (toAdd.length > 0) onChange([...values, ...toAdd]);
  }

  const chipClass =
    tone === "include"
      ? "border-ocean/40 bg-ocean/10 text-ocean"
      : "border-red-300 bg-red-50 text-red-700";
  const chipCloseClass = tone === "include" ? "hover:text-white hover:bg-ocean" : "hover:text-white hover:bg-red-500";

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
        {label}
      </label>
      <div
        onClick={() => inputRef.current?.focus()}
        className={`mt-1 flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border bg-white px-2 py-1.5 text-sm dark:bg-white/[0.04] ${
          focused
            ? "border-ocean ring-1 ring-ocean/30 dark:border-accent-400"
            : "border-slate-200 dark:border-white/10"
        }`}
      >
        {values.map((value, idx) => (
          <span
            key={`${value}:${idx}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chipClass}`}
          >
            {value}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                removeAt(idx);
              }}
              className={`rounded-full p-0.5 transition ${chipCloseClass}`}
              aria-label={`Remove ${value}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit(draft);
            } else if (event.key === "Backspace" && draft === "" && values.length > 0) {
              event.preventDefault();
              removeAt(values.length - 1);
            } else if (event.key === "Escape") {
              setFocused(false);
              (event.target as HTMLInputElement).blur();
            }
          }}
          disabled={disabled}
          placeholder={values.length === 0 ? placeholder : ""}
          className="min-w-[120px] flex-1 border-none bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/40"
        />
      </div>
      {focused ? (
        <div className="absolute left-0 right-0 z-[60] mt-1 flex max-h-72 flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#101013]">
          {/* Select-all pill. Two flavours:
                clear-any  → clears the include list so Apollo returns every
                             title at these vessels' companies (checked = the
                             list is currently empty).
                select     → toggles the entire known pool (curated + live +
                             parent-provided suggestions) into `values`. */}
          {selectAllPool.length > 0 || onFetchAllForSelectAll ? (
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-1.5 text-[11px] dark:border-white/10 dark:bg-white/[0.03]">
              <label
                onMouseDown={(event) => event.preventDefault()}
                className={`flex items-center gap-2 text-slate-600 dark:text-white/70 ${
                  selectAllLoading ? "cursor-progress" : "cursor-pointer"
                }`}
              >
                {selectAllLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-ocean" />
                ) : (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (!selectAllLoading) void toggleSelectAll();
                    }}
                    readOnly
                    className="h-3.5 w-3.5 rounded border-slate-300 text-ocean"
                  />
                )}
                <span className="font-semibold uppercase tracking-wide">
                  {selectAllLoading
                    ? "Loading every title…"
                    : allSelected
                      ? "Deselect all"
                      : "Select all"}
                </span>
              </label>
              {!selectAllLoading && selectAllPool.length > 0 ? (
                <span className="text-slate-400 dark:text-white/40">
                  {selectAllPool.length} total
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="flex-1 overflow-y-auto">
            {loadingSuggestions ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500 dark:text-white/60">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Looking up titles…
              </div>
            ) : filteredSuggestions.length === 0 ? (
              draftTrimmed ? (
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(draftTrimmed);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 dark:text-white/80 dark:hover:bg-white/[0.04]"
                >
                  <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500 dark:bg-white/[0.06] dark:text-white/60">
                    +
                  </span>
                  Use &ldquo;{draftTrimmed}&rdquo; anyway
                </button>
              ) : (
                <p className="px-3 py-2 text-xs text-slate-400 dark:text-white/40">
                  {emptyHint ?? "Start typing to see live title suggestions."}
                </p>
              )
            ) : (
              filteredSuggestions.slice(0, 20).map((suggestion) => {
                // Checked reflects whether the title is ALREADY a chip — ticking
                // adds it immediately, un-ticking removes it. No staging step.
                const checked = values.some((v) => v.toLowerCase() === suggestion.toLowerCase());
                return (
                  <div
                    key={suggestion}
                    // Clicking the row toggles membership in the chip list right
                    // away. mousedown (not click) so it fires before the input
                    // blur that would close the popover.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (checked) {
                        onChange(values.filter((v) => v.toLowerCase() !== suggestion.toLowerCase()));
                      } else {
                        commit(suggestion);
                      }
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs cursor-pointer transition ${
                      checked
                        ? "bg-ocean/10 text-slate-950 dark:bg-ocean/20 dark:text-white"
                        : "text-slate-700 hover:bg-slate-50 dark:text-white/80 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      tabIndex={-1}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-ocean pointer-events-none"
                      aria-label={`${checked ? "Remove" : "Add"} ${suggestion}`}
                    />
                    <span className="flex-1 truncate">{suggestion}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

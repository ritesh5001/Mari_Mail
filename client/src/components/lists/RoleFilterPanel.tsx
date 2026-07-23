"use client";

import { useEffect, useRef, useState } from "react";
import { Filter, Loader2, Search, X } from "lucide-react";

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

const SENIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "c_suite", label: "C-Suite" },
  { value: "vp", label: "VP" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
  { value: "senior", label: "Senior" },
  { value: "entry", label: "Entry" },
  { value: "intern", label: "Intern" },
];

export function RoleFilterPanel({
  value,
  onChange,
  onApply,
  suggestionsFromResults,
  companySuggestionsFromResults,
  fetchTitleSuggestions,
  fetchCompanySuggestions,
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

  function toggleSeniority(seniority: string) {
    const has = value.seniorities.includes(seniority);
    patch({
      seniorities: has
        ? value.seniorities.filter((s) => s !== seniority)
        : [...value.seniorities, seniority],
    });
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
      </div>

      <div className="mt-4 space-y-4">
        <ChipInput
          label="Include job titles"
          placeholder="e.g. Fleet Manager, Chartering Manager"
          values={value.includeTitles}
          onChange={(next) => patch({ includeTitles: next })}
          suggestions={mergeSuggestions(DEFAULT_TITLE_SUGGESTIONS, suggestionsFromResults ?? [])}
          onFetchSuggestions={fetchTitleSuggestions}
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

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
            Seniority
          </label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {SENIORITY_OPTIONS.map((option) => {
              const active = value.seniorities.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleSeniority(option.value)}
                  disabled={disabled}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                    active
                      ? "border-ocean bg-ocean text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-ocean hover:text-ocean dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70"
                  } disabled:opacity-50`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
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
        <button
          type="button"
          onClick={onApply}
          disabled={disabled || totalActive === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-ocean px-4 py-2 text-xs font-semibold text-white hover:bg-ocean/90 disabled:opacity-60"
        >
          <Search className="h-3.5 w-3.5" />
          Search
        </button>
      </div>
    </section>
  );
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
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
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
  // Titles the user has ticked in the popover but hasn't committed yet.
  // Committing (via footer button or Enter) folds them into `values`.
  const [pending, setPending] = useState<Set<string>>(new Set());
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
    setPending(new Set());
  }

  function togglePending(suggestion: string) {
    setPending((prev) => {
      const next = new Set(prev);
      const key = suggestion.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function commitPending(all: string[]) {
    const seen = new Set(values.map((v) => v.toLowerCase()));
    const toAdd: string[] = [];
    for (const suggestion of all) {
      const key = suggestion.toLowerCase();
      if (!pending.has(key) || seen.has(key)) continue;
      seen.add(key);
      toAdd.push(suggestion);
    }
    if (toAdd.length === 0) return;
    onChange([...values, ...toAdd]);
    setDraft("");
    setPending(new Set());
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

  // The pool "Select all" operates over — every distinct suggestion this input
  // knows about (static + live + parent-provided), regardless of the current
  // draft filter. Dedup case-insensitively so a static "Fleet Manager" and a
  // live "fleet manager" don't both count.
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

  function toggleSelectAll() {
    if (allSelected) {
      // Remove every pool entry from the committed values.
      const poolKeys = new Set(selectAllPool.map((s) => s.toLowerCase()));
      onChange(values.filter((v) => !poolKeys.has(v.toLowerCase())));
    } else {
      const seen = new Set(values.map((v) => v.toLowerCase()));
      const toAdd: string[] = [];
      for (const s of selectAllPool) {
        const key = s.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        toAdd.push(s);
      }
      if (toAdd.length > 0) onChange([...values, ...toAdd]);
    }
    setPending(new Set());
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
          {/* Select-all pill — toggles the ENTIRE known pool (curated + live +
              parent-provided suggestions), not just the currently filtered
              subset. That's the scope the user picked: one click gets you
              "every title we've ever heard of at these companies". */}
          {selectAllPool.length > 0 ? (
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-1.5 text-[11px] dark:border-white/10 dark:bg-white/[0.03]">
              <label
                onMouseDown={(event) => event.preventDefault()}
                className="flex cursor-pointer items-center gap-2 text-slate-600 dark:text-white/70"
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    toggleSelectAll();
                  }}
                  readOnly
                  className="h-3.5 w-3.5 rounded border-slate-300 text-ocean"
                />
                <span className="font-semibold uppercase tracking-wide">
                  {allSelected ? "Deselect all" : "Select all"}
                </span>
              </label>
              <span className="text-slate-400 dark:text-white/40">
                {selectAllPool.length} total
              </span>
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
                const checked = pending.has(suggestion.toLowerCase());
                return (
                  <div
                    key={suggestion}
                    // The whole row toggles the checkbox; the inner button
                    // adds this one title immediately. mousedown, not click,
                    // so the field's blur (which would close the popover)
                    // fires *after* our handler.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      togglePending(suggestion);
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
                      // Row-level mousedown already toggles pending — this is
                      // presentation only, hence tabIndex -1 to skip it in
                      // keyboard flow.
                      tabIndex={-1}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-ocean pointer-events-none"
                      aria-label={`Select ${suggestion}`}
                    />
                    <span className="flex-1 truncate">{suggestion}</span>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        commit(suggestion);
                      }}
                      className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500 hover:bg-ocean hover:text-white dark:bg-white/[0.06] dark:text-white/60"
                      title="Add just this title"
                    >
                      + Add
                    </button>
                  </div>
                );
              })
            )}
          </div>
          {pending.size > 0 ? (
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
              <span className="text-[11px] font-semibold text-slate-600 dark:text-white/70">
                {pending.size} selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setPending(new Set());
                  }}
                  className="text-[11px] font-semibold text-slate-500 hover:text-red-600 dark:text-white/60"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commitPending(filteredSuggestions);
                  }}
                  className="rounded-md bg-ocean px-3 py-1 text-[11px] font-semibold text-white hover:bg-ocean/90"
                >
                  Add {pending.size} selected
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

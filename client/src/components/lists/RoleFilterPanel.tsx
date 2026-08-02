"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkPlus, ChevronRight, Filter, Loader2, Search, Trash2, X } from "lucide-react";
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
  /**
   * The rest only apply to an Apollo-wide search (`scope="apollo"`). A
   * vessel-scoped search is already pinned to specific company domains, so
   * location and headcount would only ever narrow it further for no reason.
   */
  personLocations: string[];
  companyLocations: string[];
  /** Headcount bands in Apollo's "min,max" form — see EMPLOYEE_BANDS. */
  employeeRanges: string[];
  /** Industry / market-segment terms. Apollo has no industry facet — see below. */
  keywords: string;
};

/** Refinements over results already fetched. Applied client-side, instantly. */
export type ResultFilter = {
  email: "all" | "available" | "unavailable";
  country: string;
};

export const EMPTY_RESULT_FILTER: ResultFilter = { email: "all", country: "all" };

/** Debounced live-suggestions loader — see RoleFilterPanel.fetchTitleSuggestions. */
type SuggestFn = (draft: string) => Promise<string[]>;

export const EMPTY_ROLE_FILTER: RoleFilter = {
  includeTitles: [],
  excludeTitles: [],
  includeCompanies: [],
  excludeCompanies: [],
  seniorities: [],
  personLocations: [],
  companyLocations: [],
  employeeRanges: [],
  keywords: "",
};

/**
 * Apollo's headcount bands, as it expects them: "min,max" strings.
 *
 * Sent verbatim rather than derived from a slider — Apollo matches on these
 * exact bands, and an arbitrary range like "37,412" silently returns nothing.
 */
export const EMPLOYEE_BANDS: Array<{ value: string; label: string }> = [
  { value: "1,10", label: "1–10" },
  { value: "11,20", label: "11–20" },
  { value: "21,50", label: "21–50" },
  { value: "51,100", label: "51–100" },
  { value: "101,200", label: "101–200" },
  { value: "201,500", label: "201–500" },
  { value: "501,1000", label: "501–1k" },
  { value: "1001,5000", label: "1k–5k" },
  { value: "5001,10000", label: "5k–10k" },
  { value: "10001,1000000", label: "10k+" },
];

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

/**
 * Apollo's seniority buckets, as one row of toggles.
 *
 * These were dropped from the UI for being too crowded, which left the field
 * on RoleFilter and still being sent to the server while nothing could set it
 * — a filter we pay Apollo to support and no one could reach. Back as compact
 * toggles rather than the old chip input: it is a short fixed vocabulary, so
 * free-text entry with autocomplete was always the wrong control for it.
 *
 * Values are Apollo's own enum strings; the labels are ours.
 */
const SENIORITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "owner", label: "Owner" },
  { value: "founder", label: "Founder" },
  { value: "c_suite", label: "C-suite" },
  { value: "vp", label: "VP" },
  { value: "head", label: "Head" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
  { value: "senior", label: "Senior" },
  { value: "entry", label: "Entry" },
];

/**
 * One collapsible filter group, modelled on Apollo's People search sidebar:
 * a dense row you can scan, an active-count badge, and contents that only take
 * vertical space when you open them.
 *
 * The previous panel laid every control out at once across the full page
 * width. That is fine with four fields and unreadable past that — the eye has
 * no grouping to land on, and the results table gets pushed below the fold.
 */
function FilterSection({
  title,
  count,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  /** Shown next to the title when collapsed — a summary of the current value. */
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 last:border-b-0 dark:border-white/[0.06]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform dark:text-white/35 ${
            open ? "rotate-90" : ""
          }`}
        />
        <span className="text-[13px] font-medium text-slate-800 dark:text-white/85">{title}</span>
        {count ? (
          <span className="rounded-full bg-accent-500/12 px-1.5 py-0.5 text-[10px] font-bold text-accent-600 dark:text-accent-300">
            {count}
          </span>
        ) : null}
        {!open && hint ? (
          <span className="ml-auto truncate text-[11px] text-slate-400 dark:text-white/35">
            {hint}
          </span>
        ) : null}
      </button>
      {open ? <div className="px-3 pb-3.5 pt-0.5">{children}</div> : null}
    </div>
  );
}

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
  resultFilter,
  onResultFilterChange,
  countryOptions = [],
  resultCount,
  scope = "vessels",
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
  /**
   * Refinements applied to results already on screen. These used to be loose
   * `<select>`s floating in the results bar — the same job as everything else
   * in this panel, in a different place, with different behaviour and no
   * indication either way. They live here now, in their own group, because
   * unlike the fields above they take effect immediately rather than on Search.
   */
  resultFilter?: ResultFilter;
  onResultFilterChange?: (next: ResultFilter) => void;
  /** Countries present in the current results; empty hides the control. */
  countryOptions?: string[];
  /** Rows currently loaded — the refine group is meaningless without any. */
  resultCount?: number;
  /**
   * "vessels" searches only the companies attached to a list's vessels.
   * "apollo" searches Apollo's whole database, which is what cold outreach
   * needs — and only then do location and headcount mean anything, since a
   * vessel-scoped search is already pinned to specific domains.
   */
  scope?: "vessels" | "apollo";
}) {
  const totalActive =
    value.includeTitles.length +
    value.excludeTitles.length +
    value.includeCompanies.length +
    value.excludeCompanies.length +
    value.seniorities.length +
    value.personLocations.length +
    value.companyLocations.length +
    value.employeeRanges.length +
    (value.keywords.trim() ? 1 : 0);

  function patch(part: Partial<RoleFilter>) {
    onChange({ ...value, ...part });
  }

  function clearAll() {
    onChange(EMPTY_ROLE_FILTER);
  }

  const activeChips: Array<{ key: string; label: string; onRemove: () => void }> = [
    ...value.includeTitles.map((t) => ({
      key: `it:${t}`,
      label: `Title: ${t}`,
      onRemove: () => patch({ includeTitles: value.includeTitles.filter((v) => v !== t) }),
    })),
    ...value.excludeTitles.map((t) => ({
      key: `xt:${t}`,
      label: `Not title: ${t}`,
      onRemove: () => patch({ excludeTitles: value.excludeTitles.filter((v) => v !== t) }),
    })),
    ...value.includeCompanies.map((c) => ({
      key: `ic:${c}`,
      label: `Company: ${c}`,
      onRemove: () => patch({ includeCompanies: value.includeCompanies.filter((v) => v !== c) }),
    })),
    ...value.excludeCompanies.map((c) => ({
      key: `xc:${c}`,
      label: `Not company: ${c}`,
      onRemove: () => patch({ excludeCompanies: value.excludeCompanies.filter((v) => v !== c) }),
    })),
    ...value.seniorities.map((sv) => ({
      key: `s:${sv}`,
      label: SENIORITY_OPTIONS.find((o) => o.value === sv)?.label ?? sv,
      onRemove: () => patch({ seniorities: value.seniorities.filter((v) => v !== sv) }),
    })),
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-white/[0.06]">
        <Filter className="h-3.5 w-3.5 text-accent-500" />
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Filters</p>
        {totalActive > 0 ? (
          <span className="rounded-full bg-accent-500/12 px-1.5 py-0.5 text-[10px] font-bold text-accent-600 dark:text-accent-300">
            {totalActive}
          </span>
        ) : null}
        {totalActive > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            disabled={disabled}
            className="ml-auto text-[11px] font-medium text-slate-500 hover:text-red-600 disabled:opacity-50 dark:text-white/50"
          >
            Clear all
          </button>
        ) : null}
      </div>

      {/* Applied filters as removable chips, the way Apollo surfaces them —
          so what's active is readable without opening every section. */}
      {activeChips.length > 0 ? (
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 py-2 dark:border-white/[0.06]">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onRemove}
              disabled={disabled}
              className="group inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:bg-white/[0.08] dark:text-white/70 dark:hover:bg-white/[0.12]"
            >
              <span className="truncate">{chip.label}</span>
              <X className="h-2.5 w-2.5 shrink-0 opacity-50 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="px-3 py-2">
        <SavedFilterSets value={value} onLoad={onChange} disabled={disabled} />
      </div>

      <div className="border-t border-slate-100 dark:border-white/[0.06]">
        <FilterSection
          title="Job titles"
          count={value.includeTitles.length + value.excludeTitles.length}
          defaultOpen
        >
          <div className="space-y-3">
            <ChipInput
              label="Is any of"
              placeholder="e.g. Fleet Manager"
              values={value.includeTitles}
              onChange={(next) => patch({ includeTitles: next })}
              suggestions={mergeSuggestions(DEFAULT_TITLE_SUGGESTIONS, suggestionsFromResults ?? [])}
              onFetchSuggestions={fetchTitleSuggestions}
              onFetchAllForSelectAll={fetchAllTitles}
              tone="include"
              disabled={disabled}
            />
            <ChipInput
              label="Is not"
              placeholder="e.g. Intern"
              values={value.excludeTitles}
              onChange={(next) => patch({ excludeTitles: next })}
              suggestions={mergeSuggestions(DEFAULT_TITLE_SUGGESTIONS, suggestionsFromResults ?? [])}
              onFetchSuggestions={fetchTitleSuggestions}
              tone="exclude"
              disabled={disabled}
            />
          </div>
        </FilterSection>

        <FilterSection
          title="Companies"
          count={value.includeCompanies.length + value.excludeCompanies.length}
        >
          <div className="space-y-3">
            <ChipInput
              label="Is any of"
              placeholder="e.g. V.Group"
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
              label="Is not"
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
        </FilterSection>

        <FilterSection
          title="Management level"
          count={value.seniorities.length}
          hint={value.seniorities.length === 0 ? "Any" : undefined}
        >
          <div className="flex flex-wrap gap-1.5">
            {SENIORITY_OPTIONS.map((option) => {
              const active = value.seniorities.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() =>
                    patch({
                      seniorities: active
                        ? value.seniorities.filter((v) => v !== option.value)
                        : [...value.seniorities, option.value],
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                    active
                      ? "border-accent-500 bg-accent-500 text-[#ffffff]"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/65 dark:hover:bg-white/[0.08]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </FilterSection>

        {scope === "apollo" ? (
          <>
            <FilterSection
              title="Location"
              count={value.personLocations.length + value.companyLocations.length}
            >
              <div className="space-y-3">
                <ChipInput
                  label="Person is in"
                  placeholder="e.g. London, Singapore"
                  values={value.personLocations}
                  onChange={(next) => patch({ personLocations: next })}
                  suggestions={[]}
                  tone="include"
                  disabled={disabled}
                  emptyHint="City, state or country — Apollo resolves the name."
                />
                <ChipInput
                  label="Company HQ is in"
                  placeholder="e.g. United Kingdom"
                  values={value.companyLocations}
                  onChange={(next) => patch({ companyLocations: next })}
                  suggestions={[]}
                  tone="include"
                  disabled={disabled}
                  emptyHint="Where the business is based, not the person."
                />
              </div>
            </FilterSection>

            <FilterSection
              title="Company size"
              count={value.employeeRanges.length}
              hint={value.employeeRanges.length === 0 ? "Any" : undefined}
            >
              <div className="flex flex-wrap gap-1.5">
                {EMPLOYEE_BANDS.map((band) => {
                  const active = value.employeeRanges.includes(band.value);
                  return (
                    <button
                      key={band.value}
                      type="button"
                      disabled={disabled}
                      aria-pressed={active}
                      onClick={() =>
                        patch({
                          employeeRanges: active
                            ? value.employeeRanges.filter((v) => v !== band.value)
                            : [...value.employeeRanges, band.value],
                        })
                      }
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                        active
                          ? "border-accent-500 bg-accent-500 text-[#ffffff]"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/65 dark:hover:bg-white/[0.08]"
                      }`}
                    >
                      {band.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400 dark:text-white/30">
                Apollo matches these exact bands — employees, not revenue.
              </p>
            </FilterSection>

            <FilterSection
              title="Industry & keywords"
              count={value.keywords.trim() ? 1 : 0}
              hint={value.keywords.trim() || undefined}
            >
              <input
                value={value.keywords}
                onChange={(e) => patch({ keywords: e.target.value })}
                disabled={disabled}
                placeholder="e.g. Computer Software, E-commerce, SaaS"
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-700 outline-none focus:border-accent-400 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70"
              />
              {/* Deliberately labelled keywords, not "Industry". Apollo's public
                  search API has no industry facet — its UI picker maps to
                  undocumented internal tag ids — so industry and market-segment
                  terms are matched as free text. Calling this an industry filter
                  would promise exact matching we can't deliver. */}
              <p className="mt-1.5 text-[10px] leading-4 text-slate-400 dark:text-white/30">
                Free-text match across the company profile. Industry and market
                segment go here — Apollo exposes no exact industry filter.
              </p>
            </FilterSection>
          </>
        ) : null}

        {/* Result refinements. Kept in the same rail so there is one place to
            look, but below the Search button and labelled, because they take
            effect immediately — presenting them identically to the sections
            above would make Search look broken the first time one applied
            without it. */}
        {onResultFilterChange && resultFilter && (resultCount ?? 0) > 0 ? (
          <>
            <FilterSection
              title="Email status"
              count={resultFilter.email === "all" ? 0 : 1}
              hint={
                resultFilter.email === "all"
                  ? "Any"
                  : resultFilter.email === "available"
                    ? "Has an email"
                    : "No email"
              }
            >
              <div className="space-y-1">
                {(
                  [
                    ["all", "Any"],
                    ["available", "Has an email"],
                    ["unavailable", "No email"],
                  ] as const
                ).map(([v, label]) => (
                  <label
                    key={v}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-[12px] text-slate-700 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/[0.05]"
                  >
                    <input
                      type="radio"
                      name="email-status"
                      checked={resultFilter.email === v}
                      onChange={() => onResultFilterChange({ ...resultFilter, email: v })}
                      className="h-3.5 w-3.5 border-slate-300 text-accent-500 focus:ring-accent-400"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400 dark:text-white/30">
                Applies instantly to the results below.
              </p>
            </FilterSection>

            {countryOptions.length > 0 ? (
              <FilterSection
                title="Country"
                count={resultFilter.country === "all" ? 0 : 1}
                hint={resultFilter.country === "all" ? "Any" : resultFilter.country}
              >
                <select
                  value={resultFilter.country}
                  onChange={(e) =>
                    onResultFilterChange({ ...resultFilter, country: e.target.value })
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-700 outline-none focus:border-accent-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70"
                  aria-label="Filter by country"
                >
                  <option value="all">Any country</option>
                  {countryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[10px] text-slate-400 dark:text-white/30">
                  Applies instantly to the results below.
                </p>
              </FilterSection>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Search is always enabled — an empty include-title list is the "all
          titles at these companies" Apollo default, a real search on its own.
          Only the in-flight `disabled` prop can dim it. */}
      <div className="border-t border-slate-100 p-3 dark:border-white/[0.06]">
        <button
          type="button"
          onClick={onApply}
          disabled={disabled}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-accent-500 px-4 py-2 text-xs font-semibold text-[#ffffff] transition-colors hover:bg-accent-600 disabled:opacity-60"
        >
          {disabled ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          {disabled ? "Searching…" : "Search"}
        </button>
        <p className="mt-2 text-[10px] leading-4 text-slate-400 dark:text-white/30">
          Searching is free — only revealing an email or phone spends a credit.
        </p>
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
    // Added after the first saved sets shipped — absent in older rows, so
    // they normalise to empty rather than breaking the load.
    personLocations: arr(r.personLocations),
    companyLocations: arr(r.companyLocations),
    employeeRanges: arr(r.employeeRanges),
    keywords: typeof r.keywords === "string" ? r.keywords : "",
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

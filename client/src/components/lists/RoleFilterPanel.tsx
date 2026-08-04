"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  BookmarkPlus,
  Briefcase,
  Building2,
  Check,
  ChevronDown,
  Filter,
  Globe2,
  Loader2,
  MapPin,
  Pencil,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Users2,
  X,
} from "lucide-react";
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
 * Curated maritime-role suggestions that surface before Apollo has any live
 * hits to offer — the moment the user starts typing, Apollo's typeahead
 * takes over and this list is only used to seed the empty state.
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
 * Live Apollo typeahead shared by every chip input on the panel. Kept in this
 * module so the callers never have to wire four near-identical debouncers.
 *
 * Fires POST /api/contacts/apollo/typeahead with { field, query }; server
 * caches per query so repeated keystrokes are cheap. Returns [] on failure.
 */
async function apolloTypeahead(
  field: "title" | "company" | "person_location" | "company_location",
  query: string,
): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await apiFetch("/api/contacts/apollo/typeahead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, query: q }),
    });
    if (!res.ok) return [];
    const payload = (await res.json()) as { data?: { suggestions?: string[] } };
    return Array.isArray(payload.data?.suggestions) ? payload.data!.suggestions! : [];
  } catch {
    return [];
  }
}

type FilterIcon = React.ComponentType<{ className?: string }>;

/**
 * One collapsible filter group. Denser than a card — Apollo's own People
 * search sits at this altitude and the eye lands on section headers first.
 */
function FilterSection({
  title,
  count,
  hint,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  /** Shown next to the title when collapsed — a summary of the current value. */
  hint?: string;
  icon: FilterIcon;
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
        className="group flex w-full items-center gap-2 px-3.5 py-3 text-left transition-colors hover:bg-slate-50/70 dark:hover:bg-white/[0.03]"
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
            (count ?? 0) > 0
              ? "border-accent-500/30 bg-accent-500/10 text-accent-600 dark:text-accent-300"
              : "border-slate-200 bg-white text-slate-500 group-hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/50"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[13px] font-semibold text-slate-800 dark:text-white/90">{title}</span>
        {count ? (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        ) : null}
        {!open && hint ? (
          <span className="ml-auto max-w-[130px] truncate text-[11px] text-slate-400 dark:text-white/35">
            {hint}
          </span>
        ) : null}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform dark:text-white/40 ${
            open ? "rotate-180" : ""
          } ${!open && hint ? "ml-1" : "ml-auto"}`}
        />
      </button>
      {open ? (
        <div className="px-3.5 pb-3.5 pt-1">{children}</div>
      ) : null}
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
  suggestionsFromResults?: string[];
  companySuggestionsFromResults?: string[];
  fetchTitleSuggestions?: SuggestFn;
  fetchCompanySuggestions?: SuggestFn;
  fetchAllTitles?: () => Promise<string[]>;
  fetchAllCompanies?: () => Promise<string[]>;
  disabled?: boolean;
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

  // Apollo-scope defaults every chip input to Apollo's own typeahead so cold
  // searches get real live suggestions, not just the 17 curated titles that
  // used to be the only autocomplete on this panel. Vessel-scope keeps the
  // parent-supplied loaders (title histogram from the list) as-is.
  const apolloTitleFetcher = useMemo<SuggestFn>(
    () => (draft) => apolloTypeahead("title", draft),
    [],
  );
  const apolloCompanyFetcher = useMemo<SuggestFn>(
    () => (draft) => apolloTypeahead("company", draft),
    [],
  );
  const apolloPersonLocationFetcher = useMemo<SuggestFn>(
    () => (draft) => apolloTypeahead("person_location", draft),
    [],
  );
  const apolloCompanyLocationFetcher = useMemo<SuggestFn>(
    () => (draft) => apolloTypeahead("company_location", draft),
    [],
  );

  const titleFetcher = fetchTitleSuggestions ?? (scope === "apollo" ? apolloTitleFetcher : undefined);
  const companyFetcher = fetchCompanySuggestions ?? (scope === "apollo" ? apolloCompanyFetcher : undefined);

  const activeChips: Array<{ key: string; label: string; onRemove: () => void; tone: "include" | "exclude" }> = [
    ...value.includeTitles.map((t) => ({
      key: `it:${t}`,
      label: t,
      tone: "include" as const,
      onRemove: () => patch({ includeTitles: value.includeTitles.filter((v) => v !== t) }),
    })),
    ...value.excludeTitles.map((t) => ({
      key: `xt:${t}`,
      label: `not ${t}`,
      tone: "exclude" as const,
      onRemove: () => patch({ excludeTitles: value.excludeTitles.filter((v) => v !== t) }),
    })),
    ...value.includeCompanies.map((c) => ({
      key: `ic:${c}`,
      label: `@ ${c}`,
      tone: "include" as const,
      onRemove: () => patch({ includeCompanies: value.includeCompanies.filter((v) => v !== c) }),
    })),
    ...value.excludeCompanies.map((c) => ({
      key: `xc:${c}`,
      label: `not @ ${c}`,
      tone: "exclude" as const,
      onRemove: () => patch({ excludeCompanies: value.excludeCompanies.filter((v) => v !== c) }),
    })),
    ...value.seniorities.map((sv) => ({
      key: `s:${sv}`,
      label: SENIORITY_OPTIONS.find((o) => o.value === sv)?.label ?? sv,
      tone: "include" as const,
      onRemove: () => patch({ seniorities: value.seniorities.filter((v) => v !== sv) }),
    })),
    ...value.personLocations.map((l) => ({
      key: `pl:${l}`,
      label: l,
      tone: "include" as const,
      onRemove: () => patch({ personLocations: value.personLocations.filter((v) => v !== l) }),
    })),
    ...value.companyLocations.map((l) => ({
      key: `cl:${l}`,
      label: `HQ ${l}`,
      tone: "include" as const,
      onRemove: () => patch({ companyLocations: value.companyLocations.filter((v) => v !== l) }),
    })),
    ...value.employeeRanges.map((band) => ({
      key: `er:${band}`,
      label: `${EMPLOYEE_BANDS.find((b) => b.value === band)?.label ?? band} employees`,
      tone: "include" as const,
      onRemove: () => patch({ employeeRanges: value.employeeRanges.filter((v) => v !== band) }),
    })),
    ...(value.keywords.trim()
      ? [
          {
            key: `kw`,
            label: `“${value.keywords.trim()}”`,
            tone: "include" as const,
            onRemove: () => patch({ keywords: "" }),
          },
        ]
      : []),
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm ring-1 ring-black/[0.02] dark:border-white/[0.08] dark:bg-white/[0.02] dark:ring-white/[0.02]">
      {/* Panel header — brand pill, count, clear-all */}
      <div className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50/70 via-white to-white px-3.5 py-3 dark:border-white/[0.06] dark:from-white/[0.03] dark:via-transparent dark:to-transparent">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-500/12 text-accent-600 dark:text-accent-300">
          <Filter className="h-3.5 w-3.5" />
        </span>
        <p className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-white">
          Filters
        </p>
        {totalActive > 0 ? (
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white">
            {totalActive}
          </span>
        ) : null}
        {totalActive > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            disabled={disabled}
            className="ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-white/55 dark:hover:bg-red-500/10 dark:hover:text-red-300"
          >
            Clear all
          </button>
        ) : null}
      </div>

      {/* Saved sets bar — pinned above the sections so users can load a preset
          before touching anything. Save is only offered when there's something
          to save (any active filter). */}
      <div className="border-b border-slate-100 bg-slate-50/40 px-3.5 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.015]">
        <SavedFilterSets value={value} onLoad={onChange} disabled={disabled} />
      </div>

      {/* Applied filters as removable chips, grouped by tone (include vs. exclude)
          so what's active is scannable without opening every section. */}
      {activeChips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-3.5 py-2.5 dark:border-white/[0.06]">
          {activeChips.map((chip) => {
            const toneClass =
              chip.tone === "include"
                ? "border-accent-500/25 bg-accent-500/10 text-accent-700 hover:bg-accent-500/15 dark:text-accent-200"
                : "border-red-300/40 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-200";
            return (
              <button
                key={chip.key}
                type="button"
                onClick={chip.onRemove}
                disabled={disabled}
                className={`group inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${toneClass}`}
              >
                <span className="truncate">{chip.label}</span>
                <X className="h-2.5 w-2.5 shrink-0 opacity-60 group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      ) : null}

      <div>
        <FilterSection
          title="Job titles"
          icon={Briefcase}
          count={value.includeTitles.length + value.excludeTitles.length}
          defaultOpen
        >
          <div className="space-y-3">
            <ChipInput
              label="Include"
              placeholder="Fleet Manager, Chartering…"
              values={value.includeTitles}
              onChange={(next) => patch({ includeTitles: next })}
              suggestions={mergeSuggestions(DEFAULT_TITLE_SUGGESTIONS, suggestionsFromResults ?? [])}
              onFetchSuggestions={titleFetcher}
              onFetchAllForSelectAll={fetchAllTitles}
              tone="include"
              disabled={disabled}
            />
            <ChipInput
              label="Exclude"
              placeholder="Intern, Assistant…"
              values={value.excludeTitles}
              onChange={(next) => patch({ excludeTitles: next })}
              suggestions={mergeSuggestions(DEFAULT_TITLE_SUGGESTIONS, suggestionsFromResults ?? [])}
              onFetchSuggestions={titleFetcher}
              tone="exclude"
              disabled={disabled}
            />
          </div>
        </FilterSection>

        <FilterSection
          title="Seniority"
          icon={Sparkles}
          count={value.seniorities.length}
          hint={value.seniorities.length === 0 ? "Any" : `${value.seniorities.length} selected`}
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
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all disabled:opacity-50 ${
                    active
                      ? "border-accent-500 bg-accent-500 text-white shadow-sm shadow-accent-500/25"
                      : "border-slate-200 bg-white text-slate-600 hover:border-accent-300 hover:bg-accent-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/65 dark:hover:border-accent-400/40 dark:hover:bg-white/[0.08]"
                  }`}
                >
                  {active ? <Check className="h-2.5 w-2.5" /> : null}
                  {option.label}
                </button>
              );
            })}
          </div>
        </FilterSection>

        <FilterSection
          title="Companies"
          icon={Building2}
          count={value.includeCompanies.length + value.excludeCompanies.length}
        >
          <div className="space-y-3">
            <ChipInput
              label="Include"
              placeholder="V.Group, Anglo-Eastern…"
              values={value.includeCompanies}
              onChange={(next) => patch({ includeCompanies: next })}
              suggestions={companySuggestionsFromResults ?? []}
              onFetchSuggestions={companyFetcher}
              onFetchAllForSelectAll={fetchAllCompanies}
              tone="include"
              disabled={disabled}
              emptyHint="Start typing to see Apollo companies matching your term."
            />
            <ChipInput
              label="Exclude"
              placeholder="Third-party surveyors…"
              values={value.excludeCompanies}
              onChange={(next) => patch({ excludeCompanies: next })}
              suggestions={companySuggestionsFromResults ?? []}
              onFetchSuggestions={companyFetcher}
              tone="exclude"
              disabled={disabled}
              emptyHint="Type a company name to hide its rows."
            />
          </div>
        </FilterSection>

        {scope === "apollo" ? (
          <>
            <FilterSection
              title="Location"
              icon={MapPin}
              count={value.personLocations.length + value.companyLocations.length}
              hint={
                value.personLocations.length + value.companyLocations.length === 0
                  ? "Anywhere"
                  : undefined
              }
            >
              <div className="space-y-3">
                <ChipInput
                  label="Person is in"
                  placeholder="London, Singapore, India…"
                  values={value.personLocations}
                  onChange={(next) => patch({ personLocations: next })}
                  suggestions={[]}
                  onFetchSuggestions={apolloPersonLocationFetcher}
                  tone="include"
                  disabled={disabled}
                  emptyHint="Type a city, state or country — Apollo resolves the name."
                />
                <ChipInput
                  label="Company HQ is in"
                  placeholder="United Kingdom, UAE…"
                  values={value.companyLocations}
                  onChange={(next) => patch({ companyLocations: next })}
                  suggestions={[]}
                  onFetchSuggestions={apolloCompanyLocationFetcher}
                  tone="include"
                  disabled={disabled}
                  emptyHint="Where the business is based, not the person."
                />
              </div>
            </FilterSection>

            <FilterSection
              title="Company size"
              icon={Users2}
              count={value.employeeRanges.length}
              hint={value.employeeRanges.length === 0 ? "Any size" : undefined}
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
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all disabled:opacity-50 ${
                        active
                          ? "border-accent-500 bg-accent-500 text-white shadow-sm shadow-accent-500/25"
                          : "border-slate-200 bg-white text-slate-600 hover:border-accent-300 hover:bg-accent-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/65 dark:hover:border-accent-400/40 dark:hover:bg-white/[0.08]"
                      }`}
                    >
                      {band.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] leading-4 text-slate-400 dark:text-white/35">
                Apollo matches these exact bands — employees, not revenue.
              </p>
            </FilterSection>

            <FilterSection
              title="Industry & keywords"
              icon={Tag}
              count={value.keywords.trim() ? 1 : 0}
              hint={value.keywords.trim() || undefined}
            >
              <input
                value={value.keywords}
                onChange={(e) => patch({ keywords: e.target.value })}
                disabled={disabled}
                placeholder="Shipping, Chemicals, Bunkering…"
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[12px] text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-500/15 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/85 dark:placeholder:text-white/30"
              />
              {/* Deliberately labelled keywords, not "Industry". Apollo's public
                  search API has no industry facet — its UI picker maps to
                  undocumented internal tag ids — so industry and market-segment
                  terms are matched as free text. */}
              <p className="mt-2 text-[10px] leading-4 text-slate-400 dark:text-white/35">
                Free-text match across the company profile. Industry and market
                segment go here — Apollo exposes no exact industry filter.
              </p>
            </FilterSection>
          </>
        ) : null}
      </div>

      {/* Search CTA — always enabled; empty include-title is a real Apollo
          query. Only the in-flight `disabled` prop can dim it. */}
      <div className="border-t border-slate-100 bg-slate-50/40 p-3 dark:border-white/[0.06] dark:bg-white/[0.015]">
        <button
          type="button"
          onClick={onApply}
          disabled={disabled}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-accent-500 to-accent-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-accent-500/25 transition-all hover:from-accent-500 hover:to-accent-500 hover:shadow-accent-500/40 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-white/10 dark:disabled:to-white/10"
        >
          {disabled ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
          )}
          {disabled ? "Searching Apollo…" : "Search"}
        </button>
        <p className="mt-2 text-center text-[10px] leading-4 text-slate-500 dark:text-white/40">
          Searching is <span className="font-semibold text-emerald-600 dark:text-emerald-300">free</span> — only revealing an email or phone spends a credit.
        </p>
      </div>

      {/* Refine results — same rail, distinct block. Below the Search button
          because these apply INSTANTLY and mixing them into the sections above
          would make Search look broken the first time one applied without it. */}
      {onResultFilterChange && resultFilter && (resultCount ?? 0) > 0 ? (
        <div className="border-t border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-emerald-50/40 px-3.5 py-2 dark:border-white/[0.06] dark:bg-emerald-500/[0.04]">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
              <Sparkles className="h-3 w-3" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
              Refine results
            </p>
            <span className="ml-auto text-[10px] text-emerald-600/70 dark:text-emerald-200/60">
              Applies instantly
            </span>
          </div>

          <FilterSection
            title="Email status"
            icon={Sparkles}
            count={resultFilter.email === "all" ? 0 : 1}
            hint={
              resultFilter.email === "all"
                ? "Any"
                : resultFilter.email === "available"
                  ? "Has email"
                  : "No email"
            }
            defaultOpen
          >
            <div className="flex gap-1.5">
              {(
                [
                  ["all", "Any"],
                  ["available", "Has email"],
                  ["unavailable", "No email"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onResultFilterChange({ ...resultFilter, email: v })}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-all ${
                    resultFilter.email === v
                      ? "border-accent-500 bg-accent-500 text-white shadow-sm shadow-accent-500/25"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/65 dark:hover:bg-white/[0.08]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </FilterSection>

          {countryOptions.length > 0 ? (
            <FilterSection
              title="Country"
              icon={Globe2}
              count={resultFilter.country === "all" ? 0 : 1}
              hint={resultFilter.country === "all" ? "Any" : resultFilter.country}
            >
              <select
                value={resultFilter.country}
                onChange={(e) =>
                  onResultFilterChange({ ...resultFilter, country: e.target.value })
                }
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[12px] text-slate-700 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75"
                aria-label="Filter by country"
              >
                <option value="all">Any country</option>
                {countryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FilterSection>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// --- Saved filter sets -----------------------------------------------------

type SavedSet = { id: string; name: string; filterConfig: RoleFilter };

/**
 * Save the current filter as a named preset, and reload any saved preset
 * with one click. Backed by /api/saved-filters (entityType CONTACT).
 *
 * Redesigned from the tiny two-button row to a first-class picker: sets show
 * up in a dropdown that also names the currently-loaded preset, and the save
 * flow supports rename + overwrite so users can iterate on a set instead of
 * being forced to make a new one each time.
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
  const [naming, setNaming] = useState<null | { mode: "create" } | { mode: "rename"; id: string }>(null);
  const [name, setName] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const hasFilter =
    value.includeTitles.length +
      value.excludeTitles.length +
      value.includeCompanies.length +
      value.excludeCompanies.length +
      value.seniorities.length +
      value.personLocations.length +
      value.companyLocations.length +
      value.employeeRanges.length +
      (value.keywords.trim() ? 1 : 0) >
    0;

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/saved-filters?entityType=CONTACT");
      if (!res.ok) return;
      const body = (await res.json()) as {
        data?: { filters?: Array<{ id: string; name: string; filterConfig: unknown }> };
      };
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Close the dropdown on outside click. Capture phase for the same reason as
  // ChipInput: deleting a set unmounts its row synchronously, and a bubble-phase
  // listener would then test a detached node, read it as an outside click, and
  // close the dropdown out from under the user mid-manage.
  useEffect(() => {
    if (!open && !naming) return;
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setNaming(null);
      }
    }
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [open, naming]);

  async function save() {
    const trimmed = name.trim();
    if (trimmed.length < 2 || !naming) return;
    setSaving(true);
    try {
      // Redesigned save: persists EVERY filter field, not just titles/companies.
      // The old save dropped locations, employee ranges and keywords, so a
      // loaded preset silently un-checked those fields.
      const filterConfig = {
        includeTitles: value.includeTitles,
        excludeTitles: value.excludeTitles,
        includeCompanies: value.includeCompanies,
        excludeCompanies: value.excludeCompanies,
        seniorities: value.seniorities,
        personLocations: value.personLocations,
        companyLocations: value.companyLocations,
        employeeRanges: value.employeeRanges,
        keywords: value.keywords,
      };

      if (naming.mode === "rename") {
        // Overwrite = delete + re-create with the same name (or new one). The
        // saved-filters route has no PATCH, and add-then-remove is a single
        // click for the user so it stays fine.
        await apiFetch(`/api/saved-filters/${naming.id}`, { method: "DELETE" });
      }
      const res = await apiFetch("/api/saved-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          entityType: "CONTACT",
          filterConfig,
        }),
      });
      if (res.ok) {
        const payload = (await res.json()) as { data?: { id?: string } };
        setName("");
        setNaming(null);
        if (payload.data?.id) setLoadedId(payload.data.id);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await apiFetch(`/api/saved-filters/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSets((prev) => prev.filter((s) => s.id !== id));
      if (loadedId === id) setLoadedId(null);
    }
  }

  const loadedName = loadedId ? sets.find((s) => s.id === loadedId)?.name ?? null : null;

  return (
    <div ref={boxRef} className="relative flex items-center gap-2">
      {/* Saved sets picker — shows the loaded set's name when there is one. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 shadow-sm transition hover:border-accent-400 hover:text-accent-600 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:border-accent-400/60"
      >
        <Bookmark className="h-3.5 w-3.5 shrink-0 text-accent-500" />
        <span className="min-w-0 flex-1 truncate text-left">
          {loadedName ? loadedName : `Saved sets${sets.length ? ` (${sets.length})` : ""}`}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform dark:text-white/40 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Save current filter — disabled until the user has picked at least
          one facet; keeps empty presets out of the dropdown. */}
      <button
        type="button"
        onClick={() => {
          setNaming({ mode: "create" });
          setName(loadedName ?? "");
          setOpen(false);
        }}
        disabled={disabled || !hasFilter}
        title={hasFilter ? "Save this filter as a set" : "Add some filters first"}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-accent-500/25 bg-accent-500/10 px-2 py-1.5 text-[12px] font-semibold text-accent-600 shadow-sm transition hover:bg-accent-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent-500/10 disabled:hover:text-accent-600 dark:text-accent-200 dark:disabled:hover:text-accent-200"
      >
        <BookmarkPlus className="h-3.5 w-3.5" />
        Save
      </button>

      {/* Naming popover — used for both "create" and "rename" flows */}
      {naming ? (
        <div className="absolute left-0 right-0 top-full z-[70] mt-1 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl dark:border-white/10 dark:bg-[#101013]">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
            {naming.mode === "rename" ? "Rename set" : "Name this filter set"}
          </label>
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") {
                  setNaming(null);
                  setName("");
                }
              }}
              placeholder="e.g. Fleet Managers · India"
              className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12px] text-slate-800 outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || name.trim().length < 2}
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
        </div>
      ) : null}

      {open ? (
        <div className="absolute left-0 right-0 top-full z-[60] mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#101013]">
          {sets.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-slate-500 dark:text-white/50">
              No saved sets yet. Configure filters and hit <span className="font-semibold text-accent-600 dark:text-accent-300">Save</span>.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {sets.map((s) => {
                const isLoaded = loadedId === s.id;
                return (
                  <li key={s.id} className={`group flex items-center gap-1 px-1.5 py-0.5 ${isLoaded ? "bg-accent-500/[0.06]" : ""}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onLoad(normalizeRoleFilter(s.filterConfig));
                        setLoadedId(s.id);
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
                      <span className="truncate">{s.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNaming({ mode: "rename", id: s.id });
                        setName(s.name);
                        setOpen(false);
                      }}
                      aria-label={`Rename ${s.name}`}
                      className="rounded p-1.5 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-accent-600 dark:hover:bg-white/[0.05]"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(s.id)}
                      aria-label={`Delete ${s.name}`}
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

/** Coerce arbitrary saved JSON back into a full RoleFilter (missing arrays → []). */
function normalizeRoleFilter(raw: unknown): RoleFilter {
  const r = (raw ?? {}) as Partial<RoleFilter>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    includeTitles: arr(r.includeTitles),
    excludeTitles: arr(r.excludeTitles),
    includeCompanies: arr(r.includeCompanies),
    excludeCompanies: arr(r.excludeCompanies),
    seniorities: arr(r.seniorities),
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

/**
 * Multi-select chip field with live Apollo typeahead.
 *
 * Three behaviours here are load-bearing and easy to regress, so they are
 * spelled out:
 *
 *  1. The outside-click listener runs in the CAPTURE phase. In the bubble
 *     phase it was broken: clicking a suggestion re-rendered the list
 *     synchronously (mousedown is a discrete event, so React flushes before
 *     the native bubble listener runs), the clicked row was unmounted, and
 *     `container.contains(detachedNode)` returned false — so every pick was
 *     misread as a click outside and closed the popover. Capture fires before
 *     React's handler, while the node is still in the tree.
 *
 *  2. Picking a suggestion does NOT clear the draft and does NOT remove the
 *     row. Chosen entries stay in the list with a ticked checkbox so several
 *     can be picked from one result set, and picking again un-picks. Clearing
 *     the draft used to wipe the live results, which on the company fields
 *     (no static fallback list) left the popover completely empty.
 *
 *  3. A refetch never blanks the list. While the new query is in flight the
 *     previous results stay visible, narrowed locally, as long as the old
 *     query is a prefix of the new one — refining "fleet" → "fleet m" filters
 *     instantly and the server result just replaces it when it lands.
 */
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
  onFetchAllForSelectAll?: () => Promise<string[]>;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [selectAllLoading, setSelectAllLoading] = useState(false);
  /** Keyboard cursor. -1 = nothing highlighted, so Enter commits free text. */
  const [activeIndex, setActiveIndex] = useState(-1);
  const [liveSuggestions, setLiveSuggestions] = useState<{ query: string; items: string[] }>({
    query: "",
    items: [],
  });
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Close the popover when the pointer goes down anywhere outside this field.
  //
  // CAPTURE PHASE — see the note at the top of this component. This must run
  // before React's own mousedown handlers, otherwise a pick that re-renders
  // the list makes `contains()` test a detached node and the popover closes
  // itself after every selection.
  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocPointerDown, true);
    return () => document.removeEventListener("mousedown", onDocPointerDown, true);
  }, [open]);

  // Debounced live-suggestions fetch. Fires 200ms after the user stops typing.
  //
  // Deliberately does NOT wipe the previous results up front — render decides
  // whether they are still relevant (see `staleItems`). Wiping here is what
  // made the list flash empty on every keystroke.
  useEffect(() => {
    if (!onFetchSuggestions) return;
    const q = draft.trim();
    if (!q) {
      setLiveSuggestions({ query: "", items: [] });
      setLoadingSuggestions(false);
      return;
    }
    // Already have the exact results for this query (e.g. the user deleted a
    // character and typed it back) — nothing to do.
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
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, onFetchSuggestions]);

  const draftTrimmed = draft.trim();
  const chosen = new Set(values.map((v) => v.toLowerCase()));

  /** Server results that correspond exactly to what is typed right now. */
  const liveMatches =
    draftTrimmed && liveSuggestions.query === draftTrimmed ? liveSuggestions.items : null;

  /**
   * Previous server results, still usable because the user is refining the
   * same term ("fleet" → "fleet m"). Narrowed locally so the list reacts
   * instantly instead of blanking while the new request is in flight.
   */
  const staleItems =
    !liveMatches &&
    liveSuggestions.query.length > 0 &&
    liveSuggestions.items.length > 0 &&
    draftTrimmed.toLowerCase().startsWith(liveSuggestions.query.toLowerCase())
      ? liveSuggestions.items.filter((s) => s.toLowerCase().includes(draftTrimmed.toLowerCase()))
      : null;

  const serverSource = liveMatches ?? staleItems;
  const source = serverSource ?? suggestions;
  // Chosen entries are NOT removed — they render with a ticked checkbox so the
  // list holds still while several are picked, and picking again un-picks.
  const options = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of source) {
      const s = raw.trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      // Server results are already matched for this query; only the static
      // fallback list needs local filtering.
      if (!serverSource && draftTrimmed && !key.includes(draftTrimmed.toLowerCase())) continue;
      seen.add(key);
      out.push(s);
      if (out.length >= 25) break;
    }
    return out;
  })();

  // Reset the keyboard cursor whenever the query changes, and clamp it if the
  // option list shrank under it.
  useEffect(() => {
    setActiveIndex(-1);
  }, [draftTrimmed]);
  const safeActiveIndex = activeIndex >= options.length ? -1 : activeIndex;

  // Keep the highlighted option in view during arrow-key navigation.
  useEffect(() => {
    if (safeActiveIndex < 0 || !listRef.current) return;
    const node = listRef.current.querySelector<HTMLElement>(`[data-option-index="${safeActiveIndex}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [safeActiveIndex]);

  /** Commit free text (Enter / comma / "Add …"). Clears the draft. */
  function commitFreeText(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (!chosen.has(value.toLowerCase())) onChange([...values, value]);
    setDraft("");
    setActiveIndex(-1);
  }

  /**
   * Toggle a suggestion in or out. Keeps the draft, the popover and the option
   * list exactly as they are — this is what makes multi-select from a single
   * result set work.
   */
  function toggleSuggestion(suggestion: string) {
    const key = suggestion.trim().toLowerCase();
    if (!key) return;
    if (chosen.has(key)) {
      onChange(values.filter((v) => v.toLowerCase() !== key));
    } else {
      onChange([...values, suggestion.trim()]);
    }
    // The row may be re-rendered out from under the pointer; make sure focus
    // (and therefore the popover) stays on this field.
    inputRef.current?.focus();
    setOpen(true);
  }

  function removeAt(idx: number) {
    onChange(values.filter((_, i) => i !== idx));
  }

  // Pool Select-all operates over — every distinct suggestion this input knows
  // about, regardless of the current draft filter.
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
      const poolKeys = new Set(selectAllPool.map((s) => s.toLowerCase()));
      onChange(values.filter((v) => !poolKeys.has(v.toLowerCase())));
      return;
    }

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
        /* fall back to the local pool */
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

  const isInclude = tone === "include";
  const chipClass = isInclude
    ? "border-accent-500/30 bg-accent-500/10 text-accent-700 dark:text-accent-200"
    : "border-red-300/40 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-200";
  const chipCloseClass = isInclude
    ? "hover:bg-accent-500 hover:text-white"
    : "hover:bg-red-500 hover:text-white";
  const labelTone = isInclude
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-red-600 dark:text-red-300";
  const labelDot = isInclude ? "bg-emerald-500" : "bg-red-500";

  // "Add xyz" only makes sense when the typed term isn't already an option or
  // an existing chip.
  const canAddFreeText =
    draftTrimmed.length > 0 &&
    !chosen.has(draftTrimmed.toLowerCase()) &&
    !options.some((o) => o.toLowerCase() === draftTrimmed.toLowerCase());

  return (
    <div ref={containerRef} className="relative">
      <label
        className={`mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${labelTone}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${labelDot}`} />
        {label}
        {values.length > 0 ? (
          <span className="ml-auto rounded-full bg-slate-100 px-1.5 text-[10px] font-bold normal-case tracking-normal text-slate-500 dark:bg-white/10 dark:text-white/50">
            {values.length}
          </span>
        ) : null}
      </label>
      <div
        onClick={() => {
          inputRef.current?.focus();
          setOpen(true);
        }}
        className={`flex min-h-[36px] flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 text-sm shadow-sm transition-all dark:bg-white/[0.04] ${
          open
            ? isInclude
              ? "border-accent-400 ring-2 ring-accent-500/15"
              : "border-red-400 ring-2 ring-red-500/15"
            : "border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20"
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
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((i) => (options.length === 0 ? -1 : Math.min(i + 1, options.length - 1)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((i) => (i <= 0 ? -1 : i - 1));
            } else if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              // A highlighted option wins; otherwise the typed text is taken
              // verbatim. Picking via Enter keeps the popover open, exactly
              // like picking with the mouse.
              const highlighted = safeActiveIndex >= 0 ? options[safeActiveIndex] : undefined;
              if (highlighted) toggleSuggestion(highlighted);
              else commitFreeText(draft);
            } else if (event.key === "Backspace" && draft === "" && values.length > 0) {
              event.preventDefault();
              removeAt(values.length - 1);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setActiveIndex(-1);
            }
          }}
          disabled={disabled}
          placeholder={values.length === 0 ? placeholder : "Add another…"}
          className="min-w-[100px] flex-1 border-none bg-transparent text-[13px] text-slate-950 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/35"
        />
        {loadingSuggestions && draftTrimmed ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400 dark:text-white/40" />
        ) : null}
      </div>
      {open ? (
        <div className="absolute left-0 right-0 z-[60] mt-1 flex max-h-72 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#101013]">
          {selectAllPool.length > 0 || onFetchAllForSelectAll ? (
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-1.5 text-[11px] dark:border-white/10 dark:bg-white/[0.03]">
              <label
                onMouseDown={(event) => event.preventDefault()}
                className={`flex items-center gap-2 text-slate-600 dark:text-white/70 ${
                  selectAllLoading ? "cursor-progress" : "cursor-pointer"
                }`}
              >
                {selectAllLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-500" />
                ) : (
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (!selectAllLoading) void toggleSelectAll();
                    }}
                    readOnly
                    className="h-3.5 w-3.5 rounded border-slate-300 text-accent-500"
                  />
                )}
                <span className="font-semibold uppercase tracking-wide">
                  {selectAllLoading
                    ? "Fetching everything…"
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

          {/* Thin progress bar while a refetch is in flight, so the list can
              keep showing the previous (narrowed) results instead of blanking. */}
          {loadingSuggestions && options.length > 0 ? (
            <div className="h-0.5 w-full overflow-hidden bg-accent-500/10">
              <div className="h-full w-1/3 animate-[shimmer_1.1s_ease-in-out_infinite] bg-accent-500/60" />
            </div>
          ) : null}

          <div ref={listRef} className="flex-1 overflow-y-auto">
            {options.length === 0 ? (
              loadingSuggestions ? (
                <div className="flex items-center gap-2 px-3 py-2.5 text-[12px] text-slate-500 dark:text-white/60">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching Apollo…
                </div>
              ) : canAddFreeText ? (
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commitFreeText(draftTrimmed);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-slate-50 dark:text-white/85 dark:hover:bg-white/[0.04]"
                >
                  <span className="rounded-full bg-accent-500/15 px-1.5 text-[10px] font-bold text-accent-600 dark:text-accent-300">
                    +
                  </span>
                  Add &ldquo;{draftTrimmed}&rdquo;
                </button>
              ) : (
                <p className="px-3 py-2.5 text-[11px] text-slate-400 dark:text-white/40">
                  {emptyHint ?? "Start typing to see live Apollo suggestions."}
                </p>
              )
            ) : (
              <>
                {options.map((suggestion, index) => {
                  const checked = chosen.has(suggestion.toLowerCase());
                  const active = index === safeActiveIndex;
                  const parts = draftTrimmed
                    ? splitByMatch(suggestion, draftTrimmed)
                    : [{ text: suggestion, match: false }];
                  return (
                    <div
                      key={suggestion}
                      data-option-index={index}
                      role="option"
                      aria-selected={checked}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => {
                        // preventDefault keeps DOM focus on the input so the
                        // popover survives the pick.
                        event.preventDefault();
                        toggleSuggestion(suggestion);
                      }}
                      className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12px] transition ${
                        active
                          ? "bg-accent-500/[0.14] text-slate-950 dark:text-white"
                          : checked
                            ? "bg-accent-500/[0.07] text-slate-950 dark:text-white"
                            : "text-slate-700 dark:text-white/85"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        tabIndex={-1}
                        className="pointer-events-none h-3.5 w-3.5 rounded border-slate-300 text-accent-500"
                        aria-label={`${checked ? "Remove" : "Add"} ${suggestion}`}
                      />
                      <span className="flex-1 truncate">
                        {parts.map((part, i) =>
                          part.match ? (
                            <mark
                              key={i}
                              className="rounded bg-accent-500/20 px-0.5 text-accent-700 dark:text-accent-200"
                            >
                              {part.text}
                            </mark>
                          ) : (
                            <span key={i}>{part.text}</span>
                          ),
                        )}
                      </span>
                      {checked ? (
                        <Check className="h-3 w-3 shrink-0 text-accent-500" />
                      ) : null}
                    </div>
                  );
                })}
                {/* Free text that matches nothing in the list is still a valid
                    Apollo term — offer it under the results rather than making
                    the user clear the list to reach it. */}
                {canAddFreeText ? (
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      commitFreeText(draftTrimmed);
                    }}
                    className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-[12px] text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/[0.04]"
                  >
                    <span className="rounded-full bg-accent-500/15 px-1.5 text-[10px] font-bold text-accent-600 dark:text-accent-300">
                      +
                    </span>
                    Use &ldquo;{draftTrimmed}&rdquo; exactly
                  </button>
                ) : null}
              </>
            )}
          </div>

          {/* Footer hint — makes multi-select discoverable. */}
          {options.length > 0 ? (
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-1.5 text-[10px] text-slate-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/35">
              <span>Click to add or remove — pick as many as you like</span>
              <span className="shrink-0">↑↓ · Enter</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Split a string into runs of match / no-match for highlight rendering. */
function splitByMatch(text: string, needle: string): Array<{ text: string; match: boolean }> {
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const idx = lowerText.indexOf(lowerNeedle);
  if (idx === -1) return [{ text, match: false }];
  const before = text.slice(0, idx);
  const middle = text.slice(idx, idx + needle.length);
  const after = text.slice(idx + needle.length);
  const parts: Array<{ text: string; match: boolean }> = [];
  if (before) parts.push({ text: before, match: false });
  parts.push({ text: middle, match: true });
  if (after) parts.push({ text: after, match: false });
  return parts;
}

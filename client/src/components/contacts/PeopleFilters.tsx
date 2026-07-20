"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Filter, RotateCcw, Search } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

export type PeopleFilterState = {
  keyword: string;
  title: string;
  company: string;
  country: string;
  marineRole: string[];
  seniority: string[];
  emailStatus: string[];
  companyKind: string[];
  department: string[];
  tags: string[];
  listIds: string[];
  hasMobilePhone: boolean;
  hasCorporatePhone: boolean;
  hasLinkedInProfile: boolean;
  verified: boolean;
  engagementTier: string;
};

export const EMPTY_PEOPLE_FILTERS: PeopleFilterState = {
  keyword: "",
  title: "",
  company: "",
  country: "",
  marineRole: [],
  seniority: [],
  emailStatus: [],
  companyKind: [],
  department: [],
  tags: [],
  listIds: [],
  hasMobilePhone: false,
  hasCorporatePhone: false,
  hasLinkedInProfile: false,
  verified: false,
  engagementTier: "",
};

const MARINE_ROLES = [
  "FLEET_MANAGER",
  "SHIP_SUPERINTENDENT",
  "TECHNICAL_MANAGER",
  "CREWING_MANAGER",
  "CHARTERING_MANAGER",
  "PORT_CAPTAIN",
  "MARINE_SURVEYOR",
  "CLASS_SURVEYOR",
  "UNDERWRITER",
  "BROKER",
  "PORT_AGENT",
  "CHANDLER",
  "BUNKER_TRADER",
  "OPA_PROVIDER",
  "OTHER",
];

const SENIORITIES = [
  "INTERN",
  "ENTRY",
  "MID",
  "SENIOR",
  "LEAD",
  "MANAGER",
  "DIRECTOR",
  "VP",
  "C_LEVEL",
  "FOUNDER",
  "OWNER",
];

const EMAIL_STATUSES = ["VALID", "RISKY", "INVALID", "UNKNOWN"];

const COMPANY_KINDS = ["SHIP_OWNER", "ISM_MANAGER", "COMMERCIAL_MANAGER", "GENERIC"];

const DEPARTMENTS = [
  "OPERATIONS",
  "TECHNICAL",
  "CREWING",
  "CHARTERING",
  "COMMERCIAL",
  "EXECUTIVE",
  "PROCUREMENT",
];

const ENGAGEMENT_TIERS = ["HOT", "WARM", "COLD", "INACTIVE"];

function formatEnum(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type ContactList = { id: string; name: string; color: string; contactCount: number };

// Same variant pattern used by the vessel filter panel so both filter surfaces
// have identical section rendering (list rows in sidebar, card grid at top).
const SectionVariantContext = createContext<"list" | "card">("list");

function Section({
  title,
  defaultOpen = false,
  count,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  const variant = useContext(SectionVariantContext);
  const [open, setOpen] = useState(variant === "card" ? false : defaultOpen);

  if (variant === "card") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold text-slate-800 dark:text-white/85"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{title}</span>
            {count ? <span className="rounded-full bg-ocean/10 px-2 text-xs font-semibold text-ocean">{count}</span> : null}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="max-h-80 space-y-3 overflow-y-auto border-t border-slate-100 px-3 py-3 dark:border-white/10">
            {children}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          {title}
          {count ? <span className="rounded-full bg-ocean/10 px-2 text-xs font-semibold text-ocean">{count}</span> : null}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-2 px-4 pb-4">{children}</div>}
    </div>
  );
}

function CheckboxList({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
      {options.map((option) => (
        <label key={option} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:text-white/75 dark:hover:bg-white/[0.05]">
          <input
            type="checkbox"
            checked={selected.includes(option)}
            onChange={() => onToggle(option)}
            className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
          />
          {formatEnum(option)}
        </label>
      ))}
    </div>
  );
}

function countActive(state: PeopleFilterState): number {
  let n = 0;
  if (state.keyword.trim()) n++;
  if (state.title.trim()) n++;
  if (state.company.trim()) n++;
  if (state.country.trim()) n++;
  n += state.marineRole.length ? 1 : 0;
  n += state.seniority.length ? 1 : 0;
  n += state.emailStatus.length ? 1 : 0;
  n += state.companyKind.length ? 1 : 0;
  n += state.department.length ? 1 : 0;
  n += state.tags.length ? 1 : 0;
  n += state.listIds.length ? 1 : 0;
  if (state.hasMobilePhone) n++;
  if (state.hasCorporatePhone) n++;
  if (state.hasLinkedInProfile) n++;
  if (state.verified) n++;
  if (state.engagementTier) n++;
  return n;
}

export function PeopleFilters({
  value,
  onChange,
  onReset,
  orientation = "vertical",
}: {
  value: PeopleFilterState;
  onChange: (next: PeopleFilterState) => void;
  onReset: () => void;
  orientation?: "vertical" | "horizontal";
}) {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    apiFetch(`/api/lists?scope=my`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { data?: { lists?: ContactList[] } } | null) => setLists(payload?.data?.lists ?? []))
      .catch(() => undefined);
  }, []);

  function set<K extends keyof PeopleFilterState>(key: K, v: PeopleFilterState[K]) {
    onChange({ ...value, [key]: v });
  }

  function toggleIn(key: "marineRole" | "seniority" | "emailStatus" | "companyKind" | "department" | "tags" | "listIds", option: string) {
    const current = value[key];
    set(key, current.includes(option) ? current.filter((x) => x !== option) : [...current, option]);
  }

  const active = countActive(value);

  const sections = (
    <>
      <Section title="Lists" count={value.listIds.length}>
        {lists.length === 0 ? (
          <p className="py-1 text-sm text-slate-400">No personal lists yet.</p>
        ) : (
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {lists.map((list) => (
              <label key={list.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:text-white/75 dark:hover:bg-white/[0.05]">
                <input
                  type="checkbox"
                  checked={value.listIds.includes(list.id)}
                  onChange={() => toggleIn("listIds", list.id)}
                  className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: list.color }} />
                <span className="flex-1 truncate">{list.name}</span>
                <span className="text-xs text-slate-400">{list.contactCount}</span>
              </label>
            ))}
          </div>
        )}
      </Section>

      <Section title="Job Title" count={value.title.trim() ? 1 : 0}>
        <input
          value={value.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g. Operations Manager"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white/85"
        />
      </Section>

      <Section title="Marine Role (Persona)" count={value.marineRole.length}>
        <CheckboxList options={MARINE_ROLES} selected={value.marineRole} onToggle={(v) => toggleIn("marineRole", v)} />
      </Section>

      <Section title="Seniority" count={value.seniority.length}>
        <CheckboxList options={SENIORITIES} selected={value.seniority} onToggle={(v) => toggleIn("seniority", v)} />
      </Section>

      <Section title="Email Status" count={value.emailStatus.length}>
        <CheckboxList options={EMAIL_STATUSES} selected={value.emailStatus} onToggle={(v) => toggleIn("emailStatus", v)} />
      </Section>

      <Section title="Company" count={(value.company.trim() ? 1 : 0) + value.companyKind.length}>
        <input
          value={value.company}
          onChange={(e) => set("company", e.target.value)}
          placeholder="Company name…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white/85"
        />
        <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Company Type</p>
        <CheckboxList options={COMPANY_KINDS} selected={value.companyKind} onToggle={(v) => toggleIn("companyKind", v)} />
      </Section>

      <Section title="Location" count={value.country.trim() ? 1 : 0}>
        <input
          value={value.country}
          onChange={(e) => set("country", e.target.value)}
          placeholder="Country…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white/85"
        />
      </Section>

      <Section title="Department" count={value.department.length}>
        <CheckboxList options={DEPARTMENTS} selected={value.department} onToggle={(v) => toggleIn("department", v)} />
      </Section>

      <Section title="Engagement" count={value.engagementTier ? 1 : 0}>
        <select
          value={value.engagementTier}
          onChange={(e) => set("engagementTier", e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white/85"
        >
          <option value="">Any engagement</option>
          {ENGAGEMENT_TIERS.map((tier) => (
            <option key={tier} value={tier}>{formatEnum(tier)}</option>
          ))}
        </select>
      </Section>

      <Section title="Data Quality" count={[value.hasMobilePhone, value.hasCorporatePhone, value.hasLinkedInProfile, value.verified].filter(Boolean).length}>
        {([
          ["hasMobilePhone", "Has mobile phone"],
          ["hasCorporatePhone", "Has corporate phone"],
          ["hasLinkedInProfile", "Has LinkedIn profile"],
          ["verified", "Verified contacts only"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:text-white/75 dark:hover:bg-white/[0.05]">
            <input
              type="checkbox"
              checked={value[key]}
              onChange={(e) => set(key, e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
            />
            {label}
          </label>
        ))}
      </Section>

      <Section title="Tags" count={value.tags.length}>
        <input
          placeholder="Type a tag and press Enter"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const v = (e.target as HTMLInputElement).value.trim();
              if (v && !value.tags.includes(v)) set("tags", [...value.tags, v]);
              (e.target as HTMLInputElement).value = "";
            }
          }}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white/85"
        />
        {value.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {value.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => set("tags", value.tags.filter((t) => t !== tag))}
                className="rounded-full bg-ocean/10 px-2 py-0.5 text-xs font-semibold text-ocean hover:bg-ocean/20"
              >
                {tag} ×
              </button>
            ))}
          </div>
        )}
      </Section>
    </>
  );

  if (orientation === "horizontal") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white/90">
            <Filter className="h-4 w-4 text-ocean" />
            People filters
            {active > 0 ? (
              <span className="rounded-full bg-ocean/10 px-2 text-xs font-semibold text-ocean">{active}</span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1 md:max-w-lg">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={value.keyword}
                onChange={(e) => set("keyword", e.target.value)}
                placeholder="Search name, email, company…"
                className="w-full rounded-md border border-slate-300 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white/85"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 md:ml-auto">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/[0.06]"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {expanded ? "Hide filters" : "Show filters"}
            </button>
            {active > 0 ? (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-white/70"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            ) : null}
          </div>
        </div>

        {expanded ? (
          <SectionVariantContext.Provider value="card">
            <div className="mt-4 grid grid-cols-1 items-start gap-3 border-t border-slate-100 pt-4 dark:border-white/10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sections}
            </div>
          </SectionVariantContext.Provider>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-950">
          Filters {active > 0 ? <span className="text-ocean">({active})</span> : null}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-ocean hover:text-ocean"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>

      <div className="px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={value.keyword}
            onChange={(e) => set("keyword", e.target.value)}
            placeholder="Search name, email, company…"
            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ocean"
          />
        </div>
      </div>

      {sections}
    </div>
  );
}

export function peopleFiltersToConditions(state: PeopleFilterState) {
  const conditions: { field: string; operator: string; value?: unknown }[] = [];
  if (state.keyword.trim()) conditions.push({ field: "keyword", operator: "contains", value: state.keyword.trim() });
  if (state.title.trim()) conditions.push({ field: "title", operator: "contains", value: state.title.trim() });
  if (state.company.trim()) conditions.push({ field: "companyName", operator: "contains", value: state.company.trim() });
  if (state.country.trim()) conditions.push({ field: "country", operator: "contains", value: state.country.trim() });
  if (state.marineRole.length) conditions.push({ field: "marineRole", operator: "is_any_of", value: state.marineRole });
  if (state.seniority.length) conditions.push({ field: "seniority", operator: "is_any_of", value: state.seniority });
  if (state.emailStatus.length) conditions.push({ field: "emailStatus", operator: "is_any_of", value: state.emailStatus });
  if (state.companyKind.length) conditions.push({ field: "companyType", operator: "is_any_of", value: state.companyKind });
  if (state.department.length) conditions.push({ field: "department", operator: "includes_any_of", value: state.department });
  if (state.tags.length) conditions.push({ field: "tags", operator: "includes_any_of", value: state.tags });
  if (state.listIds.length) conditions.push({ field: "listMembership", operator: "includes_any_of", value: state.listIds });
  if (state.hasMobilePhone) conditions.push({ field: "hasMobilePhone", operator: "equals", value: true });
  if (state.hasCorporatePhone) conditions.push({ field: "hasCorporatePhone", operator: "equals", value: true });
  if (state.hasLinkedInProfile) conditions.push({ field: "hasLinkedInProfile", operator: "equals", value: true });
  if (state.verified) conditions.push({ field: "verified", operator: "equals", value: true });
  if (state.engagementTier) conditions.push({ field: "engagementTier", operator: "equals", value: state.engagementTier });
  return conditions;
}

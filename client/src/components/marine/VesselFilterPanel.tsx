"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Filter, Search, Upload } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/browser-fetch";
import {
  ETA_CONFIDENCES,
  VESSEL_STATUSES,
  VESSEL_TYPE_CATEGORIES,
  VOYAGE_STATUSES,
  formatVesselEnum,
} from "@/lib/vessel-filter-options";

type CountryOption = { country: string; countryName: string };
type PortOption = {
  portCode: string;
  portName: string;
  country: string;
  countryName: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

type FilterState = {
  q: string;
  vesselType: string[];
  flag: string;
  status: string[];
  dwtMin: string;
  dwtMax: string;
  gtMin: string;
  gtMax: string;
  builtMin: string;
  builtMax: string;
  loaMin: string;
  loaMax: string;
  owner: string;
  manager: string;
  operator: string;
  hasEta: boolean;
  etaFrom: string;
  etaTo: string;
  destCountry: string[];
  destPort: string[];
  etaConfidence: string[];
  voyageStatus: string[];
  market: string;
  sizeClass: string;
  verified: boolean;
  hasMmsi: boolean;
  hasEmail: boolean;
};

function str(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function list(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function isTrue(value: string | string[] | undefined): boolean {
  const v = str(value).toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function searchParamsToState(sp: SearchParams): FilterState {
  return {
    q: str(sp.q),
    vesselType: list(sp.vesselType),
    flag: list(sp.flag).join(", "),
    status: list(sp.status),
    dwtMin: str(sp.dwtMin),
    dwtMax: str(sp.dwtMax),
    gtMin: str(sp.gtMin),
    gtMax: str(sp.gtMax),
    builtMin: str(sp.builtMin),
    builtMax: str(sp.builtMax),
    loaMin: str(sp.loaMin),
    loaMax: str(sp.loaMax),
    owner: str(sp.owner),
    manager: str(sp.manager),
    operator: str(sp.operator),
    hasEta: isTrue(sp.hasEta),
    etaFrom: str(sp.etaFrom),
    etaTo: str(sp.etaTo),
    destCountry: list(sp.destCountry).map((c) => c.toUpperCase()),
    destPort: list(sp.destPort).map((p) => p.toUpperCase()),
    etaConfidence: list(sp.etaConfidence),
    voyageStatus: list(sp.voyageStatus),
    market: str(sp.market),
    sizeClass: str(sp.sizeClass),
    verified: isTrue(sp.verified),
    hasMmsi: isTrue(sp.hasMmsi),
    hasEmail: isTrue(sp.hasEmail),
  };
}

function stateToParams(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  const setStr = (key: string, value: string) => {
    if (value.trim()) params.set(key, value.trim());
  };
  setStr("q", state.q);
  if (state.vesselType.length) params.set("vesselType", state.vesselType.join(","));
  const flags = list(state.flag).map((f) => f.toUpperCase());
  if (flags.length) params.set("flag", flags.join(","));
  if (state.status.length) params.set("status", state.status.join(","));
  setStr("dwtMin", state.dwtMin);
  setStr("dwtMax", state.dwtMax);
  setStr("gtMin", state.gtMin);
  setStr("gtMax", state.gtMax);
  setStr("builtMin", state.builtMin);
  setStr("builtMax", state.builtMax);
  setStr("loaMin", state.loaMin);
  setStr("loaMax", state.loaMax);
  setStr("owner", state.owner);
  setStr("manager", state.manager);
  setStr("operator", state.operator);

  if (state.hasEta) params.set("hasEta", "1");
  setStr("etaFrom", state.etaFrom);
  setStr("etaTo", state.etaTo);
  if (state.destCountry.length) params.set("destCountry", state.destCountry.join(","));
  if (state.destPort.length) params.set("destPort", state.destPort.join(","));
  if (state.etaConfidence.length) params.set("etaConfidence", state.etaConfidence.join(","));
  if (state.voyageStatus.length) params.set("voyageStatus", state.voyageStatus.join(","));

  setStr("market", state.market);
  setStr("sizeClass", state.sizeClass);

  if (state.verified) params.set("verified", "1");
  if (state.hasMmsi) params.set("hasMmsi", "1");
  if (state.hasEmail) params.set("hasEmail", "1");
  return params;
}

function countActive(state: FilterState): number {
  let n = 0;
  if (state.q.trim()) n++;
  if (state.vesselType.length) n++;
  if (state.flag.trim()) n++;
  if (state.status.length) n++;
  if (state.dwtMin.trim() || state.dwtMax.trim()) n++;
  if (state.gtMin.trim() || state.gtMax.trim()) n++;
  if (state.builtMin.trim() || state.builtMax.trim()) n++;
  if (state.loaMin.trim() || state.loaMax.trim()) n++;
  if (state.owner.trim()) n++;
  if (state.manager.trim()) n++;
  if (state.operator.trim()) n++;
  if (state.hasEta) n++;
  if (state.etaFrom.trim() || state.etaTo.trim()) n++;
  if (state.destCountry.length) n++;
  if (state.destPort.length) n++;
  if (state.etaConfidence.length) n++;
  if (state.voyageStatus.length) n++;
  if (state.market.trim()) n++;
  if (state.sizeClass.trim()) n++;
  if (state.verified) n++;
  if (state.hasMmsi) n++;
  if (state.hasEmail) n++;
  return n;
}

// Section rendering variant — "list" is the sidebar look (border between rows);
// "card" is the horizontal grid look (bordered card per section).
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
  // In card mode (horizontal grid), start collapsed regardless of the caller's
  // defaultOpen so every card lines up at the same height on first render.
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
    <div className="border-b border-slate-100 last:border-0 dark:border-white/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-3 text-left text-sm font-semibold text-slate-800 dark:text-white/85"
      >
        <span className="flex items-center gap-2">
          {title}
          {count ? <span className="rounded-full bg-ocean/10 px-2 text-xs font-semibold text-ocean">{count}</span> : null}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-3 pb-4">{children}</div>}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-[#262631] dark:bg-[#08080B] dark:text-white/85";

export function VesselFilterPanel({
  searchParams,
  basePath = "/dashboard/vessels",
  orientation = "vertical",
}: {
  searchParams: SearchParams;
  basePath?: string;
  orientation?: "vertical" | "horizontal";
}) {
  const router = useRouter();
  const [state, setState] = useState<FilterState>(() => searchParamsToState(searchParams));
  const [typeSearch, setTypeSearch] = useState("");
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [ports, setPorts] = useState<PortOption[]>([]);
  const [expanded, setExpanded] = useState(false);

  // Load country list once. Cached server-side; cheap on subsequent mounts.
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/workspaces/port-countries`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { data?: CountryOption[] } | null) => {
        if (!cancelled) setCountries(payload?.data ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-load ports whenever the country selection changes. Clears any
  // already-picked ports that don't belong to the new selection.
  const countriesKey = state.destCountry.slice().sort().join(",");
  useEffect(() => {
    if (state.destCountry.length === 0) {
      setPorts([]);
      if (state.destPort.length > 0) {
        setState((prev) => ({ ...prev, destPort: [] }));
      }
      return;
    }
    let cancelled = false;
    apiFetch(`/workspaces/ports?countries=${encodeURIComponent(countriesKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { data?: PortOption[] } | null) => {
        if (cancelled) return;
        const next = payload?.data ?? [];
        setPorts(next);
        const allowed = new Set(next.map((p) => p.portCode));
        setState((prev) =>
          prev.destPort.every((code) => allowed.has(code))
            ? prev
            : { ...prev, destPort: prev.destPort.filter((code) => allowed.has(code)) },
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countriesKey]);

  const active = countActive(state);
  const typeCount = state.vesselType.length;

  function patch(part: Partial<FilterState>) {
    setState((prev) => ({ ...prev, ...part }));
  }

  function toggleType(type: string) {
    setState((prev) => ({
      ...prev,
      vesselType: prev.vesselType.includes(type)
        ? prev.vesselType.filter((t) => t !== type)
        : [...prev.vesselType, type],
    }));
  }

  function toggleStatus(value: string) {
    setState((prev) => ({
      ...prev,
      status: prev.status.includes(value) ? prev.status.filter((s) => s !== value) : [...prev.status, value],
    }));
  }

  function toggleListField(
    field: "destCountry" | "destPort" | "etaConfidence" | "voyageStatus",
    value: string,
  ) {
    setState((prev) => {
      const current = prev[field];
      return {
        ...prev,
        [field]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
      };
    });
  }

  function toggleCategory(types: string[], allSelected: boolean) {
    setState((prev) => {
      const set = new Set(prev.vesselType);
      if (allSelected) types.forEach((t) => set.delete(t));
      else types.forEach((t) => set.add(t));
      return { ...prev, vesselType: Array.from(set) };
    });
  }

  const categories = useMemo(() => {
    const term = typeSearch.trim().toLowerCase();
    if (!term) return VESSEL_TYPE_CATEGORIES;
    return VESSEL_TYPE_CATEGORIES.map((cat) => ({
      ...cat,
      types: cat.types.filter(
        (t) => cat.label.toLowerCase().includes(term) || formatVesselEnum(t).toLowerCase().includes(term),
      ),
    })).filter((cat) => cat.types.length > 0);
  }, [typeSearch]);

  function apply() {
    const params = stateToParams(state);
    // Carry the page-size choice across a filter change (page itself resets to
    // 1, since the new result set makes the old offset meaningless).
    const pageSize = searchParams.pageSize;
    if (typeof pageSize === "string") params.set("pageSize", pageSize);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function reset() {
    setState(searchParamsToState({}));
    setTypeSearch("");
    router.push(basePath);
  }

  const activeBadge = active ? (
    <span className="rounded-full bg-ocean/10 px-2 text-xs font-semibold text-ocean">{active}</span>
  ) : null;

  const sections = (
    <>
      <Section
        title="ETA & voyage"
        defaultOpen
        count={
          (state.hasEta ? 1 : 0) +
          (state.etaFrom || state.etaTo ? 1 : 0) +
          state.destCountry.length +
          state.destPort.length +
          state.etaConfidence.length +
          state.voyageStatus.length
        }
      >
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-white/70">
          <input
            type="checkbox"
            checked={state.hasEta}
            onChange={(e) => patch({ hasEta: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
          />
          Only vessels with an upcoming ETA
        </label>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-500 dark:text-white/45">ETA window (UTC)</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={state.etaFrom}
              onChange={(e) => patch({ etaFrom: e.target.value })}
              className={inputClass}
            />
            <input
              type="date"
              value={state.etaTo}
              onChange={(e) => patch({ etaTo: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-500 dark:text-white/45">
            Destination country
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2 dark:border-white/10">
            {countries.length === 0 ? (
              <p className="px-1 py-1 text-xs text-slate-400">Loading…</p>
            ) : (
              countries.map((option) => (
                <label
                  key={option.country}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/[0.05]"
                >
                  <input
                    type="checkbox"
                    checked={state.destCountry.includes(option.country)}
                    onChange={() => toggleListField("destCountry", option.country)}
                    className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                  />
                  <span className="min-w-0 truncate">
                    {option.countryName}
                    <span className="ml-1 text-xs text-slate-400">({option.country})</span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-500 dark:text-white/45">
            Destination port
          </p>
          {state.destCountry.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 px-2 py-2 text-xs text-slate-400 dark:border-white/10">
              Pick a country first to filter by specific ports.
            </p>
          ) : ports.length === 0 ? (
            <p className="rounded-md border border-slate-200 px-2 py-2 text-xs text-slate-400 dark:border-white/10">
              Loading ports…
            </p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2 dark:border-white/10">
              {ports.map((port) => (
                <label
                  key={port.portCode}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/[0.05]"
                >
                  <input
                    type="checkbox"
                    checked={state.destPort.includes(port.portCode)}
                    onChange={() => toggleListField("destPort", port.portCode)}
                    className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                  />
                  <span className="min-w-0 truncate">
                    {port.portName}
                    <span className="ml-1 text-xs text-slate-400">
                      ({port.portCode} · {port.country})
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-500 dark:text-white/45">ETA confidence</p>
          <div className="flex flex-wrap gap-2">
            {ETA_CONFIDENCES.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/[0.05]"
              >
                <input
                  type="checkbox"
                  checked={state.etaConfidence.includes(value)}
                  onChange={() => toggleListField("etaConfidence", value)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-ocean focus:ring-ocean"
                />
                {formatVesselEnum(value)}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-500 dark:text-white/45">Voyage status</p>
          <div className="flex flex-wrap gap-2">
            {VOYAGE_STATUSES.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/[0.05]"
              >
                <input
                  type="checkbox"
                  checked={state.voyageStatus.includes(value)}
                  onChange={() => toggleListField("voyageStatus", value)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-ocean focus:ring-ocean"
                />
                {formatVesselEnum(value)}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Vessel type" count={typeCount}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={typeSearch}
            onChange={(e) => setTypeSearch(e.target.value)}
            placeholder="Search vessel type"
            className="w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-3 text-sm dark:border-[#262631] dark:bg-[#08080B] dark:text-white/85"
          />
        </div>
        <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
          {categories.map((cat) => {
            const allSelected = cat.types.every((t) => state.vesselType.includes(t));
            return (
              <div key={cat.label}>
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.types, allSelected)}
                  className="text-xs font-semibold uppercase tracking-wide text-ocean hover:underline"
                >
                  {allSelected ? "Clear" : "Select all"} · {cat.label}
                </button>
                <div className="mt-1 space-y-1">
                  {cat.types.map((type) => (
                    <label
                      key={type}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/[0.05]"
                    >
                      <input
                        type="checkbox"
                        checked={state.vesselType.includes(type)}
                        onChange={() => toggleType(type)}
                        className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                      />
                      {formatVesselEnum(type)}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {categories.length === 0 ? (
            <p className="px-1 py-2 text-sm text-slate-400">No vessel type matches.</p>
          ) : null}
        </div>
      </Section>

      <Section title="Identity" count={state.flag.trim() ? 1 : 0}>
        <input
          value={state.flag}
          onChange={(e) => patch({ flag: e.target.value.toUpperCase() })}
          placeholder="Flag states, e.g. LR, PA, MH"
          className={`${inputClass} uppercase`}
        />
        <p className="text-xs text-slate-400 dark:text-white/35">Comma-separate multiple flag codes.</p>
      </Section>

      <Section title="Status" count={state.status.length}>
        <div className="space-y-1">
          {VESSEL_STATUSES.map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/[0.05]"
            >
              <input
                type="checkbox"
                checked={state.status.includes(value)}
                onChange={() => toggleStatus(value)}
                className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
              />
              {formatVesselEnum(value)}
            </label>
          ))}
        </div>
      </Section>

      <Section
        title="Size & specs"
        count={
          (state.dwtMin || state.dwtMax ? 1 : 0) +
          (state.gtMin || state.gtMax ? 1 : 0) +
          (state.builtMin || state.builtMax ? 1 : 0) +
          (state.loaMin || state.loaMax ? 1 : 0)
        }
      >
        <RangeRow label="DWT" min={state.dwtMin} max={state.dwtMax} onMin={(v) => patch({ dwtMin: v })} onMax={(v) => patch({ dwtMax: v })} />
        <RangeRow label="Gross tonnage" min={state.gtMin} max={state.gtMax} onMin={(v) => patch({ gtMin: v })} onMax={(v) => patch({ gtMax: v })} />
        <RangeRow label="Built year" min={state.builtMin} max={state.builtMax} onMin={(v) => patch({ builtMin: v })} onMax={(v) => patch({ builtMax: v })} />
        <RangeRow label="Length (LOA)" min={state.loaMin} max={state.loaMax} onMin={(v) => patch({ loaMin: v })} onMax={(v) => patch({ loaMax: v })} />
      </Section>

      <Section
        title="Owner & manager"
        count={(state.owner.trim() ? 1 : 0) + (state.manager.trim() ? 1 : 0) + (state.operator.trim() ? 1 : 0)}
      >
        <input value={state.owner} onChange={(e) => patch({ owner: e.target.value })} placeholder="Owner (registered / beneficial / company)" className={inputClass} />
        <input value={state.manager} onChange={(e) => patch({ manager: e.target.value })} placeholder="Manager (ISM / commercial / technical)" className={inputClass} />
        <input value={state.operator} onChange={(e) => patch({ operator: e.target.value })} placeholder="Operator" className={inputClass} />
      </Section>

      <Section
        title="Cargo & market"
        count={(state.market.trim() ? 1 : 0) + (state.sizeClass.trim() ? 1 : 0)}
      >
        <input
          value={state.market}
          onChange={(e) => patch({ market: e.target.value })}
          placeholder="Commercial market, e.g. Crude Oil, LNG"
          className={inputClass}
        />
        <input
          value={state.sizeClass}
          onChange={(e) => patch({ sizeClass: e.target.value })}
          placeholder="Size class, e.g. Aframax, Panamax"
          className={inputClass}
        />
      </Section>

      <Section
        title="Data quality"
        count={(state.verified ? 1 : 0) + (state.hasMmsi ? 1 : 0) + (state.hasEmail ? 1 : 0)}
      >
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-white/70">
          <input
            type="checkbox"
            checked={state.verified}
            onChange={(e) => patch({ verified: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
          />
          Verified vessels only
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-white/70">
          <input
            type="checkbox"
            checked={state.hasMmsi}
            onChange={(e) => patch({ hasMmsi: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
          />
          Has MMSI (AIS active)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-white/70">
          <input
            type="checkbox"
            checked={state.hasEmail}
            onChange={(e) => patch({ hasEmail: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
          />
          Has at least one contact email
        </label>
      </Section>
    </>
  );

  const searchRow = (
    <div className="flex min-w-0 gap-2">
      <input
        value={state.q}
        onChange={(e) => patch({ q: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && apply()}
        placeholder="Name, IMO, port, owner, manager"
        className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-[#262631] dark:bg-[#08080B] dark:text-white/85"
      />
      <button
        type="button"
        onClick={apply}
        className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:bg-ocean dark:bg-accent-600 dark:hover:bg-accent-500"
      >
        Search
      </button>
    </div>
  );

  if (orientation === "horizontal") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white/90">
            <Filter className="h-4 w-4 text-ocean" />
            Vessel filters
            {activeBadge}
          </div>
          <div className="min-w-0 flex-1 md:max-w-lg">{searchRow}</div>
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
            {active ? (
              <button
                type="button"
                onClick={reset}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#262631] dark:text-white/70"
              >
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
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={apply}
                className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-ocean dark:bg-accent-600 dark:hover:bg-accent-500"
              >
                Apply filters
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-[#262631] dark:text-white/70"
              >
                Reset
              </button>
            </div>
          </SectionVariantContext.Provider>
        ) : null}
      </div>
    );
  }

  return (
    <aside className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white/90">
          <Filter className="h-4 w-4 text-ocean" />
          Vessel filters
          {activeBadge}
        </div>
        <Link
          href="/dashboard/import"
          className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-white/60"
          aria-label="Import CSV"
        >
          <Upload className="h-4 w-4" />
        </Link>
      </div>

      <div className="pt-2">{searchRow}</div>

      {sections}

      <div className="flex gap-2 pt-3">
        <button
          type="button"
          onClick={apply}
          className="flex-1 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:bg-ocean dark:bg-accent-600 dark:hover:bg-accent-500"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-[#262631] dark:text-white/70"
        >
          Reset
        </button>
      </div>
    </aside>
  );
}

function RangeRow({
  label,
  min,
  max,
  onMin,
  onMax,
}: {
  label: string;
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-500 dark:text-white/45">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          inputMode="numeric"
          value={min}
          onChange={(e) => onMin(e.target.value)}
          placeholder="Min"
          className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-[#262631] dark:bg-[#08080B] dark:text-white/85"
        />
        <input
          inputMode="numeric"
          value={max}
          onChange={(e) => onMax(e.target.value)}
          placeholder="Max"
          className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-[#262631] dark:bg-[#08080B] dark:text-white/85"
        />
      </div>
    </div>
  );
}

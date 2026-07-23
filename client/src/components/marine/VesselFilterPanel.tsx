"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Filter, Search, Upload, X } from "lucide-react";
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
  /**
   * "Missed opportunity" filter — vessels arriving with no campaign trigger
   * attached. Composes with the ETA-window chips: on its own it lists every
   * campaign-less ETA; combined with a preset (e.g. Under 3d) it reproduces
   * the old Missed Opportunities tab for any window the user cares about.
   */
  noCampaign: boolean;

  // --- Extended fields (matches server whitelist in buildVesselFilterClauses) ---
  // Identity
  mmsi: string;
  callsign: string;
  // Size / capacity
  netTonMin: string;
  netTonMax: string;
  teuMin: string;
  teuMax: string;
  beamMin: string;
  beamMax: string;
  // AIS / position
  globalArea: string;
  navStatus: string;
  currentPortCountry: string;
  // Extended ownership / management
  registeredOwner: string;
  beneficialOwner: string;
  technicalManager: string;
  pAndIClub: string;
  // Builders & class
  classSociety: string;
  shipBuilder: string;
  engineBuilder: string;
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
    noCampaign: isTrue(sp.noCampaign),

    mmsi: str(sp.mmsi),
    callsign: str(sp.callsign),
    netTonMin: str(sp.netTonMin),
    netTonMax: str(sp.netTonMax),
    teuMin: str(sp.teuMin),
    teuMax: str(sp.teuMax),
    beamMin: str(sp.beamMin),
    beamMax: str(sp.beamMax),
    globalArea: str(sp.globalArea),
    navStatus: str(sp.navStatus),
    currentPortCountry: str(sp.currentPortCountry),
    registeredOwner: str(sp.registeredOwner),
    beneficialOwner: str(sp.beneficialOwner),
    technicalManager: str(sp.technicalManager),
    pAndIClub: str(sp.pAndIClub),
    classSociety: str(sp.classSociety),
    shipBuilder: str(sp.shipBuilder),
    engineBuilder: str(sp.engineBuilder),
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
  if (state.noCampaign) params.set("noCampaign", "1");

  setStr("mmsi", state.mmsi);
  setStr("callsign", state.callsign);
  setStr("netTonMin", state.netTonMin);
  setStr("netTonMax", state.netTonMax);
  setStr("teuMin", state.teuMin);
  setStr("teuMax", state.teuMax);
  setStr("beamMin", state.beamMin);
  setStr("beamMax", state.beamMax);
  setStr("globalArea", state.globalArea);
  setStr("navStatus", state.navStatus);
  setStr("currentPortCountry", state.currentPortCountry);
  setStr("registeredOwner", state.registeredOwner);
  setStr("beneficialOwner", state.beneficialOwner);
  setStr("technicalManager", state.technicalManager);
  setStr("pAndIClub", state.pAndIClub);
  setStr("classSociety", state.classSociety);
  setStr("shipBuilder", state.shipBuilder);
  setStr("engineBuilder", state.engineBuilder);
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
  if (state.noCampaign) n++;

  if (state.mmsi.trim()) n++;
  if (state.callsign.trim()) n++;
  if (state.netTonMin.trim() || state.netTonMax.trim()) n++;
  if (state.teuMin.trim() || state.teuMax.trim()) n++;
  if (state.beamMin.trim() || state.beamMax.trim()) n++;
  if (state.globalArea.trim()) n++;
  if (state.navStatus.trim()) n++;
  if (state.currentPortCountry.trim()) n++;
  if (state.registeredOwner.trim()) n++;
  if (state.beneficialOwner.trim()) n++;
  if (state.technicalManager.trim()) n++;
  if (state.pAndIClub.trim()) n++;
  if (state.classSociety.trim()) n++;
  if (state.shipBuilder.trim()) n++;
  if (state.engineBuilder.trim()) n++;
  return n;
}

// Section rendering variant — "list" is the sidebar look (border between rows);
// "card" is the horizontal grid look (bordered card per section);
// "plain" strips the collapsible chrome for the modal tab-pane, where the
// enclosing sidebar already handles section switching.
const SectionVariantContext = createContext<"list" | "card" | "plain">("list");

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

  if (variant === "plain") {
    // Modal pane — sub-groups need more breathing room than the compact card
    // / list variants use, otherwise "ETA confidence" and "Voyage status" run
    // into each other and the whole pane reads as one wall of controls.
    return <div className="space-y-5">{children}</div>;
  }

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
  isSuperAdmin = false,
}: {
  searchParams: SearchParams;
  basePath?: string;
  orientation?: "vertical" | "horizontal" | "modal";
  /**
   * Regular users are already server-scoped to their workspace's target
   * country, so the "Destination country" picker is redundant for them and
   * only clutters the panel. Super-admins (who see All countries) still get
   * it. Default false to keep vessel-page callers narrow.
   */
  isSuperAdmin?: boolean;
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

  const etaVoyageCount =
    (state.hasEta ? 1 : 0) +
    (state.etaFrom || state.etaTo ? 1 : 0) +
    (state.noCampaign ? 1 : 0) +
    state.destCountry.length +
    state.destPort.length +
    state.etaConfidence.length +
    state.voyageStatus.length;

  // ETA quick-window presets. Applying one sets etaFrom = today (yyyy-mm-dd)
  // and etaTo = today + N days. "Any time" clears both. Uses the browser
  // local date; the server treats the value as a UTC date literal, matching
  // how the manual date pickers behave.
  const quickWindows = [
    { key: "any", label: "Any time", days: null as number | null },
    { key: "1d", label: "1d", days: 1 },
    { key: "3d", label: "3d", days: 3 },
    { key: "7d", label: "7d", days: 7 },
    { key: "15d", label: "15d", days: 15 },
    { key: "30d", label: "30d", days: 30 },
  ];
  const todayISO = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const addDaysISO = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const activeQuickWindow = (() => {
    if (!state.etaFrom && !state.etaTo) return "any";
    if (state.etaFrom !== todayISO()) return null;
    const match = quickWindows.find((w) => w.days !== null && state.etaTo === addDaysISO(w.days));
    return match?.key ?? null;
  })();
  function applyQuickWindow(days: number | null) {
    if (days === null) {
      patch({ etaFrom: "", etaTo: "" });
    } else {
      patch({ etaFrom: todayISO(), etaTo: addDaysISO(days) });
    }
  }
  const sizeCount =
    (state.dwtMin || state.dwtMax ? 1 : 0) +
    (state.gtMin || state.gtMax ? 1 : 0) +
    (state.netTonMin || state.netTonMax ? 1 : 0) +
    (state.builtMin || state.builtMax ? 1 : 0) +
    (state.loaMin || state.loaMax ? 1 : 0) +
    (state.beamMin || state.beamMax ? 1 : 0) +
    (state.teuMin || state.teuMax ? 1 : 0);
  const ownerCount =
    (state.owner.trim() ? 1 : 0) +
    (state.registeredOwner.trim() ? 1 : 0) +
    (state.beneficialOwner.trim() ? 1 : 0) +
    (state.manager.trim() ? 1 : 0) +
    (state.technicalManager.trim() ? 1 : 0) +
    (state.operator.trim() ? 1 : 0);
  const cargoCount =
    (state.market.trim() ? 1 : 0) +
    (state.sizeClass.trim() ? 1 : 0) +
    (state.pAndIClub.trim() ? 1 : 0);
  const qualityCount = (state.verified ? 1 : 0) + (state.hasMmsi ? 1 : 0) + (state.hasEmail ? 1 : 0);
  const identityCount =
    (state.flag.trim() ? 1 : 0) +
    (state.mmsi.trim() ? 1 : 0) +
    (state.callsign.trim() ? 1 : 0);
  const aisCount =
    (state.globalArea.trim() ? 1 : 0) +
    (state.navStatus.trim() ? 1 : 0) +
    (state.currentPortCountry.trim() ? 1 : 0);
  const buildersCount =
    (state.classSociety.trim() ? 1 : 0) +
    (state.shipBuilder.trim() ? 1 : 0) +
    (state.engineBuilder.trim() ? 1 : 0);

  const etaVoyageBody = (
    <>
      {/* -- Focus card: the two boolean toggles that scope the entire feed -- */}
      <FilterCard title="Focus">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <ToggleTile
            checked={state.hasEta}
            onChange={(v) => patch({ hasEta: v })}
            title="Only vessels with an upcoming ETA"
            description="Hide vessels that have no scheduled arrival on file."
          />
          <ToggleTile
            tone="amber"
            checked={state.noCampaign}
            onChange={(v) => patch({ noCampaign: v })}
            title="Missed opportunities"
            description="Arriving with no campaign trigger attached. Pair with a window below."
          />
        </div>
      </FilterCard>

      {/* -- ETA window: presets on top, manual date range below -- */}
      <FilterCard
        title="ETA window (UTC)"
        action={
          state.etaFrom || state.etaTo ? (
            <button
              type="button"
              onClick={() => patch({ etaFrom: "", etaTo: "" })}
              className="text-[11px] font-semibold uppercase tracking-wide text-ocean hover:underline dark:text-accent-300"
            >
              Clear
            </button>
          ) : null
        }
      >
        <div className="flex flex-wrap gap-2">
          {quickWindows.map((w) => {
            const on = activeQuickWindow === w.key;
            return (
              <button
                key={w.key}
                type="button"
                onClick={() => applyQuickWindow(w.days)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  on
                    ? "border-ocean bg-ocean text-white shadow-sm dark:border-accent-500 dark:bg-accent-600"
                    : "border-slate-200 bg-white text-slate-600 hover:border-ocean hover:text-ocean dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60 dark:hover:border-accent-400"
                }`}
              >
                {w.label}
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
              From
            </span>
            <input
              type="date"
              value={state.etaFrom}
              onChange={(e) => patch({ etaFrom: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
              To
            </span>
            <input
              type="date"
              value={state.etaTo}
              onChange={(e) => patch({ etaTo: e.target.value })}
              className={inputClass}
            />
          </label>
        </div>
      </FilterCard>

      {isSuperAdmin ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <FilterCard title="Destination country" count={state.destCountry.length}>
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {countries.length === 0 ? (
                <p className="px-1 py-1 text-xs text-slate-400">Loading…</p>
              ) : (
                countries.map((option) => (
                  <label
                    key={option.country}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/[0.05]"
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
          </FilterCard>

          <FilterCard title="Destination port" count={state.destPort.length}>
            {state.destCountry.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400 dark:border-white/10">
                Pick a country first to filter by specific ports.
              </p>
            ) : ports.length === 0 ? (
              <p className="px-1 py-1 text-xs text-slate-400">Loading ports…</p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {ports.map((port) => (
                  <label
                    key={port.portCode}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/[0.05]"
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
          </FilterCard>
        </div>
      ) : null}

      {/* -- Confidence & voyage status side-by-side -- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <FilterCard title="ETA confidence">
          <div className="flex flex-wrap gap-2">
            {ETA_CONFIDENCES.map((value) => {
              const on = state.etaConfidence.includes(value);
              return (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? "border-ocean bg-ocean/10 text-ocean dark:border-accent-500 dark:bg-accent-500/15 dark:text-accent-200"
                      : "border-slate-200 bg-white text-slate-700 hover:border-ocean/60 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleListField("etaConfidence", value)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-ocean focus:ring-ocean"
                  />
                  {formatVesselEnum(value)}
                </label>
              );
            })}
          </div>
        </FilterCard>

        <FilterCard title="Voyage status">
          <div className="flex flex-wrap gap-2">
            {VOYAGE_STATUSES.map((value) => {
              const on = state.voyageStatus.includes(value);
              return (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? "border-ocean bg-ocean/10 text-ocean dark:border-accent-500 dark:bg-accent-500/15 dark:text-accent-200"
                      : "border-slate-200 bg-white text-slate-700 hover:border-ocean/60 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/70"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleListField("voyageStatus", value)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-ocean focus:ring-ocean"
                  />
                  {formatVesselEnum(value)}
                </label>
              );
            })}
          </div>
        </FilterCard>
      </div>
    </>
  );

  const vesselTypeBody = (
    <>
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
    </>
  );

  const identityBody = (
    <>
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500 dark:text-white/45">Flag states</p>
        <input
          value={state.flag}
          onChange={(e) => patch({ flag: e.target.value.toUpperCase() })}
          placeholder="Flag states, e.g. LR, PA, MH"
          className={`${inputClass} uppercase`}
        />
        <p className="text-xs text-slate-400 dark:text-white/35">Comma-separate multiple flag codes.</p>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500 dark:text-white/45">MMSI</p>
        <input
          value={state.mmsi}
          onChange={(e) => patch({ mmsi: e.target.value })}
          placeholder="e.g. 636000123"
          inputMode="numeric"
          className={inputClass}
        />
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500 dark:text-white/45">Callsign</p>
        <input
          value={state.callsign}
          onChange={(e) => patch({ callsign: e.target.value.toUpperCase() })}
          placeholder="e.g. 9V1234"
          className={`${inputClass} uppercase`}
        />
      </div>
    </>
  );

  const statusBody = (
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
  );

  const sizeSpecsBody = (
    <>
      <RangeRow label="DWT" min={state.dwtMin} max={state.dwtMax} onMin={(v) => patch({ dwtMin: v })} onMax={(v) => patch({ dwtMax: v })} />
      <RangeRow label="Gross tonnage" min={state.gtMin} max={state.gtMax} onMin={(v) => patch({ gtMin: v })} onMax={(v) => patch({ gtMax: v })} />
      <RangeRow label="Net tonnage" min={state.netTonMin} max={state.netTonMax} onMin={(v) => patch({ netTonMin: v })} onMax={(v) => patch({ netTonMax: v })} />
      <RangeRow label="Built year" min={state.builtMin} max={state.builtMax} onMin={(v) => patch({ builtMin: v })} onMax={(v) => patch({ builtMax: v })} />
      <RangeRow label="Length (LOA)" min={state.loaMin} max={state.loaMax} onMin={(v) => patch({ loaMin: v })} onMax={(v) => patch({ loaMax: v })} />
      <RangeRow label="Beam (m)" min={state.beamMin} max={state.beamMax} onMin={(v) => patch({ beamMin: v })} onMax={(v) => patch({ beamMax: v })} />
      <RangeRow label="TEU" min={state.teuMin} max={state.teuMax} onMin={(v) => patch({ teuMin: v })} onMax={(v) => patch({ teuMax: v })} />
    </>
  );

  const ownerBody = (
    <>
      <input value={state.owner} onChange={(e) => patch({ owner: e.target.value })} placeholder="Owner (registered / beneficial / company)" className={inputClass} />
      <input value={state.registeredOwner} onChange={(e) => patch({ registeredOwner: e.target.value })} placeholder="Registered owner (specific)" className={inputClass} />
      <input value={state.beneficialOwner} onChange={(e) => patch({ beneficialOwner: e.target.value })} placeholder="Beneficial owner (specific)" className={inputClass} />
      <input value={state.manager} onChange={(e) => patch({ manager: e.target.value })} placeholder="Manager (ISM / commercial / technical)" className={inputClass} />
      <input value={state.technicalManager} onChange={(e) => patch({ technicalManager: e.target.value })} placeholder="Technical manager (specific)" className={inputClass} />
      <input value={state.operator} onChange={(e) => patch({ operator: e.target.value })} placeholder="Operator" className={inputClass} />
    </>
  );

  const cargoBody = (
    <>
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
      <input
        value={state.pAndIClub}
        onChange={(e) => patch({ pAndIClub: e.target.value })}
        placeholder="P&I Club, e.g. Gard, UK P&I"
        className={inputClass}
      />
    </>
  );

  const aisBody = (
    <>
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500 dark:text-white/45">Global area</p>
        <input
          value={state.globalArea}
          onChange={(e) => patch({ globalArea: e.target.value })}
          placeholder="e.g. Arabian Gulf, Persian Gulf"
          className={inputClass}
        />
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500 dark:text-white/45">Navigational status</p>
        <input
          value={state.navStatus}
          onChange={(e) => patch({ navStatus: e.target.value })}
          placeholder="e.g. Under way, At anchor"
          className={inputClass}
        />
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500 dark:text-white/45">Current port country</p>
        <input
          value={state.currentPortCountry}
          onChange={(e) => patch({ currentPortCountry: e.target.value })}
          placeholder="e.g. Singapore"
          className={inputClass}
        />
      </div>
    </>
  );

  const buildersBody = (
    <>
      <input
        value={state.classSociety}
        onChange={(e) => patch({ classSociety: e.target.value })}
        placeholder="Class society, e.g. Lloyd's Register, DNV"
        className={inputClass}
      />
      <input
        value={state.shipBuilder}
        onChange={(e) => patch({ shipBuilder: e.target.value })}
        placeholder="Ship builder, e.g. Hyundai HI, Samsung HI"
        className={inputClass}
      />
      <input
        value={state.engineBuilder}
        onChange={(e) => patch({ engineBuilder: e.target.value })}
        placeholder="Engine builder, e.g. MAN, Wärtsilä"
        className={inputClass}
      />
    </>
  );

  const qualityBody = (
    <>
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
    </>
  );

  const sectionList: Array<{ key: string; title: string; count: number; body: React.ReactNode; defaultOpen?: boolean }> = [
    { key: "eta", title: "ETA & voyage", count: etaVoyageCount, body: etaVoyageBody, defaultOpen: true },
    { key: "type", title: "Vessel type", count: typeCount, body: vesselTypeBody },
    { key: "identity", title: "Identity", count: identityCount, body: identityBody },
    { key: "status", title: "Status", count: state.status.length, body: statusBody },
    { key: "size", title: "Size & specs", count: sizeCount, body: sizeSpecsBody },
    { key: "ais", title: "AIS & position", count: aisCount, body: aisBody },
    { key: "owner", title: "Owner & manager", count: ownerCount, body: ownerBody },
    { key: "builders", title: "Builders & class", count: buildersCount, body: buildersBody },
    { key: "cargo", title: "Cargo & market", count: cargoCount, body: cargoBody },
    { key: "quality", title: "Data quality", count: qualityCount, body: qualityBody },
  ];

  const sections = (
    <>
      {sectionList.map((s) => (
        <Section key={s.key} title={s.title} count={s.count} defaultOpen={s.defaultOpen}>
          {s.body}
        </Section>
      ))}
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

  if (orientation === "modal") {
    return (
      <FilterModalShell
        activeBadge={activeBadge}
        active={active}
        searchRow={searchRow}
        sections={sectionList}
        onApply={apply}
        onReset={reset}
      />
    );
  }

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

/**
 * Bordered card wrapper used to group related fields inside a filter section.
 * Gives every subsection a title strip, an optional right-hand action slot
 * (e.g. a "Clear" link), an optional count badge, and consistent padding.
 * Cards visually separate what used to be flat stacked <div>s so the pane
 * reads like a real form instead of a wall of labels.
 */
function FilterCard({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
            {title}
          </span>
          {count ? (
            <span className="rounded-full bg-ocean/10 px-1.5 text-[10px] font-semibold text-ocean dark:bg-accent-500/15 dark:text-accent-200">
              {count}
            </span>
          ) : null}
        </div>
        {action}
      </div>
      <div className="px-4 py-3.5">{children}</div>
    </div>
  );
}

/**
 * Rich toggle tile — a bigger tap target than a bare checkbox, with a title
 * and a helper description. Used for the two focus toggles at the top of the
 * ETA & voyage pane so the primary controls read as clear, distinct choices
 * rather than a compressed row of labels.
 */
function ToggleTile({
  title,
  description,
  checked,
  onChange,
  tone = "ocean",
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  tone?: "ocean" | "amber";
}) {
  const activeBorder =
    tone === "amber"
      ? "border-amber-400 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10"
      : "border-ocean bg-ocean/[0.06] dark:border-accent-500 dark:bg-accent-500/10";
  const activeCheck =
    tone === "amber" ? "text-amber-600 focus:ring-amber-500" : "text-ocean focus:ring-ocean";
  return (
    <label
      className={`group flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
        checked
          ? activeBorder
          : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={`mt-0.5 h-4 w-4 rounded border-slate-300 ${activeCheck}`}
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-white/90">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-white/50">{description}</p>
      </div>
    </label>
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

type FilterSectionMeta = {
  key: string;
  title: string;
  count: number;
  body: React.ReactNode;
};

/**
 * Full-screen filter modal — the trigger sits in the page header; clicking it
 * mounts an overlay with a two-column layout (section list on the left, the
 * active section's fields on the right). Open/close is animated in two phases:
 * `mounted` gates the DOM, `visible` drives the transition classes. Closing
 * flips `visible` off first, then unmounts after the transition ends so the
 * exit animation actually plays.
 */
function FilterModalShell({
  activeBadge,
  active,
  searchRow,
  sections,
  onApply,
  onReset,
}: {
  activeBadge: React.ReactNode;
  active: number;
  searchRow: React.ReactNode;
  sections: FilterSectionMeta[];
  onApply: () => void;
  onReset: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [activeKey, setActiveKey] = useState(sections[0]?.key ?? "");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function open() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setMounted(true);
    // Next frame — mount first so the DOM lands with the "hidden" classes,
    // then flip `visible` to trigger the transition.
    requestAnimationFrame(() => setVisible(true));
  }

  function close() {
    setVisible(false);
    closeTimer.current = setTimeout(() => setMounted(false), 220);
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // Lock body scroll while the modal is open — otherwise the page underneath
  // scrolls with the wheel when the panel already has its own scroll.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted]);

  const activeSection = sections.find((s) => s.key === activeKey) ?? sections[0];

  function handleApply() {
    onApply();
    close();
  }

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
            onClick={open}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/[0.06]"
          >
            <Filter className="h-4 w-4" />
            Filter vessels
          </button>
          {active ? (
            <button
              type="button"
              onClick={onReset}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#262631] dark:text-white/70"
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {mounted ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Filter vessels"
          className={`fixed inset-0 z-50 flex items-stretch justify-stretch transition-opacity duration-200 ${
            visible ? "opacity-100" : "opacity-0"
          }`}
        >
          <button
            type="button"
            aria-label="Close filters"
            onClick={close}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm dark:bg-black/60"
          />
          <div
            className={`relative m-3 flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-shell transition-all duration-200 ease-out dark:border-white/10 dark:bg-[#0A0A0C] sm:m-6 ${
              visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.98] opacity-0"
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-white/10">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white/90">Filter Vessels</h2>
                {activeBadge}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/[0.06]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              <nav className="shrink-0 overflow-y-auto border-b border-slate-100 px-3 py-4 md:w-56 md:border-b-0 md:border-r dark:border-white/10">
                <ul className="flex gap-1 overflow-x-auto md:block md:space-y-0.5">
                  {sections.map((s) => {
                    const isActive = s.key === activeSection?.key;
                    return (
                      <li key={s.key} className="shrink-0 md:shrink">
                        <button
                          type="button"
                          onClick={() => setActiveKey(s.key)}
                          className={`flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors md:whitespace-normal ${
                            isActive
                              ? "bg-ocean/10 font-semibold text-ocean dark:bg-accent-500/15 dark:text-accent-300"
                              : "text-slate-600 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/[0.05]"
                          }`}
                        >
                          <span className="truncate">{s.title}</span>
                          {s.count ? (
                            <span
                              className={`rounded-full px-2 text-xs font-semibold ${
                                isActive
                                  ? "bg-ocean/15 text-ocean dark:bg-accent-500/20 dark:text-accent-200"
                                  : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60"
                              }`}
                            >
                              {s.count}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div key={activeSection?.key} className="flex-1 overflow-y-auto px-8 py-6 animate-in-fade">
                <SectionVariantContext.Provider value="plain">
                  {activeSection?.body}
                </SectionVariantContext.Provider>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
              <button
                type="button"
                onClick={() => {
                  onReset();
                  close();
                }}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-white/60 dark:hover:text-white"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="rounded-md bg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-ocean dark:bg-accent-600 dark:hover:bg-accent-500"
              >
                Show Results
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Filter,
  Radar,
  Ruler,
  Search,
  Ship,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/browser-fetch";
import { cn } from "@/lib/cn";
import { SavedFilterSets } from "@/components/filters/SavedFilterSets";
import {
  ETA_CONFIDENCES,
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

/** A labeled text input for the filter modal — label above, input below. */
function LabeledField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-white/60">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );
}

export function VesselFilterPanel({
  searchParams,
  basePath = "/dashboard/vessels",
  orientation = "vertical",
}: {
  searchParams: SearchParams;
  basePath?: string;
  orientation?: "vertical" | "horizontal" | "modal";
}) {
  const router = useRouter();
  const [state, setState] = useState<FilterState>(() => searchParamsToState(searchParams));
  // Two hundred countries is a scroll, not a chooser. Both lists get a filter
  // box so a known destination is two keystrokes away rather than a hunt.
  const [countryQuery, setCountryQuery] = useState("");
  const [portQuery, setPortQuery] = useState("");
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
        setPortQuery("");
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

  /**
   * Add or remove a whole set at once, for the select-all controls.
   *
   * Acts on the values passed in, which are the ones currently VISIBLE after
   * any search. Selecting "all" while a search is narrowing the list to three
   * countries should select those three, not all two hundred — otherwise the
   * control silently does far more than it appears to.
   */
  const visibleCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return countries;
    // Name or ISO code — people type "Singapore" or "SG" with equal confidence.
    return countries.filter(
      (c) => c.countryName.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
    );
  }, [countries, countryQuery]);

  const visiblePorts = useMemo(() => {
    const q = portQuery.trim().toLowerCase();
    if (!q) return ports;
    return ports.filter(
      (p) =>
        p.portName.toLowerCase().includes(q) ||
        p.portCode.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q),
    );
  }, [ports, portQuery]);

  function setListValues(
    field: "destCountry" | "destPort",
    values: string[],
    selected: boolean,
  ) {
    setState((prev) => {
      const set = new Set(prev[field]);
      if (selected) values.forEach((v) => set.add(v));
      else values.forEach((v) => set.delete(v));
      return { ...prev, [field]: Array.from(set) };
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

  /**
   * Apply a change immediately, without waiting for the Search button.
   *
   * Used by the chip ×: `apply()` reads from `state`, and React state updates
   * are asynchronous, so patching and then applying in the same handler would
   * navigate with the value the user just removed still in the URL.
   */
  function applyWith(part: Partial<FilterState>) {
    const next = { ...state, ...part };
    setState(next);
    const params = stateToParams(next);
    const pageSize = searchParams.pageSize;
    if (typeof pageSize === "string") params.set("pageSize", pageSize);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  /**
   * The JSON a saved set stores: the query string this filter produces.
   *
   * Saving the URL params rather than the state object means a set round-trips
   * through exactly the same parser the address bar does, and a set saved
   * before a field existed simply lacks that key — `searchParamsToState` fills
   * the default. No separate migration path for presets.
   */
  const savedFilterConfig = Object.fromEntries(stateToParams(state).entries());

  function loadSavedFilter(config: unknown) {
    const raw = (config ?? {}) as Record<string, unknown>;
    const params: SearchParams = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "string") params[key] = value;
      else if (Array.isArray(value)) params[key] = value.filter((v): v is string => typeof v === "string");
    }
    setState(searchParamsToState(params));
  }

  function reset() {
    setState(searchParamsToState({}));
    setTypeSearch("");
    // Leaving a search term behind would make a freshly-reset filter look like
    // it still had one applied.
    setCountryQuery("");
    setPortQuery("");
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

      {/*
        Shown whenever there is more than one country to choose between.
        `/workspaces/port-countries` returns the caller's PLAN GRANT, so this
        list is already exactly what they may filter by — 2 entries on Pro, 4 on
        Fleet, every country for a super-admin.

        It used to be gated on `isSuperAdmin`, with the reasoning that regular
        users were server-scoped to a single target country and the picker was
        redundant. That stopped being true when plans started granting 2-4
        countries: the users who most needed to filter by country were the only
        ones who couldn't. One country still hides it — filtering a list to the
        one value it already has is just a dead control.
      */}
      {countries.length > 1 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <FilterCard
            title="Destination country"
            count={state.destCountry.length}
            action={
              <SelectAll
                visible={visibleCountries.map((c) => c.country)}
                selected={state.destCountry}
                onChange={(values, selected) => setListValues("destCountry", values, selected)}
              />
            }
          >
            {countries.length > 8 ? (
              <ListSearch
                value={countryQuery}
                onChange={setCountryQuery}
                placeholder="Search country or code…"
              />
            ) : null}
            {/* Only scrolls once the list is long enough to need it. A
                two-country plan shouldn't get a scroll region around two rows. */}
            <div
              className={cn(
                "space-y-1 pr-1",
                countries.length > 8 && "max-h-56 overflow-y-auto",
              )}
            >
              {visibleCountries.length === 0 ? (
                <p className="px-1 py-2 text-xs text-slate-400">
                  No country matches &ldquo;{countryQuery}&rdquo;.
                </p>
              ) : null}
              {visibleCountries.map((option) => (
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
              ))}
            </div>
          </FilterCard>

          <FilterCard
            title="Destination port"
            count={state.destPort.length}
            action={
              state.destCountry.length > 0 && ports.length > 0 ? (
                <SelectAll
                  visible={visiblePorts.map((p) => p.portCode)}
                  selected={state.destPort}
                  onChange={(values, selected) => setListValues("destPort", values, selected)}
                />
              ) : null
            }
          >
            {state.destCountry.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400 dark:border-white/10">
                Pick a country first to filter by specific ports.
              </p>
            ) : ports.length === 0 ? (
              <p className="px-1 py-1 text-xs text-slate-400">Loading ports…</p>
            ) : (
              <>
                {ports.length > 8 ? (
                  <ListSearch
                    value={portQuery}
                    onChange={setPortQuery}
                    placeholder="Search port, code or country…"
                  />
                ) : null}
                <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {visiblePorts.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-slate-400">
                      No port matches &ldquo;{portQuery}&rdquo;.
                    </p>
                  ) : null}
                  {visiblePorts.map((port) => (
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
              </>
            )}
          </FilterCard>
        </div>
      ) : null}

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

  const sizeSpecsBody = (
    <>
      <RangeRow label="DWT (mt)" min={state.dwtMin} max={state.dwtMax} onMin={(v) => patch({ dwtMin: v })} onMax={(v) => patch({ dwtMax: v })} />
      <RangeRow label="Gross tonnage (mt)" min={state.gtMin} max={state.gtMax} onMin={(v) => patch({ gtMin: v })} onMax={(v) => patch({ gtMax: v })} />
      <RangeRow label="Net tonnage (mt)" min={state.netTonMin} max={state.netTonMax} onMin={(v) => patch({ netTonMin: v })} onMax={(v) => patch({ netTonMax: v })} />
      <RangeRow label="Built year" min={state.builtMin} max={state.builtMax} onMin={(v) => patch({ builtMin: v })} onMax={(v) => patch({ builtMax: v })} />
      <RangeRow label="Length (LOA)" min={state.loaMin} max={state.loaMax} onMin={(v) => patch({ loaMin: v })} onMax={(v) => patch({ loaMax: v })} />
      <RangeRow label="Beam (m)" min={state.beamMin} max={state.beamMax} onMin={(v) => patch({ beamMin: v })} onMax={(v) => patch({ beamMax: v })} />
      <RangeRow label="TEU" min={state.teuMin} max={state.teuMax} onMin={(v) => patch({ teuMin: v })} onMax={(v) => patch({ teuMax: v })} />
    </>
  );

  const ownerBody = (
    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
      <LabeledField label="Owner (any)" value={state.owner} onChange={(v) => patch({ owner: v })} placeholder="Registered / beneficial / company" />
      <LabeledField label="Registered owner" value={state.registeredOwner} onChange={(v) => patch({ registeredOwner: v })} placeholder="Specific registered owner" />
      <LabeledField label="Beneficial owner" value={state.beneficialOwner} onChange={(v) => patch({ beneficialOwner: v })} placeholder="Specific beneficial owner" />
      <LabeledField label="Manager (any)" value={state.manager} onChange={(v) => patch({ manager: v })} placeholder="ISM / commercial / technical" />
      <LabeledField label="Technical manager" value={state.technicalManager} onChange={(v) => patch({ technicalManager: v })} placeholder="Specific technical manager" />
      <LabeledField label="Operator" value={state.operator} onChange={(v) => patch({ operator: v })} placeholder="Operator name" />
    </div>
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
    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
      <LabeledField label="Class society" value={state.classSociety} onChange={(v) => patch({ classSociety: v })} placeholder="e.g. Lloyd's Register, DNV" />
      <LabeledField label="Ship builder" value={state.shipBuilder} onChange={(v) => patch({ shipBuilder: v })} placeholder="e.g. Hyundai HI, Samsung HI" />
      <LabeledField label="Engine builder" value={state.engineBuilder} onChange={(v) => patch({ engineBuilder: v })} placeholder="e.g. MAN, Wärtsilä" />
    </div>
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

  const sectionList: FilterSectionMeta[] = [
    {
      key: "eta",
      title: "ETA & voyage",
      icon: Radar,
      description:
        "When they arrive and where. Set an arrival window, pick destination countries and ports, and narrow by voyage state.",
      count: etaVoyageCount,
      body: etaVoyageBody,
      defaultOpen: true,
    },
    {
      key: "type",
      title: "Vessel type",
      icon: Ship,
      description: "Hull categories, flag, identifiers and the data-quality toggles.",
      count: typeCount,
      body: vesselTypeBody,
    },
    {
      key: "size",
      title: "Size & specs",
      icon: Ruler,
      description: "Deadweight, tonnage, dimensions and capacity — every field is a min/max range.",
      count: sizeCount,
      body: sizeSpecsBody,
    },
    {
      key: "owner",
      title: "Owner & manager",
      icon: Building2,
      description: "Registered and beneficial owners, technical and commercial managers, operators.",
      count: ownerCount,
      body: ownerBody,
    },
    {
      key: "builders",
      title: "Builders & class",
      icon: Wrench,
      description: "Shipyard, engine builder, classification society and P&I club.",
      count: buildersCount,
      body: buildersBody,
    },
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

  /**
   * Active filters as removable chips, mirroring the contact search toolbar.
   *
   * The chip is the answer to "what am I actually filtering by right now?",
   * which a bare count on a Filters button cannot give. Each one names its
   * value, jumps to the pane it came from when clicked, and drops just that
   * value on the ×; multi-select facets get one chip per value so removing a
   * single country doesn't wipe the other three.
   *
   * Removing a chip applies immediately — it is an undo of something already
   * in the result set, and making the user press Search afterwards would leave
   * the toolbar disagreeing with the table.
   */
  const activeChips: Array<{ key: string; label: string; section: string; onRemove: () => void }> = [];
  const pushChip = (key: string, label: string, section: string, part: Partial<FilterState>) => {
    activeChips.push({ key, label, section, onRemove: () => applyWith(part) });
  };
  const pushText = (field: keyof FilterState, prefix: string, section: string) => {
    const raw = state[field];
    if (typeof raw === "string" && raw.trim()) {
      pushChip(String(field), `${prefix}: ${raw.trim()}`, section, { [field]: "" } as Partial<FilterState>);
    }
  };
  const pushRange = (
    minField: keyof FilterState,
    maxField: keyof FilterState,
    label: string,
    section: string,
  ) => {
    const min = String(state[minField] ?? "").trim();
    const max = String(state[maxField] ?? "").trim();
    if (!min && !max) return;
    pushChip(`${String(minField)}-range`, `${label} ${min || "…"}–${max || "…"}`, section, {
      [minField]: "",
      [maxField]: "",
    } as Partial<FilterState>);
  };
  const pushList = (
    field: "vesselType" | "destCountry" | "destPort" | "etaConfidence" | "voyageStatus",
    prefix: string,
    section: string,
    format: (value: string) => string = (v) => v,
  ) => {
    for (const item of state[field]) {
      pushChip(`${field}:${item}`, `${prefix}: ${format(item)}`, section, {
        [field]: state[field].filter((v) => v !== item),
      } as Partial<FilterState>);
    }
  };

  if (state.hasEta) pushChip("hasEta", "Has an ETA", "eta", { hasEta: false });
  if (state.noCampaign) pushChip("noCampaign", "No campaign attached", "eta", { noCampaign: false });
  if (state.etaFrom || state.etaTo) {
    pushChip("etaWindow", `ETA ${state.etaFrom || "any"} → ${state.etaTo || "any"}`, "eta", {
      etaFrom: "",
      etaTo: "",
    });
  }
  pushList("destCountry", "Country", "eta", (code) => countries.find((c) => c.country === code)?.countryName ?? code);
  pushList("destPort", "Port", "eta", (code) => ports.find((p) => p.portCode === code)?.portName ?? code);
  pushList("etaConfidence", "Confidence", "eta", formatVesselEnum);
  pushList("voyageStatus", "Voyage", "eta", formatVesselEnum);
  pushList("vesselType", "Type", "type", formatVesselEnum);
  pushRange("dwtMin", "dwtMax", "DWT", "size");
  pushRange("gtMin", "gtMax", "GT", "size");
  pushRange("netTonMin", "netTonMax", "Net tonnage", "size");
  pushRange("builtMin", "builtMax", "Built", "size");
  pushRange("loaMin", "loaMax", "LOA", "size");
  pushRange("beamMin", "beamMax", "Beam", "size");
  pushRange("teuMin", "teuMax", "TEU", "size");
  pushText("flag", "Flag", "type");
  pushText("owner", "Owner", "owner");
  pushText("registeredOwner", "Registered owner", "owner");
  pushText("beneficialOwner", "Beneficial owner", "owner");
  pushText("manager", "Manager", "owner");
  pushText("technicalManager", "Technical manager", "owner");
  pushText("operator", "Operator", "owner");
  pushText("classSociety", "Class", "builders");
  pushText("pAndIClub", "P&I", "builders");
  pushText("shipBuilder", "Builder", "builders");
  pushText("engineBuilder", "Engine", "builders");
  pushText("mmsi", "MMSI", "type");
  pushText("callsign", "Callsign", "type");
  pushText("market", "Market", "type");
  pushText("sizeClass", "Size class", "size");
  pushText("globalArea", "Area", "eta");
  pushText("navStatus", "Nav status", "eta");
  pushText("currentPortCountry", "Currently in", "eta");
  if (state.verified) pushChip("verified", "Verified only", "type", { verified: false });
  if (state.hasMmsi) pushChip("hasMmsi", "AIS active", "type", { hasMmsi: false });
  if (state.hasEmail) pushChip("hasEmail", "Has contact email", "type", { hasEmail: false });

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
        active={active}
        searchRow={searchRow}
        sections={sectionList}
        onApply={apply}
        onReset={reset}
        chips={activeChips}
        savedSets={
          <SavedFilterSets
            entityType="ETA"
            value={savedFilterConfig}
            hasFilter={active > 0}
            onLoad={loadSavedFilter}
            namePlaceholder="e.g. Tankers · Brazil · 7 days"
          />
        }
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
/** Compact filter box for a long checkbox list. */
function ListSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative mb-2">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-900 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Select-all for a checkbox list.
 *
 * Acts on what is visible, so it stays honest while a search is narrowing the
 * list — "Select all 4" says exactly how many it will take.
 */
function SelectAll({
  visible,
  selected,
  onChange,
}: {
  visible: string[];
  selected: string[];
  onChange: (values: string[], selected: boolean) => void;
}) {
  if (visible.length === 0) return null;
  const chosen = visible.filter((v) => selected.includes(v)).length;
  const allChosen = chosen === visible.length;
  return (
    <button
      type="button"
      onClick={() => onChange(visible, !allChosen)}
      className="text-[11px] font-medium text-ocean hover:underline"
    >
      {allChosen ? `Clear ${visible.length}` : `Select all ${visible.length}`}
    </button>
  );
}

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
  /** Rail icon. Same role as the contact filter's category icons. */
  icon: typeof Radar;
  /** One line under the pane heading saying what this section is for. */
  description: string;
  count: number;
  body: React.ReactNode;
  defaultOpen?: boolean;
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
  active,
  searchRow,
  sections,
  onApply,
  onReset,
  chips,
  savedSets,
}: {
  active: number;
  searchRow: React.ReactNode;
  sections: FilterSectionMeta[];
  onApply: () => void;
  onReset: () => void;
  chips: Array<{ key: string; label: string; section: string; onRemove: () => void }>;
  savedSets: React.ReactNode;
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
    /* ── Toolbar ──────────────────────────────────────────────────────────
       Deliberately the same shape as the contact search toolbar: a Filters
       button carrying the active count, then the chips for what is actually
       applied, then Clear / Saved sets / Search on the right. The two filters
       used to look like different products; the panes behind them were always
       the same idea, so only the front door needed to agree. */
    <div className="rounded-xl border border-slate-200/70 bg-white shadow-sm ring-1 ring-black/[0.02] dark:border-white/[0.08] dark:bg-white/[0.02] dark:ring-white/[0.02]">
      <div className="flex flex-wrap items-center gap-2 p-2">
        <button
          type="button"
          onClick={open}
          className="group inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 shadow-sm transition-all hover:border-accent-400 hover:text-accent-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:border-accent-400/60"
        >
          <Filter className="h-3.5 w-3.5 text-accent-500" />
          Filters
          {active ? (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white">
              {active}
            </span>
          ) : null}
        </button>

        <span className="hidden h-6 w-px shrink-0 bg-slate-200 sm:block dark:bg-white/10" />

        {/* Horizontal scroll, so a 40-chip filter never wraps the toolbar into
            a wall of text. */}
        <div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
          {chips.length === 0 ? (
            <span className="truncate text-[12px] text-slate-400 dark:text-white/35">No filters</span>
          ) : (
            chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent-500/25 bg-accent-500/10 py-0.5 pl-2 pr-1 text-[11px] font-medium text-accent-700 dark:text-accent-200"
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveKey(chip.section);
                    open();
                  }}
                  className="max-w-[180px] truncate hover:underline"
                  title="Edit this filter"
                >
                  {chip.label}
                </button>
                <button
                  type="button"
                  onClick={chip.onRemove}
                  aria-label={`Remove ${chip.label}`}
                  className="rounded-full p-0.5 opacity-60 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/15"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))
          )}
        </div>

        {active ? (
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-white/55 dark:hover:bg-red-500/10 dark:hover:text-red-300"
          >
            Clear
          </button>
        ) : null}

        <div className="shrink-0">{savedSets}</div>

        <div className="min-w-[220px] shrink-0 grow sm:grow-0 sm:basis-[320px]">{searchRow}</div>
      </div>

      {mounted ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Filter vessels"
          onMouseDown={(event) => {
            // mousedown, not click: a click that STARTED inside the dialog and
            // ended on the backdrop (dragging to select text) must not close it.
            if (event.target === event.currentTarget) close();
          }}
          className={`fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm transition-opacity duration-200 ${
            visible ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* FIXED height, not max-height. With `max-h` the dialog sized itself
              to whichever section was open — ETA & voyage is tall, Builders &
              class is short — so every tab switch resized the window and moved
              the footer buttons out from under the cursor. Clamped rather than a
              flat vh so it stays comfortable on a laptop and doesn't become a
              full-height sheet on a tall monitor; the pane scrolls inside it. */}
          <div
            className={`flex h-[clamp(480px,72vh,660px)] max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_32px_80px_rgba(15,23,42,0.28)] transition-all duration-200 ease-out dark:border-white/10 dark:bg-[#0C0C0F] ${
              visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.98] opacity-0"
            }`}
          >
            {/* Header — icon tile, title, and what this filter is searching. */}
            <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-white px-5 py-3.5 dark:border-white/[0.06] dark:from-white/[0.03] dark:via-transparent dark:to-transparent">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500/12 text-accent-600 dark:text-accent-300">
                <Filter className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">Filters</h2>
                <p className="text-[11px] text-slate-500 dark:text-white/45">
                  Searching arrivals in the countries your plan covers
                </p>
              </div>
              {active > 0 ? (
                <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-500 px-1.5 text-[10px] font-bold text-white">
                  {active}
                </span>
              ) : null}
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="ml-auto rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-white/40 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body — category rail on the left, the active pane on the right.
                A vertical rail rather than the old horizontal tab bar: the
                sections are a list of places to go, and reading a column of
                labels beats scanning a row that scrolls sideways once there
                are five of them. */}
            <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
              <nav className="shrink-0 space-y-0.5 overflow-y-auto border-b border-slate-100 p-2 dark:border-white/[0.06] sm:w-56 sm:border-b-0 sm:border-r">
                {sections.map((section) => {
                  const Icon = section.icon;
                  const isActive = section.key === activeSection?.key;
                  return (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => setActiveKey(section.key)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] transition ${
                        isActive
                          ? "border border-accent-500/30 bg-accent-500/[0.07] font-semibold text-accent-700 shadow-sm dark:text-accent-200"
                          : "border border-transparent font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-white/65 dark:hover:bg-white/[0.04] dark:hover:text-white"
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-accent-500" : "text-slate-400 dark:text-white/40"}`} />
                      <span className="min-w-0 flex-1 truncate">{section.title}</span>
                      {section.count ? (
                        <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white">
                          {section.count}
                        </span>
                      ) : null}
                      {isActive ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-accent-500" /> : null}
                    </button>
                  );
                })}
              </nav>

              {/* The pane is the scroll container; strip the inner max-height
                  caps the section bodies use in the compact layout so lists
                  fill the modal instead of being clipped with empty space. */}
              <div
                key={activeSection?.key}
                className="min-h-0 flex-1 overflow-y-auto px-5 py-5 animate-in-fade [&_.max-h-56]:max-h-none [&_.max-h-72]:max-h-none [&_.max-h-80]:max-h-none"
              >
                {activeSection ? (
                  <div className="mb-4 flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-500/12 text-accent-600 dark:text-accent-300">
                      <activeSection.icon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                        {activeSection.title}
                      </h3>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500 dark:text-white/50">
                        {activeSection.description}
                      </p>
                    </div>
                  </div>
                ) : null}
                <SectionVariantContext.Provider value="plain">
                  {activeSection?.body}
                </SectionVariantContext.Provider>
              </div>
            </div>

            {/* Footer — states what the filter currently does, then Done (keep
                the selection, close) and Apply & search (run it). */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <p className="text-[12px] text-slate-500 dark:text-white/45">
                {active === 0
                  ? "No filters — every arrival in scope will be returned."
                  : `${active} filter${active === 1 ? "" : "s"} applied.`}
              </p>
              <div className="flex items-center gap-2">
                {active > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      onReset();
                      close();
                    }}
                    className="rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-white/55 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                  >
                    Reset
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-accent-500 to-accent-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm shadow-accent-500/25 transition-all hover:from-accent-500 hover:to-accent-500 hover:shadow-accent-500/40"
                >
                  <Search className="h-3.5 w-3.5" />
                  Apply &amp; search
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

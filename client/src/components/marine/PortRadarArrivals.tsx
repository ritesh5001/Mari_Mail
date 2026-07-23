"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ExternalLink, Loader2, SlidersHorizontal } from "lucide-react";
import type { MarineVesselContactView, MarineVesselContactsResponse } from "@/lib/marine-row-views";
import { ColumnCustomizer } from "@/components/table/ColumnCustomizer";
import { useColumnPreferences } from "@/hooks/useColumnPreferences";
import { portRadarColumns } from "@/lib/table-columns";

export type IndiaRadarEta = {
  id: string;
  vesselId: string;
  eta: string;
  createdAt: string;
  destinationPort: string;
  destinationPortName: string;
  currentLat: number | null;
  currentLon: number | null;
  speedOverGround: number | null;
  lastAISUpdate: string | null;
  voyageStatus: string;
  previousCargo: string | null;
  nextCargo: string | null;
  associatedContactCount: number;
  triggers: Array<{ status: string }>;
  vessel: {
    id: string;
    imoNumber: string;
    vesselName: string;
    vesselType: string;
    flag: string | null;
  };
};
import { VesselAddToListModal } from "@/components/marine/VesselAddToListModal";
import { ExternalContactsSubrow, type ExternalContactRow, type ExternalLoadState } from "@/components/marine/VesselViews";
import { EditVesselButton } from "@/components/marine/EditVesselButton";
import { EditEtaModal, type EditEtaInitial } from "@/components/marine/EditEtaModal";
import { SortableHeader } from "@/components/table/SortableHeader";
import type { SortState } from "@/hooks/useClientSort";
import { apiFetch } from "@/lib/browser-fetch";

type ContactLoadState =
  | { status: "loading" }
  | { status: "loaded"; rows: MarineVesselContactView[] }
  | { status: "error"; message: string };

function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatEta(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function etaCountdown(value: string) {
  const ms = new Date(value).getTime() - Date.now();
  const days = Math.floor(ms / 86_400_000);
  // Colour-code by urgency so a long list stays readable at a glance:
  //   Today       — red     (act now)
  //   Tomorrow    — amber   (imminent)
  //   ≤ 7 days    — emerald (this week)
  //   ≤ 30 days   — sky     (this month)
  //   > 30 days   — slate   (long-lead)
  if (days <= 0) return { label: "Today", tone: "border-red-200 bg-red-50 text-red-700" };
  if (days === 1) return { label: "Tomorrow", tone: "border-amber-200 bg-amber-50 text-amber-700" };
  if (days <= 7) return { label: `In ${days} days`, tone: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (days <= 30) return { label: `In ${days} days`, tone: "border-sky-200 bg-sky-50 text-sky-700" };
  return { label: `In ${days} days`, tone: "border-slate-200 bg-slate-100 text-slate-600" };
}

// Relative "added N ago" label. Absolute timestamp goes in the cell's title
// tooltip so power users can hover for the exact time.
function formatAddedAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function formatAddedAbsolute(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function campaignBadge(triggers: Array<{ status: string }>) {
  if (!triggers.length) return { label: "No Campaign", tone: "border-slate-200 bg-slate-50 text-slate-600" };
  const active = triggers.some((trigger) => trigger.status === "PENDING" || trigger.status === "ACTIVE");
  if (active) return { label: "Active", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  return { label: "Completed", tone: "border-cyan-200 bg-cyan-50 text-cyan-700" };
}

// Column visibility toggles persisted per-user in localStorage. Keys are the
// column ids used by the table header + body to match visibility state.
type ColumnKey =
  | "flag"
  | "imo"
  | "type"
  | "etaUtc"
  | "destination"
  | "eta"
  | "campaign"
  | "voyage"
  | "cargo"
  | "ais"
  | "contacts"
  | "added";

// Column definitions live in @/lib/table-columns (portRadarColumns) and are
// driven through the shared ColumnCustomizer drawer via useColumnPreferences,
// same pattern as the Vessels and Contacts tables. The old localStorage key
// (portRadar.visibleColumns) is superseded by the hook's own storage key
// ("marimail-cols-port-radar") — legacy prefs are ignored and every column
// simply starts visible on first load.

export function PortRadarArrivals({
  etas,
  count,
  page,
  pageSize,
  paging = false,
  onPageChange,
  sort = null,
  onSort,
  portsWithCoordinates,
  isSuperAdmin = false,
}: {
  etas: IndiaRadarEta[];
  count: number;
  page: number;
  pageSize: number;
  // Paging is now driven by the parent (client-fetch + prefetch); these replace
  // the old URL-navigation approach so switching pages doesn't reload the page.
  paging?: boolean;
  onPageChange?: (page: number) => void;
  // Server-side sort: the parent re-queries the feed ordered by the clicked
  // column across the full dataset (not just the visible page).
  sort?: SortState;
  onSort?: (key: string) => void;
  portsWithCoordinates: string[];
  isSuperAdmin?: boolean;
}) {
  const [selectedVessels, setSelectedVessels] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [contactLoadState, setContactLoadState] = useState<Record<string, ContactLoadState>>({});
  const [externalLoadState, setExternalLoadState] = useState<Record<string, ExternalLoadState>>({});
  const [revealing, setRevealing] = useState<Map<string, "email" | "phone">>(new Map());
  const [showVesselModal, setShowVesselModal] = useState(false);
  const [editingEta, setEditingEta] = useState<EditEtaInitial | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  // Shared column-prefs hook — same drawer + persistence flow the Vessels and
  // Contacts tables use. `visibleIds` gates every optional <th>/<td> below.
  const allColumns = useMemo(() => portRadarColumns(), []);
  const {
    columns: renderColumns,
    orderedAll,
    lockedColumns,
    save: saveColumns,
    reset: resetColumns,
  } = useColumnPreferences("port-radar", allColumns);
  const visibleIds = useMemo(() => new Set(renderColumns.map((c) => c.id)), [renderColumns]);
  const isVisible = (key: ColumnKey) => visibleIds.has(key);

  // Render a sortable header when the parent supplied an onSort handler (server
  // sort); otherwise a plain header. Keeps the JSX below terse.
  const sortableTh = (label: string, key: string) =>
    onSort ? (
      <SortableHeader label={label} sortKey={key} sort={sort} onSort={onSort} />
    ) : (
      <th className="whitespace-nowrap px-4 py-3">{label}</th>
    );
  const selectedVesselIds = Array.from(selectedVessels);
  // Page-level select-all state — reads the checkbox as "checked" only when
  // every vessel on the current page is already in the selection set. Rows
  // are keyed by ETA id (a vessel may recur across ETA rows within the same
  // page); this collapses to the underlying vessel-id set.
  const pageVesselIds = Array.from(new Set(etas.map((e) => e.vesselId)));
  const allOnPageSelected =
    pageVesselIds.length > 0 && pageVesselIds.every((id) => selectedVessels.has(id));
  const someOnPageSelected =
    !allOnPageSelected && pageVesselIds.some((id) => selectedVessels.has(id));
  function toggleAllOnPage() {
    setSelectedVessels((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const id of pageVesselIds) next.delete(id);
      } else {
        for (const id of pageVesselIds) next.add(id);
      }
      return next;
    });
  }

  // `etas` is already just this page — the server applied skip/take.
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEtas = etas;

  function toggleVessel(id: string) {
    setSelectedVessels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleExpand(vesselId: string) {
    const isOpen = expanded.has(vesselId);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(vesselId);
      else next.add(vesselId);
      return next;
    });
    if (isOpen) return;

    const internalStatus = contactLoadState[vesselId]?.status;
    if (internalStatus !== "loaded" && internalStatus !== "loading") {
      setContactLoadState((prev) => ({ ...prev, [vesselId]: { status: "loading" } }));
      (async () => {
        try {
          const response = await fetch(`/api/marine-db/vessels/${vesselId}/contacts`);
          if (!response.ok) {
            setContactLoadState((prev) => ({ ...prev, [vesselId]: { status: "error", message: `Failed (${response.status})` } }));
            return;
          }
          const data = (await response.json()) as MarineVesselContactsResponse;
          setContactLoadState((prev) => ({ ...prev, [vesselId]: { status: "loaded", rows: data.rows } }));
        } catch (err) {
          setContactLoadState((prev) => ({
            ...prev,
            [vesselId]: { status: "error", message: err instanceof Error ? err.message : "Network error" },
          }));
        }
      })();
    }

    // External sources (Apollo/Maribiz) fire in parallel. Server returns
    // *locked* rows — no credit is spent until the user hits "Reveal".
    const externalStatus = externalLoadState[vesselId]?.status;
    if (externalStatus !== "loaded" && externalStatus !== "loading") {
      setExternalLoadState((prev) => ({ ...prev, [vesselId]: { status: "loading" } }));
      (async () => {
        try {
          const response = await apiFetch(`/api/contacts/external-by-vessel/${vesselId}`);
          if (!response.ok) {
            setExternalLoadState((prev) => ({
              ...prev,
              [vesselId]: { status: "error", message: `Failed (${response.status})` },
            }));
            return;
          }
          const payload = (await response.json()) as {
            data?: { rows?: ExternalContactRow[]; warnings?: string[] };
          };
          setExternalLoadState((prev) => ({
            ...prev,
            [vesselId]: {
              status: "loaded",
              rows: payload.data?.rows ?? [],
              warnings: payload.data?.warnings ?? [],
            },
          }));
        } catch (err) {
          setExternalLoadState((prev) => ({
            ...prev,
            [vesselId]: { status: "error", message: err instanceof Error ? err.message : "Network error" },
          }));
        }
      })();
    }
  }

  async function revealApollo(vesselId: string, contact: ExternalContactRow, field: "email" | "phone") {
    if (!contact.externalId) return;
    const key = `${contact.id}:${field}`;
    if (revealing.has(key)) return;
    setRevealing((prev) => new Map(prev).set(key, field));
    try {
      const response = await apiFetch(`/api/contacts/reveal-apollo/${contact.externalId}/${field}`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
        const msg = body?.error?.code === "INSUFFICIENT_CREDITS"
          ? "Out of credits — upgrade your plan to reveal more"
          : body?.error?.message ?? "Failed to reveal";
        done(msg);
        return;
      }
      const payload = (await response.json()) as {
        data: { contact: { id: string; email?: string; mobilePhone?: string | null }; balance: number };
      };
      setExternalLoadState((prev) => {
        const current = prev[vesselId];
        if (!current || current.status !== "loaded") return prev;
        const updated = current.rows.map((r) => {
          if (r.id !== contact.id) return r;
          return {
            ...r,
            email: field === "email" && payload.data.contact.email ? payload.data.contact.email : r.email,
            emailLocked: field === "email" ? false : r.emailLocked,
            mobilePhone: field === "phone" && payload.data.contact.mobilePhone ? payload.data.contact.mobilePhone : r.mobilePhone,
            phoneLocked: field === "phone" ? false : r.phoneLocked,
            emailStatus: field === "email" ? "VALID" : r.emailStatus,
          };
        });
        return { ...prev, [vesselId]: { ...current, rows: updated } };
      });
      done(`Revealed — ${payload.data.balance} credits left`);
    } finally {
      setRevealing((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function done(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  async function handleExport() {
    const imoNumbers = etas
      .filter((eta) => selectedVessels.has(eta.vesselId))
      .map((eta) => eta.vessel.imoNumber);
    if (imoNumbers.length === 0) return;
    setExporting(true);
    try {
      const response = await apiFetch(`/api/vessels/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imoNumbers }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        done(payload.error?.message ?? "Export failed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "radar-vessels.csv";
      a.click();
      URL.revokeObjectURL(url);
      setSelectedVessels(new Set());
    } catch {
      done("Export failed - please try again");
    } finally {
      setExporting(false);
    }
  }

  if (etas.length === 0) {
    // While a fetch is in flight (tab open / sort / page change) show a loader
    // rather than the empty-state, which otherwise flashes "no results" on every
    // load and reads as a bug when the feed actually has rows.
    if (paging) {
      return (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading arrivals…
        </div>
      );
    }
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        No arrivals match this filter. Try widening the ETA window or clearing filters.
      </div>
    );
  }

  return (
    <>
      {showVesselModal && (
        <VesselAddToListModal
          vesselIds={selectedVesselIds}
          onClose={() => setShowVesselModal(false)}
          onDone={(listName, added) => {
            setShowVesselModal(false);
            setSelectedVessels(new Set());
            done(`${added} vessel${added !== 1 ? "s" : ""} added to "${listName}"`);
          }}
        />
      )}
      {editingEta && (
        <EditEtaModal initial={editingEta} onClose={() => setEditingEta(null)} />
      )}
      {showCustomizer && (
        <ColumnCustomizer
          title="Customize arrival columns"
          lockedColumns={lockedColumns}
          orderedAll={orderedAll}
          onClose={() => setShowCustomizer(false)}
          onSave={saveColumns}
          onReset={resetColumns}
        />
      )}
      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg">
          {toast}
        </div>
      ) : null}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">Table view</p>
            <p className="text-xs text-slate-500">
              {selectedVesselIds.length > 0
                ? `${selectedVesselIds.length} vessel${selectedVesselIds.length === 1 ? "" : "s"} selected`
                : `${count.toLocaleString("en")} upcoming arrival${count === 1 ? "" : "s"} · sorted by ETA`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => setShowCustomizer(true)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 hover:border-ocean hover:text-ocean"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Customize
            </button>
            <button
              type="button"
              onClick={() => selectedVesselIds.length > 0 && setShowVesselModal(true)}
              disabled={selectedVesselIds.length === 0}
              className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40 enabled:hover:border-ocean enabled:hover:text-ocean"
            >
              Add to List{selectedVesselIds.length > 0 ? ` (${selectedVesselIds.length})` : ""}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={selectedVesselIds.length === 0 || exporting}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40 enabled:hover:border-ocean enabled:hover:text-ocean"
            >
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Export CSV{selectedVesselIds.length > 0 ? ` (${selectedVesselIds.length})` : ""}
            </button>
          </div>
        </div>
        {/* Bounded scroll area: the table scrolls BOTH axes inside this div.
            That's what makes the sticky header reliable — `sticky top-0`
            pins to this container's top while rows scroll beneath, and the
            container's own horizontal scrollbar sits at its bottom edge,
            which is always on screen because the container is capped to
            the viewport height. */}
        <div className="max-h-[calc(100vh-230px)] overflow-auto overscroll-x-contain rounded-b-lg">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-30 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226,232,240)]">
            <tr>
              <th className="sticky left-0 top-0 z-40 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label={allOnPageSelected ? "Deselect all vessels on this page" : "Select all vessels on this page"}
                  checked={allOnPageSelected}
                  ref={(el) => {
                    // Indeterminate is DOM-only, not a React prop — reflect
                    // "some but not all rows on this page selected" as the
                    // dashed checkbox state so the master control isn't
                    // ambiguous when the user is mid-selection.
                    if (el) el.indeterminate = someOnPageSelected;
                  }}
                  onChange={toggleAllOnPage}
                  disabled={pageVesselIds.length === 0}
                  className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                />
              </th>
              {onSort ? (
                <SortableHeader
                  label="Vessel Name"
                  sortKey="vesselName"
                  sort={sort}
                  onSort={onSort}
                  className="sticky left-12 top-0 z-40 bg-slate-50"
                />
              ) : (
                <th className="sticky left-12 top-0 z-40 bg-slate-50 px-4 py-3 whitespace-nowrap">Vessel Name</th>
              )}
              {isVisible("flag") ? sortableTh("Flag", "flag") : null}
              {isVisible("imo") ? sortableTh("IMO", "imo") : null}
              {isVisible("type") ? sortableTh("Type", "type") : null}
              {isVisible("etaUtc") ? sortableTh("ETA (UTC)", "etaUtc") : null}
              {isVisible("destination") ? sortableTh("Destination", "destination") : null}
              {isVisible("eta") ? sortableTh("ETA", "eta") : null}
              {/* Campaign / Cargo / AIS / Contacts have no single sortable column. */}
              {isVisible("campaign") ? <th className="whitespace-nowrap px-4 py-3">Campaign</th> : null}
              {isVisible("voyage") ? sortableTh("Voyage", "voyage") : null}
              {isVisible("cargo") ? <th className="whitespace-nowrap px-4 py-3">Cargo</th> : null}
              {isVisible("ais") ? <th className="whitespace-nowrap px-4 py-3">AIS</th> : null}
              {isVisible("contacts") ? <th className="whitespace-nowrap px-4 py-3">Contacts</th> : null}
              {isVisible("added") ? sortableTh("Added", "added") : null}
              <th className="sticky right-0 top-0 z-40 bg-slate-50 px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageEtas.map((eta) => {
              const countdown = etaCountdown(eta.eta);
              const campaign = campaignBadge(eta.triggers);
              const hasLivePosition = eta.currentLat !== null && eta.currentLon !== null;
              const hasDestinationMarker = portsWithCoordinates.includes(eta.destinationPort);
              const cargoChange =
                eta.previousCargo && eta.nextCargo && eta.previousCargo !== eta.nextCargo;
              const isOpen = expanded.has(eta.vesselId);
              const isSelected = selectedVessels.has(eta.vesselId);
              const rowBg = isSelected ? "bg-ocean/5" : "bg-white";
              const aisLabel = hasLivePosition
                ? "Live"
                : hasDestinationMarker
                  ? "Destination"
                  : "—";
              const aisTone = hasLivePosition
                ? "bg-emerald-50 text-emerald-700"
                : hasDestinationMarker
                  ? "bg-slate-100 text-slate-600"
                  : "bg-slate-50 text-slate-400";
              return (
                <Fragment key={eta.id}>
                  <tr className={`hover:bg-slate-50 ${isSelected ? "bg-ocean/5" : ""}`}>
                    <td className={`sticky left-0 z-10 px-4 py-3 ${rowBg}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleVessel(eta.vesselId)}
                        className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                      />
                    </td>
                    <td
                      className={`sticky left-12 z-10 max-w-[220px] truncate whitespace-nowrap px-4 py-3 font-semibold text-slate-950 ${rowBg}`}
                      title={eta.vessel.vesselName}
                    >
                      <Link
                        href={`/dashboard/vessels/${eta.vessel.imoNumber}`}
                        className="hover:text-ocean"
                      >
                        {eta.vessel.vesselName}
                      </Link>
                    </td>
                    {isVisible("flag") ? (
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {eta.vessel.flag ?? "—"}
                      </td>
                    ) : null}
                    {isVisible("imo") ? (
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {eta.vessel.imoNumber}
                      </td>
                    ) : null}
                    {isVisible("type") ? (
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatEnum(eta.vessel.vesselType)}
                      </td>
                    ) : null}
                    {isVisible("etaUtc") ? (
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatEta(eta.eta)} IST
                      </td>
                    ) : null}
                    {isVisible("destination") ? (
                      <td className="max-w-[200px] truncate px-4 py-3 text-slate-600" title={eta.destinationPortName}>
                        {eta.destinationPortName}{" "}
                        <span className="text-xs text-slate-400">({eta.destinationPort})</span>
                      </td>
                    ) : null}
                    {isVisible("eta") ? (
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-semibold ${countdown.tone}`}
                        >
                          {countdown.label}
                        </span>
                      </td>
                    ) : null}
                    {isVisible("campaign") ? (
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-semibold ${campaign.tone}`}
                        >
                          {campaign.label}
                        </span>
                      </td>
                    ) : null}
                    {isVisible("voyage") ? (
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                          {formatEnum(eta.voyageStatus)}
                        </span>
                      </td>
                    ) : null}
                    {isVisible("cargo") ? (
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        {eta.previousCargo || eta.nextCargo ? (
                          <span className={cargoChange ? "font-semibold text-amber-600" : "text-slate-500"}>
                            {eta.previousCargo ?? "—"} → {eta.nextCargo ?? "—"}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    ) : null}
                    {isVisible("ais") ? (
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-1 text-xs font-semibold ${aisTone}`}>
                          {aisLabel}
                        </span>
                      </td>
                    ) : null}
                    {isVisible("contacts") ? (
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleExpand(eta.vesselId)}
                          className="rounded bg-ocean/10 px-2 py-1 text-xs font-semibold text-ocean hover:bg-ocean/15"
                        >
                          {eta.associatedContactCount.toLocaleString("en")}
                        </button>
                      </td>
                    ) : null}
                    {isVisible("added") ? (
                      <td
                        className="whitespace-nowrap px-4 py-3 text-xs text-slate-500"
                        title={formatAddedAbsolute(eta.createdAt)}
                      >
                        {formatAddedAgo(eta.createdAt)}
                      </td>
                    ) : null}
                    <td className={`sticky right-0 z-10 px-4 py-3 ${rowBg}`}>
                      <div className="flex items-center gap-2">
                        {isSuperAdmin ? (
                          <>
                            <EditVesselButton variant="icon" imoNumber={eta.vessel.imoNumber} />
                            <button
                              type="button"
                              onClick={() =>
                                setEditingEta({
                                  id: eta.id,
                                  eta: eta.eta,
                                  destinationPort: eta.destinationPort,
                                  voyageStatus: eta.voyageStatus,
                                  previousCargo: eta.previousCargo,
                                  nextCargo: eta.nextCargo,
                                  vesselName: eta.vessel.vesselName,
                                })
                              }
                              aria-label="Edit ETA"
                              title="Edit ETA"
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              <CalendarClock className="h-4 w-4" />
                            </button>
                          </>
                        ) : null}
                        <Link
                          href={`/dashboard/vessels/${eta.vessel.imoNumber}`}
                          className="inline-flex items-center gap-1 text-sm font-semibold text-ocean"
                        >
                          View <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr key={`${eta.id}:contacts`} className="bg-slate-50/70">
                      <td colSpan={3 + visibleIds.size} className="px-3 py-3">
                        <div className="space-y-3">
                          <AssociatedContactsSubrow
                            vesselName={eta.vessel.vesselName}
                            state={contactLoadState[eta.vesselId]}
                          />
                          <ExternalContactsSubrow
                            vesselName={eta.vessel.vesselName}
                            hasDomains={true}
                            state={externalLoadState[eta.vesselId]}
                            revealing={revealing}
                            onReveal={(contact, fld) => revealApollo(eta.vesselId, contact, fld)}
                          />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      <div className="sticky bottom-0 z-20 mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-1 py-2 backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]/95">
        <p className="text-xs text-slate-500">
          Showing {pageEtas.length === 0 ? 0 : pageStart + 1}–{pageStart + pageEtas.length} of{" "}
          {count.toLocaleString("en")} matching arrival{count === 1 ? "" : "s"}
        </p>
        {totalPages > 1 ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => onPageChange?.(currentPage - 1)}
              disabled={currentPage <= 1 || paging}
              className="rounded-md border border-slate-200 px-2 py-1 hover:border-ocean hover:text-ocean disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600"
            >
              Previous
            </button>
            <span className="font-normal text-slate-500">
              {paging ? "Loading…" : `Page ${currentPage} of ${totalPages}`}
            </span>
            <button
              type="button"
              onClick={() => onPageChange?.(currentPage + 1)}
              disabled={currentPage >= totalPages || paging}
              className="rounded-md border border-slate-200 px-2 py-1 hover:border-ocean hover:text-ocean disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function AssociatedContactsSubrow({
  vesselName,
  state,
}: {
  vesselName: string;
  state: ContactLoadState | undefined;
}) {
  if (!state || state.status === "loading") {
    return (
      <div className="mb-4 ml-7 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading associated contacts…
      </div>
    );
  }
  if (state.status === "error") {
    return <div className="mb-4 ml-7 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Couldn&apos;t load contacts: {state.message}</div>;
  }
  if (state.rows.length === 0) {
    return <div className="mb-4 ml-7 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">No contacts are associated with {vesselName}.</div>;
  }
  return (
    <div className="mb-4 ml-7 overflow-x-auto rounded border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {["Name", "Email", "Company", "Title", "Matched Value", "Matched Role", "Match Source", "Confidence"].map((label) => (
              <th key={label} className="whitespace-nowrap px-3 py-2">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {state.rows.map((contact) => {
            const roles = contact.matchedCompanies.map((company) => company.role).join(", ") || "-";
            return (
              <tr key={`${contact.contactId}:${contact.matchedValue}:${contact.matchedSource}`} className="hover:bg-slate-50">
                <td className="max-w-[200px] px-3 py-2 align-top font-medium text-slate-900" title={contact.fullName}>
                  <Link href={`/dashboard/contacts/${contact.contactId}`} className="block truncate hover:text-ocean">
                    {contact.fullName}
                  </Link>
                  {contact.jobTitle ? (
                    <p className="mt-0.5 truncate text-xs font-normal text-slate-500" title={contact.jobTitle}>
                      {contact.jobTitle}
                    </p>
                  ) : null}
                </td>
                <td className="max-w-[220px] truncate px-3 py-2 text-slate-600" title={contact.email ?? undefined}>{contact.email ?? "-"}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-slate-600" title={contact.companyName ?? undefined}>{contact.companyName ?? "-"}</td>
                <td className="max-w-[200px] truncate px-3 py-2 text-slate-600" title={contact.jobTitle ?? undefined}>{contact.jobTitle ?? "-"}</td>
                <td className="max-w-[180px] truncate px-3 py-2 text-slate-600" title={contact.matchedValue}>{contact.matchedValue}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-slate-600" title={roles}>{roles}</td>
                <td className="max-w-[180px] truncate px-3 py-2 text-slate-600" title={contact.matchedSource}>{contact.matchedSource}</td>
                <td className="px-3 py-2 text-slate-600">{contact.confidence}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

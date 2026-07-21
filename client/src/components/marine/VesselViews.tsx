"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Database, ExternalLink, Loader2, Lock, SlidersHorizontal, Zap } from "lucide-react";
import Link from "next/link";
import type { VesselWithCompanies } from "@/lib/marine-data";

const PUBLIC_EMAIL_DOMAINS = new Set([
  "aol.com", "example.com", "gmail.com", "googlemail.com", "hotmail.com",
  "icloud.com", "live.com", "mail.com", "msn.com", "outlook.com",
  "proton.me", "protonmail.com", "yahoo.com",
]);

function isPublicEmailDomain(value: string | null | undefined) {
  const domain = value?.trim().toLowerCase().replace(/^www\./, "");
  return Boolean(domain && PUBLIC_EMAIL_DOMAINS.has(domain));
}
import { VESSEL_SCHEMA_FIELDS, vesselFieldValue, type VesselSchemaField } from "@/lib/vessel-schema";
import { VesselAddToListModal } from "./VesselAddToListModal";
import { apiFetch } from "@/lib/browser-fetch";
import { vesselTableColumns } from "@/lib/table-columns";
import { useColumnPreferences } from "@/hooks/useColumnPreferences";
import { useClientSort } from "@/hooks/useClientSort";
import { SortableHeader } from "@/components/table/SortableHeader";
import { ColumnCustomizer } from "@/components/table/ColumnCustomizer";
import { ContactAddToListModal } from "@/components/contacts/ContactAddToListModal";
import { LaunchCampaignFromSelection } from "@/components/campaigns/LaunchCampaignButton";
import type { MarineVesselContactView, MarineVesselContactsResponse } from "@/lib/marine-row-views";
import { EditVesselButton } from "@/components/marine/EditVesselButton";
import { vesselToFormInitial } from "@/lib/vessel-form";

export type ExternalContactRow = {
  id: string;
  externalId?: string | number;
  source: "MARIBIZ" | "APOLLO";
  firstName: string;
  lastName: string;
  fullName?: string;
  title: string | null;
  companyName: string;
  email: string;
  emailStatus: string;
  emailLocked?: boolean;
  phoneLocked?: boolean;
  mobilePhone: string | null;
  country: string | null;
};

export type ExternalLoadState =
  | { status: "loading" }
  | { status: "loaded"; rows: ExternalContactRow[]; warnings: string[] }
  | { status: "error"; message: string };

const MAX_APOLLO_DOMAINS = 20;

const NOISE_DOMAINS = new Set([
  "-", "n/a", "na", "none", "null", "unknown", "tbd",
  "test.com", "example.com", "domain.com", "email.com",
]);

function extractDomainFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || NOISE_DOMAINS.has(raw.toLowerCase())) return null;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const hostname = new URL(withProtocol).hostname.toLowerCase().replace(/\.$/, "");
    const domain = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
    return domain.includes(".") ? domain : null;
  } catch {
    return null;
  }
}

function extractDomainFromEmail(value: string): string | null {
  const match = value.trim().toLowerCase().match(/^[^\s@]+@([^\s@,;<>]+)$/);
  if (!match) return null;
  const domain = match[1].replace(/[.,;]+$/, "");
  if (!domain.includes(".") || NOISE_DOMAINS.has(domain)) return null;
  return domain;
}

function splitEmailField(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
}

function collectVesselDomains(vessel: VesselWithCompanies): string[] {
  const domains = new Set<string>();

  const directEmailFields = [
    vessel.commercialManagerEmail,
    vessel.registeredOwnerEmail,
    vessel.beneficialOwnerEmail,
    vessel.technicalManagerEmail,
    vessel.pAndIClubEmail,
    vessel.shipBuilderEmail,
    vessel.classSocietyEmail,
    vessel.engineBuilderEmail,
    vessel.ismManagerEmail,
    vessel.operatorEmail,
  ];

  const companyFields = [
    vessel.shipOwnerCompany,
    vessel.ismManagerCompany,
    vessel.commercialManagerCompany,
  ];

  // company websites
  for (const c of companyFields) {
    const fromWebsite = extractDomainFromUrl(c?.website ?? null);
    if (fromWebsite && !isPublicEmailDomain(fromWebsite)) domains.add(fromWebsite);
  }

  // every direct vessel email field + every company email field — both can be multi-value
  const allEmailStrings: Array<string | null | undefined> = [
    ...directEmailFields,
    ...companyFields.map((c) => c?.email ?? null),
  ];

  for (const field of allEmailStrings) {
    for (const email of splitEmailField(field)) {
      const domain = extractDomainFromEmail(email);
      if (domain && !isPublicEmailDomain(domain)) domains.add(domain);
    }
  }

  return Array.from(domains).slice(0, MAX_APOLLO_DOMAINS);
}

const VESSEL_FIELD_BY_KEY = new Map<string, VesselSchemaField>(
  VESSEL_SCHEMA_FIELDS.map((field) => [field.key, field]),
);

type ContactLoadState =
  | { status: "loading" }
  | { status: "loaded"; rows: MarineVesselContactView[] }
  | { status: "error"; message: string };

function formatEnum(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusClass(status: string) {
  if (status === "ACTIVE") return "bg-emerald-50 text-emerald-700";
  if (status === "LAID_UP") return "bg-amber-50 text-amber-700";
  if (status === "SCRAPPED") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-700";
}

export function VesselTable({ vessels, isSuperAdmin = false }: { vessels: VesselWithCompanies[]; isSuperAdmin?: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [showContactModal, setShowContactModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; listId?: string } | null>(null);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [contactLoadState, setContactLoadState] = useState<Record<string, ContactLoadState>>({});
  const [externalLoadState, setExternalLoadState] = useState<Record<string, ExternalLoadState>>({});
  const [revealing, setRevealing] = useState<Map<string, "email" | "phone">>(new Map());

  const allColumns = useMemo(() => vesselTableColumns(), []);
  const { columns, orderedAll, lockedColumns, save, reset } = useColumnPreferences("vessels", allColumns);

  // Client-side sort over the in-memory vessel rows, by each schema column's
  // displayed value (reuses vesselFieldValue so sort matches the cell text).
  const sortAccessors = useMemo(() => {
    const map: Record<string, (v: VesselWithCompanies) => string | number> = {};
    for (const col of allColumns) {
      if (col.sortable === false) continue;
      const field = VESSEL_FIELD_BY_KEY.get(col.sortKey ?? col.id);
      if (field) map[col.sortKey ?? col.id] = (v) => vesselFieldValue(v, field);
    }
    return map;
  }, [allColumns]);
  const { sorted: sortedVessels, sort, toggle } = useClientSort(vessels, sortAccessors);

  const allIds = vessels.map((v) => v.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDone(listName: string, count: number, listId: string) {
    setShowModal(false);
    setSelected(new Set());
    const msg = `${count} vessel${count !== 1 ? "s" : ""} added to "${listName}"`;
    setToast({ message: msg, listId });
    setTimeout(() => setToast(null), 6000);
  }

  function handleContactsDone(listName: string, count: number) {
    setShowContactModal(false);
    setSelectedContacts(new Set());
    setToast({ message: `${count} contact${count !== 1 ? "s" : ""} added to "${listName}"` });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleExport() {
    const imoNumbers = vessels
      .filter((v) => selected.has(v.id))
      .map((v) => v.imoNumber);
    if (!imoNumbers.length) return;
    const creditCost = imoNumbers.length * 2;
    if (!window.confirm(`Export ${imoNumbers.length} vessel${imoNumbers.length !== 1 ? "s" : ""} as CSV? This costs ${creditCost} credits.`)) return;
    setExporting(true);
    try {
      const r = await apiFetch(`/api/vessels/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imoNumbers }),
      });
      if (!r.ok) {
        const payload = (await r.json()) as { error?: { message?: string } };
        setToast({ message: payload.error?.message ?? "Export failed" });
        setTimeout(() => setToast(null), 4000);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vessels.csv";
      a.click();
      URL.revokeObjectURL(url);
      setSelected(new Set());
    } catch {
      setToast({ message: "Export failed — please try again" });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setExporting(false);
    }
  }

  const selectedIds = Array.from(selected);
  const selectedContactIds = Array.from(selectedContacts);

  async function toggleExpand(vesselId: string) {
    const isOpen = expanded.has(vesselId);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(vesselId);
      else next.add(vesselId);
      return next;
    });
    if (isOpen) return;

    const internalLoaded = contactLoadState[vesselId]?.status === "loaded" || contactLoadState[vesselId]?.status === "loading";

    if (!internalLoaded) {
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

    // Auto-fire external search in parallel — no button click needed.
    void runExternalSearch(vesselId);
  }

  async function runExternalSearch(vesselId: string) {
    const current = externalLoadState[vesselId]?.status;
    if (current === "loading" || current === "loaded") return;

    const vessel = vessels.find((v) => v.id === vesselId);
    const domains = vessel ? collectVesselDomains(vessel) : [];
    if (!domains.length) {
      setExternalLoadState((prev) => ({ ...prev, [vesselId]: { status: "loaded", rows: [], warnings: ["no_domains"] } }));
      return;
    }
    setExternalLoadState((prev) => ({ ...prev, [vesselId]: { status: "loading" } }));

    const results = await Promise.all(
      domains.map(async (domain) => {
        try {
          const response = await apiFetch(`/api/contacts/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filterConfig: {
                entityType: "CONTACT",
                groupLogic: "AND",
                groups: [
                  { conditions: [{ field: "companyName", operator: "contains", value: domain }] },
                ],
              },
              limit: 50,
            }),
          });
          if (!response.ok) return { ok: false as const, message: `Failed (${response.status})` };
          const payload = (await response.json()) as {
            data?: { contacts?: ExternalContactRow[]; warnings?: string[] };
          };
          return {
            ok: true as const,
            rows: payload.data?.contacts ?? [],
            warnings: payload.data?.warnings ?? [],
          };
        } catch (err) {
          return { ok: false as const, message: err instanceof Error ? err.message : "Network error" };
        }
      }),
    );

    const successes = results.filter((r): r is Extract<typeof r, { ok: true }> => r.ok);
    if (successes.length === 0) {
      const firstError = results.find((r): r is Extract<typeof r, { ok: false }> => !r.ok);
      setExternalLoadState((prev) => ({
        ...prev,
        [vesselId]: { status: "error", message: firstError?.message ?? "Search failed" },
      }));
      return;
    }

    const seen = new Set<string>();
    const merged: ExternalContactRow[] = [];
    for (const s of successes) {
      for (const row of s.rows) {
        if (!row.id.startsWith("apollo:") && !row.id.startsWith("maribiz:")) continue;
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
        if (merged.length >= 50) break;
      }
      if (merged.length >= 50) break;
    }
    const warnings = Array.from(new Set(successes.flatMap((s) => s.warnings)));

    setExternalLoadState((prev) => ({
      ...prev,
      [vesselId]: { status: "loaded", rows: merged, warnings },
    }));
  }

  async function revealApolloFromVessel(vesselId: string, contact: ExternalContactRow, field: "email" | "phone") {
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
        setToast({ message: msg });
        setTimeout(() => setToast(null), 5000);
        return;
      }
      const payload = (await response.json()) as { data: { contact: { id: string; email?: string; mobilePhone?: string | null }; balance: number } };
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
      setToast({ message: `Revealed — ${payload.data.balance} credits left` });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setRevealing((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function toggleAssociatedContact(contactId: string) {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  return (
    <>
      {showCustomizer && (
        <ColumnCustomizer
          title="Customize vessel columns"
          lockedColumns={lockedColumns}
          orderedAll={orderedAll}
          onClose={() => setShowCustomizer(false)}
          onSave={save}
          onReset={reset}
        />
      )}

      {showModal && (
        <VesselAddToListModal
          vesselIds={selectedIds}
          onClose={() => setShowModal(false)}
          onDone={handleDone}
        />
      )}

      {showContactModal && (
        <ContactAddToListModal
          contactIds={selectedContactIds}
          onClose={() => setShowContactModal(false)}
          onDone={handleContactsDone}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg">
          <span>{toast.message}</span>
          {toast.listId && (
            <Link
              href={`/dashboard/lists/${toast.listId}`}
              className="whitespace-nowrap text-xs font-semibold text-emerald-900 underline hover:text-emerald-950"
            >
              View list →
            </Link>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">Table view</p>
            <p className="text-xs text-slate-500">
              {selected.size > 0 ? `${selected.size} selected` : "Full vessel schema | AIS | dimensions | capacity | ownership | managers | builders"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setShowCustomizer(true)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 hover:border-ocean hover:text-ocean"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Customize
            </button>
            <button
              onClick={() => { if (selectedIds.length > 0) setShowModal(true); }}
              disabled={selectedIds.length === 0}
              className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40 enabled:hover:border-ocean enabled:hover:text-ocean"
            >
              Add to List{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
            <button className="rounded-md border border-slate-200 px-2 py-1">Start Campaign</button>
            <button
              onClick={handleExport}
              disabled={selectedIds.length === 0 || exporting}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40 enabled:hover:border-ocean enabled:hover:text-ocean"
            >
              {exporting && <Loader2 className="h-3 w-3 animate-spin" />}
              Export CSV{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
            <button
              onClick={() => { if (selectedContactIds.length > 0) setShowContactModal(true); }}
              disabled={selectedContactIds.length === 0}
              className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40 enabled:hover:border-ocean enabled:hover:text-ocean"
            >
              Add Contacts to List{selectedContactIds.length ? ` (${selectedContactIds.length})` : ""}
            </button>
            <LaunchCampaignFromSelection contactIds={selectedContactIds} />
          </div>
        </div>
        <div className="max-h-[calc(100vh-300px)] overflow-auto overscroll-x-contain">
          <table className="divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 z-40 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226,232,240)]">
              <tr>
                <th className="sticky left-0 top-0 z-50 bg-slate-50 px-2 py-3" />
                <th className="sticky left-8 top-0 z-50 bg-slate-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={vessels.length === 0}
                    className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                  />
                </th>
                    {columns.map((col) =>
                      col.sortable === false ? (
                        <th
                          key={col.id}
                          className={`whitespace-nowrap px-4 py-3 ${col.id === "vesselName" ? "sticky left-20 top-0 z-50 bg-slate-50" : ""}`}
                        >
                          {col.label}
                        </th>
                      ) : (
                        <SortableHeader
                          key={col.id}
                          label={col.label}
                          sortKey={col.sortKey ?? col.id}
                          sort={sort}
                          onSort={toggle}
                          className={col.id === "vesselName" ? "sticky left-20 top-0 z-50 bg-slate-50" : ""}
                        />
                      ),
                    )}
                <th className="sticky right-0 top-0 z-50 bg-slate-50 px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {sortedVessels.length === 0 ? (
                  <tr>
                  <td colSpan={columns.length + 3} className="px-4 py-8 text-center text-sm text-slate-400">
                    No vessels match your filters.
                  </td>
                </tr>
              ) : (
                sortedVessels.map((vessel) => {
                  const isOpen = expanded.has(vessel.id);
                  return (
                  <Fragment key={vessel.id}>
                  <tr
                    className={`hover:bg-slate-50 ${selected.has(vessel.id) ? "bg-ocean/5" : ""}`}
                  >
                    <td className={`sticky left-0 z-10 px-2 py-3 ${selected.has(vessel.id) ? "bg-ocean/5" : "bg-white"}`}>
                      <button
                        type="button"
                        onClick={() => toggleExpand(vessel.id)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "Collapse associated contacts" : "Expand associated contacts"}
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className={`sticky left-8 z-10 px-4 py-3 ${selected.has(vessel.id) ? "bg-ocean/5" : "bg-white"}`}>
                      <input
                        type="checkbox"
                        checked={selected.has(vessel.id)}
                        onChange={() => toggleOne(vessel.id)}
                        className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                      />
                    </td>
                    {columns.map((col) => {
                      if (col.id === "vesselName") {
                        const name = vesselFieldValue(vessel, VESSEL_FIELD_BY_KEY.get("vesselName")!);
                        return (
                          <td
                            key={col.id}
                            className={`max-w-[220px] truncate whitespace-nowrap px-4 py-3 sticky left-20 z-10 font-semibold text-slate-950 ${selected.has(vessel.id) ? "bg-ocean/5" : "bg-white"}`}
                            title={name}
                          >
                            <Link href={`/dashboard/vessels/${vessel.imoNumber}`} className="hover:text-ocean">
                              {name}
                            </Link>
                          </td>
                        );
                      }
                      if (col.id === "associatedContacts") {
                        return (
                          <td key={col.id} className="whitespace-nowrap px-4 py-3">
                            <button
                              type="button"
                              onClick={() => toggleExpand(vessel.id)}
                              className="rounded bg-ocean/10 px-2 py-1 text-xs font-semibold text-ocean hover:bg-ocean/15"
                            >
                              {(vessel.associatedContactCount ?? 0).toLocaleString("en")}
                            </button>
                          </td>
                        );
                      }
                      if (col.id === "eta") {
                        const eta = (vessel as { etas?: Array<{ eta: Date }> }).etas?.[0];
                        return (
                          <td key={col.id} className="px-4 py-3">
                            {eta ? (
                              <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                                {new Date(eta.eta).toLocaleDateString("en", { month: "short", day: "numeric" })}
                              </span>
                            ) : (
                              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">No ETA</span>
                            )}
                          </td>
                        );
                      }
                      if (col.id === "linkedOwner") {
                        return (
                          <td key={col.id} className="px-4 py-3 text-slate-600">{vessel.shipOwnerCompany?.companyName ?? "-"}</td>
                        );
                      }
                      if (col.id === "campaign") {
                        return (
                          <td key={col.id} className="px-4 py-3">
                            {(vessel as { _count?: { etaTriggers: number } })._count?.etaTriggers ? (
                              <span className="rounded bg-ocean/10 px-2 py-1 text-xs font-semibold text-ocean">Active</span>
                            ) : (
                              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">None</span>
                            )}
                          </td>
                        );
                      }
                      const field = VESSEL_FIELD_BY_KEY.get(col.id);
                      const value = field ? vesselFieldValue(vessel, field) : "-";
                      return (
                        <td
                          key={col.id}
                          className="max-w-[220px] truncate whitespace-nowrap px-4 py-3 text-slate-600"
                          title={value}
                        >
                          {col.id === "vesselTypeDetailed" && value === "-" ? formatEnum(vessel.vesselType) : value}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-10 bg-white px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isSuperAdmin ? (
                          <EditVesselButton variant="icon" initial={vesselToFormInitial(vessel as unknown as Record<string, unknown> & { imoNumber: string })} />
                        ) : null}
                        <Link href={`/dashboard/vessels/${vessel.imoNumber}`} className="inline-flex items-center gap-1 text-sm font-semibold text-ocean">
                          View <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr key={`${vessel.id}:contacts`} className="bg-slate-50/70">
                      <td colSpan={columns.length + 3} className="px-3 py-3">
                        <div className="space-y-3">
                          <AssociatedContactsSubrow
                            vesselName={vessel.vesselName}
                            state={contactLoadState[vessel.id]}
                            selectedContacts={selectedContacts}
                            onToggleContact={toggleAssociatedContact}
                          />
                          <ExternalContactsSubrow
                            vesselName={vessel.vesselName}
                            hasDomains={collectVesselDomains(vessel).length > 0}
                            state={externalLoadState[vessel.id]}
                            revealing={revealing}
                            onReveal={(contact, fld) => revealApolloFromVessel(vessel.id, contact, fld)}
                          />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );})
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function AssociatedContactsSubrow({
  vesselName,
  state,
  selectedContacts,
  onToggleContact,
}: {
  vesselName: string;
  state: ContactLoadState | undefined;
  selectedContacts: Set<string>;
  onToggleContact: (contactId: string) => void;
}) {
  if (!state || state.status === "loading") {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading associated contacts…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        Couldn&apos;t load contacts: {state.message}
      </div>
    );
  }
  if (state.rows.length === 0) {
    return <div className="px-1 py-2 text-sm text-slate-500">No contacts are associated with {vesselName}.</div>;
  }
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-10 px-3 py-2" />
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
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedContacts.has(contact.contactId)}
                    onChange={() => onToggleContact(contact.contactId)}
                    className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                  />
                </td>
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

export function ExternalContactsSubrow({
  vesselName,
  hasDomains,
  state,
  revealing,
  onReveal,
}: {
  vesselName: string;
  hasDomains: boolean;
  state: ExternalLoadState | undefined;
  revealing: Map<string, "email" | "phone">;
  onReveal: (contact: ExternalContactRow, field: "email" | "phone") => void;
}) {
  if (!state) {
    // Auto-fetch starts on expand — show loading immediately to avoid empty flash.
    return (
      <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {hasDomains
          ? `Searching by ${vesselName}'s company domain…`
          : `No company domain on ${vesselName} — skipping external sources.`}
      </div>
    );
  }
  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Searching external sources by company domain…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        External sources unavailable: {state.message}
      </div>
    );
  }
  if (state.warnings.includes("no_domains")) {
    return (
      <div className="rounded border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        No company domain on {vesselName} — can&apos;t search external sources.
      </div>
    );
  }
  if (state.rows.length === 0) {
    return (
      <div className="rounded border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        No external matches for {vesselName}.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        <span>External matches</span>
        <span className="text-[11px] font-normal text-slate-500">{state.rows.length} result{state.rows.length === 1 ? "" : "s"}</span>
      </div>
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {["Source", "Name", "Email", "Phone", "Company", "Title", "Country"].map((label) => (
              <th key={label} className="whitespace-nowrap px-3 py-2">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {state.rows.map((contact) => {
            const isApollo = contact.source === "APOLLO";
            const emailKey = `${contact.id}:email`;
            const phoneKey = `${contact.id}:phone`;
            return (
              <tr key={contact.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  {isApollo ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-700">
                      <Zap className="h-3 w-3" />
                      Web
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-700">
                      <Database className="h-3 w-3" />
                      Directory
                    </span>
                  )}
                </td>
                <td className="max-w-[200px] truncate px-3 py-2 font-medium text-slate-900" title={contact.fullName ?? `${contact.firstName} ${contact.lastName}`}>
                  {contact.fullName ?? (`${contact.firstName} ${contact.lastName}`.trim() || "(no name)")}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {isApollo && contact.emailLocked ? (
                    <button
                      type="button"
                      onClick={() => onReveal(contact, "email")}
                      disabled={revealing.has(emailKey)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                      title="Unlock this email — 1 credit"
                    >
                      {revealing.get(emailKey) === "email" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
                      Reveal email
                    </button>
                  ) : (
                    <span className="block max-w-[220px] truncate" title={contact.email}>{contact.email || "-"}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {isApollo && contact.phoneLocked ? (
                    <button
                      type="button"
                      onClick={() => onReveal(contact, "phone")}
                      disabled={revealing.has(phoneKey)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                      title="Unlock this phone — 1 credit"
                    >
                      {revealing.get(phoneKey) === "phone" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
                      Reveal phone
                    </button>
                  ) : (
                    <span className="block max-w-[160px] truncate" title={contact.mobilePhone ?? undefined}>{contact.mobilePhone ?? "-"}</span>
                  )}
                </td>
                <td className="max-w-[200px] truncate px-3 py-2 text-slate-600" title={contact.companyName}>{contact.companyName || "-"}</td>
                <td className="max-w-[200px] truncate px-3 py-2 text-slate-600" title={contact.title ?? undefined}>{contact.title ?? "-"}</td>
                <td className="px-3 py-2 text-slate-600">{contact.country ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function VesselCards({ vessels }: { vessels: VesselWithCompanies[] }) {
  const cardFields = VESSEL_SCHEMA_FIELDS.filter((field) =>
    ["Flag", "Type", "DWT", "Gross Tonnage", "Built Year", "Current Port Unlocode", "Commercial Manager", "Operator"].includes(field.label),
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {vessels.map((vessel) => (
        <article key={vessel.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link href={`/dashboard/vessels/${vessel.imoNumber}`} className="text-base font-semibold text-slate-950 hover:text-ocean">
                {vessel.vesselName}
              </Link>
              <p className="mt-1 text-xs text-slate-500">IMO {vessel.imoNumber}</p>
            </div>
            <span className={`rounded px-2 py-1 text-xs font-semibold ${statusClass(vessel.status)}`}>{formatEnum(vessel.status)}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {cardFields.map((field) => (
              <div key={field.label}>
                <p className="text-xs text-slate-500">{field.label}</p>
                <p className="truncate font-medium text-slate-800" title={vesselFieldValue(vessel, field)}>
                  {field.key === "vesselTypeDetailed" && vesselFieldValue(vessel, field) === "-" ? formatEnum(vessel.vesselType) : vesselFieldValue(vessel, field)}
                </p>
              </div>
            ))}
            <div>
              <p className="text-xs text-slate-500">ETA</p>
              <p className="font-medium text-slate-800">No ETA</p>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
            {vessel.shipOwnerCompany?.companyName ?? "No owner linked"}
          </div>
        </article>
      ))}
    </div>
  );
}

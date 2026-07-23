"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Clock, Eye, Loader2, Plus, Ship, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ContactListDetailResponse,
  ListCompanyRow,
  ListVesselRow,
} from "@/lib/contact-data";
import { apiFetch } from "@/lib/browser-fetch";
import { useClientSort } from "@/hooks/useClientSort";
import { SortableHeader } from "@/components/table/SortableHeader";
import { CONTACT_SCHEMA_FIELDS, contactFieldValue } from "@/lib/contact-schema";
import { ImportContactsCsvSection } from "@/components/lists/ImportContactsCsvSection";
import { RoleFilterPanel, EMPTY_ROLE_FILTER, type RoleFilter } from "@/components/lists/RoleFilterPanel";

function listKindOf(
  list: ContactListDetailResponse["list"],
  vesselCount: number,
): "ETA" | "CONTACT" {
  const config = list.filterConfig as { kind?: string } | null | undefined;
  if (config?.kind === "ETA" || config?.kind === "CONTACT") return config.kind;
  // Legacy lists (created before we tracked kind) — infer from what they hold.
  // Anything with vessels is an ETA list; otherwise treat as Contact.
  return vesselCount > 0 ? "ETA" : "CONTACT";
}

function formatEnum(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Short UTC ETA label, e.g. "14 Jul, 12:30" — used in the highlighted ETA pill. */
function formatEtaShort(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

/** Ship chips + highlighted next-ETA badge, one row per associated vessel. */
function ShipEtaCell({ vessels }: { vessels: ContactRow["matchedVessels"] }) {
  if (!vessels || vessels.length === 0) {
    return <span className="text-slate-300 dark:text-white/25">—</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {vessels.map((vessel) => {
        const eta = formatEtaShort(vessel.nextEta);
        return (
          <div key={vessel.id} className="flex flex-wrap items-center gap-1">
            <span
              className="inline-flex items-center gap-1 rounded-full bg-ocean/10 px-2 py-0.5 text-[11px] font-semibold text-ocean"
              title={`IMO ${vessel.imoNumber}`}
            >
              <Ship className="h-3 w-3" />
              {vessel.vesselName || vessel.imoNumber}
            </span>
            {eta ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/40"
                title={`Next ETA${vessel.nextEtaPort ? ` — ${vessel.nextEtaPort}` : ""} (UTC)`}
              >
                <Clock className="h-3 w-3" />
                ETA {eta}
                {vessel.nextEtaPort ? ` · ${vessel.nextEtaPort}` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-white/[0.06] dark:text-white/50">
                No upcoming ETA
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact ETA badge for the vessels-in-list table — matches the tone of the
 * ShipEtaCell chips used elsewhere so the two views read as one system. Shows
 * the latest known ETA regardless of past/future, with a colour + label swap
 * for past ETAs so ops staff can still see "ship said it would be at Kandla
 * yesterday" instead of a bare "No upcoming ETA".
 */
function VesselNextEtaBadge({
  nextEta,
  nextEtaPort,
}: {
  nextEta: string | null;
  nextEtaPort: string | null;
}) {
  const eta = formatEtaShort(nextEta);
  if (!eta || !nextEta) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-white/[0.06] dark:text-white/50">
        No ETA on file
      </span>
    );
  }
  const isPast = new Date(nextEta).getTime() < Date.now();
  if (isPast) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-300 dark:bg-white/[0.06] dark:text-white/60 dark:ring-white/10"
        title={`Last known ETA${nextEtaPort ? ` — ${nextEtaPort}` : ""} (UTC) — this time is in the past`}
      >
        <Clock className="h-3 w-3" />
        ETA {eta}
        {nextEtaPort ? ` · ${nextEtaPort}` : ""}
        <span className="ml-0.5 rounded bg-slate-200 px-1 text-[9px] font-bold uppercase tracking-wide text-slate-700 dark:bg-white/10 dark:text-white/70">
          past
        </span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/40"
      title={`Next ETA${nextEtaPort ? ` — ${nextEtaPort}` : ""} (UTC)`}
    >
      <Clock className="h-3 w-3" />
      ETA {eta}
      {nextEtaPort ? ` · ${nextEtaPort}` : ""}
    </span>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const KIND_TO_SLUG: Record<ListCompanyRow["companyKind"], string> = {
  SHIP_OWNER: "ship-owners",
  ISM_MANAGER: "ism-managers",
  COMMERCIAL_MANAGER: "commercial-managers",
  GENERIC: "ship-owners",
};


type Tab = "companies" | "contacts" | "vessels" | "newVessels";

export function ContactListDetail({
  list,
  companies,
  contacts,
  vessels,
  activity,
  isSuperAdmin = false,
}: ContactListDetailResponse & { isSuperAdmin?: boolean }) {
  const router = useRouter();
  const kind = listKindOf(list, vessels.length);
  const isEta = kind === "ETA";
  // Vessels whose owner/manager companies have nobody in this list. They can
  // trigger an ETA campaign but would email no one, so they get their own tab
  // to work through — a vessel leaves it as soon as a matching contact lands.
  const newVessels = vessels.filter((vessel) => vessel.contactCount === 0);
  // Default to the leftmost tab that has content — matches the new visual
  // order (New Vessels → Vessels → Contacts → Companies). "New Vessels" only
  // exists for ETA lists AND only when there are vessels with no contacts
  // yet, so it's the strongest signal of "something needs your attention".
  const [tab, setTab] = useState<Tab>(
    isEta && newVessels.length > 0
      ? "newVessels"
      : isEta && vessels.length > 0
        ? "vessels"
        : contacts.length > 0
          ? "contacts"
          : "companies",
  );
  const [revealing, setRevealing] = useState<Record<string, "email" | "phone" | undefined>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteList() {
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/lists/${list.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        alert(body?.error?.message ?? `Delete failed (${res.status})`);
        return;
      }
      // Back to the lists index — the current page's route is gone.
      router.push("/dashboard/lists");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function removeCompany(row: ListCompanyRow) {
    const slug = KIND_TO_SLUG[row.companyKind];
    const r = await apiFetch(`/api/lists/${list.id}/companies/${row.companyKind}/${row.companyId}`, {
      method: "DELETE",
    });
    if (r.ok) router.refresh();
    void slug;
  }

  async function removeContact(contactId: string) {
    const r = await apiFetch(`/api/lists/${list.id}/contacts/${contactId}`, {
      method: "DELETE",
    });
    if (r.ok) router.refresh();
  }

  async function removeVessel(vesselId: string) {
    const r = await apiFetch(`/api/lists/${list.id}/vessels/${vesselId}`, {
      method: "DELETE",
    });
    if (r.ok) router.refresh();
  }

  async function revealContact(contact: ContactRow, field: "email" | "phone") {
    const externalId = apolloExternalId(contact);
    if (!externalId) return;
    setRevealing((prev) => ({ ...prev, [contact.id]: field }));
    try {
      const r = await apiFetch(`/api/contacts/reveal-apollo/${externalId}/${field}`, {
        method: "POST",
      });
      if (r.ok) {
        router.refresh();
      } else {
        const body = await r.json().catch(() => null);
        const msg =
          body?.error?.message ||
          (r.status === 402
            ? "Not enough credits — top up to reveal this contact."
            : `Reveal failed (${r.status})`);
        alert(msg);
      }
    } finally {
      setRevealing((prev) => {
        const next = { ...prev };
        delete next[contact.id];
        return next;
      });
    }
  }

  return (
    <>
      <div className="space-y-5">
        <section className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#0A0A0C]">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-ocean">{formatEnum(list.type)} List</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  isEta
                    ? "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                }`}
              >
                {isEta ? "ETA" : "Contact"}
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{list.name}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
              {companies.length} companies · {contacts.length} contacts
              {isEta ? ` · ${vessels.length} vessels` : ""}
            </p>
          </div>
          {/* Delete uses inline confirmation instead of a modal — a
              destructive action needs a click-verify step, but a full modal
              felt heavy for a single-list delete. */}
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100">
              <span>Delete this list? Contacts and vessels stay in the DB.</span>
              <button
                type="button"
                onClick={deleteList}
                disabled={deleting}
                className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="text-xs font-medium text-red-900 hover:underline dark:text-red-100"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-red-600 hover:border-red-200 hover:bg-red-50 dark:border-white/10 dark:text-red-300 dark:hover:bg-red-500/10"
              title="Delete this list — contacts, vessels, and companies stay in the DB"
            >
              <Trash2 className="h-4 w-4" />
              Delete list
            </button>
          )}
        </section>

        {!isEta && isSuperAdmin ? <ImportContactsCsvSection listId={list.id} /> : null}

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-[#0A0A0C]">
          <div className="flex border-b border-slate-100 dark:border-white/[0.06]">
            {/* Order: New Vessels → Vessels → Contacts → Companies. New/Vessels
                only render for ETA lists; New Vessels only when there are
                unmatched vessels to work through. */}
            {isEta && newVessels.length > 0 ? (
              <TabButton
                active={tab === "newVessels"}
                onClick={() => setTab("newVessels")}
                icon={<Ship className="h-4 w-4" />}
                label="New Vessels"
                count={newVessels.length}
              />
            ) : null}
            {isEta ? (
              <TabButton active={tab === "vessels"} onClick={() => setTab("vessels")} icon={<Ship className="h-4 w-4" />} label="Vessels" count={vessels.length} />
            ) : null}
            <TabButton active={tab === "contacts"} onClick={() => setTab("contacts")} icon={<Users className="h-4 w-4" />} label="Contacts" count={contacts.length} />
            <TabButton active={tab === "companies"} onClick={() => setTab("companies")} icon={<Building2 className="h-4 w-4" />} label="Companies" count={companies.length} />
          </div>

          {/* Wrap each table so its own overflow-x scroll stays inside the
              tab body — otherwise the wide contact/vessel tables would push
              the whole page horizontally and the "Launch campaign" header
              would drift off-screen on narrow viewports. */}
          {tab === "companies" && (
            <div className="max-h-[calc(100vh-280px)] overflow-auto overscroll-x-contain"><CompaniesTable rows={companies} onRemove={removeCompany} /></div>
          )}
          {tab === "contacts" && (
            <div className="max-h-[calc(100vh-280px)] overflow-auto overscroll-x-contain">
              <ContactsTable rows={contacts} onRemove={removeContact} onReveal={revealContact} revealing={revealing} />
            </div>
          )}
          {tab === "vessels" && isEta && (
            <div className="space-y-4">
              {vessels.length > 0 ? <CampaignByRolePanel listId={list.id} listName={list.name} /> : null}
              <div className="max-h-[calc(100vh-320px)] overflow-auto overscroll-x-contain"><VesselsTable rows={vessels} onRemove={removeVessel} /></div>
            </div>
          )}
          {tab === "newVessels" && isEta && (
            <div className="space-y-4">
              <div className="mx-4 mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/[0.06]">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  {newVessels.length} vessel{newVessels.length === 1 ? "" : "s"} with no contacts yet
                </p>
                <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/70">
                  Nothing will be emailed for {newVessels.length === 1 ? "this vessel" : "these vessels"} until
                  someone at {newVessels.length === 1 ? "its" : "their"} owner or manager company is in this
                  list. Use the role search below to add people — they drop out of this tab once matched.
                </p>
              </div>
              <CampaignByRolePanel
                listId={list.id}
                listName={list.name}
                vesselIds={newVessels.map((vessel) => vessel.id)}
              />
              <div className="max-h-[calc(100vh-320px)] overflow-auto overscroll-x-contain"><VesselsTable rows={newVessels} onRemove={removeVessel} /></div>
            </div>
          )}
        </section>

        {activity.length > 0 ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#0A0A0C]">
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Recent activity</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
              Additions to this list. Active campaigns targeting the list auto-enroll new matches.
            </p>
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/[0.06]">
              {activity.slice(0, 20).map((entry, idx) => (
                <li key={`${entry.kind}:${entry.at}:${idx}`} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <span className={`mr-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${entry.kind === "vessel_added" ? "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"}`}>
                      {entry.kind === "vessel_added" ? "Vessel" : "Contact"}
                    </span>
                    {entry.kind === "vessel_added" ? (
                      <Link href={`/dashboard/vessels/${entry.imoNumber}`} className="font-medium text-slate-950 hover:text-ocean dark:text-white">
                        {entry.label}
                      </Link>
                    ) : (
                      <Link href={`/dashboard/contacts/${entry.contactId}`} className="font-medium text-slate-950 hover:text-ocean dark:text-white">
                        {entry.label}
                      </Link>
                    )}
                    <span className="ml-2 text-slate-500 dark:text-white/50">added to list</span>
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-500 dark:text-white/50" title={entry.at}>
                    {formatRelative(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}

function TabButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition ${
        active
          ? "border-b-2 border-ocean text-ocean"
          : "text-slate-500 hover:text-slate-800 dark:text-white/60 dark:hover:text-white"
      }`}
    >
      {icon}
      {label}
      <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-ocean/10 text-ocean" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60"}`}>
        {count}
      </span>
    </button>
  );
}

function CompaniesTable({ rows, onRemove }: { rows: ListCompanyRow[]; onRemove: (row: ListCompanyRow) => void }) {
  const { sorted, sort, toggle } = useClientSort(rows, {
    company: (r) => r.companyName,
    kind: (r) => r.companyKind,
    country: (r) => r.country,
    fleet: (r) => r.fleetSize,
    employees: (r) => r.employeeCount,
    vessels: (r) => r.listVessels.length,
  });
  if (rows.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">No companies in this list yet.</p>;
  }
  return (
    <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-white/[0.06]">
      <thead className="sticky top-0 z-30 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226,232,240)] dark:bg-white/[0.02] dark:text-white/60 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
        <tr>
          <SortableHeader label="Company" sortKey="company" sort={sort} onSort={toggle} />
          <SortableHeader label="Kind" sortKey="kind" sort={sort} onSort={toggle} />
          <SortableHeader label="Country" sortKey="country" sort={sort} onSort={toggle} />
          <SortableHeader label="Fleet" sortKey="fleet" sort={sort} onSort={toggle} />
          <SortableHeader label="Employees" sortKey="employees" sort={sort} onSort={toggle} />
          <SortableHeader label="Vessels in this list" sortKey="vessels" sort={sort} onSort={toggle} />
          <th className="w-10 px-4 py-3" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
        {sorted.map((row) => (
          <tr key={`${row.companyKind}:${row.companyId}`}>
            <td className="px-4 py-3 font-semibold">
              <Link href={`/dashboard/companies/${KIND_TO_SLUG[row.companyKind]}/${row.companyId}`} className="text-slate-950 hover:text-ocean dark:text-white">
                {row.companyName}
              </Link>
            </td>
            <td className="px-4 py-3">
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-white/70">
                {formatEnum(row.companyKind)}
              </span>
            </td>
            <td className="px-4 py-3 text-slate-600 dark:text-white/60">{row.country ?? "—"}</td>
            <td className="px-4 py-3 text-slate-600 dark:text-white/60">{row.fleetSize}</td>
            <td className="px-4 py-3 text-slate-600 dark:text-white/60">{row.employeeCount}</td>
            <td className="px-4 py-3">
              {row.listVessels.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {row.listVessels.map((vessel) => (
                    <Link
                      key={vessel.id}
                      href={`/dashboard/vessels/${vessel.imoNumber}`}
                      className="inline-flex items-center gap-1 rounded-full bg-ocean/10 px-2 py-0.5 text-[11px] font-semibold text-ocean hover:bg-ocean/20"
                      title={`IMO ${vessel.imoNumber}`}
                    >
                      <Ship className="h-3 w-3" />
                      {vessel.vesselName}
                    </Link>
                  ))}
                </div>
              ) : (
                <span className="text-slate-400 dark:text-white/40">—</span>
              )}
            </td>
            <td className="px-4 py-3 text-right">
              {/* Derived rows have no ListCompany link to delete — removing the
                  vessel is what removes the company. */}
              {row.addedToList ? (
                <button onClick={() => onRemove(row)} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove from list">
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type ContactRow = ContactListDetailResponse["contacts"][number];

/**
 * Apollo previews are persisted with email `apollo-<externalId>@unknown.local`
 * (see server/src/routes/lists.ts). We derive the external id from the email
 * so the row itself carries everything the reveal endpoint needs — no extra
 * lookup, and phone reveal keeps working after the email has been revealed
 * (customFields.apolloId remains on the row).
 */
function apolloExternalId(contact: ContactRow): string | null {
  const email = contact.email ?? "";
  const m = email.match(/^apollo-([^@]+)@unknown\.local$/i);
  if (m) return m[1];
  const cf = contact.customFields as { apolloId?: unknown } | null;
  return typeof cf?.apolloId === "string" ? cf.apolloId : null;
}

function isEmailLocked(contact: ContactRow) {
  return /^apollo-[^@]+@unknown\.local$/i.test(contact.email ?? "");
}

function ContactsTable({
  rows,
  onRemove,
  onReveal,
  revealing,
}: {
  rows: ContactRow[];
  onRemove: (id: string) => void;
  onReveal: (contact: ContactRow, field: "email" | "phone") => void;
  revealing: Record<string, "email" | "phone" | undefined>;
}) {
  // Trimmed to the fields that matter for a list-detail view. The Apollo-
  // style extras (Departments, Contact Owner, LinkedIn, Salesforce ID,
  // Corporate Phone) blew the table past 1600px wide and forced horizontal
  // scrolling; the vessel-detail page still has the full schema for anyone
  // who needs it.
  const listContactFields = CONTACT_SCHEMA_FIELDS.filter((field) =>
    ["First Name", "Last Name", "Title", "Company", "Email", "Mobile Phone"].includes(field.label),
  );
  const sortAccessors: Record<string, (c: ContactRow) => string | number | null | undefined> = {
    marineRole: (c) => c.marineRole,
    added: (c) => (c.addedAt ? new Date(c.addedAt).getTime() : null),
  };
  for (const field of listContactFields) {
    sortAccessors[field.label] = (c) => contactFieldValue(c, field);
  }
  const { sorted, sort, toggle } = useClientSort(rows, sortAccessors);
  if (rows.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">No contacts in this list yet.</p>;
  }
  return (
    <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-white/[0.06]">
      <thead className="sticky top-0 z-30 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226,232,240)] dark:bg-white/[0.02] dark:text-white/60 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
        <tr>
          {listContactFields.map((field) => (
            <SortableHeader key={field.label} label={field.label} sortKey={field.label} sort={sort} onSort={toggle} />
          ))}
          <th className="whitespace-nowrap px-4 py-3">Ship / ETA</th>
          <SortableHeader label="Marine Role" sortKey="marineRole" sort={sort} onSort={toggle} />
          <SortableHeader label="Added" sortKey="added" sort={sort} onSort={toggle} />
          <th className="w-10 px-4 py-3" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
        {sorted.map((contact) => {
          const externalId = apolloExternalId(contact);
          const emailLocked = isEmailLocked(contact);
          const phoneMissing = !contact.mobilePhone && !contact.corporatePhone;
          const busy = revealing[contact.id];
          return (
          <tr key={contact.id}>
            {listContactFields.map((field) => {
              if (field.key === "email" && emailLocked && externalId) {
                return (
                  <td key={field.label} className="px-4 py-3">
                    <button
                      onClick={() => onReveal(contact, "email")}
                      disabled={busy === "email"}
                      className="inline-flex items-center gap-1.5 rounded-md border border-ocean/40 bg-ocean/5 px-2 py-1 text-xs font-semibold text-ocean hover:bg-ocean/10 disabled:opacity-60 dark:border-ocean/50 dark:text-ocean-light"
                      title="Reveal email (1 credit)"
                    >
                      {busy === "email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                      Reveal email
                    </button>
                  </td>
                );
              }
              if (field.key === "mobilePhone" && phoneMissing && externalId && contact.source === "APOLLO") {
                return (
                  <td key={field.label} className="px-4 py-3">
                    <button
                      onClick={() => onReveal(contact, "phone")}
                      disabled={busy === "phone"}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-white/70 dark:hover:bg-white/[0.04]"
                      title="Reveal mobile phone (1 credit)"
                    >
                      {busy === "phone" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                      Reveal phone
                    </button>
                  </td>
                );
              }
              return (
              <td key={field.label} className="max-w-[220px] truncate px-4 py-3 text-slate-600 dark:text-white/60" title={contactFieldValue(contact, field)}>
                {field.key === "firstName" ? (
                  <Link href={`/dashboard/contacts/${contact.id}`} className="font-semibold text-slate-950 hover:text-ocean dark:text-white">
                    {contactFieldValue(contact, field)}
                  </Link>
                ) : (
                  contactFieldValue(contact, field)
                )}
              </td>
              );
            })}
            <td className="px-4 py-3"><ShipEtaCell vessels={contact.matchedVessels} /></td>
            <td className="px-4 py-3 text-slate-600 dark:text-white/60">{formatEnum(contact.marineRole)}</td>
            <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-white/50" title={contact.addedAt ?? ""}>
              {contact.addedAt ? formatRelative(contact.addedAt) : "—"}
            </td>
            <td className="px-4 py-3 text-right">
              <button onClick={() => onRemove(contact.id)} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove from list">
                <Trash2 className="h-4 w-4" />
              </button>
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function VesselsTable({ rows, onRemove }: { rows: ListVesselRow[]; onRemove: (id: string) => void }) {
  const { sorted, sort, toggle } = useClientSort(rows, {
    vessel: (v) => v.vesselName,
    imo: (v) => v.imoNumber,
    type: (v) => v.vesselType,
    flag: (v) => v.flag,
    dwt: (v) => v.capacityDwt ?? v.dwt,
    currentPort: (v) => v.currentPortUnlocode,
    commercialManager: (v) => v.commercialManagerName ?? v.commercialManagerCompany?.companyName,
    ismManager: (v) => v.ismManagerName ?? v.ismManagerCompany?.companyName,
    operator: (v) => v.operatorName,
    // Sort by the actual date so "sooner" sorts before "later"; vessels with
    // no ETA go to the bottom regardless of direction.
    nextEta: (v) => (v.nextEta ? new Date(v.nextEta) : null),
    contacts: (v) => v.contactCount,
    added: (v) => (v.addedAt ? new Date(v.addedAt) : null),
  });
  if (rows.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">No vessels in this list yet.</p>;
  }
  return (
    <table className="min-w-[1100px] divide-y divide-slate-200 text-sm dark:divide-white/[0.06]">
      <thead className="sticky top-0 z-30 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226,232,240)] dark:bg-white/[0.02] dark:text-white/60 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
        <tr>
          <SortableHeader label="Vessel" sortKey="vessel" sort={sort} onSort={toggle} />
          <SortableHeader label="IMO" sortKey="imo" sort={sort} onSort={toggle} />
          <SortableHeader label="Type" sortKey="type" sort={sort} onSort={toggle} />
          <SortableHeader label="Flag" sortKey="flag" sort={sort} onSort={toggle} />
          <SortableHeader label="Capacity - Dwt" sortKey="dwt" sort={sort} onSort={toggle} />
          <SortableHeader label="Current Port Unlocode" sortKey="currentPort" sort={sort} onSort={toggle} />
          <SortableHeader label="Commercial Manager" sortKey="commercialManager" sort={sort} onSort={toggle} />
          <SortableHeader label="Ism Manager" sortKey="ismManager" sort={sort} onSort={toggle} />
          <SortableHeader label="Operator" sortKey="operator" sort={sort} onSort={toggle} />
          <SortableHeader label="Next ETA" sortKey="nextEta" sort={sort} onSort={toggle} />
          <SortableHeader label="Contacts" sortKey="contacts" sort={sort} onSort={toggle} />
          <SortableHeader label="Added" sortKey="added" sort={sort} onSort={toggle} />
          <th className="w-10 px-4 py-3" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
        {sorted.map((vessel) => (
          <tr key={vessel.id}>
            <td className="px-4 py-3 font-semibold">
              <Link href={`/dashboard/vessels/${vessel.imoNumber}`} className="text-slate-950 hover:text-ocean dark:text-white">
                {vessel.vesselName}
              </Link>
            </td>
            <td className="px-4 py-3 text-slate-600 dark:text-white/60">{vessel.imoNumber}</td>
            <td className="px-4 py-3 text-slate-600 dark:text-white/60">{formatEnum(vessel.vesselType)}</td>
            <td className="px-4 py-3 text-slate-600 dark:text-white/60">{vessel.flag ?? "—"}</td>
            <td className="px-4 py-3 text-slate-600 dark:text-white/60">{vessel.capacityDwt?.toLocaleString() ?? vessel.dwt?.toLocaleString() ?? "—"}</td>
            <td className="px-4 py-3 text-slate-600 dark:text-white/60">{vessel.currentPortUnlocode ?? "—"}</td>
            <td className="px-4 py-3 text-slate-600 dark:text-white/60">{vessel.commercialManagerName ?? vessel.commercialManagerCompany?.companyName ?? "—"}</td>
            <td className="px-4 py-3 text-slate-600 dark:text-white/60">{vessel.ismManagerName ?? vessel.ismManagerCompany?.companyName ?? "—"}</td>
            <td className="px-4 py-3 text-slate-600 dark:text-white/60">{vessel.operatorName ?? "—"}</td>
            <td className="whitespace-nowrap px-4 py-3">
              <VesselNextEtaBadge nextEta={vessel.nextEta} nextEtaPort={vessel.nextEtaPort} />
            </td>
            <td className="whitespace-nowrap px-4 py-3">
              {vessel.contactCount > 0 ? (
                <span className="text-slate-600 dark:text-white/60">{vessel.contactCount}</span>
              ) : (
                <span
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                  title="No one at this vessel's owner/manager companies is in this list — it can't be emailed yet."
                >
                  None
                </span>
              )}
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-white/50" title={vessel.addedAt ?? ""}>
              {vessel.addedAt ? formatRelative(vessel.addedAt) : "—"}
            </td>
            <td className="px-4 py-3 text-right">
              <button onClick={() => onRemove(vessel.id)} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove from list">
                <Trash2 className="h-4 w-4" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Apollo-derived role picker — powers the new title-based CampaignByRolePanel.
type ApolloRow = {
  id: string;
  externalId?: string | number;
  source?: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  title: string | null;
  companyName: string;
  email: string;
  emailStatus: string;
  emailLocked?: boolean;
  emailAvailable?: boolean;
  phoneLocked?: boolean;
  phoneAvailable?: boolean;
  mobilePhone: string | null;
  personLinkedinUrl?: string | null;
  website?: string | null;
  companyDomain?: string | null;
  /** Which of the list's vessels this person's company ties back to. Empty when
   *  Apollo matched a domain we can't attribute to one specific vessel. */
  matchedVessels?: Array<{ id: string; vesselName: string; imoNumber: string }>;
  country: string | null;
};

type ApolloListResponse = {
  data?: {
    rows: ApolloRow[];
    titleHistogram: Array<{ title: string; count: number }>;
    totalContacts: number;
    totalDomains: number;
    page: number;
    nextPage: number | null;
    warnings: string[];
  };
  error?: { message?: string };
};

type ApolloRolesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      // Snapshot of the filter that produced this result — keeps the
      // "Load more" call in sync even if the user starts editing chips.
      filter: RoleFilter;
      allRows: ApolloRow[];
      warnings: string[];
      totalDomains: number;
      loadedPage: number;
      nextPage: number | null;
      loadingMore: boolean;
    };

function buildRoleQuery(filter: RoleFilter, vesselIds?: string[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const t of filter.includeTitles) params.append("includeTitle", t);
  for (const t of filter.excludeTitles) params.append("excludeTitle", t);
  for (const c of filter.includeCompanies) params.append("includeCompany", c);
  for (const c of filter.excludeCompanies) params.append("excludeCompany", c);
  for (const s of filter.seniorities) params.append("seniority", s);
  // Scopes the Apollo search (and the title suggestions built from it) to just
  // these vessels' companies. Omitted = every vessel on the list.
  for (const id of vesselIds ?? []) params.append("vesselId", id);
  return params;
}

function summarizeFilter(filter: RoleFilter): string {
  const parts: string[] = [];
  if (filter.includeTitles.length) parts.push(`include: ${filter.includeTitles.join(", ")}`);
  if (filter.excludeTitles.length) parts.push(`exclude: ${filter.excludeTitles.join(", ")}`);
  if (filter.includeCompanies.length) parts.push(`at: ${filter.includeCompanies.join(", ")}`);
  if (filter.excludeCompanies.length) parts.push(`not at: ${filter.excludeCompanies.join(", ")}`);
  if (filter.seniorities.length) parts.push(`seniority: ${filter.seniorities.join(", ")}`);
  return parts.join(" · ") || "any role";
}

/**
 * Apollo role search → reveal → add-to-list, in one panel. Exported because the
 * campaign Leads tab reuses it verbatim to find more people at a staged
 * vessel's company: adding through it runs the list reconciler, so the new
 * contacts arrive in the campaign's review queue on refresh.
 */
export function CampaignByRolePanel({
  listId,
  listName,
  vesselIds,
}: {
  listId: string;
  listName: string;
  /** Restrict the search to these vessels' companies. Omit for the whole list. */
  vesselIds?: string[];
}) {
  // Stable identity for the vessel scope — see the fetchTitleSuggestions deps.
  const vesselKey = (vesselIds ?? []).join(",");
  // Apollo-style multi-facet role filter: include titles, exclude titles,
  // seniority. Search only fires when the user clicks Apply (or clears the
  // filter), so mid-edit chips don't spam the API. Empty filter → idle.
  const router = useRouter();
  const [state, setState] = useState<ApolloRolesState>({ status: "idle" });
  const [revealing, setRevealing] = useState<Map<string, "email" | "phone">>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<RoleFilter>(EMPTY_ROLE_FILTER);
  // Workspace credit balance shown in the panel header. Loaded once on
  // mount from /api/billing/me; each successful reveal returns a fresh
  // balance so we can update this in place without another round-trip.
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/billing/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { data?: { workspace?: { creditBalance?: number } } } | null) => {
        if (!cancelled && typeof payload?.data?.workspace?.creditBalance === "number") {
          setCreditBalance(payload.data.workspace.creditBalance);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleRow(rowId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function toggleAllRows(rows: ApolloRow[]) {
    setSelected((prev) => {
      if (prev.size === rows.length) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }

  async function addSelectedToList() {
    if (state.status !== "loaded") return;
    const rowsById = new Map(state.allRows.map((r) => [r.id, r]));
    const chosen = Array.from(selected)
      .map((id) => rowsById.get(id))
      .filter((r): r is ApolloRow => Boolean(r && r.externalId));
    if (chosen.length === 0) return;

    // Reveal-first flow: the list should only ever contain contacts we can
    // actually email, so we split the selection into three buckets and act
    // on each accordingly.
    //   - alreadyRevealed → add straight to the list (no credit spent).
    //   - noEmailOnFile   → skip entirely; there's nothing to reveal.
    //   - needsReveal     → attempt reveal (1 credit each). Only the rows
    //                        whose reveal succeeds get added to the list.
    // This prevents "add now, reveal later" from silently persisting locked
    // previews that a campaign will just skip at launch time.
    const alreadyRevealed = chosen.filter((r) => r.emailLocked === false && r.emailAvailable !== false);
    const noEmailOnFile = chosen.filter((r) => r.emailAvailable === false);
    const needsReveal = chosen.filter(
      (r) => r.emailLocked !== false && r.emailAvailable !== false && r.externalId,
    );

    setAdding(true);
    try {
      // 1) Reveal in parallel. Track successes vs failure reasons so the
      //    toast can explain what actually happened.
      let outOfCredits = false;
      let latestBalance: number | null = null;
      const revealResults =
        needsReveal.length > 0
          ? await Promise.allSettled(
              needsReveal.map(async (row) => {
                const revealRes = await apiFetch(
                  `/api/contacts/reveal-apollo/${row.externalId}/email`,
                  { method: "POST" },
                );
                if (!revealRes.ok) {
                  const body = (await revealRes.json().catch(() => null)) as
                    | { error?: { code?: string } }
                    | null;
                  throw new Error(body?.error?.code ?? "reveal_failed");
                }
                const payload = (await revealRes.json().catch(() => null)) as
                  | { data?: { balance?: number } }
                  | null;
                if (typeof payload?.data?.balance === "number") {
                  latestBalance = payload.data.balance;
                }
                return row;
              }),
            )
          : [];
      const revealedRows: ApolloRow[] = [];
      let revealSkipped = 0;
      for (let idx = 0; idx < revealResults.length; idx += 1) {
        const outcome = revealResults[idx];
        if (outcome.status === "fulfilled") {
          revealedRows.push(needsReveal[idx]);
        } else {
          revealSkipped += 1;
          if ((outcome.reason as Error).message === "INSUFFICIENT_CREDITS") outOfCredits = true;
        }
      }
      if (latestBalance !== null) setCreditBalance(latestBalance);

      // 2) Only the rows we can actually email land in the list. Combined
      //    payload = already-revealed rows + rows we just revealed.
      const rowsToPersist = [...alreadyRevealed, ...revealedRows];
      let added = 0;
      if (rowsToPersist.length > 0) {
        const res = await apiFetch(`/api/lists/${listId}/apollo-contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apolloRows: rowsToPersist.map((r) => ({
              externalId: String(r.externalId),
              firstName: r.firstName ?? "",
              lastName: r.lastName ?? "",
              title: r.title,
              companyName: r.companyName ?? "",
              // website + companyDomain are the signals the vessel matcher
              // hits for association — without them the contact can't
              // associate to any ship in the list.
              website: r.website ?? null,
              companyDomain: r.companyDomain ?? null,
              personLinkedinUrl: r.personLinkedinUrl ?? null,
              country: r.country,
            })),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          setToast(body?.error?.message ?? `Failed to add (${res.status})`);
          setTimeout(() => setToast(null), 5000);
          return;
        }
        const payload = (await res.json()) as { data: { added: number } };
        added = payload.data.added;
      }

      // 3) Build the summary toast — surface exactly what happened so the
      //    user knows credits were / weren't spent and why some rows were
      //    skipped.
      const notes: string[] = [];
      if (revealedRows.length > 0) {
        notes.push(`${revealedRows.length} revealed`);
      }
      if (noEmailOnFile.length > 0) {
        notes.push(`${noEmailOnFile.length} skipped (no email on file)`);
      }
      if (revealSkipped > 0) {
        notes.push(
          outOfCredits
            ? `${revealSkipped} skipped (out of credits)`
            : `${revealSkipped} skipped (reveal failed)`,
        );
      }
      const detail = notes.length > 0 ? ` — ${notes.join(", ")}.` : ".";
      setToast(
        added > 0
          ? `Added ${added} contact${added === 1 ? "" : "s"} to "${listName}"${detail}`
          : `Nothing added${detail}`,
      );
      setTimeout(() => setToast(null), 6000);
      setSelected(new Set());

      // 4) Flip local locked flags off for the rows we just revealed so
      //    the results table shows the unlocked state immediately.
      if (revealedRows.length > 0) {
        const revealedIds = new Set(revealedRows.map((r) => r.id));
        setState((prev) => {
          if (prev.status !== "loaded") return prev;
          return {
            ...prev,
            allRows: prev.allRows.map((r) =>
              revealedIds.has(r.id) ? { ...r, emailLocked: false, emailStatus: "VALID" } : r,
            ),
          };
        });
      }

      // 5) Re-fetch the server-rendered list so the Contacts tab (and the
      //    list counts up top) pick up the new rows without a manual reload.
      if (added > 0) router.refresh();
    } finally {
      setAdding(false);
    }
  }

  // The old "reset to idle when the filter is empty" auto-effect was
  // removed: an empty filter is now a legitimate "return everyone at these
  // companies" Apollo query, so wiping results the moment the user clears
  // a chip would fight the new Search-anytime affordance.

  async function runSearch(active: RoleFilter) {
    // No `hasFacets` guard here anymore — an empty filter is a real search
    // (Apollo's default: every title at these vessels' companies). If the
    // parent doesn't want empty-filter calls, it can disable the button.
    setState({ status: "loading" });
    setSelected(new Set());
    try {
      const params = buildRoleQuery(active, vesselIds);
      params.set("page", "1");
      const res = await apiFetch(`/api/contacts/external-by-list/${listId}?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApolloListResponse | null;
        setState({ status: "error", message: body?.error?.message ?? `Failed (${res.status})` });
        return;
      }
      const payload = (await res.json()) as ApolloListResponse;
      const d = payload.data;
      if (!d) {
        setState({ status: "error", message: "Empty response" });
        return;
      }
      setState({
        status: "loaded",
        filter: active,
        allRows: d.rows,
        warnings: d.warnings,
        totalDomains: d.totalDomains,
        loadedPage: d.page,
        nextPage: d.nextPage,
        loadingMore: false,
      });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  }

  async function loadMore() {
    if (state.status !== "loaded" || state.nextPage === null || state.loadingMore) return;
    const targetPage = state.nextPage;
    const activeFilter = state.filter;
    setState((prev) => (prev.status === "loaded" ? { ...prev, loadingMore: true } : prev));
    try {
      const params = buildRoleQuery(activeFilter, vesselIds);
      params.set("page", String(targetPage));
      const res = await apiFetch(`/api/contacts/external-by-list/${listId}?${params.toString()}`);
      if (!res.ok) {
        setState((prev) => (prev.status === "loaded" ? { ...prev, loadingMore: false } : prev));
        return;
      }
      const payload = (await res.json()) as ApolloListResponse;
      const d = payload.data;
      if (!d) return;
      setState((prev) => {
        // Bail out if the filter changed under us.
        if (
          prev.status !== "loaded" ||
          summarizeFilter(prev.filter) !== summarizeFilter(activeFilter)
        )
          return prev;
        // Dedupe by row.id — Apollo person IDs are stable and can occasionally
        // repeat between pages when rankings shift.
        const seen = new Set(prev.allRows.map((r) => r.id));
        const merged = [...prev.allRows];
        for (const r of d.rows) {
          if (!seen.has(r.id)) {
            merged.push(r);
            seen.add(r.id);
          }
        }
        return {
          ...prev,
          allRows: merged,
          loadedPage: d.page,
          nextPage: d.nextPage,
          loadingMore: false,
        };
      });
    } catch {
      setState((prev) => (prev.status === "loaded" ? { ...prev, loadingMore: false } : prev));
    }
  }

  async function reveal(row: ApolloRow, field: "email" | "phone") {
    if (!row.externalId) return;
    const key = `${row.id}:${field}`;
    if (revealing.has(key)) return;
    setRevealing((prev) => new Map(prev).set(key, field));
    try {
      const res = await apiFetch(`/api/contacts/reveal-apollo/${row.externalId}/${field}`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
        const msg =
          body?.error?.code === "INSUFFICIENT_CREDITS"
            ? "Out of credits — upgrade your plan to reveal more"
            : body?.error?.message ?? "Failed to reveal";
        setToast(msg);
        setTimeout(() => setToast(null), 5000);
        return;
      }
      const payload = (await res.json()) as { data: { contact: { email?: string; mobilePhone?: string | null }; balance: number } };
      setState((prev) => {
        if (prev.status !== "loaded") return prev;
        const updated = prev.allRows.map((r) =>
          r.id !== row.id
            ? r
            : {
                ...r,
                email: field === "email" && payload.data.contact.email ? payload.data.contact.email : r.email,
                emailLocked: field === "email" ? false : r.emailLocked,
                mobilePhone: field === "phone" && payload.data.contact.mobilePhone ? payload.data.contact.mobilePhone : r.mobilePhone,
                phoneLocked: field === "phone" ? false : r.phoneLocked,
                emailStatus: field === "email" ? "VALID" : r.emailStatus,
              },
        );
        return { ...prev, allRows: updated };
      });
      setCreditBalance(payload.data.balance);
      setToast(`Revealed — ${payload.data.balance} credits left`);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setRevealing((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }
  }

  const loaded = state.status === "loaded" ? state : null;
  const visibleRows = loaded ? loaded.allRows : [];
  // Feed distinct titles from the latest results back into the include-title
  // autocomplete so the user can pick a title they just saw.
  const suggestionsFromResults = loaded
    ? Array.from(
        new Set(
          loaded.allRows
            .map((r) => (r.title ?? "").trim())
            .filter((t): t is string => Boolean(t)),
        ),
      )
    : [];
  // Distinct company names from the latest results, feeding the include /
  // exclude company autocomplete. Sorted by first appearance so the most-
  // frequent companies from the top of the result set surface first.
  const companySuggestionsFromResults = loaded
    ? Array.from(
        new Set(
          loaded.allRows
            .map((r) => (r.companyName ?? "").trim())
            .filter((c): c is string => Boolean(c)),
        ),
      )
    : [];

  // Live title lookups for the Include-titles chip input. Reuses the same
  // list-scoped search endpoint the main "Search" button uses — server
  // returns a `titleHistogram` of what actually exists at these vessels'
  // companies, which we surface as autocomplete suggestions. Free tier: the
  // upstream search itself doesn't spend credits, only reveals do.
  //
  // useCallback keeps the reference stable across parent re-renders so the
  // ChipInput's debounce effect doesn't reset on every keystroke — without
  // this, adding a chip caused the parent to re-render, the callback ref
  // changed, and the follow-up "manager" search never resolved.
  const fetchTitleSuggestions = useCallback(
    async (draft: string): Promise<string[]> => {
      const query = draft.trim();
      if (!query) return [];
      try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("q", query);
        // Suggestions come from the same Apollo search as the results, so they
        // must honour the same vessel scope — otherwise the New Vessels tab
        // would suggest titles that only exist at vessels it doesn't cover.
        for (const id of vesselIds ?? []) params.append("vesselId", id);
        const res = await apiFetch(`/api/contacts/external-by-list/${listId}?${params.toString()}`);
        if (!res.ok) return [];
        const payload = (await res.json()) as ApolloListResponse;
        const data = payload.data;
        if (!data) return [];
        const histogram = data.titleHistogram ?? [];
        const seen = new Set<string>();
        const suggestions: string[] = [];
        for (const entry of histogram) {
          const key = entry.title.trim();
          if (!key) continue;
          const lower = key.toLowerCase();
          if (seen.has(lower)) continue;
          seen.add(lower);
          suggestions.push(key);
          if (suggestions.length >= 15) break;
        }
        return suggestions;
      } catch {
        return [];
      }
    },
    // vesselKey (not vesselIds) — the parent passes a fresh array each render,
    // and depending on it directly would reset the ChipInput's debounce on every
    // keystroke, which is the bug the useCallback exists to avoid.
    [listId, vesselKey],
  );

  return (
    <div className="space-y-4">
      {/* Credit balance banner. Rendered above the filter so the user can
          see how many reveals they can afford before they select rows. Only
          shows once we have a real number from /api/billing/me — no
          skeleton flicker if the fetch is still in flight. */}
      {creditBalance !== null ? (
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-2 text-xs dark:border-white/10 dark:bg-white/[0.02]">
          <span className="text-slate-600 dark:text-white/70">
            Every reveal spends 1 credit. Adding contacts to this list reveals their emails first — locked previews aren&rsquo;t added.
          </span>
          <span
            className={`ml-3 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              creditBalance <= 0
                ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200"
                : creditBalance < 50
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
            }`}
            title="Workspace credit balance"
          >
            {creditBalance.toLocaleString()} credits left
          </span>
        </div>
      ) : null}

      <RoleFilterPanel
        value={filter}
        onChange={setFilter}
        onApply={() => void runSearch(filter)}
        suggestionsFromResults={suggestionsFromResults}
        companySuggestionsFromResults={companySuggestionsFromResults}
        fetchTitleSuggestions={fetchTitleSuggestions}
        disabled={state.status === "loading"}
      />

      <div>
        {state.status === "loading" && (
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-white/10 dark:bg-white/[0.02]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Searching at these vessels&rsquo; domains…
          </div>
        )}
        {state.status === "error" && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
            Search failed: {state.message}
          </p>
        )}
        {loaded && loaded.allRows.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-white/10 dark:bg-transparent dark:text-white/60">
            {loaded.warnings.includes("no_vessels")
              ? "This list has no vessels yet. Add some from Port Radar."
              : loaded.warnings.includes("no_domains")
                ? "These vessels don't expose a company domain, so there's nothing to search against."
                : loaded.warnings.includes("apollo_disabled")
                  ? "Contact search is disabled — an admin needs to enable it."
                  : loaded.warnings.includes("apollo_unavailable")
                    ? "Contact search is temporarily unavailable — try again in a moment."
                    : `No people match this filter (${summarizeFilter(loaded.filter)}) at these companies.`}
          </div>
        )}
      </div>

      {loaded && loaded.allRows.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[11px] text-slate-500 dark:text-white/50">
              {loaded.allRows.length} match{loaded.allRows.length === 1 ? "" : "es"} across {loaded.totalDomains} primary company domain{loaded.totalDomains === 1 ? "" : "s"} — {summarizeFilter(loaded.filter)}.
            </p>
            {visibleRows.length > 0 ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {(() => {
                  // Cost estimate: 1 credit per still-locked row in the
                  // selection. Rows already revealed or without an email
                  // on file cost nothing.
                  const selectedRows = visibleRows.filter((r) => selected.has(r.id));
                  const needsReveal = selectedRows.filter(
                    (r) => r.emailLocked !== false && r.emailAvailable !== false && r.externalId,
                  ).length;
                  return (
                    <p className="text-xs text-slate-500 dark:text-white/60">
                      {selected.size} of {visibleRows.length} selected
                      {needsReveal > 0 ? ` · ${needsReveal} credit${needsReveal === 1 ? "" : "s"} to reveal` : ""}
                    </p>
                  );
                })()}
                <button
                  type="button"
                  onClick={addSelectedToList}
                  disabled={selected.size === 0 || adding}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#4F6DFF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3B4FE6] disabled:opacity-60"
                  title="Reveals emails first, then adds to the list. Locked previews are not added."
                >
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Reveal &amp; add {selected.size || ""} to this list
                </button>
              </div>
            ) : null}
          </div>
            <div className="overflow-x-auto rounded border border-slate-200 bg-white dark:border-white/10 dark:bg-transparent">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={
                          visibleRows.length > 0 &&
                          selected.size === visibleRows.length
                        }
                        onChange={() => toggleAllRows(visibleRows)}
                        className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                        aria-label="Select all"
                      />
                    </th>
                    {["Name", "Title", "Company", "Vessel", "Email", "Phone", "Country"].map((label) => (
                      <th key={label} className="whitespace-nowrap px-3 py-2">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {visibleRows.map((row) => {
                    const name =
                      (row.fullName ?? `${row.firstName} ${row.lastName}`.trim()) ||
                      "(no name)";
                    const emailKey = `${row.id}:email`;
                    const phoneKey = `${row.id}:phone`;
                    return (
                      <tr key={row.id} className={`hover:bg-slate-50 dark:hover:bg-white/[0.02] ${selected.has(row.id) ? "bg-ocean/5" : ""}`}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={() => toggleRow(row.id)}
                            className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                            aria-label={`Select ${name}`}
                          />
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 font-medium text-slate-900 dark:text-white" title={name}>
                          {name}
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-slate-600 dark:text-white/70" title={row.title ?? undefined}>
                          {row.title ?? "—"}
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-slate-600 dark:text-white/70" title={row.companyName}>
                          {row.companyName || "—"}
                        </td>
                        <td className="px-3 py-2">
                          {row.matchedVessels && row.matchedVessels.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {row.matchedVessels.slice(0, 3).map((vessel) => (
                                <span
                                  key={vessel.id}
                                  className="inline-flex w-fit items-center gap-1 rounded-full bg-ocean/10 px-2 py-0.5 text-[11px] font-semibold text-ocean"
                                  title={`IMO ${vessel.imoNumber}`}
                                >
                                  <Ship className="h-3 w-3" />
                                  {vessel.vesselName}
                                </span>
                              ))}
                              {row.matchedVessels.length > 3 ? (
                                <span className="text-[11px] text-slate-400 dark:text-white/40">
                                  +{row.matchedVessels.length - 3} more
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span
                              className="text-[11px] text-slate-400 dark:text-white/40"
                              title="Apollo matched this person on a company domain we couldn't tie back to a specific vessel in this list."
                            >
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-white/70">
                          {row.emailAvailable === false ? (
                            <span
                              className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500 dark:bg-white/[0.06] dark:text-white/50"
                              title="We have no email on file for this contact — nothing to reveal, no credit spent."
                            >
                              No email on file
                            </span>
                          ) : row.emailLocked ? (
                            <button
                              type="button"
                              onClick={() => reveal(row, "email")}
                              disabled={revealing.has(emailKey)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                              title="Unlock this email — 1 credit"
                            >
                              {revealing.get(emailKey) === "email" ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : null}
                              Reveal email
                            </button>
                          ) : (
                            <span className="block max-w-[240px] truncate" title={row.email}>{row.email || "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-white/70">
                          {row.phoneAvailable === false ? (
                            <span className="text-[11px] text-slate-400 dark:text-white/40" title="We have no phone on file for this contact.">
                              No phone
                            </span>
                          ) : row.phoneLocked ? (
                            <button
                              type="button"
                              onClick={() => reveal(row, "phone")}
                              disabled={revealing.has(phoneKey)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                              title="Unlock this phone — 1 credit"
                            >
                              {revealing.get(phoneKey) === "phone" ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : null}
                              Reveal phone
                            </button>
                          ) : (
                            <span className="block max-w-[160px] truncate" title={row.mobilePhone ?? undefined}>{row.mobilePhone ?? "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-white/70">{row.country ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          {visibleRows.length > 0 ? (
            <p className="text-[11px] text-slate-400 dark:text-white/40">
              External contacts stay locked until you spend a credit per email or phone. Adding to the list persists the preview so you can reveal later — nothing here spends credits automatically.
            </p>
          ) : null}
          {loaded.nextPage !== null ? (
            <div>
              <button
                type="button"
                onClick={loadMore}
                disabled={loaded.loadingMore}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-ocean hover:text-ocean disabled:opacity-60 dark:border-white/10 dark:text-white/80"
              >
                {loaded.loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Load more matches
              </button>
              <span className="ml-2 text-[11px] text-slate-400">Loading more is free — credits are only spent on reveal.</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

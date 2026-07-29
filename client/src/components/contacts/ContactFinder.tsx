"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bookmark, ChevronDown, ChevronRight, Database, Linkedin, ListPlus, Loader2, Lock, Phone, PlusCircle, Smartphone, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import type { ContactModel } from "@/lib/contact-data";
import { CONTACT_SCHEMA_FIELDS, contactFieldValue, type ContactSchemaField } from "@/lib/contact-schema";
import { apiFetch } from "@/lib/browser-fetch";
import { contactTableColumns } from "@/lib/table-columns";
import { useColumnPreferences } from "@/hooks/useColumnPreferences";
import { ColumnCustomizer } from "@/components/table/ColumnCustomizer";
import { SortableHeader } from "@/components/table/SortableHeader";
import type { SortState } from "@/hooks/useClientSort";
import { ContactAddToListModal } from "./ContactAddToListModal";
import { MotionButton } from "@/components/ui/motion-button";
import { VesselAddToListModal } from "@/components/marine/VesselAddToListModal";
import type { AssociatedVesselView, AssociatedVesselsResponse, AssociationCountsResponse } from "@/lib/marine-row-views";

const CONTACT_FIELD_BY_KEY = new Map<string, ContactSchemaField>(
  CONTACT_SCHEMA_FIELDS.map((field) => [String(field.key), field]),
);
import {
  EMPTY_PEOPLE_FILTERS,
  PeopleFilters,
  peopleFiltersToConditions,
  type PeopleFilterState,
} from "./PeopleFilters";

const PAGE_SIZE = 50;

function formatEnum(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function initials(contact: ContactModel) {
  return `${contact.firstName.slice(0, 1)}${contact.lastName.slice(0, 1)}`.toUpperCase();
}

/**
 * One icon in the ACTIONS column. When we have the underlying value it renders
 * as a real link (tel: / profile URL) with an accessible label; when we don't
 * it stays inert but still announces *why* it's greyed out, so the colour isn't
 * the only thing carrying the meaning.
 */
function ContactActionIcon({
  icon: Icon,
  value,
  href,
  label,
  external,
}: {
  icon: typeof Smartphone;
  value: string | null | undefined;
  href: string | null | undefined;
  label: string;
  external?: boolean;
}) {
  if (!value || !href) {
    return (
      <span
        title={`No ${label} on file`}
        aria-label={`No ${label} on file`}
        className="cursor-default text-slate-300 dark:text-white/20"
      >
        <Icon className="h-4 w-4" />
      </span>
    );
  }
  return (
    <a
      href={href}
      title={`${label.charAt(0).toUpperCase()}${label.slice(1)}: ${value}`}
      aria-label={`Open ${label}: ${value}`}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      onClick={(e) => e.stopPropagation()}
      className="rounded p-0.5 text-emerald-600 hover:bg-slate-100 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-white/10"
    >
      <Icon className="h-4 w-4" />
    </a>
  );
}

function scoreTier(score: number) {
  if (score >= 75) return "Hot";
  if (score >= 40) return "Warm";
  if (score >= 10) return "Cold";
  return "Inactive";
}

// Mirrors the server's contact search sort allowlist (contacts.ts sortableFields).
// Only these columns get a clickable sortable header; others render plain.
const SERVER_SORTABLE_CONTACT_FIELDS = new Set([
  "firstName",
  "lastName",
  "companyName",
  "email",
  "engagementScore",
]);

function buildFilterConfig(filters: PeopleFilterState) {
  return {
    entityType: "CONTACT" as const,
    groupLogic: "AND" as const,
    groups: [{ conditions: peopleFiltersToConditions(filters) }],
  };
}

type ContactRowView = ContactModel & {
  externalId?: number | string;
  emailLocked?: boolean;
  phoneLocked?: boolean;
};

type SearchResponse = {
  data?: {
    contacts?: ContactRowView[];
    count?: number;
    nextCursor?: string | null;
    maribizCount?: number;
    apolloCount?: number;
    warnings?: string[];
  };
  error?: { message?: string };
};

function isMaribizRow(row: ContactRowView): boolean {
  return row.id.startsWith("maribiz:");
}

function isApolloRow(row: ContactRowView): boolean {
  return row.id.startsWith("apollo:");
}

function isExternalRow(row: ContactRowView): boolean {
  return isMaribizRow(row) || isApolloRow(row);
}

type VesselLoadState =
  | { status: "loading" }
  | { status: "loaded"; rows: AssociatedVesselView[] }
  | { status: "error"; message: string };

export function ContactFinder() {
  const [filters, setFilters] = useState<PeopleFilterState>(EMPTY_PEOPLE_FILTERS);
  const [contacts, setContacts] = useState<ContactRowView[]>([]);
  const [count, setCount] = useState(0);
  const [maribizCount, setMaribizCount] = useState(0);
  // apolloCount was surfaced in a pill, then removed with the Apollo-name
  // cleanup. Keep the setter (feed API still returns it) but drop the
  // unused reader.
  const [, setApolloCount] = useState(0);
  const [secondaryWarning, setSecondaryWarning] = useState(false);
  const [apolloWarning, setApolloWarning] = useState(false);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [revealing, setRevealing] = useState<Map<string, "email" | "phone">>(new Map());
  const [cursor, setCursor] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(null);
  const sortRef = useRef<SortState>(null);
  sortRef.current = sort;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [selectedVessels, setSelectedVessels] = useState<Set<string>>(new Set());
  const [showVesselModal, setShowVesselModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [associationCounts, setAssociationCounts] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [vesselLoadState, setVesselLoadState] = useState<Record<string, VesselLoadState>>({});

  const allColumns = useMemo(() => contactTableColumns(), []);
  const { columns, orderedAll, lockedColumns, save, reset } = useColumnPreferences("contacts", allColumns);

  const reqId = useRef(0);

  async function loadAssociationCounts(contactIds: string[]) {
    if (contactIds.length === 0) return;
    try {
      const response = await fetch(`/api/associations/contacts/counts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as AssociationCountsResponse;
      setAssociationCounts((prev) => ({ ...prev, ...payload.counts }));
    } catch {
      // Counts are decorative; keep the table usable if the association API fails.
    }
  }

  // Hydrate the per-user saved/bookmark state once on mount.
  useEffect(() => {
    apiFetch(`/api/saved/ids`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { data?: { contactIds?: string[] } } | null) => {
        if (p?.data?.contactIds) setSavedIds(new Set(p.data.contactIds));
      })
      .catch(() => {});
  }, []);

  async function toggleSaved(id: string) {
    const isSaved = savedIds.has(id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      if (isSaved) {
        await apiFetch(`/api/saved/${id}`, { method: "DELETE" });
      } else {
        await apiFetch(`/api/saved`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId: id }),
        });
      }
    } catch {
      // Revert optimistic update on failure.
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  }

  async function revealApollo(contact: ContactRowView, field: "email" | "phone") {
    if (!contact.externalId) return;
    const key = `${contact.id}:${field}`;
    if (revealing.has(key)) return;
    setRevealing((prev) => new Map(prev).set(key, field));
    try {
      const response = await apiFetch(
        `/api/contacts/reveal-apollo/${contact.externalId}/${field}`,
        { method: "POST" },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
        const code = body?.error?.code;
        const msg =
          code === "INSUFFICIENT_CREDITS"
            ? "Out of credits — upgrade your plan to reveal more"
            : body?.error?.message ?? "Failed to reveal";
        setToast(msg);
        setTimeout(() => setToast(null), 5000);
        return;
      }
      const payload = (await response.json()) as { data: { contact: ContactModel; balance: number } };
      const updated: ContactRowView = payload.data.contact;
      setContacts((prev) => prev.map((row) => (row.id === contact.id ? updated : row)));
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

  async function importContact(contact: ContactRowView) {
    if (!contact.externalId || importing.has(contact.id)) return;
    setImporting((prev) => new Set(prev).add(contact.id));
    try {
      const response = await apiFetch(`/api/contacts/import-maribiz/${contact.externalId}`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setToast(body?.error?.message ?? "Failed to save contact");
        setTimeout(() => setToast(null), 4000);
        return;
      }
      const payload = (await response.json()) as { data: { contact: ContactModel; created: boolean } };
      const newRow: ContactRowView = payload.data.contact;
      setContacts((prev) => prev.map((row) => (row.id === contact.id ? newRow : row)));
      setMaribizCount((m) => Math.max(0, m - 1));
      setToast(payload.data.created ? "Saved to your contacts" : "Already in your contacts");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setImporting((prev) => {
        const next = new Set(prev);
        next.delete(contact.id);
        return next;
      });
    }
  }

  const runSearch = useCallback(
    async (filtersToUse: PeopleFilterState, nextCursor: string | null) => {
      const isAppend = nextCursor !== null;
      if (isAppend) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      const myReq = ++reqId.current;
      try {
        const r = await apiFetch(`/api/contacts/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filterConfig: {
              ...buildFilterConfig(filtersToUse),
              // Server sorts the whole result set by this (allowlisted) field.
              ...(sortRef.current ? { sortBy: { field: sortRef.current.key, direction: sortRef.current.direction } } : {}),
            },
            limit: PAGE_SIZE,
            ...(nextCursor ? { cursor: nextCursor } : {}),
          }),
        });
        const payload = (await r.json()) as SearchResponse;
        if (myReq !== reqId.current) return; // stale response
        if (!r.ok) throw new Error(payload.error?.message ?? "Search failed");
        const page = payload.data?.contacts ?? [];
        setContacts((prev) => (isAppend ? [...prev, ...page] : page));
        setCount(payload.data?.count ?? page.length);
        setCursor(payload.data?.nextCursor ?? null);
        if (!isAppend) {
          setMaribizCount(payload.data?.maribizCount ?? 0);
          setApolloCount(payload.data?.apolloCount ?? 0);
          const warnings = payload.data?.warnings ?? [];
          setSecondaryWarning(warnings.includes("secondary_unavailable"));
          setApolloWarning(warnings.includes("apollo_unavailable"));
        }
        const primaryIds = page.filter((c) => !isExternalRow(c)).map((c) => c.id);
        void loadAssociationCounts(primaryIds);
      } catch (err) {
        if (myReq === reqId.current) setError((err as Error).message);
      } finally {
        if (myReq === reqId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  // Header click → cycle asc/desc/clear, then re-run the search from the first
  // page so the server re-orders the entire result set (not just loaded rows).
  const onSortColumn = useCallback(
    (key: string) => {
      const next: SortState =
        sortRef.current?.key !== key
          ? { key, direction: "asc" }
          : sortRef.current.direction === "asc"
            ? { key, direction: "desc" }
            : null;
      setSort(next);
      sortRef.current = next;
      setSelected(new Set());
      setCursor(null);
      runSearch(filters, null);
    },
    [filters, runSearch],
  );

  // Debounced search whenever filters change.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelected(new Set());
      runSearch(filters, null);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [filters, runSearch]);

  const allIds = contacts.filter((c) => !isExternalRow(c)).map((c) => c.id);
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

  function handleDone(listName: string, added: number) {
    setShowModal(false);
    setSelected(new Set());
    setToast(`${added} contact${added !== 1 ? "s" : ""} added to "${listName}"`);
    setTimeout(() => setToast(null), 4000);
  }

  function handleVesselsDone(listName: string, added: number) {
    setShowVesselModal(false);
    setSelectedVessels(new Set());
    setToast(`${added} vessel${added !== 1 ? "s" : ""} added to "${listName}"`);
    setTimeout(() => setToast(null), 4000);
  }

  const selectedIds = Array.from(selected);
  const selectedVesselIds = Array.from(selectedVessels);

  /**
   * Export the selected contacts as CSV.
   *
   * There is no server-side contacts export endpoint (unlike vessels), and the
   * rows are already in memory, so we build the file client-side — instant, no
   * round-trip, no credits. Values are RFC-4180 quoted so commas/quotes in
   * titles and company names can't corrupt the columns.
   */
  function handleExport() {
    const rows = contacts.filter((c) => selected.has(c.id));
    if (rows.length === 0) return;
    setExporting(true);
    try {
      const headers = ["First name", "Last name", "Title", "Company", "Email", "Mobile", "Country", "LinkedIn"];
      const cell = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [
        headers.join(","),
        ...rows.map((c) =>
          [
            c.firstName,
            c.lastName,
            c.title,
            c.companyName,
            // Never leak a masked preview into a file the user will trust.
            isApolloRow(c) && c.emailLocked ? "" : c.email,
            c.mobilePhone,
            c.country,
            c.personLinkedinUrl,
          ]
            .map(cell)
            .join(","),
        ),
      ].join("\n");

      const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setToast(`Exported ${rows.length} contact${rows.length !== 1 ? "s" : ""}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setExporting(false);
    }
  }

  /** Add a tag to every selected contact (merged with their existing tags). */
  async function handleBulkTag() {
    if (selectedIds.length === 0) return;

    // Directory/Apollo previews aren't rows in our DB yet — PATCHing their
    // synthetic ids would 404. Only saved contacts can carry tags.
    const byId = new Map(contacts.map((c) => [c.id, c]));
    const taggable = selectedIds.filter((id) => {
      const row = byId.get(id);
      return row ? !isExternalRow(row) : false;
    });
    const skipped = selectedIds.length - taggable.length;

    if (taggable.length === 0) {
      setToast("Those contacts aren't saved yet — add them to a list first, then tag them.");
      setTimeout(() => setToast(null), 5000);
      return;
    }

    const raw = window.prompt(
      `Tag ${taggable.length} contact${taggable.length !== 1 ? "s" : ""} with:${
        skipped > 0 ? `\n\n(${skipped} unsaved preview${skipped !== 1 ? "s" : ""} will be skipped.)` : ""
      }`,
    );
    const tag = raw?.trim();
    if (!tag) return;

    setTagging(true);
    let ok = 0;
    try {
      await Promise.all(
        taggable.map(async (id) => {
          const existing = byId.get(id)?.tags ?? [];
          if (existing.some((t) => t.toLowerCase() === tag.toLowerCase())) {
            ok += 1; // already tagged — count as success, don't re-write
            return;
          }
          const res = await apiFetch(`/api/contacts/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags: [...existing, tag] }),
          });
          if (res.ok) ok += 1;
        }),
      );
      setToast(
        ok === taggable.length
          ? `Tagged ${ok} contact${ok !== 1 ? "s" : ""} with "${tag}"${skipped > 0 ? ` · ${skipped} skipped` : ""}`
          : `Tagged ${ok} of ${taggable.length} — some failed`,
      );
    } catch {
      setToast("Tagging failed — please try again");
    } finally {
      setTagging(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  async function toggleExpand(contactId: string) {
    const isOpen = expanded.has(contactId);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
    if (isOpen || vesselLoadState[contactId]?.status === "loaded" || vesselLoadState[contactId]?.status === "loading") {
      return;
    }
    setVesselLoadState((prev) => ({ ...prev, [contactId]: { status: "loading" } }));
    try {
      const response = await fetch(`/api/associations/contacts/${contactId}/vessels`);
      if (!response.ok) {
        setVesselLoadState((prev) => ({ ...prev, [contactId]: { status: "error", message: `Failed (${response.status})` } }));
        return;
      }
      const data = (await response.json()) as AssociatedVesselsResponse;
      setVesselLoadState((prev) => ({ ...prev, [contactId]: { status: "loaded", rows: data.rows } }));
      setAssociationCounts((prev) => ({ ...prev, [contactId]: data.rows.length }));
    } catch (err) {
      setVesselLoadState((prev) => ({
        ...prev,
        [contactId]: { status: "error", message: err instanceof Error ? err.message : "Network error" },
      }));
    }
  }

  function toggleAssociatedVessel(vesselId: string) {
    setSelectedVessels((prev) => {
      const next = new Set(prev);
      if (next.has(vesselId)) next.delete(vesselId);
      else next.add(vesselId);
      return next;
    });
  }

  return (
    <>
      {showCustomizer && (
        <ColumnCustomizer
          title="Customize contact columns"
          lockedColumns={lockedColumns}
          orderedAll={orderedAll}
          onClose={() => setShowCustomizer(false)}
          onSave={save}
          onReset={reset}
        />
      )}

      {showModal && (
        <ContactAddToListModal contactIds={selectedIds} onClose={() => setShowModal(false)} onDone={handleDone} />
      )}

      {showVesselModal && (
        <VesselAddToListModal vesselIds={selectedVesselIds} onClose={() => setShowVesselModal(false)} onDone={handleVesselsDone} />
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg">
          {toast}
        </div>
      )}

      <div className="space-y-5">
        <PeopleFilters
          value={filters}
          onChange={setFilters}
          onReset={() => setFilters(EMPTY_PEOPLE_FILTERS)}
          orientation="horizontal"
        />

        <section className="min-w-0 space-y-4">
          {/* Compact result line. This used to be a full hero card repeating the
              page's own <h1> ("People") and the breadcrumb ("Contacts") — three
              titles and ~180px of chrome before the first row of data. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {loading ? "Searching…" : `${count.toLocaleString("en")} contact${count === 1 ? "" : "s"}`}
            </h2>
            {maribizCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                <Database className="h-3.5 w-3.5" />
                {maribizCount.toLocaleString("en")} from the directory
              </span>
            )}
            {/* Legend so the row-level status dot is learnable, not guesswork. */}
            <span className="ml-auto flex items-center gap-3 text-xs text-slate-500 dark:text-white/45">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                Verified
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                Unverified
              </span>
            </span>
          </div>

          {secondaryWarning && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>Contact directory temporarily unreachable; showing primary results only.</span>
            </div>
          )}
          {apolloWarning && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>Some external contacts are temporarily unavailable; showing internal results only.</span>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600 dark:text-white/70">
                <button
                  onClick={() => setShowCustomizer(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 hover:border-ocean hover:text-ocean"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Customize
                </button>
                <MotionButton
                  type="button"
                  size="sm"
                  icon={<ListPlus className="size-4" />}
                  onClick={() => { if (selectedIds.length > 0) setShowModal(true); }}
                  disabled={selectedIds.length === 0}
                  label={`Add to List${selected.size > 0 ? ` (${selected.size})` : ""}`}
                />
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={selectedIds.length === 0 || exporting}
                  title={selectedIds.length === 0 ? "Select contacts to export" : "Download the selected contacts as CSV"}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40 enabled:hover:border-ocean enabled:hover:text-ocean dark:border-white/10"
                >
                  {exporting && <Loader2 className="h-3 w-3 animate-spin" />}
                  Export CSV{selected.size > 0 ? ` (${selected.size})` : ""}
                </button>
                <button
                  type="button"
                  onClick={handleBulkTag}
                  disabled={selectedIds.length === 0 || tagging}
                  title={selectedIds.length === 0 ? "Select contacts to tag" : "Add a tag to the selected contacts"}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40 enabled:hover:border-ocean enabled:hover:text-ocean dark:border-white/10"
                >
                  {tagging && <Loader2 className="h-3 w-3 animate-spin" />}
                  Bulk Tag{selected.size > 0 ? ` (${selected.size})` : ""}
                </button>
              </div>
            </div>
            <div className="max-h-[calc(100vh-260px)] overflow-auto overscroll-x-contain">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-white/[0.06]">
                <thead className="sticky top-0 z-30 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226,232,240)] dark:bg-[#0F0F11] dark:text-white/50 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
                  <tr>
                    <th className="sticky left-0 top-0 z-40 bg-slate-50 px-2 py-3" />
                    <th className="sticky left-8 top-0 z-40 bg-slate-50 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        disabled={contacts.length === 0}
                        className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                      />
                    </th>
                    {columns.map((col) => {
                      const key = col.sortKey ?? col.id;
                      const serverSortable = SERVER_SORTABLE_CONTACT_FIELDS.has(key);
                      const sticky = col.id === "firstName" ? "sticky left-20 top-0 z-40 bg-slate-50" : "";
                      return col.sortable === false || !serverSortable ? (
                        <th key={col.id} className={`whitespace-nowrap px-4 py-3 ${sticky}`}>
                          {col.label}
                        </th>
                      ) : (
                        <SortableHeader
                          key={col.id}
                          label={col.label}
                          sortKey={key}
                          sort={sort}
                          onSort={onSortColumn}
                          className={sticky}
                        />
                      );
                    })}
                    <th className="sticky right-0 top-0 z-40 bg-slate-50 px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={columns.length + 3}>
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-sm text-red-600" colSpan={columns.length + 3}>{error}</td>
                    </tr>
                  ) : contacts.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={columns.length + 3}>No contacts found.</td>
                    </tr>
                  ) : (
                    contacts.map((contact) => {
                      const isOpen = expanded.has(contact.id);
                      // Pinned cells must be OPAQUE. A translucent selected tint
                      // (bg-ocean/5) lets the horizontally-scrolling columns show
                      // through the frozen Name column and strike across the text
                      // — the same bug that hit Port Radar.
                      const stickyBg = selected.has(contact.id)
                        ? "bg-[#F4F6FF] dark:bg-[#151A2E]"
                        : "bg-white dark:bg-[#0F0F11]";
                      return (
                      <Fragment key={contact.id}>
                      <tr className={`hover:bg-slate-50 dark:hover:bg-white/[0.03] ${selected.has(contact.id) ? "bg-ocean/5" : ""}`}>
                        <td className={`sticky left-0 z-10 px-2 py-3 ${stickyBg}`}>
                          {!isExternalRow(contact) ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(contact.id)}
                              aria-expanded={isOpen}
                              aria-label={isOpen ? "Collapse associated ships" : "Expand associated ships"}
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                            >
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          ) : null}
                        </td>
                        <td className={`sticky left-8 z-10 px-4 py-3 ${stickyBg}`}>
                          <input
                            type="checkbox"
                            checked={selected.has(contact.id)}
                            onChange={() => toggleOne(contact.id)}
                            disabled={isExternalRow(contact)}
                            className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean disabled:opacity-40"
                            title={isExternalRow(contact) ? "Save to your contacts first to include in lists" : undefined}
                          />
                        </td>
                        {columns.map((col) => {
                          if (col.id === "marineRole") {
                            return <td key={col.id} className="px-4 py-3 text-slate-600">{formatEnum(contact.marineRole)}</td>;
                          }
                          if (col.id === "seniority") {
                            return <td key={col.id} className="px-4 py-3 text-slate-600">{formatEnum(contact.seniority)}</td>;
                          }
                          if (col.id === "score") {
                            return (
                              <td key={col.id} className="px-4 py-3">
                                <div className="w-28">
                                  <div className="h-2 rounded bg-slate-100">
                                    <div className="h-2 rounded bg-ocean" style={{ width: `${Math.max(0, Math.min(contact.engagementScore, 100))}%` }} />
                                  </div>
                                  <p className="mt-1 text-xs font-semibold text-slate-600">{contact.engagementScore} - {scoreTier(contact.engagementScore)}</p>
                                </div>
                              </td>
                            );
                          }
                          const field = CONTACT_FIELD_BY_KEY.get(col.id);
                          const value = field ? contactFieldValue(contact, field) : "-";
                          const isFirst = col.id === "firstName";
                          return (
                            <td
                              key={col.id}
                              className={`max-w-[240px] truncate whitespace-nowrap px-4 py-3 text-slate-600 ${isFirst ? `sticky left-20 z-10 font-semibold text-slate-950 ${stickyBg}` : ""}`}
                              title={value}
                            >
                              {isFirst ? (
                                isMaribizRow(contact) ? (
                                  <div className="flex items-center gap-3">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-sky-100 text-xs font-semibold text-sky-700">{initials(contact)}</span>
                                    <span className="flex items-center gap-2">
                                      <span>{value}</span>
                                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-700">
                                        <Database className="h-3 w-3" />
                                        Directory
                                      </span>
                                    </span>
                                  </div>
                                ) : isApolloRow(contact) ? (
                                  <div className="flex items-center gap-3">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-200 text-xs font-semibold text-slate-600">{initials(contact)}</span>
                                    <span>{value}</span>
                                  </div>
                                ) : (
                                  <Link href={`/dashboard/contacts/${contact.id}`} className="flex items-center gap-3 hover:text-ocean">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-navy text-xs text-white">{initials(contact)}</span>
                                    {value}
                                  </Link>
                                )
                              ) : col.id === "email" ? (
                                isApolloRow(contact) && contact.emailLocked ? (
                                  <button
                                    type="button"
                                    onClick={() => revealApollo(contact, "email")}
                                    disabled={revealing.has(`${contact.id}:email`)}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                                    title="Unlock this email — 1 credit"
                                  >
                                    {revealing.get(`${contact.id}:email`) === "email" ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Lock className="h-3 w-3" />
                                    )}
                                    Reveal email
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    {/* Colour alone can't carry deliverability —
                                        give the dot a title + screen-reader text. */}
                                    <span
                                      title={
                                        contact.emailStatus === "VALID"
                                          ? "Verified — safe to send"
                                          : `Unverified (${formatEnum(contact.emailStatus ?? "UNKNOWN")}) — may bounce`
                                      }
                                      className={`h-2 w-2 shrink-0 rounded-full ${
                                        contact.emailStatus === "VALID" ? "bg-emerald-500" : "bg-amber-500"
                                      }`}
                                    />
                                    <span className="sr-only">
                                      {contact.emailStatus === "VALID" ? "Verified email." : "Unverified email."}
                                    </span>
                                    <span>{value}</span>
                                  </div>
                                )
                              ) : col.id === "mobilePhone" && isApolloRow(contact) && contact.phoneLocked ? (
                                <button
                                  type="button"
                                  onClick={() => revealApollo(contact, "phone")}
                                  disabled={revealing.has(`${contact.id}:phone`)}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                                  title="Unlock this phone — 1 credit"
                                >
                                  {revealing.get(`${contact.id}:phone`) === "phone" ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Lock className="h-3 w-3" />
                                  )}
                                  Reveal phone
                                </button>
                              ) : (
                                value
                              )}
                            </td>
                          );
                        })}
                        <td className="sticky right-0 z-10 bg-white px-4 py-3">
                          {isMaribizRow(contact) ? (
                            <button
                              type="button"
                              onClick={() => importContact(contact)}
                              disabled={importing.has(contact.id)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                              title="Add this contact to your workspace"
                            >
                              {importing.has(contact.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlusCircle className="h-3 w-3" />}
                              Save to my contacts
                            </button>
                          ) : isApolloRow(contact) ? (
                            <span className="text-[11px] font-medium text-sky-700">
                              Reveal to save
                            </span>
                          ) : (
                            <div className="flex items-center gap-2 text-slate-500">
                              <button
                                type="button"
                                onClick={() => toggleSaved(contact.id)}
                                aria-label={savedIds.has(contact.id) ? "Remove from saved" : "Save contact"}
                                title={savedIds.has(contact.id) ? "Saved — click to remove" : "Save contact"}
                                className="rounded p-0.5 hover:bg-slate-100"
                              >
                                <Bookmark
                                  className={savedIds.has(contact.id) ? "h-4 w-4 fill-ocean text-ocean" : "h-4 w-4 text-slate-400 hover:text-ocean"}
                                />
                              </button>
                              {/* These sit in the ACTIONS column, so they have to
                                  BE actions. Previously they were bare icons —
                                  green when data existed, inert always — which
                                  read as buttons and did nothing when clicked.
                                  Now: real tel:/profile links when we have the
                                  data, explicitly muted + labelled when we don't. */}
                              <ContactActionIcon
                                icon={Smartphone}
                                value={contact.mobilePhone}
                                href={contact.mobilePhone ? `tel:${contact.mobilePhone}` : null}
                                label="mobile"
                              />
                              <ContactActionIcon
                                icon={Phone}
                                value={contact.corporatePhone}
                                href={contact.corporatePhone ? `tel:${contact.corporatePhone}` : null}
                                label="office phone"
                              />
                              <ContactActionIcon
                                icon={Linkedin}
                                value={contact.personLinkedinUrl}
                                href={contact.personLinkedinUrl}
                                label="LinkedIn profile"
                                external
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr key={`${contact.id}:vessels`} className="bg-slate-50/70">
                          <td colSpan={columns.length + 3} className="px-3 py-3">
                            <AssociatedVesselsSubrow
                              contactName={`${contact.firstName} ${contact.lastName}`.trim()}
                              state={vesselLoadState[contact.id]}
                              selectedVessels={selectedVessels}
                              onToggleVessel={toggleAssociatedVessel}
                            />
                          </td>
                        </tr>
                      ) : null}
                      </Fragment>
                    );})
                  )}
                </tbody>
              </table>
            </div>
            {cursor && !loading && (
              <div className="border-t border-slate-200 px-4 py-3 text-center">
                <button
                  onClick={() => runSearch(filters, cursor)}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-ocean hover:text-ocean disabled:opacity-50"
                >
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                  Load more ({contacts.length} of {count.toLocaleString("en")})
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function AssociatedVesselsSubrow({
  contactName,
  state,
  selectedVessels,
  onToggleVessel,
}: {
  contactName: string;
  state: VesselLoadState | undefined;
  selectedVessels: Set<string>;
  onToggleVessel: (vesselId: string) => void;
}) {
  if (!state || state.status === "loading") {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading associated ships…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        Couldn&apos;t load ships: {state.message}
      </div>
    );
  }
  if (state.rows.length === 0) {
    return <div className="px-1 py-2 text-sm text-slate-500">No ships are associated with {contactName || "this contact"}.</div>;
  }
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-10 px-3 py-2" />
            {["Ship", "IMO", "Type", "Flag", "DWT", "Manager", "Matched Value", "Matched Role", "Match Source", "Confidence"].map((label) => (
              <th key={label} className="whitespace-nowrap px-3 py-2">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {state.rows.map((vessel) => {
            const roles = vessel.matchedCompanies.map((company) => company.role).join(", ") || vessel.matchedRole;
            const manager = vessel.commercialManagerName ?? vessel.ismManagerName ?? vessel.operatorName ?? "-";
            return (
              <tr key={`${vessel.vesselId}:${vessel.matchedValue}:${vessel.matchedSource}`} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedVessels.has(vessel.vesselId)}
                    onChange={() => onToggleVessel(vessel.vesselId)}
                    className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                  />
                </td>
                <td className="max-w-[180px] truncate px-3 py-2 font-medium text-slate-900" title={vessel.vesselName}>
                  <Link href={`/dashboard/vessels/${vessel.imoNumber}`} className="hover:text-ocean">{vessel.vesselName}</Link>
                </td>
                <td className="px-3 py-2 text-slate-600">{vessel.imoNumber}</td>
                <td className="max-w-[140px] truncate px-3 py-2 text-slate-600" title={formatEnum(vessel.vesselType)}>{formatEnum(vessel.vesselType)}</td>
                <td className="px-3 py-2 text-slate-600">{vessel.flag ?? "-"}</td>
                <td className="px-3 py-2 text-slate-600">{vessel.dwt?.toLocaleString("en") ?? "-"}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-slate-600" title={manager}>{manager}</td>
                <td className="max-w-[180px] truncate px-3 py-2 text-slate-600" title={vessel.matchedValue}>{vessel.matchedValue}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-slate-600" title={roles}>{roles}</td>
                <td className="max-w-[180px] truncate px-3 py-2 text-slate-600" title={vessel.matchedSource}>{vessel.matchedSource}</td>
                <td className="px-3 py-2 text-slate-600">{vessel.confidence}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
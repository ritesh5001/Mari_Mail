"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, SlidersHorizontal } from "lucide-react";
import type {
  MarineVesselContactView,
  MarineVesselContactsResponse,
  MarineVesselRowView,
} from "@/lib/marine-row-views";
import { VESSEL_SCHEMA_FIELDS, type VesselSchemaField } from "@/lib/vessel-schema";
import { marineDbColumns, type TableColumn } from "@/lib/table-columns";
import { useColumnPreferences } from "@/hooks/useColumnPreferences";
import { ColumnCustomizer } from "@/components/table/ColumnCustomizer";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; rows: MarineVesselContactView[] }
  | { status: "error"; message: string };

const VESSEL_FIELD_BY_KEY = new Map<string, VesselSchemaField>(
  VESSEL_SCHEMA_FIELDS.map((field) => [field.key, field]),
);

const SUBROW_COLUMNS = [
  "Name",
  "Email",
  "Company",
  "Title",
  "Country",
  "Website",
  "Matched Value",
  "Matched Role",
  "Match Source",
  "Confidence",
];

function displayCell(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "" || value === "-") {
    return <span className="text-slate-300 dark:text-white/35">-</span>;
  }
  return value;
}

function joinList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "-";
}

/** Sticky positioning for the two pinned data columns, keyed by column id. */
function stickyHeadClass(id: string) {
  if (id === "associatedContacts" || id === "vesselName") {
    // top-0 + high z so these header cells pin at the top-left corner,
    // above both the scrolling rows and the sticky-left body cells.
    return "sticky top-0 z-50 bg-slate-50 dark:bg-[#0E0E12]";
  }
  return "";
}
function stickyBodyClass(id: string) {
  if (id === "associatedContacts" || id === "vesselName") {
    return "sticky z-20 bg-white group-hover:bg-slate-50 dark:bg-[#0B0B0E] dark:group-hover:bg-[#111116]";
  }
  return "";
}
function stickyStyle(id: string): React.CSSProperties | undefined {
  if (id === "associatedContacts") return { left: "40px", minWidth: "150px" };
  if (id === "vesselName") return { left: "190px" };
  return undefined;
}

export function MarineDbTable({ rows }: { rows: MarineVesselRowView[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadState, setLoadState] = useState<Record<string, LoadState>>({});
  const [showCustomizer, setShowCustomizer] = useState(false);

  const allColumns = useMemo(() => marineDbColumns(), []);
  const { columns, orderedAll, lockedColumns, save, reset } = useColumnPreferences("marine-db", allColumns);

  // expand toggle column + the visible data columns
  const colSpan = columns.length + 1;

  async function toggle(vesselId: string) {
    const isOpen = expanded.has(vesselId);
    const next = new Set(expanded);
    if (isOpen) {
      next.delete(vesselId);
      setExpanded(next);
      return;
    }
    next.add(vesselId);
    setExpanded(next);
    if (loadState[vesselId]?.status === "loaded" || loadState[vesselId]?.status === "loading") {
      return;
    }
    setLoadState((prev) => ({ ...prev, [vesselId]: { status: "loading" } }));
    try {
      const response = await fetch(`/api/marine-db/vessels/${vesselId}/contacts`, {
        });
      if (!response.ok) {
        setLoadState((prev) => ({
          ...prev,
          [vesselId]: { status: "error", message: `Failed (${response.status})` },
        }));
        return;
      }
      const data = (await response.json()) as MarineVesselContactsResponse;
      setLoadState((prev) => ({
        ...prev,
        [vesselId]: { status: "loaded", rows: data.rows },
      }));
    } catch (err) {
      setLoadState((prev) => ({
        ...prev,
        [vesselId]: { status: "error", message: err instanceof Error ? err.message : "Network error" },
      }));
    }
  }

  return (
    <>
      {showCustomizer && (
        <ColumnCustomizer
          title="Customize marine DB columns"
          lockedColumns={lockedColumns}
          orderedAll={orderedAll}
          onClose={() => setShowCustomizer(false)}
          onSave={save}
          onReset={reset}
        />
      )}

      <div className="flex justify-end border-b border-slate-200 px-4 py-2 dark:border-[#202026]">
        <button
          onClick={() => setShowCustomizer(true)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-ocean hover:text-ocean dark:border-[#262631] dark:text-white/60"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Customize columns
        </button>
      </div>

      <div className="max-h-[calc(100vh-230px)] overflow-auto overscroll-x-contain">
        <table className="text-sm">
          <thead className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226,232,240)] dark:border-[#202026] dark:bg-[#0E0E12] dark:text-white/45">
            <tr>
              <th className="sticky left-0 top-0 z-50 w-10 bg-slate-50 px-2 py-3 dark:bg-[#0E0E12]" />
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={`whitespace-nowrap px-3 py-3 ${stickyHeadClass(col.id)}`}
                  style={stickyStyle(col.id)}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#1B1B20]">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={colSpan}>
                  No vessels match the current filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isOpen = expanded.has(row.vesselId);
                const state = loadState[row.vesselId];
                return (
                  <VesselRowBlock
                    key={row.vesselId}
                    row={row}
                    columns={columns}
                    colSpan={colSpan}
                    isOpen={isOpen}
                    state={state}
                    onToggle={toggle}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function marineCellValue(row: MarineVesselRowView, col: TableColumn) {
  switch (col.id) {
    case "associatedContacts":
      return row.associatedContactCount.toLocaleString("en");
    case "matchedValue":
      return joinList(row.matchedValues);
    case "matchedRole":
      return joinList(row.matchedRoles);
    case "matchSource":
      return joinList(row.matchedSources);
    case "confidence":
      return joinList(row.matchConfidences);
    default: {
      const field = VESSEL_FIELD_BY_KEY.get(col.id);
      return field ? row.schemaValues[field.label] ?? "-" : "-";
    }
  }
}

function VesselRowBlock({
  row,
  columns,
  colSpan,
  isOpen,
  state,
  onToggle,
}: {
  row: MarineVesselRowView;
  columns: TableColumn[];
  colSpan: number;
  isOpen: boolean;
  state: LoadState | undefined;
  onToggle: (vesselId: string) => void;
}) {
  return (
    <>
      <tr className="group transition-colors hover:bg-slate-50 dark:hover:bg-[#111116]">
        <td className="sticky left-0 z-20 w-10 bg-white px-2 py-3 group-hover:bg-slate-50 dark:bg-[#0B0B0E] dark:group-hover:bg-[#111116]">
          <button
            type="button"
            onClick={() => onToggle(row.vesselId)}
            aria-expanded={isOpen}
            aria-label={isOpen ? "Collapse vessel" : "Expand vessel"}
            className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-white/45 dark:hover:bg-[#20202A] dark:hover:text-white/75"
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        {columns.map((col) => {
          const value = marineCellValue(row, col);
          const isVesselName = col.id === "vesselName";
          const isAssociated = col.id === "associatedContacts";
          const base = isAssociated
            ? "whitespace-nowrap px-3 py-3 text-slate-700 dark:text-white/60"
            : "max-w-[220px] truncate whitespace-nowrap px-3 py-3 text-slate-700 dark:text-white/60";
          return (
            <td
              key={col.id}
              className={`${base} ${stickyBodyClass(col.id)} ${isVesselName ? "font-semibold text-slate-950 dark:text-white/90" : ""}`}
              style={stickyStyle(col.id)}
              title={typeof value === "string" ? value : undefined}
            >
              {isVesselName && row.imoNumber ? (
                <Link href={`/dashboard/vessels/${row.imoNumber}`} className="hover:text-ocean dark:hover:text-accent-300">
                  {value}
                </Link>
              ) : (
                displayCell(value)
              )}
            </td>
          );
        })}
      </tr>
      {isOpen ? (
        <tr className="bg-slate-50/60 dark:bg-[#0F0F13]">
          <td colSpan={colSpan} className="px-3 py-3">
            <SubrowArea row={row} state={state} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function SubrowArea({ row, state }: { row: MarineVesselRowView; state: LoadState | undefined }) {
  if (!state || state.status === "loading") {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-sm text-slate-500 dark:text-white/55">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading associated contacts…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">
        Couldn&apos;t load contacts: {state.message}
      </div>
    );
  }
  if (state.rows.length === 0) {
    return (
      <div className="px-1 py-2 text-sm text-slate-500 dark:text-white/55">
        No contacts are associated with {row.vesselName}.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white dark:border-[#202026] dark:bg-[#0B0B0E]">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-[#202026] dark:bg-[#111116] dark:text-white/45">
          <tr>
            {SUBROW_COLUMNS.map((label) => (
              <th key={label} className="whitespace-nowrap px-3 py-2">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-[#1B1B20]">
          {state.rows.map((contact) => {
            const roles = contact.matchedCompanies.map((c) => c.role).join(", ") || "-";
            return (
              <tr key={`${contact.contactId}:${contact.matchedValue}:${contact.matchedSource}`} className="transition-colors hover:bg-slate-50 dark:hover:bg-[#111116]">
                <td className="max-w-[180px] truncate px-3 py-2 font-medium text-slate-900 dark:text-white/85" title={contact.fullName}>{contact.fullName}</td>
                <td className="max-w-[200px] truncate px-3 py-2 text-slate-700 dark:text-white/60" title={contact.email ?? undefined}>{displayCell(contact.email)}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-slate-700 dark:text-white/60" title={contact.companyName ?? undefined}>
                  {displayCell(contact.companyName)}
                </td>
                <td className="max-w-[200px] truncate px-3 py-2 text-slate-700 dark:text-white/60" title={contact.jobTitle ?? undefined}>
                  {displayCell(contact.jobTitle)}
                </td>
                <td className="max-w-[120px] truncate px-3 py-2 text-slate-700 dark:text-white/60" title={contact.country ?? undefined}>{displayCell(contact.country)}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-slate-700 dark:text-white/60" title={contact.website ?? undefined}>
                  {displayCell(contact.website)}
                </td>
                <td className="max-w-[160px] truncate px-3 py-2 text-slate-700 dark:text-white/60" title={contact.matchedValue}>{contact.matchedValue}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-slate-700 dark:text-white/60" title={roles}>
                  {displayCell(roles)}
                </td>
                <td className="max-w-[120px] truncate px-3 py-2 text-slate-700 dark:text-white/60" title={contact.matchedSource}>{contact.matchedSource}</td>
                <td className="max-w-[80px] truncate px-3 py-2 text-slate-700 dark:text-white/60">{contact.confidence}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

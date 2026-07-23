import { VESSEL_SCHEMA_FIELDS } from "@/lib/vessel-schema";
import { CONTACT_SCHEMA_FIELDS } from "@/lib/contact-schema";

/**
 * Normalized column descriptor shared by every customizable table. It decouples
 * the persisted column preferences (order + visibility) from the underlying
 * schema shape so the customizer and the persistence hook never need to know
 * about vessels vs. contacts.
 */
export type TableColumn = {
  /** Stable identity. For schema columns this is the schema `key`; for extras a literal. */
  id: string;
  label: string;
  /** Optional grouping used to organize the customizer list. */
  group?: string;
  /** Locked columns can never be hidden or reordered (sticky / structural columns). */
  locked?: boolean;
  /** Hidden on first load (used to trim the very wide vessel schema by default). */
  defaultHidden?: boolean;
  /**
   * Sort key for this column. Defaults to `id`. Set `sortable: false` to opt a
   * column out of sorting (e.g. actions / computed columns with no order). When
   * a table sorts server-side, this key is what the feed's orderBy allowlist
   * maps to a Prisma column.
   */
  sortKey?: string;
  sortable?: boolean;
};

/** Persisted unit — one entry per movable column. */
export type ColumnPref = { id: string; visible: boolean };
/** Versioned storage envelope so we can invalidate on breaking changes. */
export type StoredColumnPrefs = { v: 1; order: ColumnPref[] };

export const COLUMN_PREFS_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Table column definitions
// ---------------------------------------------------------------------------

/**
 * Vessel schema columns we keep visible by default. Everything else in the
 * 100+ field schema starts hidden so the table is usable out of the box.
 */
const VESSEL_DEFAULT_VISIBLE = new Set<string>([
  "vesselName",
  "flag",
  "imoNumber",
  "etaUtc",
  "destination",
  "shipOwner",
  "commercialManagerName",
  "ismManagerName",
  "mmsi",
  "vesselTypeDetailed",
  "dwt",
  "grossTonnage",
  "builtYear",
]);

export function vesselTableColumns(): TableColumn[] {
  return [
    // Computed/relational columns have no simple sort key.
    { id: "associatedContacts", label: "Associated Contacts", group: "Match", sortable: false },
    ...VESSEL_SCHEMA_FIELDS.map<TableColumn>((field) => ({
      id: field.key,
      label: field.label,
      group: field.group,
      locked: field.key === "vesselName",
      defaultHidden: field.key === "vesselName" ? false : !VESSEL_DEFAULT_VISIBLE.has(field.key),
      sortKey: field.key,
    })),
    { id: "eta", label: "ETA", group: "Voyage", sortable: false },
    { id: "linkedOwner", label: "Linked Owner", group: "Ownership and Management", sortable: false },
    { id: "campaign", label: "Campaign", group: "Voyage", sortable: false },
  ];
}

export function contactTableColumns(): TableColumn[] {
  return [
    { id: "associatedVessels", label: "Associated Ships", group: "Marine", sortable: false },
    ...CONTACT_SCHEMA_FIELDS.map<TableColumn>((field, index) => ({
      id: String(field.key),
      label: field.label,
      group: field.group,
      locked: index === 0,
      sortKey: String(field.key),
    })),
    { id: "marineRole", label: "Marine Role", group: "Marine", sortKey: "marineRole" },
    { id: "seniority", label: "Seniority", group: "Marine", sortKey: "seniority" },
    { id: "score", label: "Score", group: "Marine", sortKey: "engagementScore" },
  ];
}

const MARINE_MATCH_COLUMNS: TableColumn[] = [
  { id: "matchedValue", label: "Matched Value", group: "Match", sortable: false },
  { id: "matchedRole", label: "Matched Role", group: "Match", sortable: false },
  { id: "matchSource", label: "Match Source", group: "Match", sortable: false },
  { id: "confidence", label: "Confidence", group: "Match", sortable: false },
];

/**
 * Port Radar arrivals table columns — matches the ColumnKey union in
 * PortRadarArrivals.tsx. VesselName is pinned as the row label (the checkbox
 * + expand sit in un-customizable structural cells before it); everything
 * else is toggleable via the shared ColumnCustomizer drawer.
 */
export function portRadarColumns(): TableColumn[] {
  return [
    { id: "vesselName", label: "Vessel Name", group: "Identity", locked: true, sortable: false },
    { id: "flag", label: "Flag", group: "Identity", sortKey: "flag" },
    { id: "imo", label: "IMO", group: "Identity", sortKey: "imo" },
    { id: "type", label: "Type", group: "Identity", sortKey: "type" },
    { id: "etaUtc", label: "ETA (UTC)", group: "Voyage", sortKey: "etaUtc" },
    { id: "destination", label: "Destination", group: "Voyage", sortKey: "destination" },
    { id: "eta", label: "ETA countdown", group: "Voyage", sortKey: "eta" },
    { id: "campaign", label: "Campaign", group: "Voyage", sortable: false },
    { id: "voyage", label: "Voyage", group: "Voyage", sortKey: "voyage" },
    { id: "cargo", label: "Cargo", group: "Voyage", sortable: false },
    { id: "ais", label: "AIS", group: "Voyage", sortable: false },
    { id: "contacts", label: "Contacts", group: "Match", sortable: false },
    { id: "added", label: "Added", group: "Voyage", sortKey: "added" },
  ];
}

export function marineDbColumns(): TableColumn[] {
  return [
    { id: "associatedContacts", label: "Associated Contacts", group: "Match", locked: true, sortable: false },
    ...VESSEL_SCHEMA_FIELDS.map<TableColumn>((field) => ({
      id: field.key,
      label: field.label,
      group: field.group,
      locked: field.key === "vesselName",
      defaultHidden: field.key === "vesselName" ? false : !VESSEL_DEFAULT_VISIBLE.has(field.key),
      sortKey: field.key,
    })),
    ...MARINE_MATCH_COLUMNS,
  ];
}

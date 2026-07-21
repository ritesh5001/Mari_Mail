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
    { id: "associatedContacts", label: "Associated Contacts", group: "Match" },
    ...VESSEL_SCHEMA_FIELDS.map<TableColumn>((field) => ({
      id: field.key,
      label: field.label,
      group: field.group,
      locked: field.key === "vesselName",
      defaultHidden: field.key === "vesselName" ? false : !VESSEL_DEFAULT_VISIBLE.has(field.key),
    })),
    { id: "eta", label: "ETA", group: "Voyage" },
    { id: "linkedOwner", label: "Linked Owner", group: "Ownership and Management" },
    { id: "campaign", label: "Campaign", group: "Voyage" },
  ];
}

export function contactTableColumns(): TableColumn[] {
  return [
    { id: "associatedVessels", label: "Associated Ships", group: "Marine" },
    ...CONTACT_SCHEMA_FIELDS.map<TableColumn>((field, index) => ({
      id: String(field.key),
      label: field.label,
      group: field.group,
      locked: index === 0,
    })),
    { id: "marineRole", label: "Marine Role", group: "Marine" },
    { id: "seniority", label: "Seniority", group: "Marine" },
    { id: "score", label: "Score", group: "Marine" },
  ];
}

const MARINE_MATCH_COLUMNS: TableColumn[] = [
  { id: "matchedValue", label: "Matched Value", group: "Match" },
  { id: "matchedRole", label: "Matched Role", group: "Match" },
  { id: "matchSource", label: "Match Source", group: "Match" },
  { id: "confidence", label: "Confidence", group: "Match" },
];

export function marineDbColumns(): TableColumn[] {
  return [
    { id: "associatedContacts", label: "Associated Contacts", group: "Match", locked: true },
    ...VESSEL_SCHEMA_FIELDS.map<TableColumn>((field) => ({
      id: field.key,
      label: field.label,
      group: field.group,
      locked: field.key === "vesselName",
      defaultHidden: field.key === "vesselName" ? false : !VESSEL_DEFAULT_VISIBLE.has(field.key),
    })),
    ...MARINE_MATCH_COLUMNS,
  ];
}

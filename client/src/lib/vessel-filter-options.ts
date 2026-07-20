/**
 * Shared option lists for the vessel filter panel (Vessels page + Marine DB page).
 * Vessel types are grouped into broad commercial categories so the long enum is
 * approachable, MagicPort-style, with a "Select all" affordance per category.
 */
export const VESSEL_TYPE_CATEGORIES: { label: string; types: string[] }[] = [
  { label: "Container", types: ["CONTAINER"] },
  { label: "Tanker", types: ["TANKER_CRUDE", "TANKER_PRODUCT", "TANKER_CHEMICAL"] },
  { label: "Gas Carrier", types: ["TANKER_LPG", "TANKER_LNG"] },
  { label: "Bulk Carrier", types: ["BULK_CARRIER"] },
  { label: "General Cargo", types: ["GENERAL_CARGO", "HEAVY_LIFT", "BARGE"] },
  { label: "Ro-Ro", types: ["RORO"] },
  { label: "Passenger", types: ["FERRY", "CRUISE"] },
  { label: "Offshore", types: ["OFFSHORE_PSV", "OFFSHORE_AHTS", "OFFSHORE_DRILL", "SUPPLY_BOAT"] },
  { label: "Other", types: ["DREDGER", "RESEARCH", "OTHER"] },
];

export const VESSEL_STATUSES = ["ACTIVE", "LAID_UP", "SCRAPPED", "UNDER_CONSTRUCTION", "MISSING"];

export const ETA_CONFIDENCES = ["CONFIRMED", "ESTIMATED", "TENTATIVE"];

export const VOYAGE_STATUSES = ["AT_SEA", "AT_ANCHOR", "IN_PORT", "DRIFTING", "UNKNOWN"];

export function formatVesselEnum(value: string) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

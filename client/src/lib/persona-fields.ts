/**
 * Field metadata for editing a saved filter ("persona") outside the panel that
 * created it.
 *
 * Both stored shapes turn out to be FLAT — every value is either a string or an
 * array of strings — which is what makes a generic editor possible at all:
 *
 *   CONTACT  { keywords, includeTitles[], excludeTitles[], seniorities[],
 *              emailStatus[], employeeRanges[], personLocations[],
 *              companyLocations[], includeCompanies[], excludeCompanies[] }
 *   ETA      { etaFrom, etaTo, dwtMin, dwtMax, destCountry, destPort, vesselType }
 *
 * Without this table the Settings page could only rename and delete; the actual
 * contents would need the full Port Radar / Lists filter panels, which are far
 * too heavy to mount here and would drag their URL-state handling with them.
 *
 * Anything stored but not listed here still round-trips untouched — the editor
 * only writes back keys it knows, so an unrecognised field is preserved rather
 * than dropped.
 */
export type PersonaFieldKind = "text" | "date" | "number" | "chips" | "csv";

export type PersonaField = {
  key: string;
  label: string;
  kind: PersonaFieldKind;
  /** Shown under the input when the field needs a word of explanation. */
  hint?: string;
};

export const PERSONA_FIELDS: Record<"CONTACT" | "ETA" | "VESSEL" | "COMPANY", PersonaField[]> = {
  CONTACT: [
    { key: "includeTitles", label: "Job titles to include", kind: "chips" },
    { key: "excludeTitles", label: "Job titles to exclude", kind: "chips" },
    { key: "seniorities", label: "Seniority", kind: "chips" },
    { key: "emailStatus", label: "Email status", kind: "chips" },
    { key: "keywords", label: "Keywords", kind: "text" },
    { key: "personLocations", label: "Person locations", kind: "chips" },
    { key: "companyLocations", label: "Company locations", kind: "chips" },
    { key: "includeCompanies", label: "Companies to include", kind: "chips" },
    { key: "excludeCompanies", label: "Companies to exclude", kind: "chips" },
    { key: "employeeRanges", label: "Company size", kind: "chips" },
  ],
  ETA: [
    { key: "etaFrom", label: "Arriving from", kind: "date" },
    { key: "etaTo", label: "Arriving until", kind: "date" },
    { key: "destCountry", label: "Destination country", kind: "text", hint: "Two-letter code, e.g. IN" },
    { key: "destPort", label: "Destination ports", kind: "csv", hint: "UN/LOCODE port codes" },
    { key: "vesselType", label: "Vessel type", kind: "text" },
    { key: "dwtMin", label: "Minimum DWT", kind: "number" },
    { key: "dwtMax", label: "Maximum DWT", kind: "number" },
  ],
  // Neither is produced by any current panel; listed so the editor degrades to
  // rename/delete instead of throwing if one ever appears.
  VESSEL: [],
  COMPANY: [],
};

export type PersonaConfig = Record<string, unknown>;

/** Values a field can hold, normalised for rendering. */
export function readField(config: PersonaConfig, field: PersonaField): string[] {
  const raw = config[field.key];
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  const value = String(raw);
  if (!value) return [];
  return field.kind === "csv" ? value.split(",").map((part) => part.trim()).filter(Boolean) : [value];
}

/** Write values back in whatever shape the field was stored as. */
export function writeField(
  config: PersonaConfig,
  field: PersonaField,
  values: string[],
): PersonaConfig {
  const next = { ...config };
  if (field.kind === "chips") {
    next[field.key] = values;
  } else if (field.kind === "csv") {
    next[field.key] = values.join(",");
  } else {
    next[field.key] = values[0] ?? "";
  }
  return next;
}

/**
 * A one-line description of what a persona actually matches, for the list view.
 *
 * Reads the fields in the order they are declared above — which is priority
 * order, not storage order — so the most identifying part of a filter comes
 * first when the summary is truncated.
 */
export function summarizePersona(entityType: string, config: PersonaConfig): string {
  const fields = PERSONA_FIELDS[entityType as keyof typeof PERSONA_FIELDS] ?? [];
  const parts: string[] = [];
  for (const field of fields) {
    const values = readField(config, field);
    if (values.length === 0) continue;
    parts.push(values.length > 3 ? `${values.slice(0, 3).join(", ")} +${values.length - 3}` : values.join(", "));
  }
  return parts.length > 0 ? parts.join(" · ") : "Empty filter";
}

/** How many fields carry a value — the "3 filters" count on a persona row. */
export function countActive(entityType: string, config: PersonaConfig): number {
  const fields = PERSONA_FIELDS[entityType as keyof typeof PERSONA_FIELDS] ?? [];
  return fields.filter((field) => readField(config, field).length > 0).length;
}

/**
 * Field metadata for *describing* a saved filter ("persona") in a list.
 *
 * Editing is done by the real filter panels — see `PersonaManager` — so this
 * is only ever read, never written back through. It exists because the persona
 * list has to say what a set actually matches without mounting a 1900-line
 * filter panel per row.
 *
 * Both stored shapes are flat, which is what makes a generic summary possible:
 *
 *   CONTACT  { keywords, includeTitles[], excludeTitles[], seniorities[],
 *              emailStatus[], employeeRanges[], personLocations[],
 *              companyLocations[], includeCompanies[], excludeCompanies[] }
 *   ETA      { etaFrom, etaTo, dwtMin, dwtMax, destCountry, destPort, vesselType }
 *
 * The ETA panel writes many more keys than are listed below; the extras are
 * intentionally omitted so a summary stays a summary. Unlisted keys are simply
 * not described — nothing here drops or rewrites them.
 */
type PersonaFieldKind = "text" | "date" | "number" | "chips" | "csv";

type PersonaField = {
  key: string;
  label: string;
  kind: PersonaFieldKind;
};

const PERSONA_FIELDS: Record<string, PersonaField[]> = {
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
    { key: "destCountry", label: "Destination country", kind: "csv" },
    { key: "destPort", label: "Destination ports", kind: "csv" },
    { key: "vesselType", label: "Vessel type", kind: "csv" },
    { key: "etaFrom", label: "Arriving from", kind: "date" },
    { key: "etaTo", label: "Arriving until", kind: "date" },
    { key: "dwtMin", label: "Minimum DWT", kind: "number" },
    { key: "dwtMax", label: "Maximum DWT", kind: "number" },
    { key: "flag", label: "Flag", kind: "text" },
    { key: "owner", label: "Owner", kind: "text" },
    { key: "manager", label: "Manager", kind: "text" },
  ],
  VESSEL: [],
  COMPANY: [],
};

export type PersonaConfig = Record<string, unknown>;

/** Values a field holds, flattened for display. */
function readField(config: PersonaConfig, field: PersonaField): string[] {
  const raw = config[field.key];
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  const value = String(raw);
  if (!value) return [];
  return field.kind === "csv" ? value.split(",").map((part) => part.trim()).filter(Boolean) : [value];
}

/**
 * A one-line description of what a persona actually matches, for the list view.
 *
 * Reads the fields in the order they are declared above — which is priority
 * order, not storage order — so the most identifying part of a filter comes
 * first when the summary is truncated.
 */
export function summarizePersona(entityType: string, config: PersonaConfig): string {
  const fields = PERSONA_FIELDS[entityType] ?? [];
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
  const fields = PERSONA_FIELDS[entityType] ?? [];
  return fields.filter((field) => readField(config, field).length > 0).length;
}

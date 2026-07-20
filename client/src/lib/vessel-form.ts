import type { VesselFormInitial } from "@/components/marine/AddVesselModal";
import { VESSEL_SCHEMA_FIELDS } from "@/lib/vessel-schema";

type VesselLike = Record<string, unknown> & { imoNumber: string; vesselType?: string | null };

// Flattens a vessel record into the shape AddVesselModal wants for its
// `initial` prop — one key per editable schema field, plus imoNumber and
// vesselType. Nulls stay as null so the form knows "no value" vs empty string.
export function vesselToFormInitial(vessel: VesselLike): VesselFormInitial {
  const out: VesselFormInitial = {
    imoNumber: vessel.imoNumber,
    vesselType: (vessel.vesselType ?? "OTHER") as string,
  };
  for (const field of VESSEL_SCHEMA_FIELDS) {
    if (field.editable === false) continue;
    const value = vessel[field.key];
    if (value === undefined) continue;
    out[field.key] = value as string | number | null;
  }
  return out;
}

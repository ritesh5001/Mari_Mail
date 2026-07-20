"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import { VESSEL_SCHEMA_FIELDS } from "@/lib/vessel-schema";

const VESSEL_TYPES = [
  "BULK_CARRIER","TANKER_CRUDE","TANKER_PRODUCT","TANKER_CHEMICAL","TANKER_LPG","TANKER_LNG",
  "CONTAINER","GENERAL_CARGO","RORO","OFFSHORE_PSV","OFFSHORE_AHTS","OFFSHORE_DRILL",
  "FERRY","CRUISE","DREDGER","HEAVY_LIFT","BARGE","SUPPLY_BOAT","RESEARCH","OTHER",
] as const;

const inputCls = "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400 outline-none transition focus:border-accent-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/30";
const labelCls = "block text-xs font-medium text-slate-600 dark:text-white/60 mb-1";
const numericFields = new Set([
  "dwt",
  "grossTonnage",
  "netTonnage",
  "speed",
  "course",
  "draught",
  "lengthOverall",
  "width",
  "capacityDwt",
  "draughtMax",
  "draughtMin",
  "capacityGt",
  "capacityTeu",
  "capacityLiquidGas",
  "capacityPassengers",
  "lengthBetweenPerpendiculars",
  "depth",
  "breadthExtreme",
  "capacityLiquidOil",
  "builtYear",
]);
const schemaGroups = ["Priority", "Identity", "AIS and Position", "Dimensions and Capacity", "Commercial", "Ownership and Management", "Builders and Class"];
const editableSchemaFields = VESSEL_SCHEMA_FIELDS.filter((field) => field.editable !== false);

export type VesselFormInitial = { imoNumber: string } & Record<string, string | number | null | undefined>;

export function AddVesselModal({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: VesselFormInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const editMode = Boolean(initial);
  const originalImo = initial?.imoNumber ?? "";

  const [form, setForm] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = {
      vesselType: String(initial?.vesselType ?? "OTHER"),
      ...Object.fromEntries(editableSchemaFields.map((field) => [field.key, ""])),
    };
    if (!initial) return base;
    for (const field of editableSchemaFields) {
      const value = initial[field.key];
      if (value === null || value === undefined) continue;
      base[field.key] = String(value);
    }
    return base;
  });

  function set(field: string, value: string) { setForm((p) => ({ ...p, [field]: value })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body: Record<string, unknown> = {
      imoNumber: form.imoNumber,
      vesselName: form.vesselName,
      vesselType: form.vesselType,
    };
    for (const field of editableSchemaFields) {
      const raw = form[String(field.key)]?.trim();
      // On edit we intentionally submit empty strings as "" so that clearing a
      // field wipes it server-side; on create we skip empty fields to avoid
      // storing meaningless "".
      if (!editMode && !raw) continue;
      body[String(field.key)] = numericFields.has(String(field.key)) && raw ? Number(raw.replace(/,/g, "")) : raw;
    }

    const url = editMode ? `/api/vessels/${originalImo}` : `/api/vessels`;
    const method = editMode ? "PATCH" : "POST";
    const res = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { error?: { message?: string } };
    if (!res.ok) { setError(json.error?.message ?? (editMode ? "Failed to save vessel" : "Failed to add vessel")); return; }
    startTransition(() => { router.refresh(); onClose(); });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0F0F11]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between px-6 pt-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{editMode ? "Edit vessel" : "Add vessel"}</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-white/50">
              {editMode ? "Update any field in the full vessel schema." : "Manually add a vessel with the full vessel schema."}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:text-white/40 dark:hover:bg-white/[0.08]"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={submit} className="min-h-0 space-y-4 overflow-y-auto px-6 pb-6">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className={labelCls}>Vessel Type</label>
              <select value={form.vesselType} onChange={(e) => set("vesselType", e.target.value)} className={inputCls}>
                {VESSEL_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>

          {schemaGroups.map((group) => (
            <section key={group} className="space-y-3 border-t border-slate-200 pt-4 dark:border-white/10">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">{group}</h3>
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                {editableSchemaFields.filter((field) => field.group === group).map((field) => {
                  const key = String(field.key);
                  const required = key === "imoNumber" || key === "vesselName";
                  return (
                    <div key={field.label}>
                      <label className={labelCls}>
                        {field.label} {required ? <span className="text-red-500">*</span> : null}
                      </label>
                      <input
                        value={form[key] ?? ""}
                        onChange={(event) => set(key, event.target.value)}
                        type={numericFields.has(key) ? "number" : "text"}
                        pattern={key === "imoNumber" ? "\\d{7}" : undefined}
                        maxLength={key === "imoNumber" ? 7 : undefined}
                        className={inputCls}
                        required={required}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{error}</p>}

          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white py-4 dark:border-white/10 dark:bg-[#0F0F11]">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/[0.06]">Cancel</button>
            <button type="submit" disabled={pending} className="rounded-md bg-[#4F6DFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3B4FE6] disabled:opacity-60">
              {pending ? (editMode ? "Saving…" : "Adding…") : (editMode ? "Save changes" : "Add vessel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { AddVesselModal, type VesselFormInitial } from "./AddVesselModal";
import { apiFetch } from "@/lib/browser-fetch";
import { vesselToFormInitial } from "@/lib/vessel-form";

type Variant = "button" | "icon";

type Props =
  | { initial: VesselFormInitial; imoNumber?: never; variant?: Variant; label?: string }
  | { imoNumber: string; initial?: never; variant?: Variant; label?: string };

export function EditVesselButton(props: Props) {
  const { variant = "button", label = "Edit vessel" } = props;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState<VesselFormInitial | null>(props.initial ?? null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    if (loaded) {
      setOpen(true);
      return;
    }
    if (!("imoNumber" in props) || !props.imoNumber) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/vessels/${props.imoNumber}`);
      if (!res.ok) {
        setError("Failed to load vessel");
        return;
      }
      const payload = (await res.json()) as { data?: Record<string, unknown> };
      const vessel = payload.data;
      if (!vessel || typeof vessel !== "object") {
        setError("Vessel response was empty");
        return;
      }
      setLoaded(vesselToFormInitial(vessel as Record<string, unknown> & { imoNumber: string }));
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          aria-label={label}
          title={error ?? label}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/[0.06]"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
          {label}
        </button>
      )}
      {open && loaded && <AddVesselModal initial={loaded} onClose={() => setOpen(false)} />}
    </>
  );
}

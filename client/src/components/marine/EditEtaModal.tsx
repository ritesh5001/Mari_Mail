"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

const voyageStatusOptions = ["AT_SEA", "AT_ANCHOR", "IN_PORT", "DRIFTING", "UNKNOWN"] as const;
const confidenceOptions = ["CONFIRMED", "ESTIMATED", "TENTATIVE"] as const;

export type EditEtaInitial = {
  id: string;
  eta: string;
  destinationPort: string;
  voyageStatus: string;
  previousCargo: string | null;
  nextCargo: string | null;
  vesselName: string;
};

const inputCls = "mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-accent-500";

function toLocalInput(iso: string): string {
  // Convert ISO → the value shape a <input type="datetime-local"> expects
  // (YYYY-MM-DDTHH:mm in the viewer's local timezone).
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EditEtaModal({
  initial,
  onClose,
}: {
  initial: EditEtaInitial;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    eta: toLocalInput(initial.eta),
    destinationPort: initial.destinationPort,
    voyageStatus: initial.voyageStatus,
    previousCargo: initial.previousCargo ?? "",
    nextCargo: initial.nextCargo ?? "",
    etaConfidence: "ESTIMATED",
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        eta: new Date(form.eta).toISOString(),
        destinationPort: form.destinationPort.trim().toUpperCase(),
        voyageStatus: form.voyageStatus,
        previousCargo: form.previousCargo.trim() || null,
        nextCargo: form.nextCargo.trim() || null,
        etaConfidence: form.etaConfidence,
      };
      const res = await apiFetch(`/api/vessel-etas/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Failed to save ETA");
        return;
      }
      startTransition(() => {
        router.refresh();
        onClose();
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch(`/api/vessel-etas/${initial.id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Failed to delete ETA");
        return;
      }
      startTransition(() => {
        router.refresh();
        onClose();
      });
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || pending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Edit ETA</h2>
            <p className="mt-0.5 text-sm text-slate-500">{initial.vesselName}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3 px-5 py-4">
          <label className="block text-xs font-medium text-slate-600">
            ETA (local)
            <input
              type="datetime-local"
              value={form.eta}
              onChange={(event) => setForm((prev) => ({ ...prev, eta: event.target.value }))}
              className={inputCls}
              required
            />
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Destination Port (LOCODE)
            <input
              type="text"
              value={form.destinationPort}
              onChange={(event) => setForm((prev) => ({ ...prev, destinationPort: event.target.value }))}
              placeholder="e.g. INKAN"
              className={inputCls}
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-600">
              Voyage Status
              <select
                value={form.voyageStatus}
                onChange={(event) => setForm((prev) => ({ ...prev, voyageStatus: event.target.value }))}
                className={inputCls}
              >
                {voyageStatusOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              ETA Confidence
              <select
                value={form.etaConfidence}
                onChange={(event) => setForm((prev) => ({ ...prev, etaConfidence: event.target.value }))}
                className={inputCls}
              >
                {confidenceOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-600">
              Previous Cargo
              <input
                type="text"
                value={form.previousCargo}
                onChange={(event) => setForm((prev) => ({ ...prev, previousCargo: event.target.value }))}
                className={inputCls}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Next Cargo
              <input
                type="text"
                value={form.nextCargo}
                onChange={(event) => setForm((prev) => ({ ...prev, nextCargo: event.target.value }))}
                className={inputCls}
              />
            </label>
          </div>

          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <div className="flex items-center justify-between border-t border-slate-200 pt-3">
            {confirmDelete ? (
              <div className="flex items-center gap-2 text-xs text-red-700">
                <span>Delete this ETA?</span>
                <button type="button" onClick={handleDelete} disabled={disabled} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes, delete"}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} disabled={disabled} className="text-xs text-slate-500 hover:underline">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={disabled}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete ETA
              </button>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={disabled}
                className="rounded-md bg-[#4F6DFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3B4FE6] disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

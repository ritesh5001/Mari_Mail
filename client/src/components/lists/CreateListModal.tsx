"use client";

import { useState } from "react";
import { Loader2, Ship, Users, X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

export type CreatedList = { id: string; name: string };

/**
 * Modal for creating a list manually. The user picks a "kind":
 *
 *   ETA     — list has contacts + companies + vessels. Used by ETA campaigns
 *             where the vessel supplies the ETA and port to send against.
 *   CONTACT — list has contacts + companies only. Used by cold/manual
 *             campaigns and for CSV-imported audiences.
 *
 * The kind is stored in `filterConfig.kind` on the list row (no schema
 * migration needed), and the list-detail page reads it back to decide which
 * tabs and actions to show.
 */
export function CreateListModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (list: CreatedList, kind: "ETA" | "CONTACT") => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"ETA" | "CONTACT">("CONTACT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type: "STATIC",
          kind,
          color: kind === "ETA" ? "#4F6DFF" : "#059669",
          icon: kind === "ETA" ? "ship" : "users",
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { data?: CreatedList; error?: { message?: string } }
        | null;
      if (!res.ok || !payload?.data) {
        setError(payload?.error?.message ?? "Failed to create list");
        return;
      }
      onCreated(payload.data, kind);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#0A0A0C]"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Create list</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/60">
              Pick what this list will hold. You can't switch the kind later.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
          List name
        </label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Q3 Owners – North India"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
          autoFocus
        />

        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
            Kind
          </p>
          <button
            type="button"
            onClick={() => setKind("CONTACT")}
            className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition ${
              kind === "CONTACT"
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                : "border-slate-200 hover:border-slate-300 dark:border-white/10"
            }`}
          >
            <Users className="mt-0.5 h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-slate-950 dark:text-white">Contact list</p>
              <p className="text-xs text-slate-500 dark:text-white/60">
                Contacts + companies only. Ideal for cold campaigns or a CSV you already have.
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setKind("ETA")}
            className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition ${
              kind === "ETA"
                ? "border-ocean bg-ocean/5 dark:bg-ocean/10"
                : "border-slate-200 hover:border-slate-300 dark:border-white/10"
            }`}
          >
            <Ship className="mt-0.5 h-5 w-5 text-ocean" />
            <div>
              <p className="text-sm font-semibold text-slate-950 dark:text-white">ETA list</p>
              <p className="text-xs text-slate-500 dark:text-white/60">
                Contacts + companies + vessels. Used by ETA campaigns that fire when a listed vessel gets an ETA.
              </p>
            </div>
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs font-medium text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-white/80"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-ocean px-4 py-2 text-sm font-semibold text-white hover:bg-ocean/90 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create list
          </button>
        </div>
      </form>
    </div>
  );
}

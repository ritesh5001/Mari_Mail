"use client";

import { useState } from "react";
import { Loader2, Save, Timer } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

export function SendGapDefaultsForm({
  initialMinSeconds,
  initialMaxSeconds,
}: {
  initialMinSeconds: number;
  initialMaxSeconds: number;
}) {
  const [minMinutes, setMinMinutes] = useState(Math.round(initialMinSeconds / 60));
  const [maxMinutes, setMaxMinutes] = useState(Math.round(initialMaxSeconds / 60));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isRandom = maxMinutes > minMinutes;

  async function save() {
    setSaving(true);
    setError(null);
    const min = Math.max(0, Math.min(1440, minMinutes));
    const max = Math.max(min, Math.min(1440, maxMinutes));
    try {
      const res = await apiFetch(`/workspaces/me/send-gap-defaults`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultSendGapMinSeconds: min * 60,
          defaultSendGapMaxSeconds: max * 60,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? `Failed to save (${res.status})`);
        return;
      }
      setMinMinutes(min);
      setMaxMinutes(max);
      setToast("Default send gap saved");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
        <Timer className="h-4 w-4 text-ocean" /> Default gap between emails
      </h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
        Every new campaign starts with this random gap between outgoing emails. A random wait in the range makes
        sending look natural and protects your inbox reputation.
      </p>

      <div className="mt-4 flex max-w-sm items-end gap-2">
        <label className="flex-1 text-xs font-medium text-slate-600 dark:text-white/60">
          Min gap (minutes)
          <input
            type="number"
            min={0}
            max={1440}
            value={minMinutes}
            onChange={(event) => {
              const value = Math.max(0, Math.min(1440, Number(event.target.value) || 0));
              setMinMinutes(value);
              if (value > maxMinutes) setMaxMinutes(value);
            }}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
          />
        </label>
        <span className="pb-2 text-slate-400">–</span>
        <label className="flex-1 text-xs font-medium text-slate-600 dark:text-white/60">
          Max gap (minutes)
          <input
            type="number"
            min={0}
            max={1440}
            value={maxMinutes}
            onChange={(event) =>
              setMaxMinutes(Math.max(0, Math.min(1440, Number(event.target.value) || 0)))
            }
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
          />
        </label>
      </div>

      <p className="mt-2 text-[11px] text-slate-500 dark:text-white/45">
        {minMinutes === 0 && maxMinutes === 0
          ? "No gap — new campaigns send as fast as the schedule allows."
          : isRandom
            ? `New campaigns wait a random ${minMinutes}–${maxMinutes} min between emails.`
            : `New campaigns wait a fixed ${minMinutes} min between emails. Set a higher Max to randomise.`}
      </p>

      {error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#4F6DFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3B4FE6] disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save default
        </button>
        {toast ? <span className="text-sm text-emerald-600 dark:text-emerald-400">{toast}</span> : null}
      </div>
    </div>
  );
}

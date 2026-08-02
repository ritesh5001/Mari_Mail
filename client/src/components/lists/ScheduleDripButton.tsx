"use client";

import { useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

/**
 * Turn the current Apollo filter into a standing daily reveal.
 *
 * Adding every match at once isn't possible: each reveal costs a credit and a
 * filter routinely matches thousands of people. So the filter is saved and a
 * daily job reveals `dailyLimit` more of them into this list, picking up where
 * it left off. Super-admin only — it commits an unattended, recurring spend.
 */
export function ScheduleDripButton({
  listId,
  listName,
  filter,
  totalMatches,
}: {
  listId: string;
  listName: string;
  filter: Record<string, unknown>;
  totalMatches?: number;
}) {
  const [open, setOpen] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(50);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const days = totalMatches ? Math.ceil(totalMatches / Math.max(1, dailyLimit)) : null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/apollo-drips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listId,
          name: name.trim() || `${listName} — daily reveal`,
          filter,
          dailyLimit,
          totalMatches,
        }),
      });
      const payload = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(payload.error?.message ?? "Could not schedule the drip");
        return;
      }
      setDone(
        `Scheduled — ${dailyLimit} people a day will be revealed into “${listName}”, starting at the next 07:00 UTC run.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
        {done}
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.06] dark:text-white/80 dark:hover:bg-white/10"
      >
        <CalendarClock className="h-3.5 w-3.5" />
        Schedule daily reveal
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#0f1720]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                  Schedule daily reveal
                </h3>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-white/50">
                  Saves these filters and adds people to “{listName}” a batch at a time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-4 block text-[11px] font-medium text-slate-600 dark:text-white/60">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${listName} — daily reveal`}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
              />
            </label>

            <label className="mt-3 block text-[11px] font-medium text-slate-600 dark:text-white/60">
              People per day
              <input
                type="number"
                min={1}
                max={200}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
              />
            </label>

            {/* Say the cost out loud. This spends a credit per person every day
                until it's paused, which is not obvious from "schedule". */}
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
              Spends {dailyLimit} credits a day, every day, until you pause it.
              {typeof totalMatches === "number" ? (
                <>
                  {" "}
                  {totalMatches.toLocaleString()} people match, so this runs about{" "}
                  {days?.toLocaleString()} day{days === 1 ? "" : "s"} — roughly{" "}
                  {totalMatches.toLocaleString()} credits in total.
                </>
              ) : null}
            </p>

            {error ? (
              <p className="mt-3 text-[11px] text-rose-600 dark:text-rose-300">{error}</p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="rounded-md bg-ocean px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Scheduling…" : "Schedule"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

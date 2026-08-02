"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play, Trash2, Zap } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

export type DripDTO = {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "FAILED";
  dailyLimit: number;
  page: number;
  offsetInPage: number;
  totalMatches: number | null;
  revealed: number;
  added: number;
  skipped: number;
  lastRunAt: string | null;
  lastRunAdded: number | null;
  lastError: string | null;
  filter: Record<string, unknown>;
  list: { id: string; name: string; contactCount: number } | null;
  createdBy: { email: string; name: string | null } | null;
};

const STATUS_TONE: Record<DripDTO["status"], string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200",
  PAUSED: "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-white/70",
  COMPLETED: "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200",
  FAILED: "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200",
};

/** "Founder, CEO · 1-20 employees · India" — enough to recognise the filter. */
function describeFilter(f: Record<string, unknown>): string {
  const parts: string[] = [];
  const list = (k: string) => (Array.isArray(f[k]) ? (f[k] as string[]) : []);
  if (list("includeTitles").length) parts.push(list("includeTitles").slice(0, 3).join(", "));
  if (list("seniorities").length) parts.push(list("seniorities").join(", "));
  if (list("employeeRanges").length) parts.push(`${list("employeeRanges").join(", ")} employees`);
  if (list("personLocations").length) parts.push(list("personLocations").slice(0, 2).join(", "));
  if (typeof f.keywords === "string" && f.keywords) parts.push(`“${f.keywords}”`);
  return parts.join(" · ") || "no filters";
}

export function DripTable({ initialDrips }: { initialDrips: DripDTO[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: "pause" | "resume" | "delete" | "run") {
    if (action === "delete" && !confirm("Delete this drip? It stops adding people to the list.")) return;
    setBusyId(id);
    setError(null);
    setNote(null);
    try {
      const res =
        action === "delete"
          ? await apiFetch(`/api/admin/apollo-drips/${id}`, { method: "DELETE" })
          : action === "run"
            ? await apiFetch(`/api/admin/apollo-drips/${id}/run`, { method: "POST" })
            : await apiFetch(`/api/admin/apollo-drips/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: action === "pause" ? "PAUSED" : "ACTIVE" }),
              });
      const payload = (await res.json()) as {
        error?: { message?: string };
        data?: { added?: number; skipped?: number; stoppedBecause?: string };
      };
      if (!res.ok) {
        setError(payload.error?.message ?? "Action failed");
        return;
      }
      if (action === "run") {
        const d = payload.data ?? {};
        setNote(
          `Run finished — ${d.added ?? 0} added, ${d.skipped ?? 0} skipped${
            d.stoppedBecause ? ` (${d.stoppedBecause.replace(/_/g, " ")})` : ""
          }. It uses the same daily allowance, so today's quota is now spent.`,
        );
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (initialDrips.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-xs text-slate-500 dark:border-white/15 dark:text-white/50">
        No scheduled reveals yet. Open a contact list, search Apollo with the filters you want, then use
        “Schedule daily reveal”.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {note ? (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
            <tr>
              <th className="px-3 py-2">Drip</th>
              <th className="px-3 py-2">List</th>
              <th className="px-3 py-2">Per day</th>
              <th className="px-3 py-2">Progress</th>
              <th className="px-3 py-2">Last run</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {initialDrips.map((d) => {
              const pct =
                d.totalMatches && d.totalMatches > 0
                  ? Math.min(100, Math.round((d.added / d.totalMatches) * 100))
                  : null;
              return (
                <tr key={d.id} className="align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">{d.name}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-white/50">
                      {describeFilter(d.filter)}
                    </div>
                    <span
                      className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TONE[d.status]}`}
                    >
                      {d.status}
                    </span>
                    {d.lastError ? (
                      <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{d.lastError}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-700 dark:text-white/70">
                    {d.list?.name ?? "(deleted)"}
                    <div className="text-[11px] text-slate-400 dark:text-white/40">
                      {d.list?.contactCount ?? 0} contacts
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-700 dark:text-white/70">{d.dailyLimit}</td>
                  <td className="px-3 py-3 text-xs text-slate-700 dark:text-white/70">
                    {d.added} added
                    {d.totalMatches ? ` of ${d.totalMatches.toLocaleString()}` : ""}
                    {pct !== null ? ` · ${pct}%` : ""}
                    <div className="text-[11px] text-slate-400 dark:text-white/40">
                      {d.revealed} revealed · {d.skipped} skipped · cursor p{d.page}+{d.offsetInPage}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-700 dark:text-white/70">
                    {d.lastRunAt ? new Date(d.lastRunAt).toLocaleString() : "never"}
                    {d.lastRunAdded !== null ? (
                      <div className="text-[11px] text-slate-400 dark:text-white/40">
                        +{d.lastRunAdded} that run
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {busyId === d.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      ) : (
                        <>
                          {d.status === "ACTIVE" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => act(d.id, "run")}
                                title="Run now (uses today's allowance)"
                                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
                              >
                                <Zap className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => act(d.id, "pause")}
                                title="Pause"
                                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
                              >
                                <Pause className="h-4 w-4" />
                              </button>
                            </>
                          ) : d.status === "PAUSED" ? (
                            <button
                              type="button"
                              onClick={() => act(d.id, "resume")}
                              title="Resume"
                              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => act(d.id, "delete")}
                            title="Delete"
                            className="rounded p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-400/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

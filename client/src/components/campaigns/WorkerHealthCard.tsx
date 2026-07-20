"use client";

import { useEffect, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

type Counts = {
  wait: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
};

type Failure = {
  queue: string;
  id?: string;
  attemptsMade: number;
  failedReason?: string;
  timestamp?: number;
};

type Health =
  | {
      ok: true;
      workersEnabled: boolean;
      queues: Record<string, Counts>;
      recentFailures: Failure[];
    }
  | { ok: false; reason: string; workersEnabled: boolean };

export function WorkerHealthCard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const response = await apiFetch(`/api/campaigns/queue-health`);
    if (!response.ok) {
      setLoading(false);
      // 403 for non-super-admins or other errors — silently render nothing.
      setHealth(null);
      return;
    }
    const payload = (await response.json()) as { data?: Health };
    setHealth(payload.data ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (!health) return null;

  const healthy =
    health.ok && health.workersEnabled && Object.values(health.queues).every((q) => q.failed === 0);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Activity className="mt-0.5 h-5 w-5 text-ocean" />
          <div>
            <h3 className="text-base font-semibold text-slate-950 dark:text-white">
              Worker &amp; queue health
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-white/55">
              If <span className="font-mono">delayed</span> grows but <span className="font-mono">completed</span> doesn&apos;t, the worker process isn&apos;t reading the queue — scheduled campaign mails will never fire.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-ocean hover:text-ocean dark:border-white/10 dark:text-white/70 dark:hover:border-white/30"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs">
        {healthy ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Healthy
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-semibold text-red-700">
            <AlertCircle className="h-3 w-3" /> Attention needed
          </span>
        )}
        <span className="text-slate-500 dark:text-white/50">
          START_WORKERS: <span className="font-mono">{String(health.workersEnabled)}</span>
        </span>
      </div>

      {!health.ok ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800/40 dark:bg-red-900/15 dark:text-red-300">
          {health.reason}
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-md border border-slate-200 dark:border-white/10">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500 dark:bg-white/[0.04] dark:text-white/50">
                <tr>
                  <th className="px-3 py-2">Queue</th>
                  <th className="px-3 py-2">Waiting</th>
                  <th className="px-3 py-2">Delayed</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Completed</th>
                  <th className="px-3 py-2">Failed</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(health.queues).map(([name, counts]) => (
                  <tr key={name} className="border-t border-slate-100 dark:border-white/5">
                    <td className="px-3 py-2 font-mono text-slate-700 dark:text-white/75">{name}</td>
                    <td className="px-3 py-2">{counts.wait}</td>
                    <td className="px-3 py-2">{counts.delayed}</td>
                    <td className="px-3 py-2">{counts.active}</td>
                    <td className="px-3 py-2">{counts.completed}</td>
                    <td className={`px-3 py-2 font-semibold ${counts.failed > 0 ? "text-red-600" : "text-slate-500"}`}>
                      {counts.failed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {health.recentFailures.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-700 dark:text-white/70">Recent failures</p>
              {health.recentFailures.map((failure, idx) => (
                <div
                  key={`${failure.queue}:${failure.id}:${idx}`}
                  className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800/40 dark:bg-red-900/15 dark:text-red-300"
                >
                  <p>
                    <span className="font-mono">{failure.queue}</span> · attempt {failure.attemptsMade}
                    {failure.timestamp ? ` · ${new Date(failure.timestamp).toLocaleString()}` : ""}
                  </p>
                  <p className="mt-0.5 break-words font-mono text-[11px]">
                    {failure.failedReason ?? "(no reason recorded)"}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

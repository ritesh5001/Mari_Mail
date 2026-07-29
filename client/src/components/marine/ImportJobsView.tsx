"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { apiFetchJson } from "@/lib/browser-fetch";
import { cn } from "@/lib/cn";

type ImportJob = {
  jobId: string;
  importType: string;
  status: string;
  done: number | null;
  total: number | null;
  created: number | null;
  updated: number | null;
  errorCount: number | null;
  failedReason: string | null;
  createdAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  stalled: boolean;
};

type Payload = { jobs: ImportJob[]; queueAvailable: boolean };

/** States where the row is still expected to change on its own. */
const LIVE = new Set(["active", "waiting", "delayed", "paused"]);

const TYPE_LABEL: Record<string, string> = {
  MARINE_DATA_ROWS: "Marine data",
  VESSELS: "Vessels",
  VESSEL_ETAS: "Vessel ETAs",
  CONTACTS: "Contacts",
  SHIP_OWNER_COMPANIES: "Ship owners",
  ISM_MANAGER_COMPANIES: "ISM managers",
  COMMERCIAL_MANAGER_COMPANIES: "Commercial managers",
};

export function ImportJobsView() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [requeueing, setRequeueing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Kept in a ref so the poll interval can read it without being torn down and
  // recreated on every tick.
  const hasLiveJobs = useRef(false);

  const load = useCallback(async () => {
    // The API wraps every success in `{ data: ... }`, and apiFetchJson throws
    // on a network failure rather than returning null — the poll loop must
    // survive both.
    let body: { data?: Payload } | null = null;
    try {
      body = await apiFetchJson<{ data: Payload }>("/api/import/csv/jobs");
    } catch {
      body = null;
    }
    const data = body?.data;
    if (!data) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setPayload(data);
    hasLiveJobs.current = data.jobs.some((job) => LIVE.has(job.status));
  }, []);

  useEffect(() => {
    void load();
    // Poll fast while something is moving, slowly when nothing is — a finished
    // queue shouldn't hit the API every two seconds forever with this page left
    // open on a spare monitor.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      timer = setTimeout(
        async () => {
          if (cancelled) return;
          await load();
          if (!cancelled) tick();
        },
        hasLiveJobs.current ? 2_000 : 15_000,
      );
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load]);

  const requeueStalled = async () => {
    setRequeueing(true);
    setNotice(null);
    let requeued: number | null = null;
    try {
      const body = await apiFetchJson<{ data: { requeued: number } }>(
        "/api/import/csv/jobs/requeue-stalled",
        { method: "POST" },
      );
      requeued = body?.data?.requeued ?? null;
    } catch {
      requeued = null;
    }
    setRequeueing(false);
    setNotice(
      requeued == null
        ? "Couldn't reach the server to requeue."
        : requeued > 0
          ? `Requeued ${requeued} stuck import${requeued === 1 ? "" : "s"}. It should start within a few seconds.`
          : "Nothing was stuck — every job is either running or finished.",
    );
    await load();
  };

  const jobs = payload?.jobs ?? [];
  const stalledCount = jobs.filter((job) => job.stalled).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Import activity</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
            Live progress for every CSV import in this workspace. Safe to close — imports run on the
            server.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/[0.06]"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <Link
            href="/dashboard/import"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-[#ffffff] transition-colors hover:bg-accent-600"
          >
            New import
          </Link>
        </div>
      </header>

      {payload && !payload.queueAvailable ? (
        <Banner tone="warning">
          Redis isn&rsquo;t configured on the server, so imports run synchronously in the request
          instead of being queued. Nothing will appear here.
        </Banner>
      ) : null}

      {stalledCount > 0 ? (
        <Banner tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {stalledCount} import{stalledCount === 1 ? " is" : "s are"} stuck — started but no
              longer being worked on, usually because the server restarted mid-import. Later imports
              queue behind them.
            </span>
            <button
              type="button"
              onClick={() => void requeueStalled()}
              disabled={requeueing}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-[#ffffff] transition-colors hover:bg-amber-700 disabled:opacity-60"
            >
              <RotateCcw className={cn("h-3.5 w-3.5", requeueing && "animate-spin")} />
              {requeueing ? "Requeueing…" : "Requeue stuck imports"}
            </button>
          </div>
        </Banner>
      ) : null}

      {notice ? <Banner tone="info">{notice}</Banner> : null}

      {loadFailed && !payload ? (
        <Banner tone="error">
          Couldn&rsquo;t load import activity. Any running imports are unaffected — this page just
          can&rsquo;t reach the server right now.
        </Banner>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        {payload == null ? (
          <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-500 dark:text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading import activity…
          </div>
        ) : jobs.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">No imports yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-white/50">
              Start one from the import page and it will appear here with live progress.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {jobs.map((job) => (
              <JobRow key={job.jobId} job={job} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function JobRow({ job }: { job: ImportJob }) {
  const total = job.total ?? 0;
  const done = job.done ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
  const running = job.status === "active" && !job.stalled;

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge job={job} />
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {TYPE_LABEL[job.importType] ?? job.importType}
            </span>
            <span className="text-xs text-slate-400 dark:text-white/35">#{job.jobId}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
            {describeTiming(job)}
          </p>
        </div>

        <div className="text-right text-sm tabular-nums text-slate-600 dark:text-white/60">
          {total > 0 ? (
            <>
              <span className="font-semibold text-slate-900 dark:text-white">
                {done.toLocaleString()}
              </span>{" "}
              / {total.toLocaleString()} rows
              {pct !== null ? (
                <span className="ml-2 text-xs text-slate-400 dark:text-white/35">{pct}%</span>
              ) : null}
            </>
          ) : job.status === "completed" ? (
            <span className="text-xs text-slate-400 dark:text-white/35">done</span>
          ) : (
            <span className="text-xs text-slate-400 dark:text-white/35">waiting to start</span>
          )}
        </div>
      </div>

      {/* Progress is a magnitude, so it gets one hue and one scale. An
          indeterminate bar for a queued job would imply work is happening. */}
      {pct !== null && job.status !== "completed" ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.08]">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              job.stalled ? "bg-amber-500" : "bg-accent-500",
              running && "animate-pulse",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      {job.status === "completed" ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-white/45">
          {(job.created ?? 0).toLocaleString()} created
          {job.updated != null ? ` · ${job.updated.toLocaleString()} updated` : ""}
          {job.errorCount ? ` · ${job.errorCount.toLocaleString()} row(s) skipped` : ""}
        </p>
      ) : null}

      {job.failedReason ? (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {job.failedReason}
        </p>
      ) : null}
    </li>
  );
}

function StatusBadge({ job }: { job: ImportJob }) {
  // Status is never colour alone — each carries an icon and a word, so it
  // survives colour-blindness, greyscale printing and forced-colours mode.
  const [Icon, label, className] = job.stalled
    ? [AlertTriangle, "Stuck", "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"]
    : job.status === "active"
      ? [Loader2, "Running", "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"]
      : job.status === "completed"
        ? [
            CheckCircle2,
            "Done",
            "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
          ]
        : job.status === "failed"
          ? [XCircle, "Failed", "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"]
          : [
              Clock,
              "Queued",
              "bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-white/60",
            ];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", job.status === "active" && !job.stalled && "animate-spin")} />
      {label}
    </span>
  );
}

function ago(timestamp: number) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function describeTiming(job: ImportJob) {
  if (job.finishedAt) {
    const seconds = job.startedAt ? Math.round((job.finishedAt - job.startedAt) / 1000) : null;
    return `Finished ${ago(job.finishedAt)}${seconds != null ? ` · took ${seconds}s` : ""}`;
  }
  // "Started 19h ago" on a running job is the clearest possible signal that
  // something is wrong, which is why elapsed time is shown rather than hidden.
  if (job.startedAt) return `Started ${ago(job.startedAt)}`;
  if (job.createdAt) return `Queued ${ago(job.createdAt)}`;
  return "Queued";
}

function Banner({
  tone,
  children,
}: {
  tone: "warning" | "error" | "info";
  children: React.ReactNode;
}) {
  const className =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200"
      : tone === "error"
        ? "border-red-200 bg-red-50 text-red-800 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200"
        : "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200";

  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", className)}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

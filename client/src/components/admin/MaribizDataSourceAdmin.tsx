"use client";

import { useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Database, Power, Save, Zap } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import type { MaribizSettingsDTO, MaribizUsageDTO } from "@/app/dashboard/admin/maribiz/page";

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function maskUrl(url: string | null): string {
  if (!url) return "(not configured)";
  return url;
}

export function MaribizDataSourceAdmin({
  initialSettings,
  initialUsage,
}: {
  initialSettings: MaribizSettingsDTO;
  initialUsage: MaribizUsageDTO;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [usage, setUsage] = useState(initialUsage);
  const [cacheTtl, setCacheTtl] = useState(initialSettings.cacheTtlSeconds);
  const [maxResults, setMaxResults] = useState(initialSettings.maxResultsPerQuery);
  const [savingTuning, setSavingTuning] = useState(false);
  const [testing, setTesting] = useState(false);

  async function toggleEnabled(next: boolean) {
    setSettings((s) => ({ ...s, enabled: next }));
    try {
      const response = await apiFetch(`/api/admin/maribiz/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!response.ok) throw new Error("failed");
    } catch {
      setSettings((s) => ({ ...s, enabled: !next }));
    }
  }

  async function saveTuning() {
    setSavingTuning(true);
    try {
      const response = await apiFetch(`/api/admin/maribiz/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cacheTtlSeconds: cacheTtl, maxResultsPerQuery: maxResults }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { data: MaribizSettingsDTO };
        setSettings((s) => ({ ...s, ...payload.data }));
      }
    } finally {
      setSavingTuning(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const response = await apiFetch(`/api/admin/maribiz/test`, { method: "POST" });
      const payload = (await response.json()) as {
        data: { ok: boolean; latencyMs: number; totalRows?: number; error?: string; settings: MaribizSettingsDTO };
      };
      setSettings((s) => ({ ...s, ...payload.data.settings }));
      const usageResponse = await apiFetch(`/api/admin/maribiz/usage`);
      if (usageResponse.ok) {
        const usagePayload = (await usageResponse.json()) as { data: MaribizUsageDTO };
        setUsage(usagePayload.data);
      }
    } finally {
      setTesting(false);
    }
  }

  const cacheHitRate =
    usage.last7d.queries + usage.last7d.cacheHits > 0
      ? Math.round((usage.last7d.cacheHits / (usage.last7d.queries + usage.last7d.cacheHits)) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Secondary Data Source</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-950 dark:text-white">
              <Database className="h-6 w-6 text-ocean" />
              Maribiz Persons API
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
              External database of 600k+ marine industry contacts. When enabled, contact searches
              merge results from this source into the normal results table.
            </p>
          </div>

          <label className="inline-flex cursor-pointer select-none items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80">
            <Power className={`h-4 w-4 ${settings.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`} />
            <span>{settings.enabled ? "Secondary DB enabled" : "Secondary DB disabled"}</span>
            <span className="relative">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={settings.enabled}
                onChange={(event) => toggleEnabled(event.currentTarget.checked)}
              />
              <span className="block h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500 dark:bg-white/15" />
              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
            </span>
          </label>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-white/55">API URL</dt>
            <dd className="mt-0.5 truncate font-mono text-xs text-slate-800 dark:text-white/85" title={maskUrl(settings.apiUrl)}>
              {maskUrl(settings.apiUrl)}
            </dd>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-white/55">API Key</dt>
            <dd className="mt-0.5 flex items-center gap-2 text-xs text-slate-800 dark:text-white/85">
              {settings.apiKeyConfigured ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Configured in .env</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  <span>Missing — set MARIBIZ_API_KEY</span>
                </>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-white/60">
            <Zap className="h-4 w-4" />
            Connection
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
            Test connectivity to the secondary database and record the result.
          </p>

          {settings.lastTestAt ? (
            <div
              className={`mt-4 rounded-lg border p-3 text-sm ${
                settings.lastTestStatus === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
                  : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {settings.lastTestStatus === "ok" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                {settings.lastTestStatus === "ok" ? "Healthy" : "Error"}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-500 dark:text-white/55">Last test</dt>
                <dd>{formatDate(settings.lastTestAt)}</dd>
                <dt className="text-slate-500 dark:text-white/55">Latency</dt>
                <dd>{settings.lastTestLatencyMs ?? "—"} ms</dd>
                {settings.lastTestTotalRows !== null && (
                  <>
                    <dt className="text-slate-500 dark:text-white/55">Total rows</dt>
                    <dd>{settings.lastTestTotalRows.toLocaleString("en")}</dd>
                  </>
                )}
                {settings.lastTestError && (
                  <>
                    <dt className="text-slate-500 dark:text-white/55">Error</dt>
                    <dd className="break-words font-mono text-[11px]">{settings.lastTestError}</dd>
                  </>
                )}
              </dl>
            </div>
          ) : (
            <p className="mt-4 rounded border border-dashed border-slate-200 p-3 text-xs text-slate-500 dark:border-white/10 dark:text-white/50">
              No tests have been run yet.
            </p>
          )}

          <button
            type="button"
            onClick={testConnection}
            disabled={testing}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            <Zap className="h-4 w-4" />
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-white/60">
            <Activity className="h-4 w-4" />
            Usage
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
            Counts of Maribiz queries and cache hits.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/55">Today — queries</div>
              <div className="mt-0.5 text-2xl font-semibold text-slate-950 dark:text-white">{usage.today.queries.toLocaleString("en")}</div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/55">Today — cache hits</div>
              <div className="mt-0.5 text-2xl font-semibold text-slate-950 dark:text-white">{usage.today.cacheHits.toLocaleString("en")}</div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/55">Last 7d — queries</div>
              <div className="mt-0.5 text-2xl font-semibold text-slate-950 dark:text-white">{usage.last7d.queries.toLocaleString("en")}</div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/55">Cache hit rate (7d)</div>
              <div className="mt-0.5 text-2xl font-semibold text-slate-950 dark:text-white">{cacheHitRate}%</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-white/60">
          Tuning
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
          Adjust how aggressively MariMail queries and caches the secondary database.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-600 dark:text-white/70">Cache TTL (seconds)</span>
            <input
              type="number"
              min={60}
              max={86_400}
              value={cacheTtl}
              onChange={(event) => setCacheTtl(Math.max(60, Math.min(86_400, Number(event.target.value) || 60)))}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            />
            <span className="mt-1 block text-[11px] text-slate-500 dark:text-white/50">
              60–86400. How long an identical search is cached before re-hitting Maribiz.
            </span>
          </label>

          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-600 dark:text-white/70">Max results per query</span>
            <input
              type="number"
              min={1}
              max={100}
              value={maxResults}
              onChange={(event) => setMaxResults(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            />
            <span className="mt-1 block text-[11px] text-slate-500 dark:text-white/50">
              1–100. Caps how many Maribiz rows are appended to the first search page.
            </span>
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={saveTuning}
            disabled={savingTuning}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            <Save className="h-4 w-4" />
            {savingTuning ? "Saving…" : "Save tuning"}
          </button>
        </div>
      </section>
    </div>
  );
}

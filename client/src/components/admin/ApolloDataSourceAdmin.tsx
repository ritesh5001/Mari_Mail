"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Coins, Database, DollarSign, KeyRound, Mail, Phone, Power, Save, Unlock, Users, Zap } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import type {
  ApolloCreditAnalyticsDTO,
  ApolloSettingsDTO,
  ApolloUsageDTO,
} from "@/app/dashboard/admin/apollo/page";

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ApolloDataSourceAdmin({
  initialSettings,
  initialUsage,
  initialAnalytics,
  loadError = null,
}: {
  initialSettings: ApolloSettingsDTO;
  initialUsage: ApolloUsageDTO;
  initialAnalytics: ApolloCreditAnalyticsDTO;
  loadError?: string | null;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [usage, setUsage] = useState(initialUsage);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState(initialSettings.apiBaseUrl);
  const [cacheTtl, setCacheTtl] = useState(initialSettings.cacheTtlSeconds);
  const [maxResults, setMaxResults] = useState(initialSettings.maxResultsPerQuery);
  const [emailPrice, setEmailPrice] = useState(initialSettings.creditsPerEmailReveal);
  const [phonePrice, setPhonePrice] = useState(initialSettings.creditsPerPhoneReveal);
  const [savingKey, setSavingKey] = useState(false);
  const [savingTuning, setSavingTuning] = useState(false);
  const [testing, setTesting] = useState(false);

  async function patch(body: Record<string, unknown>) {
    const response = await apiFetch(`/api/admin/apollo/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("failed");
    const payload = (await response.json()) as { data: ApolloSettingsDTO };
    setSettings(payload.data);
    return payload.data;
  }

  async function toggleEnabled(next: boolean) {
    setSettings((s) => ({ ...s, enabled: next }));
    try {
      await patch({ enabled: next });
    } catch {
      setSettings((s) => ({ ...s, enabled: !next }));
    }
  }

  async function saveApiKey() {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      await patch({ apiKey: apiKeyInput.trim(), apiBaseUrl });
      setApiKeyInput("");
    } finally {
      setSavingKey(false);
    }
  }

  async function clearApiKey() {
    setSavingKey(true);
    try {
      await patch({ apiKey: "" });
    } finally {
      setSavingKey(false);
    }
  }

  async function saveTuning() {
    setSavingTuning(true);
    try {
      await patch({
        cacheTtlSeconds: cacheTtl,
        maxResultsPerQuery: maxResults,
        creditsPerEmailReveal: emailPrice,
        creditsPerPhoneReveal: phonePrice,
        apiBaseUrl,
      });
    } finally {
      setSavingTuning(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const response = await apiFetch(`/api/admin/apollo/test`, { method: "POST" });
      const payload = (await response.json()) as {
        data: { ok: boolean; latencyMs: number; error?: string; settings: ApolloSettingsDTO };
      };
      setSettings(payload.data.settings);
      const [usageResponse, analyticsResponse] = await Promise.all([
        apiFetch(`/api/admin/apollo/usage`),
        apiFetch(`/api/admin/apollo/credit-analytics`),
      ]);
      if (usageResponse.ok) {
        const usagePayload = (await usageResponse.json()) as { data: ApolloUsageDTO };
        setUsage(usagePayload.data);
      }
      if (analyticsResponse.ok) {
        const analyticsPayload = (await analyticsResponse.json()) as {
          data: ApolloCreditAnalyticsDTO;
        };
        setAnalytics(analyticsPayload.data);
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
      {loadError && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-semibold">Live settings could not be loaded — showing defaults.</p>
            <p className="mt-1 text-xs">{loadError}</p>
            <p className="mt-1 text-xs">
              You can still enter the API key below; saving will succeed once the backend is reachable.
            </p>
          </div>
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Paid Data Source</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-950 dark:text-white">
              <Database className="h-6 w-6 text-ocean" />
              Apollo.io People API
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
              External database of B2B contacts matched by company domain. Email & phone are
              redacted in search results and unlocked on demand by debiting workspace credits.
            </p>
            <Link
              href="/dashboard/admin/apollo/unlocked"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-ocean hover:text-ocean dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80"
            >
              <Unlock className="h-3.5 w-3.5" />
              View unlocked contacts
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <label className="inline-flex cursor-pointer select-none items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80">
            <Power className={`h-4 w-4 ${settings.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`} />
            <span>{settings.enabled ? "Apollo enabled" : "Apollo disabled"}</span>
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
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-white/60">
          <KeyRound className="h-4 w-4" />
          Credentials
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
          Stored encrypted at rest. Only super-admins can view this page; the key itself is never
          returned to the browser.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-600 dark:text-white/70">API base URL</span>
            <input
              type="url"
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            />
          </label>

          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-600 dark:text-white/70">
              API key {settings.hasApiKey ? "(configured)" : "(not set)"}
            </span>
            <input
              type="password"
              value={apiKeyInput}
              placeholder={settings.hasApiKey ? "•••••••••••• — paste a new key to replace" : "Paste Apollo API key"}
              onChange={(event) => setApiKeyInput(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            {settings.hasApiKey ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-slate-700 dark:text-white/70">Key stored & encrypted</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-slate-700 dark:text-white/70">No key configured — Apollo calls will fail</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            {settings.hasApiKey && (
              <button
                type="button"
                onClick={clearApiKey}
                disabled={savingKey}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:bg-white/[0.08]"
              >
                Clear key
              </button>
            )}
            <button
              type="button"
              onClick={saveApiKey}
              disabled={savingKey || !apiKeyInput.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              <Save className="h-4 w-4" />
              {savingKey ? "Saving…" : "Save key"}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-white/60">
            <Zap className="h-4 w-4" />
            Connection
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
            Test connectivity to Apollo and record the result.
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
            Counts of Apollo queries, reveals, and cache hits.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/55">Today — queries</div>
              <div className="mt-0.5 text-2xl font-semibold text-slate-950 dark:text-white">{usage.today.queries.toLocaleString("en")}</div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/55">Today — email reveals</div>
              <div className="mt-0.5 text-2xl font-semibold text-slate-950 dark:text-white">{usage.today.emailReveals.toLocaleString("en")}</div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/55">Today — phone reveals</div>
              <div className="mt-0.5 text-2xl font-semibold text-slate-950 dark:text-white">{usage.today.phoneReveals.toLocaleString("en")}</div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/55">Cache hit rate (7d)</div>
              <div className="mt-0.5 text-2xl font-semibold text-slate-950 dark:text-white">{cacheHitRate}%</div>
            </div>
          </div>
        </div>
      </section>

      <ApolloCreditAnalyticsPanel analytics={analytics} />

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-white/60">
          Tuning & Pricing
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
          Cache aggressiveness, search size, and the credit cost charged to each workspace per
          reveal.
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
              60–86400. How long an identical search is cached before re-hitting Apollo.
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
          </label>

          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-600 dark:text-white/70">Credits per email reveal</span>
            <input
              type="number"
              min={0}
              max={1000}
              value={emailPrice}
              onChange={(event) => setEmailPrice(Math.max(0, Math.min(1000, Number(event.target.value) || 0)))}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            />
            <span className="mt-1 block text-[11px] text-slate-500 dark:text-white/50">
              Debited from the workspace’s credit balance when a user clicks Reveal email.
            </span>
          </label>

          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-600 dark:text-white/70">Credits per phone reveal</span>
            <input
              type="number"
              min={0}
              max={1000}
              value={phonePrice}
              onChange={(event) => setPhonePrice(Math.max(0, Math.min(1000, Number(event.target.value) || 0)))}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            />
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

function ApolloCreditAnalyticsPanel({ analytics }: { analytics: ApolloCreditAnalyticsDTO }) {
  const { lifetime, series, topWorkspaces } = analytics;
  const maxDay = Math.max(1, ...series.map((entry) => entry.emailCredits + entry.phoneCredits));
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-white/60">
            <Coins className="h-4 w-4" />
            Credit consumption
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
            Platform-wide Apollo credit spend, refunds, and top consumers.
          </p>
        </div>
        <span className="text-[11px] text-slate-400 dark:text-white/40">
          Reads from the CreditLedger — precise, not cache-based.
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <BigStat
          icon={<Coins className="h-4 w-4" />}
          label="Lifetime credits spent"
          value={lifetime.totalCreditsSpent.toLocaleString("en")}
          subtitle={`${lifetime.netCredits.toLocaleString("en")} net after refunds`}
        />
        <BigStat
          icon={<DollarSign className="h-4 w-4" />}
          label="≈ Cost @ pack rate"
          value={`$${lifetime.costEstimateUsd.toLocaleString("en")}`}
          subtitle="Based on $19 / 1k pack"
        />
        <BigStat
          icon={<Mail className="h-4 w-4" />}
          label="Email reveals"
          value={lifetime.emailReveals.toLocaleString("en")}
          subtitle={`${lifetime.emailCredits.toLocaleString("en")} credits`}
        />
        <BigStat
          icon={<Phone className="h-4 w-4" />}
          label="Phone reveals"
          value={lifetime.phoneReveals.toLocaleString("en")}
          subtitle={`${lifetime.phoneCredits.toLocaleString("en")} credits`}
        />
      </div>

      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/60">
          Last 30 days
        </h3>
        <div className="mt-3 flex h-24 items-end gap-1 rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
          {series.map((day) => {
            const spent = day.emailCredits + day.phoneCredits;
            const heightPct = Math.max(2, Math.round((spent / maxDay) * 100));
            return (
              <div
                key={day.date}
                className="flex flex-1 flex-col items-center gap-1"
                title={`${day.date} · ${spent} credits (email ${day.emailCredits}, phone ${day.phoneCredits}, refund -${day.refundCredits})`}
              >
                <div
                  className={`w-full rounded-t ${spent > 0 ? "bg-ocean" : "bg-slate-200 dark:bg-white/10"}`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-400 dark:text-white/40">
          <span>{series[0]?.date ?? ""}</span>
          <span>{series[series.length - 1]?.date ?? ""}</span>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/60">
          <Users className="h-3.5 w-3.5" />
          Top consumers
        </h3>
        {topWorkspaces.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-white/60">
            No Apollo reveals recorded yet across the platform.
          </p>
        ) : (
          <div className="mt-3 max-h-[calc(100vh-320px)] overflow-auto overscroll-x-contain rounded-lg border border-slate-100 dark:border-white/[0.06]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-30 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226,232,240)] dark:bg-white/[0.04] dark:text-white/60 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
                <tr>
                  <th className="px-4 py-2">Workspace</th>
                  <th className="px-4 py-2">Plan</th>
                  <th className="px-4 py-2 text-right">Emails</th>
                  <th className="px-4 py-2 text-right">Phones</th>
                  <th className="px-4 py-2 text-right">Spent</th>
                  <th className="px-4 py-2 text-right">Refunded</th>
                  <th className="px-4 py-2 text-right">Net</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {topWorkspaces.map((ws) => (
                  <tr key={ws.workspaceId}>
                    <td className="max-w-[220px] truncate px-4 py-2 font-medium text-slate-950 dark:text-white" title={ws.workspaceName}>
                      {ws.workspaceName}
                    </td>
                    <td className="px-4 py-2 text-slate-600 dark:text-white/70">{ws.plan ?? "—"}</td>
                    <td className="px-4 py-2 text-right text-slate-600 dark:text-white/70">
                      {ws.emailReveals.toLocaleString("en")}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600 dark:text-white/70">
                      {ws.phoneReveals.toLocaleString("en")}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-950 dark:text-white">
                      {ws.spent.toLocaleString("en")}
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-700 dark:text-emerald-300">
                      {ws.refunded > 0 ? `-${ws.refunded.toLocaleString("en")}` : "0"}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700 dark:text-white/80">
                      {ws.net.toLocaleString("en")}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600 dark:text-white/70">
                      {ws.creditBalance.toLocaleString("en")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function BigStat({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/55">
        <span className="text-slate-400 dark:text-white/40">{icon}</span>
        {label}
      </div>
      <div className="mt-0.5 text-2xl font-semibold text-slate-950 dark:text-white">{value}</div>
      {subtitle ? (
        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-white/50">{subtitle}</div>
      ) : null}
    </div>
  );
}

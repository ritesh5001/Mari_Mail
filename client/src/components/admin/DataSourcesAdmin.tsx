"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Database, ExternalLink, Power, Save, Settings, Zap } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import type { DataSourcesDTO } from "@/app/dashboard/admin/data-sources/page";

type Patch = {
  internalEnabled?: boolean;
  maribizEnabled?: boolean;
  apolloEnabled?: boolean;
  persistApolloSearchRows?: boolean;
};

export function DataSourcesAdmin({
  initial,
  loadError = null,
}: {
  initial: DataSourcesDTO;
  loadError?: string | null;
}) {
  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);

  async function patch(field: string, body: Patch) {
    setSaving(field);
    // optimistic
    setState((s) => ({
      ...s,
      internal: body.internalEnabled !== undefined ? { ...s.internal, enabled: body.internalEnabled } : s.internal,
      maribiz: body.maribizEnabled !== undefined ? { ...s.maribiz, enabled: body.maribizEnabled } : s.maribiz,
      apollo: body.apolloEnabled !== undefined ? { ...s.apollo, enabled: body.apolloEnabled } : s.apollo,
      persistApolloSearchRows: body.persistApolloSearchRows ?? s.persistApolloSearchRows,
    }));
    try {
      const res = await apiFetch(`/api/admin/data-sources`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const payload = (await res.json()) as { data: DataSourcesDTO };
        setState(payload.data);
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-semibold">Live settings could not be loaded — showing defaults.</p>
            <p className="mt-1 text-xs">{loadError}</p>
          </div>
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Data Source Control</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-950 dark:text-white">
            <Settings className="h-6 w-6 text-ocean" />
            Where contact results come from
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
            Master switches for each data source. Disabling a source skips its query entirely — search results and the
            vessel "Search Apollo & Maribiz" panel will only contain enabled sources.
          </p>
        </div>
      </section>

      <Row
        icon={<Database className="h-5 w-5 text-emerald-600" />}
        title="Internal database"
        description="Contacts already saved in MariMail (manually added, CSV-imported, or revealed from external sources)."
        enabled={state.internal.enabled}
        saving={saving === "internal"}
        onToggle={(v) => patch("internal", { internalEnabled: v })}
        status={state.internal.enabled ? "ON" : "OFF — internal contacts hidden from search"}
        statusOK={state.internal.enabled}
      />

      <Row
        icon={<Database className="h-5 w-5 text-sky-600" />}
        title="Maribiz (secondary marine DB)"
        description="External read-only marine industry database. Query results merge into the first search page."
        enabled={state.maribiz.enabled}
        saving={saving === "maribiz"}
        onToggle={(v) => patch("maribiz", { maribizEnabled: v })}
        status={
          state.maribiz.enabled
            ? state.maribiz.hasApiKey
              ? "ON — connected"
              : "ON but no MARIBIZ_API_KEY in env"
            : "OFF"
        }
        statusOK={state.maribiz.enabled && state.maribiz.hasApiKey}
        manageHref="/dashboard/admin/maribiz"
      />

      <Row
        icon={<Zap className="h-5 w-5 text-sky-600" />}
        title="Apollo.io"
        description="People search by company domain. Email & phone reveals cost workspace credits."
        enabled={state.apollo.enabled}
        saving={saving === "apollo"}
        onToggle={(v) => patch("apollo", { apolloEnabled: v })}
        status={
          state.apollo.enabled
            ? state.apollo.hasApiKey
              ? `ON — ${state.apollo.creditsPerEmailReveal} credit / email reveal, ${state.apollo.creditsPerPhoneReveal} credit / phone reveal`
              : "ON but API key not configured"
            : "OFF"
        }
        statusOK={state.apollo.enabled && state.apollo.hasApiKey}
        manageHref="/dashboard/admin/apollo"
      />

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-white/60">
              Auto-save Apollo search results
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-white/60">
              When ON, every Apollo person returned from a search is upserted into the internal Contact table (with email
              still locked). Means future searches for the same person are served from your DB — no Apollo round-trip,
              no API quota consumed. Reveals still cost credits.
            </p>
          </div>
          <Toggle
            enabled={state.persistApolloSearchRows}
            onChange={(v) => patch("persist", { persistApolloSearchRows: v })}
            disabled={saving === "persist"}
          />
        </div>
      </section>
    </div>
  );
}

function Row({
  icon,
  title,
  description,
  enabled,
  saving,
  onToggle,
  status,
  statusOK,
  manageHref,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  saving: boolean;
  onToggle: (v: boolean) => void;
  status: string;
  statusOK: boolean;
  manageHref?: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-slate-100 p-2 dark:bg-white/[0.06]">{icon}</div>
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
              {title}
              <Power className={`h-3.5 w-3.5 ${enabled ? "text-emerald-600" : "text-slate-400"}`} />
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-white/60">{description}</p>
            <p
              className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                statusOK
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              }`}
            >
              {status}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {manageHref && (
            <Link
              href={manageHref}
              className="inline-flex items-center gap-1 text-xs font-semibold text-ocean hover:underline"
            >
              Manage <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          <Toggle enabled={enabled} onChange={onToggle} disabled={saving} />
        </div>
      </div>
    </section>
  );
}

function Toggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2">
      <span className="relative">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
        <span className="block h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500 dark:bg-white/15" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

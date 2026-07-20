"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, Mail, Phone, RefreshCw, Search, Unlock } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import type { UnlockedContactDTO } from "@/app/dashboard/admin/apollo/unlocked/page";

type ListResponse = {
  data: { rows: UnlockedContactDTO[]; total: number; nextCursor: string | null };
};

type FieldFilter = "all" | "email" | "phone";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function UnlockedApolloContacts({
  initialRows,
  initialTotal,
  initialNextCursor,
  loadError = null,
}: {
  initialRows: UnlockedContactDTO[];
  initialTotal: number;
  initialNextCursor: string | null;
  loadError?: string | null;
}) {
  const [rows, setRows] = useState<UnlockedContactDTO[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [q, setQ] = useState("");
  const [fieldFilter, setFieldFilter] = useState<FieldFilter>("all");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(loadError);

  const runSearch = useCallback(
    async (search: string, field: FieldFilter, cursor: string | null, append: boolean) => {
      const params = new URLSearchParams({ limit: "50" });
      if (search.trim()) params.set("q", search.trim());
      if (field !== "all") params.set("field", field);
      if (cursor) params.set("cursor", cursor);

      const target = append ? setLoadingMore : setLoading;
      target(true);
      setError(null);
      try {
        const response = await apiFetch(`/api/admin/apollo/unlocked?${params.toString()}`);
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message ?? `Server returned ${response.status}`);
        }
        const payload = (await response.json()) as ListResponse;
        setRows((prev) => (append ? [...prev, ...payload.data.rows] : payload.data.rows));
        setTotal(payload.data.total);
        setNextCursor(payload.data.nextCursor);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        target(false);
      }
    },
    [],
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/admin/apollo"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-ocean dark:text-white/50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Apollo settings
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-slate-950 dark:text-white">
          <Unlock className="h-6 w-6 text-ocean" />
          Unlocked contacts
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
          Every Apollo person that has been revealed at least once. Any future reveal of these people
          — from any workspace — is served from here without re-billing Apollo. Users still pay 1
          MariMail credit per reveal.
        </p>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-semibold">{error}</p>
            <p className="mt-1 text-xs">The list below may be stale.</p>
          </div>
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch(q, fieldFilter, null, false)}
                placeholder="Search name, email, company, domain, apolloId"
                className="w-full rounded-md border border-slate-300 py-2 pl-8 pr-3 text-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white/85"
              />
            </div>
            <button
              type="button"
              onClick={() => runSearch(q, fieldFilter, null, false)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:bg-ocean disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </button>
          </div>
          <div className="flex items-center gap-2">
            {(["all", "email", "phone"] as FieldFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setFieldFilter(option);
                  void runSearch(q, option, null, false);
                }}
                className={`rounded-md border px-3 py-2 text-xs font-medium capitalize ${
                  fieldFilter === option
                    ? "border-ocean bg-ocean/10 text-ocean"
                    : "border-slate-200 text-slate-600 hover:border-ocean hover:text-ocean dark:border-white/10 dark:text-white/60"
                }`}
              >
                {option === "all" ? "All" : `Has ${option}`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => runSearch(q, fieldFilter, null, false)}
              disabled={loading}
              className="rounded-md border border-slate-200 p-2 text-slate-500 hover:border-ocean hover:text-ocean disabled:opacity-60 dark:border-white/10 dark:text-white/60"
              aria-label="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-white/45">
          {total.toLocaleString("en")} unlocked {total === 1 ? "contact" : "contacts"} total
        </p>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <div className="max-h-[calc(100vh-280px)] overflow-auto overscroll-x-contain">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-white/10">
            <thead className="sticky top-0 z-30 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226,232,240)] dark:bg-white/[0.04] dark:text-white/50 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">First revealed by</th>
                <th className="px-4 py-3">Revealed</th>
                <th className="px-4 py-3">Reuses</th>
                <th className="px-4 py-3">Apollo ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-center" colSpan={9}>
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-500 dark:text-white/50" colSpan={9}>
                    No unlocked contacts match this search yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const name = row.fullName || `${row.firstName} ${row.lastName}`.trim() || "(unknown)";
                  return (
                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900 dark:text-white/90">
                        {row.personLinkedinUrl ? (
                          <a
                            href={row.personLinkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:text-ocean"
                          >
                            {name}
                            <ExternalLink className="h-3 w-3 text-slate-400" />
                          </a>
                        ) : (
                          name
                        )}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-slate-600 dark:text-white/60" title={row.title ?? ""}>
                        {row.title ?? "—"}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-slate-600 dark:text-white/60" title={row.companyName}>
                        {row.companyName}
                        {row.companyDomain ? (
                          <span className="ml-1 text-xs text-slate-400">({row.companyDomain})</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {row.email ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-white/75">
                            <Mail className="h-3.5 w-3.5 text-emerald-500" />
                            {row.email}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.mobilePhone ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-white/75">
                            <Phone className="h-3.5 w-3.5 text-emerald-500" />
                            {row.mobilePhone}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-white/60">
                        {row.firstRevealedWorkspaceName ?? (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-white/50">
                        {formatDate(row.emailRevealedAt ?? row.phoneRevealedAt ?? row.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-white/60">
                        {row.reuseCount}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-white/45">
                        {row.apolloId}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {nextCursor ? (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-center dark:border-white/[0.06] dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={() => runSearch(q, fieldFilter, nextCursor, true)}
              disabled={loadingMore}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-ocean hover:text-ocean disabled:opacity-60 dark:border-white/10 dark:text-white/70"
            >
              {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Load more
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

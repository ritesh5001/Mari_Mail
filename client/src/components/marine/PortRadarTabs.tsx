"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Radar, Ship } from "lucide-react";
import { PortRadarArrivals, type IndiaRadarEta } from "@/components/marine/PortRadarArrivals";
import type { SortState } from "@/hooks/useClientSort";

export type PortRadarTabKey = "missed" | "newly" | "upcoming";

// These endpoints are Next.js route handlers on the SAME origin as the app — NOT
// the Express backend. They must be called directly (same-origin, with cookies),
// never through `apiFetch`, which prefixes `/backend` and proxies to the Express
// VPS where these routes don't exist (that produced 404s in production).
async function postJson(url: string, body: unknown): Promise<Response> {
  // Hard client timeout so a slow/hung feed request can never leave the tab
  // spinning "Loading arrivals…" forever — it surfaces as a failed fetch that
  // the caller turns into a retryable error state.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

const TAB_ENDPOINT: Record<PortRadarTabKey, string> = {
  missed: "/api/port-radar/missed",
  newly: "/api/port-radar/newly",
  upcoming: "/api/port-radar/feed",
};

type FeedResponse = { etas: IndiaRadarEta[]; count: number; page: number; pageSize: number };

type TabState = {
  rows: IndiaRadarEta[];
  count: number;
  page: number;
  loaded: boolean;
  loading: boolean;
  error: boolean;
};

/**
 * The three Port Radar feeds as tabs. Each tab loads its data lazily — only the
 * initial tab is seeded from the server; other tabs fetch their first page when
 * first opened. Paging fetches one page at a time and prefetches the next page
 * in the background so "Next" is instant. Contact counts load lazily after rows
 * render (a second request) and are merged into the rows in place.
 */
export function PortRadarTabs({
  countryLabel,
  isSuperAdmin,
  portsWithCoordinates,
  counts,
  initialTab,
  initialRows,
  initialCount,
  pageSize,
}: {
  countryLabel: string;
  isSuperAdmin: boolean;
  portsWithCoordinates: string[];
  counts: { missed: number; newly: number; upcoming: number };
  initialTab: PortRadarTabKey;
  initialRows: IndiaRadarEta[];
  initialCount: number;
  pageSize: number;
}) {
  const [tab, setTab] = useState<PortRadarTabKey>(initialTab);
  const [tabs, setTabs] = useState<Record<PortRadarTabKey, TabState>>(() => ({
    missed: emptyTab(),
    newly: emptyTab(),
    upcoming: emptyTab(),
    [initialTab]: { rows: initialRows, count: initialCount, page: 1, loaded: true, loading: false, error: false },
  }));
  // Server-side sort, shared across tabs (each fetch appends it to the query).
  const [sort, setSort] = useState<SortState>(null);
  const sortRef = useRef<SortState>(null);
  sortRef.current = sort;

  // Prefetched next pages, keyed "tab:page". Promoted instantly on Next.
  const prefetch = useRef<Map<string, FeedResponse>>(new Map());
  // Contact counts already fetched, keyed by vessel id, so re-visiting a page
  // doesn't refetch.
  const contactCounts = useRef<Map<string, number>>(new Map());

  // Current filter query + the active sort, as the query string every feed fetch
  // sends. Sort is appended here so all tabs/pages stay consistently ordered.
  const filterSearch = () => {
    const params = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );
    const s = sortRef.current;
    if (s) {
      params.set("sort", s.key);
      params.set("dir", s.direction);
    } else {
      params.delete("sort");
      params.delete("dir");
    }
    return params.toString();
  };

  const fetchPage = useCallback(
    async (which: PortRadarTabKey, page: number): Promise<FeedResponse | null> => {
      try {
        const res = await postJson(TAB_ENDPOINT[which], {
          search: filterSearch(),
          page,
          pageSize,
        });
        if (!res.ok) return null;
        return (await res.json()) as FeedResponse;
      } catch {
        return null;
      }
    },
    [pageSize],
  );

  // Lazily fill in contact-count badges for a set of rows, then merge into state.
  const loadContactCounts = useCallback(
    async (which: PortRadarTabKey, rows: IndiaRadarEta[]) => {
      const missing = Array.from(
        new Set(rows.map((r) => r.vesselId).filter((id) => !contactCounts.current.has(id))),
      );
      if (missing.length === 0) return;
      try {
        const res = await postJson("/api/port-radar/contact-counts", { vesselIds: missing });
        if (!res.ok) return;
        const { counts: fetched } = (await res.json()) as { counts: Record<string, number> };
        for (const [id, n] of Object.entries(fetched)) contactCounts.current.set(id, n);
        setTabs((prev) => {
          const current = prev[which];
          return {
            ...prev,
            [which]: {
              ...current,
              rows: current.rows.map((row) => ({
                ...row,
                associatedContactCount: contactCounts.current.get(row.vesselId) ?? row.associatedContactCount,
              })),
            },
          };
        });
      } catch {
        // Non-fatal — badges just stay at their seeded value.
      }
    },
    [],
  );

  // Prefetch the page after `page` for a tab so the next "Next" is instant.
  const prefetchNext = useCallback(
    async (which: PortRadarTabKey, page: number, count: number) => {
      const next = page + 1;
      if ((next - 1) * pageSize >= count) return; // no next page
      const key = `${which}:${next}`;
      if (prefetch.current.has(key)) return;
      const data = await fetchPage(which, next);
      if (data) prefetch.current.set(key, data);
    },
    [fetchPage, pageSize],
  );

  const applyPage = useCallback(
    (which: PortRadarTabKey, data: FeedResponse) => {
      setTabs((prev) => ({
        ...prev,
        [which]: { rows: data.etas, count: data.count, page: data.page, loaded: true, loading: false, error: false },
      }));
      void loadContactCounts(which, data.etas);
      void prefetchNext(which, data.page, data.count);
    },
    [loadContactCounts, prefetchNext],
  );

  // Warm an inactive tab's first page in the background so clicking it is
  // instant. Only fetches tabs that actually have rows (per the badge counts)
  // and that aren't already loaded/loading. Runs at low priority after the
  // active tab is set up.
  const warmTab = useCallback(
    async (which: PortRadarTabKey) => {
      let shouldFetch = false;
      setTabs((prev) => {
        const t = prev[which];
        if (t.loaded || t.loading) return prev;
        shouldFetch = true;
        return { ...prev, [which]: { ...t, loading: true } };
      });
      if (!shouldFetch) return;
      const data = await fetchPage(which, 1);
      if (data) applyPage(which, data);
      else setTabs((prev) => ({ ...prev, [which]: { ...prev[which], loading: false, loaded: true, error: true } }));
    },
    [fetchPage, applyPage],
  );

  // On first mount: lazy counts + next-page prefetch for the seeded tab, THEN
  // background-prefetch the other tabs' first pages so tab switching is seamless.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const seeded = tabs[initialTab];
    if (seeded.loaded) {
      void loadContactCounts(initialTab, seeded.rows);
      void prefetchNext(initialTab, seeded.page, seeded.count);
    }
    // Warm the inactive tabs that have content, so opening them is instant.
    const others = (["missed", "newly", "upcoming"] as PortRadarTabKey[]).filter(
      (t) => t !== initialTab && counts[t] > 0,
    );
    for (const t of others) void warmTab(t);
  }, [tabs, initialTab, counts, loadContactCounts, prefetchNext, warmTab]);

  const openTab = useCallback(
    async (which: PortRadarTabKey) => {
      setTab(which);
      void warmTab(which);
    },
    [warmTab],
  );

  const goToPage = useCallback(
    async (which: PortRadarTabKey, page: number) => {
      const key = `${which}:${page}`;
      const cached = prefetch.current.get(key);
      if (cached) {
        applyPage(which, cached);
        return;
      }
      setTabs((prev) => ({ ...prev, [which]: { ...prev[which], loading: true, error: false } }));
      const data = await fetchPage(which, page);
      if (data) applyPage(which, data);
      else setTabs((prev) => ({ ...prev, [which]: { ...prev[which], loading: false, error: true } }));
    },
    [fetchPage, applyPage],
  );

  // Header click → cycle asc → desc → cleared, then re-fetch the active tab's
  // first page in the new order. Other tabs are marked unloaded so they re-fetch
  // (in the new order) when next opened; the prefetch cache is dropped since the
  // ordering changed.
  const onSortColumn = useCallback(
    (key: string) => {
      const next: SortState =
        sortRef.current?.key !== key
          ? { key, direction: "asc" }
          : sortRef.current.direction === "asc"
            ? { key, direction: "desc" }
            : null;
      setSort(next);
      sortRef.current = next;
      prefetch.current.clear();
      const active = tab;
      setTabs((prev) => {
        const reset: Record<PortRadarTabKey, TabState> = { ...prev };
        for (const t of ["missed", "newly", "upcoming"] as PortRadarTabKey[]) {
          if (t !== active) reset[t] = { ...prev[t], loaded: false, loading: false };
        }
        reset[active] = { ...prev[active], loading: true, error: false };
        return reset;
      });
      void (async () => {
        const data = await fetchPage(active, 1);
        if (data) applyPage(active, data);
        else setTabs((prev) => ({ ...prev, [active]: { ...prev[active], loading: false, error: true } }));
      })();
    },
    [tab, fetchPage, applyPage],
  );

  const state = tabs[tab];

  // Prefer the actual feed count once a tab has loaded; the SSR badge counts are
  // cheap estimates that can differ from the feed's real total (especially the
  // batch-detected "newly" feed), so a loaded tab is the source of truth.
  const badgeCount = (which: PortRadarTabKey) =>
    tabs[which].loaded ? tabs[which].count : counts[which];

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-[#0A0A0C]">
      <div className="flex flex-wrap border-b border-slate-100 dark:border-white/[0.06]">
        {badgeCount("missed") > 0 ? (
          <TabButton
            active={tab === "missed"}
            onClick={() => void openTab("missed")}
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Missed opportunities"
            count={badgeCount("missed")}
            tone="amber"
          />
        ) : null}
        {badgeCount("newly") > 0 ? (
          <TabButton
            active={tab === "newly"}
            onClick={() => void openTab("newly")}
            icon={<Ship className="h-4 w-4" />}
            label="Newly added ETAs"
            count={badgeCount("newly")}
          />
        ) : null}
        <TabButton
          active={tab === "upcoming"}
          onClick={() => void openTab("upcoming")}
          icon={<Radar className="h-4 w-4" />}
          label={`Upcoming ${countryLabel} arrivals`}
          count={badgeCount("upcoming")}
        />
      </div>

      <div className="p-5">
        {tab === "missed" ? (
          <p className="mb-3 text-sm text-amber-800 dark:text-amber-200/80">
            {badgeCount("missed")} vessel{badgeCount("missed") === 1 ? "" : "s"} arriving in &lt; 48h
            with no campaign assigned — select any to add to a list.
          </p>
        ) : null}
        {tab === "newly" ? (
          <p className="mb-3 text-sm text-slate-600 dark:text-white/55">
            {badgeCount("newly")} vessel{badgeCount("newly") === 1 ? "" : "s"} from the most recent
            upload — visible until the next batch arrives.
          </p>
        ) : null}
        {tab === "upcoming" ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-white/55">
              {badgeCount("upcoming")} upcoming vessels match — sorted by ETA
            </p>
            {isSuperAdmin ? (
              <Link href="/dashboard/import" className="text-sm font-medium text-ocean hover:underline">
                Import ETAs
              </Link>
            ) : null}
          </div>
        ) : null}

        {state.error && state.rows.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-dashed border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            <p>Couldn&apos;t load arrivals — the request timed out or the server is busy.</p>
            <button
              type="button"
              onClick={() => void goToPage(tab, 1)}
              className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-transparent dark:text-rose-200"
            >
              Retry
            </button>
          </div>
        ) : (
          <PortRadarArrivals
            etas={state.rows}
            count={state.count}
            page={state.page}
            pageSize={pageSize}
            paging={state.loading}
            onPageChange={(next) => void goToPage(tab, next)}
            sort={sort}
            onSort={onSortColumn}
            portsWithCoordinates={portsWithCoordinates}
            isSuperAdmin={isSuperAdmin}
          />
        )}
      </div>
    </section>
  );
}

function emptyTab(): TabState {
  return { rows: [], count: 0, page: 1, loaded: false, loading: false, error: false };
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  tone = "ocean",
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  tone?: "ocean" | "amber";
}) {
  const activeText =
    tone === "amber"
      ? "border-b-2 border-amber-500 text-amber-700 dark:text-amber-300"
      : "border-b-2 border-ocean text-ocean";
  const activeBadge =
    tone === "amber"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
      : "bg-ocean/10 text-ocean";
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition ${
        active
          ? activeText
          : "text-slate-500 hover:text-slate-800 dark:text-white/60 dark:hover:text-white"
      }`}
    >
      {icon}
      {label}
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${
          active ? activeBadge : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

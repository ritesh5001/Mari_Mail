"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Radar, Ship } from "lucide-react";
import { PortRadarArrivals, type IndiaRadarEta } from "@/components/marine/PortRadarArrivals";

type TabKey = "missed" | "newly" | "upcoming";

/**
 * The three Port Radar feeds (missed opportunities / newly added / upcoming)
 * as tabs, matching the ListViews tab pattern. Tabs that have no rows are
 * hidden — except "Upcoming", which always shows since it's the primary feed.
 */
export function PortRadarTabs({
  countryLabel,
  isSuperAdmin,
  portsWithCoordinates,
  missed,
  newlyAdded,
  upcoming,
  upcomingCount,
  page,
  pageSize,
}: {
  countryLabel: string;
  isSuperAdmin: boolean;
  portsWithCoordinates: string[];
  missed: IndiaRadarEta[];
  newlyAdded: IndiaRadarEta[];
  upcoming: IndiaRadarEta[];
  upcomingCount: number;
  page: number;
  pageSize: number;
}) {
  // Default to the most urgent tab that has content: missed → newly → upcoming.
  const initialTab: TabKey =
    missed.length > 0 ? "missed" : newlyAdded.length > 0 ? "newly" : "upcoming";
  const [tab, setTab] = useState<TabKey>(initialTab);

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-[#0A0A0C]">
      <div className="flex flex-wrap border-b border-slate-100 dark:border-white/[0.06]">
        {missed.length > 0 ? (
          <TabButton
            active={tab === "missed"}
            onClick={() => setTab("missed")}
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Missed opportunities"
            count={missed.length}
            tone="amber"
          />
        ) : null}
        {newlyAdded.length > 0 ? (
          <TabButton
            active={tab === "newly"}
            onClick={() => setTab("newly")}
            icon={<Ship className="h-4 w-4" />}
            label="Newly added ETAs"
            count={newlyAdded.length}
          />
        ) : null}
        <TabButton
          active={tab === "upcoming"}
          onClick={() => setTab("upcoming")}
          icon={<Radar className="h-4 w-4" />}
          label={`Upcoming ${countryLabel} arrivals`}
          count={upcomingCount}
        />
      </div>

      {tab === "missed" && missed.length > 0 ? (
        <div className="p-5">
          <p className="mb-3 text-sm text-amber-800 dark:text-amber-200/80">
            {missed.length} vessel{missed.length === 1 ? "" : "s"} arriving in
            &lt; 48h with no campaign assigned — select any to add to a list.
          </p>
          <PortRadarArrivals
            etas={missed}
            count={missed.length}
            page={1}
            pageSize={missed.length}
            portsWithCoordinates={portsWithCoordinates}
            isSuperAdmin={isSuperAdmin}
          />
        </div>
      ) : null}

      {tab === "newly" && newlyAdded.length > 0 ? (
        <div className="p-5">
          <p className="mb-3 text-sm text-slate-600 dark:text-white/55">
            {newlyAdded.length} vessel{newlyAdded.length === 1 ? "" : "s"} from
            the most recent upload — visible until the next batch arrives.
          </p>
          <PortRadarArrivals
            etas={newlyAdded}
            count={newlyAdded.length}
            page={1}
            pageSize={newlyAdded.length}
            portsWithCoordinates={portsWithCoordinates}
            isSuperAdmin={isSuperAdmin}
          />
        </div>
      ) : null}

      {tab === "upcoming" ? (
        <div className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-white/55">
              {upcomingCount} upcoming vessels match — sorted by ETA
            </p>
            {isSuperAdmin ? (
              <Link
                href="/dashboard/import"
                className="text-sm font-medium text-ocean hover:underline"
              >
                Import ETAs
              </Link>
            ) : null}
          </div>
          <PortRadarArrivals
            etas={upcoming}
            count={upcomingCount}
            page={page}
            pageSize={pageSize}
            portsWithCoordinates={portsWithCoordinates}
            isSuperAdmin={isSuperAdmin}
          />
        </div>
      ) : null}
    </section>
  );
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
          active
            ? activeBadge
            : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

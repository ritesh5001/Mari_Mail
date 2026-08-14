import { Suspense } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Anchor,
  ArrowRight,
  Mail,
  Radar,
  Send,
  Ship,
  TrendingUp,
} from "lucide-react";
import { ActivityChart } from "@/components/analytics/ActivityChart";
import { RangeSwitcher } from "@/components/dashboard/RangeSwitcher";
import { WorkflowJourney } from "@/components/dashboard/WorkflowJourney";
import { NoCountryNotice } from "@/components/marine/NoCountryNotice";
import {
  formatRate,
  formatTrendDetail,
  getOverview,
  requireAnalyticsWorkspace,
  trendDirection,
} from "@/lib/analytics-data";
import { getCampaignItineraryProgress } from "@/lib/onboarding-data";

export const dynamic = "force-dynamic";

const CARD =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none";

function KpiSkeleton() {
  return (
    <div className="space-y-4">
      <section className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className={`h-40 animate-pulse ${CARD}`} />
        ))}
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`h-28 animate-pulse ${CARD}`} />
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className={`h-64 animate-pulse ${CARD}`} />
        <div className={`h-64 animate-pulse ${CARD}`} />
      </section>
    </div>
  );
}

/** Trend caption, colored by direction — muted when there's nothing to compare. */
function TrendNote({ trend, suffix }: { trend: number; suffix: string }) {
  const dir = trendDirection(trend);
  const tone =
    dir === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : dir === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-slate-500 dark:text-white/45";
  return <p className={`mt-3 text-sm ${tone}`}>{formatTrendDetail(trend, suffix)}</p>;
}

async function DashboardKpis({
  workspaceId,
  days,
  countries,
}: {
  workspaceId: string;
  days: number;
  /** The plan's country grant — null means unrestricted. */
  countries: string[] | null;
}) {
  let overview: Awaited<ReturnType<typeof getOverview>> | null = null;
  try {
    overview = await getOverview(workspaceId, days, countries);
  } catch (err) {
    console.error("[dashboard] getOverview failed", err);
  }
  const cards = overview?.cards;
  const sparkline = overview?.sparkline ?? [];

  if (!cards) {
    return (
      <section className={`flex flex-col items-center py-12 text-center ${CARD}`}>
        <AlertCircle className="mb-3 h-8 w-8 text-red-500" />
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          Couldn&rsquo;t load your dashboard
        </h3>
        <p className="mt-1 max-w-sm text-sm text-slate-600 dark:text-white/55">
          The metrics service didn&rsquo;t respond. Your data is safe — this is a display problem.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-[#ffffff] hover:bg-accent-600"
        >
          Try again
        </Link>
      </section>
    );
  }

  const replies = Math.round(cards.avgReplyRate.value * cards.emailsSent.value);
  const missed = cards.missedOpportunities.value;
  // Tier 2 — supporting metrics. Every one drills through; a card that looks
  // clickable (hover ring) must actually go somewhere.
  const secondary = [
    {
      key: "campaigns",
      label: "Active campaigns",
      value: cards.activeCampaigns.value.toLocaleString("en"),
      detail: `${cards.activeCampaigns.newThisMonth} new this month`,
      icon: Send,
      href: "/dashboard/campaigns/cold",
    },
    {
      key: "emails",
      label: `Emails sent (${days}d)`,
      value: cards.emailsSent.value.toLocaleString("en"),
      trend: cards.emailsSent.trend,
      trendSuffix: `vs prior ${days}d`,
      icon: Mail,
      href: "/dashboard/analytics",
    },
    {
      key: "replies",
      label: "Avg reply rate",
      value: formatRate(cards.avgReplyRate.value),
      trend: cards.avgReplyRate.trend,
      trendSuffix: "vs prior period",
      icon: TrendingUp,
      href: "/dashboard/analytics",
    },
    {
      key: "vessels",
      label: "Vessels tracked",
      value: cards.vesselsTracked.value.toLocaleString("en"),
      trend: cards.vesselsTracked.trend,
      trendSuffix: "MoM",
      icon: Ship,
      href: "/dashboard/vessels",
    },
  ];

  const regions = Object.entries(cards.etasThisWeek.byRegion);
  const regionMax = Math.max(...regions.map(([, c]) => Number(c)), 1);

  return (
    <>
      {/* ── Tier 1: the two metrics that drive action ── */}
      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/dashboard/port-radar"
          className={`group ${CARD} transition-colors hover:border-accent-400 dark:hover:border-accent-400/50`}
        >
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium text-slate-500 dark:text-white/50">ETAs this week</p>
            <span className="rounded-md bg-accent-500/10 p-2 text-accent-600 dark:text-accent-300">
              <Radar className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {cards.etasThisWeek.value.toLocaleString("en")}
          </p>
          <p className="mt-3 text-sm text-slate-500 dark:text-white/45">
            {regions.length
              ? regions
                  .slice(0, 3)
                  .map(([r, c]) => `${r.replace(/_/g, " ").toLowerCase()} ${c}`)
                  .join(" · ")
              : "No arrivals scheduled this week"}
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-600 dark:text-accent-300">
            Open Port Radar
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        {/* Missed opportunities is the money metric — ships arriving that nobody
            is contacting. It gets urgency styling, not parity with the rest. */}
        <Link
          href="/dashboard/port-radar?noCampaign=1"
          className={`group rounded-xl border p-5 shadow-sm transition-colors dark:shadow-none ${
            missed > 0
              ? "border-amber-300 bg-amber-50 hover:border-amber-400 dark:border-amber-500/30 dark:bg-amber-500/[0.07]"
              : "border-slate-200 bg-white hover:border-accent-400 dark:border-white/10 dark:bg-white/[0.03]"
          }`}
        >
          <div className="flex items-start justify-between">
            <p
              className={`text-sm font-medium ${
                missed > 0 ? "text-amber-800 dark:text-amber-200" : "text-slate-500 dark:text-white/50"
              }`}
            >
              Missed opportunities
            </p>
            <span
              className={`rounded-md p-2 ${
                missed > 0
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-accent-500/10 text-accent-600 dark:text-accent-300"
              }`}
            >
              <Anchor className="h-5 w-5" />
            </span>
          </div>
          <p
            className={`mt-3 text-4xl font-semibold tracking-tight ${
              missed > 0 ? "text-amber-900 dark:text-amber-100" : "text-slate-900 dark:text-white"
            }`}
          >
            {missed.toLocaleString("en")}
          </p>
          <p
            className={`mt-3 text-sm ${
              missed > 0 ? "text-amber-800/80 dark:text-amber-200/70" : "text-slate-500 dark:text-white/45"
            }`}
          >
            Vessels arriving within 48h with no campaign attached
          </p>
          <span
            className={`mt-3 inline-flex items-center gap-1 text-sm font-semibold ${
              missed > 0 ? "text-amber-900 dark:text-amber-200" : "text-accent-600 dark:text-accent-300"
            }`}
          >
            {missed > 0 ? "Reach them now" : "All covered"}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </section>

      {/* ── Tier 2: supporting metrics ── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {secondary.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.key}
              href={card.href}
              className={`${CARD} transition-colors hover:border-accent-400 dark:hover:border-accent-400/50`}
            >
              <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-slate-500 dark:text-white/50">{card.label}</p>
                <Icon className="h-4 w-4 shrink-0 text-slate-300 dark:text-white/25" />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                {card.value}
              </p>
              {card.trend !== undefined ? (
                <TrendNote trend={card.trend} suffix={card.trendSuffix ?? ""} />
              ) : (
                <p className="mt-3 text-sm text-slate-500 dark:text-white/45">{card.detail}</p>
              )}
            </Link>
          );
        })}
      </section>

      {/* ── Activity + regions ── */}
      <section className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <article className={CARD}>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">Daily activity</h3>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-white/45">Last {days} days</p>
              </div>
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-white/35">Sent</p>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                    {cards.emailsSent.value.toLocaleString("en")}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-white/35">Replied</p>
                  <p className="text-2xl font-semibold text-[#10B981] dark:text-[#0EA37A]">
                    {replies.toLocaleString("en")}
                  </p>
                </div>
              </div>
            </div>
            <ActivityChart points={sparkline} />
          </article>

          <article className={CARD}>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">ETAs by region</h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-white/45">This week</p>
            <ul className="mt-4 space-y-3">
              {regions.length === 0 ? (
                <li className="text-sm text-slate-400 dark:text-white/35">No ETAs scheduled this week.</li>
              ) : (
                regions.map(([region, count]) => (
                  <li key={region}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="capitalize text-slate-700 dark:text-white/75">
                        {region.replace(/_/g, " ").toLowerCase()}
                      </span>
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                        {Number(count).toLocaleString("en")}
                      </span>
                    </div>
                    {/* Proportion is readable at a glance instead of mental math. */}
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.07]">
                      <div
                        className="h-full rounded-full bg-accent-500"
                        style={{ width: `${Math.max((Number(count) / regionMax) * 100, 3)}%` }}
                      />
                    </div>
                  </li>
                ))
              )}
            </ul>
          </article>
      </section>
    </>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { workspaceId, userId, workspace, countries, hasCountryGrant } =
    await requireAnalyticsWorkspace();
  const itinerary = await getCampaignItineraryProgress(workspaceId, userId);
  const days = (() => {
    const raw = typeof searchParams.range === "string" ? Number(searchParams.range) : 30;
    return [7, 30, 90].includes(raw) ? raw : 30;
  })();

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-600 dark:text-accent-300">
              {workspace.name}
            </p>
            <h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
              Workspace overview
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-white/55">
              Real-time KPIs across vessels, campaigns, engagement, and ETA-triggered automation.
            </p>
          </div>
          {/* Range control and the analytics link are separate jobs — the solid
              blue button no longer competes with the control beside it. */}
          <div className="flex shrink-0 items-center gap-3">
            <RangeSwitcher ranges={[7, 30, 90]} active={days} />
            <Link
              href="/dashboard/analytics"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-accent-400 hover:text-accent-600 dark:border-white/10 dark:text-white/70 dark:hover:border-accent-400/50 dark:hover:text-accent-300"
            >
              Analytics
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <WorkflowJourney progress={itinerary} />

      {/* No country granted = every ETA figure below is legitimately zero.
          Say why, but do NOT offer a picker: the target country is chosen at
          onboarding and set by the plan, so letting someone re-pick it here
          would be a second, unpriced way to change a paid entitlement. */}
      {hasCountryGrant ? null : <NoCountryNotice />}

      <Suspense fallback={<KpiSkeleton />}>
        <DashboardKpis workspaceId={workspaceId} days={days} countries={countries} />
      </Suspense>
    </div>
  );
}

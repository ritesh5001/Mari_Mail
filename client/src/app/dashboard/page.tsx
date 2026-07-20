import { Suspense } from "react";
import Link from "next/link";
import { Anchor, Mail, Radar, Send, Ship, TrendingUp } from "lucide-react";
import { Sparkline } from "@/components/analytics/Sparkline";
import {
  formatRate,
  formatTrend,
  getOverview,
  requireAnalyticsWorkspace,
} from "@/lib/analytics-data";

export const dynamic = "force-dynamic";

function KpiSkeleton() {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="h-4 w-24 rounded bg-slate-100" />
          <div className="mt-3 h-8 w-16 rounded bg-slate-100" />
          <div className="mt-4 h-3 w-32 rounded bg-slate-100" />
        </div>
      ))}
    </section>
  );
}

function ActivitySkeleton() {
  return (
    <section className="grid gap-4 lg:grid-cols-[2fr,1fr]">
      <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-white p-5 shadow-sm" />
      <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-white p-5 shadow-sm" />
    </section>
  );
}

async function DashboardKpis({ workspaceId, days }: { workspaceId: string; days: number }) {
  let overview: Awaited<ReturnType<typeof getOverview>> | null = null;
  try {
    overview = await getOverview(workspaceId, days);
  } catch (err) {
    console.error("[dashboard] getOverview failed", err);
  }
  const cards = overview?.cards;
  const sparkline = overview?.sparkline ?? [];

  if (!cards) {
    return <p className="text-sm text-slate-500">Dashboard data is currently unavailable.</p>;
  }

  const cardItems = [
    { key: "vessels", label: "Vessels Tracked", value: cards.vesselsTracked.value, detail: `${formatTrend(cards.vesselsTracked.trend)} MoM`, icon: Ship },
    {
      key: "etas",
      label: "ETAs This Week",
      value: cards.etasThisWeek.value,
      detail: Object.entries(cards.etasThisWeek.byRegion)
        .slice(0, 3)
        .map(([region, count]) => `${region.replace(/_/g, " ")} ${count}`)
        .join(" · "),
      icon: Radar,
    },
    { key: "campaigns", label: "Active Campaigns", value: cards.activeCampaigns.value, detail: `${cards.activeCampaigns.newThisMonth} new this month`, icon: Send },
    { key: "emails", label: `Emails Sent (${days}d)`, value: cards.emailsSent.value.toLocaleString("en"), detail: `${formatTrend(cards.emailsSent.trend)} vs prior ${days}d`, icon: Mail },
    { key: "replies", label: "Avg Reply Rate", value: formatRate(cards.avgReplyRate.value), detail: `${formatTrend(cards.avgReplyRate.trend)} vs prior period`, icon: TrendingUp },
    { key: "missed", label: "Missed Opportunities", value: cards.missedOpportunities.value, detail: "ETAs < 48h with no campaign", icon: Anchor, href: "/dashboard/port-radar" },
  ];

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cardItems.map((card) => {
          const Icon = card.icon;
          const inner = (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">{card.label}</p>
                  <p className="mt-3 text-3xl font-semibold text-navy">{card.value}</p>
                </div>
                <div className="rounded-md bg-ocean/10 p-2 text-ocean">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-500">{card.detail || "—"}</p>
            </>
          );
          return card.href ? (
            <Link key={card.key} href={card.href} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-ocean">{inner}</Link>
          ) : (
            <article key={card.key} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-ocean">{inner}</article>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Daily activity</h3>
          <div className="mt-3 flex items-end gap-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Sent</p>
              <p className="text-3xl font-semibold text-navy">{cards.emailsSent.value.toLocaleString("en")}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Replied</p>
              <p className="text-3xl font-semibold text-ocean">{Math.round(cards.avgReplyRate.value * cards.emailsSent.value).toLocaleString("en")}</p>
            </div>
            <div className="ml-auto"><Sparkline points={sparkline} width={220} height={56} /></div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Solid line = sent · dashed line = replied (last {days} days).</p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">ETAs by region (this week)</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {Object.entries(cards.etasThisWeek.byRegion).length === 0 ? (
              <li className="text-slate-400">No ETAs scheduled this week.</li>
            ) : (
              Object.entries(cards.etasThisWeek.byRegion).map(([region, count]) => (
                <li key={region} className="flex items-center justify-between">
                  <span className="capitalize text-slate-700">{region.replace(/_/g, " ").toLowerCase()}</span>
                  <span className="rounded-full bg-ocean/10 px-2 py-0.5 text-xs font-semibold text-ocean">{count}</span>
                </li>
              ))
            )}
          </ul>
        </article>
      </section>
    </>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { workspaceId, workspace } = await requireAnalyticsWorkspace();
  const days = (() => {
    const raw = typeof searchParams.range === "string" ? Number(searchParams.range) : 30;
    return [7, 30, 90].includes(raw) ? raw : 30;
  })();

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-ocean">{workspace.name}</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Workspace overview</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Real-time KPIs across vessels, campaigns, engagement, and ETA-triggered automation.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium uppercase tracking-wide text-slate-500">Range</span>
            {[7, 30, 90].map((range) => {
              const active = range === days;
              return (
                <Link key={range} href={`/dashboard?range=${range}`} className={`rounded-md px-3 py-1 ${active ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {range}d
                </Link>
              );
            })}
            <Link href="/dashboard/analytics" className="ml-2 rounded-md bg-ocean px-3 py-1 text-white">Analytics →</Link>
          </div>
        </div>
      </section>

      <Suspense fallback={<><KpiSkeleton /><ActivitySkeleton /></>}>
        <DashboardKpis workspaceId={workspaceId} days={days} />
      </Suspense>
    </div>
  );
}

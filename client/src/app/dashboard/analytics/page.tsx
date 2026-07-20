import Link from "next/link";
import { ArrowRight, BarChart3, Map as MapIcon, Building2, Users } from "lucide-react";
import {
  getOverview,
  listWorkspaceCampaigns,
  requireAnalyticsWorkspace,
} from "@/lib/analytics-data";

export const dynamic = "force-dynamic";

export default async function AnalyticsHome() {
  const { workspaceId } = await requireAnalyticsWorkspace();
  const [overview, campaigns] = await Promise.all([
    getOverview(workspaceId, 30),
    listWorkspaceCampaigns(workspaceId),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-ocean" />
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Analytics</h2>
            <p className="text-sm text-slate-600">Funnel performance, port heat maps, operator behaviour intelligence, exportable reports.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <AnalyticsCard
          href="/dashboard/analytics/ports"
          icon={MapIcon}
          title="Port performance"
          description="Reply rates by port, best Day-N timing, port × vessel-type heat map."
          subtitle={`Tracking ${overview.cards.etasThisWeek.value} ETAs this week`}
        />
        <AnalyticsCard
          href="/dashboard/analytics/operators"
          icon={Building2}
          title="Operator intelligence"
          description="Top engaged companies, dead operators, recent activity, ETA conversion."
          subtitle={`Avg reply rate ${(overview.cards.avgReplyRate.value * 100).toFixed(1)}%`}
        />
        <AnalyticsCard
          href="/dashboard/campaigns"
          icon={Users}
          title="Campaigns"
          description="Open campaign analytics from the campaigns list."
          subtitle={`${overview.cards.activeCampaigns.value} active campaigns`}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Per-campaign analytics</h3>
        <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Campaign</th>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Events</th>
                <th className="px-3 py-2">Contacts</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{campaign.name}</td>
                  <td className="px-3 py-2 text-slate-600">{campaign.triggerType.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-slate-600">{campaign.status}</td>
                  <td className="px-3 py-2 text-slate-600">{campaign._count.emailEvents}</td>
                  <td className="px-3 py-2 text-slate-600">{campaign._count.contacts}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/dashboard/campaigns/${campaign.id}/analytics`} className="text-xs font-semibold text-ocean hover:underline">
                      Open <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
              {campaigns.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">No campaigns yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AnalyticsCard({ href, icon: Icon, title, description, subtitle }: { href: string; icon: typeof BarChart3; title: string; description: string; subtitle: string }) {
  return (
    <Link href={href} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-ocean">
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-ocean/10 p-2 text-ocean"><Icon className="h-5 w-5" /></div>
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      </div>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ocean">{subtitle}</p>
    </Link>
  );
}

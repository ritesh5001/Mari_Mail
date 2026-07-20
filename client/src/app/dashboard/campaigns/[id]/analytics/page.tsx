import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { ExportButtons } from "@/components/analytics/ExportButtons";
import { CampaignScheduleTable } from "@/components/analytics/CampaignScheduleTable";
import { formatRate, getCampaignAnalytics, getCampaignSchedule, requireAnalyticsWorkspace } from "@/lib/analytics-data";

export const dynamic = "force-dynamic";

export default async function CampaignAnalyticsPage({ params }: { params: { id: string } }) {
  const { workspaceId } = await requireAnalyticsWorkspace();
  const [analytics, schedule] = await Promise.all([
    getCampaignAnalytics(workspaceId, params.id),
    getCampaignSchedule(workspaceId, params.id),
  ]);
  if (!analytics) notFound();

  const { campaign, funnel, steps, perVessel } = analytics;
  const funnelStages: Array<{ label: string; value: number; tone: string }> = [
    { label: "Sent", value: funnel.sent, tone: "bg-navy" },
    { label: "Opened", value: funnel.opened, tone: "bg-ocean" },
    { label: "Clicked", value: funnel.clicked, tone: "bg-emerald-500" },
    { label: "Replied", value: funnel.replied, tone: "bg-gold" },
    { label: "Bounced", value: funnel.bounced, tone: "bg-red-400" },
    { label: "Unsubscribed", value: funnel.unsubscribed, tone: "bg-slate-400" },
  ];
  const maxStage = Math.max(...funnelStages.map((s) => s.value), 1);

  return (
    <div className="space-y-6" id="campaign-analytics-export">
      <Link href="/dashboard/analytics" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-ocean">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to analytics
      </Link>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-ocean" />
            <div>
              <h2 className="text-2xl font-semibold text-slate-950">{campaign.name}</h2>
              <p className="text-sm text-slate-600">{campaign.triggerType.replace(/_/g, " ")} · {campaign.status}</p>
            </div>
          </div>
          <ExportButtons pdfFilename={`marimail-${campaign.id}`} pdfTargetId="campaign-analytics-export" />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Funnel</h3>
        <div className="mt-3 space-y-2">
          {funnelStages.map((stage) => (
            <div key={stage.label} className="flex items-center gap-3 text-sm">
              <div className="w-32 font-medium text-slate-900">{stage.label}</div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${stage.tone}`} style={{ width: `${(stage.value / maxStage) * 100}%` }} />
              </div>
              <div className="w-16 text-right text-slate-600">{stage.value.toLocaleString("en")}</div>
            </div>
          ))}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat label="Open rate" value={formatRate(funnel.openRate)} />
          <Stat label="Click rate" value={formatRate(funnel.clickRate)} />
          <Stat label="Reply rate" value={formatRate(funnel.replyRate)} />
          <Stat label="Bounce rate" value={formatRate(funnel.bounceRate)} />
        </dl>
      </section>

      {schedule ? <CampaignScheduleTable schedule={schedule} /> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Per-step performance</h3>
        <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Step</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Day</th>
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Open</th>
                <th className="px-3 py-2">Click</th>
                <th className="px-3 py-2">Reply</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => (
                <tr key={step.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">Step {step.stepOrder}</td>
                  <td className="px-3 py-2 text-slate-600 truncate max-w-xs">{step.subject}</td>
                  <td className="px-3 py-2 text-slate-600">{step.delayType === "DAYS_BEFORE_ETA" ? `Day -${step.delayValue}` : `+${step.delayValue} days`}</td>
                  <td className="px-3 py-2 text-slate-600">{step.sent}</td>
                  <td className="px-3 py-2 text-slate-600">{formatRate(step.openRate)}</td>
                  <td className="px-3 py-2 text-slate-600">{formatRate(step.clickRate)}</td>
                  <td className="px-3 py-2 text-slate-600">{formatRate(step.replyRate)}</td>
                </tr>
              ))}
              {steps.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">No sequence steps yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Per-vessel breakdown</h3>
        <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Vessel</th>
                <th className="px-3 py-2">IMO</th>
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Replied</th>
                <th className="px-3 py-2">Reply rate</th>
              </tr>
            </thead>
            <tbody>
              {perVessel.map((row) => (
                <tr key={row.imoNumber} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">
                    <Link href={`/dashboard/vessels/${row.imoNumber}`} className="hover:text-ocean">{row.vesselName}</Link>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.imoNumber}</td>
                  <td className="px-3 py-2 text-slate-600">{row.sent}</td>
                  <td className="px-3 py-2 text-slate-600">{row.replied}</td>
                  <td className="px-3 py-2 text-slate-600">{formatRate(row.replyRate)}</td>
                </tr>
              ))}
              {perVessel.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">No vessel-level events yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-navy">{value}</dd>
    </div>
  );
}

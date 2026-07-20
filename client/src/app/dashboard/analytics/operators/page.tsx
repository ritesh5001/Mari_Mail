import { Building2, Mail, MessageCircle, Eye } from "lucide-react";
import { ExportButtons } from "@/components/analytics/ExportButtons";
import { formatRate, getOperatorAnalytics, requireAnalyticsWorkspace } from "@/lib/analytics-data";

export const dynamic = "force-dynamic";

export default async function OperatorsPage() {
  const { workspaceId } = await requireAnalyticsWorkspace();
  const data = await getOperatorAnalytics(workspaceId);

  return (
    <div className="space-y-6" id="operators-export">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-ocean" />
            <div>
              <h2 className="text-2xl font-semibold text-slate-950">Operator behaviour intelligence</h2>
              <p className="text-sm text-slate-600">Top engaged companies, dead operators, ETA conversion, recent activity feed.</p>
            </div>
          </div>
          <ExportButtons pdfFilename="marimail-operators" pdfTargetId="operators-export" />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Top engaged companies</h3>
        <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Opened</th>
                <th className="px-3 py-2">Replied</th>
                <th className="px-3 py-2">Open rate</th>
                <th className="px-3 py-2">Reply rate</th>
              </tr>
            </thead>
            <tbody>
              {data.topCompanies.map((row) => (
                <tr key={row.companyName} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{row.companyName}</td>
                  <td className="px-3 py-2 text-slate-600">{row.sent}</td>
                  <td className="px-3 py-2 text-slate-600">{row.opened}</td>
                  <td className="px-3 py-2 text-slate-600">{row.replied}</td>
                  <td className="px-3 py-2 text-slate-600">{formatRate(row.openRate)}</td>
                  <td className="px-3 py-2 text-slate-600">{formatRate(row.replyRate)}</td>
                </tr>
              ))}
              {data.topCompanies.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">No company-level events yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-900">Dead operators</h3>
          <p className="text-xs text-amber-800">&gt; 10 emails sent, 0 opens in 90 days — re-engagement candidates.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {data.deadOperators.length === 0 ? (
              <li className="text-amber-800">None right now — every operator has opened at least once.</li>
            ) : (
              data.deadOperators.map((operator) => (
                <li key={operator.companyName} className="flex items-center justify-between rounded-md bg-white px-3 py-2 shadow-sm">
                  <span className="font-medium text-slate-900">{operator.companyName}</span>
                  <span className="text-xs text-slate-500">{operator.sent} sent · {operator.opens} opens</span>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent activity (7d)</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {data.activity.length === 0 ? (
              <li className="text-slate-500">No recent engagement.</li>
            ) : (
              data.activity.map((entry, idx) => {
                const Icon = entry.eventType === "REPLIED" ? MessageCircle : entry.eventType === "OPENED" ? Eye : Mail;
                return (
                  <li key={idx} className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 text-ocean" />
                    <div>
                      <p className="text-slate-800">{entry.company} — <span className="text-slate-500">{entry.contact}</span></p>
                      <p className="text-xs text-slate-500">{entry.eventType.toLowerCase()} · {entry.campaign} · {new Date(entry.occurredAt).toLocaleString()}</p>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </article>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">ETA conversion</h3>
        <p className="text-xs text-slate-500">Which port × vessel-type × cargo combinations generate the most replies.</p>
        <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Port</th>
                <th className="px-3 py-2">Vessel type</th>
                <th className="px-3 py-2">Prev → Next cargo</th>
                <th className="px-3 py-2">Triggered</th>
                <th className="px-3 py-2">Replied</th>
                <th className="px-3 py-2">Reply rate</th>
              </tr>
            </thead>
            <tbody>
              {data.etaConversion.map((row, idx) => (
                <tr key={`${row.portCode}-${row.vesselType}-${idx}`} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{row.portCode}</td>
                  <td className="px-3 py-2 text-slate-600">{row.vesselType.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-slate-600">{row.previousCargo ?? "—"} → {row.nextCargo ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{row.triggered}</td>
                  <td className="px-3 py-2 text-slate-600">{row.replied}</td>
                  <td className="px-3 py-2 text-slate-600">{formatRate(row.replyRate)}</td>
                </tr>
              ))}
              {data.etaConversion.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">No ETA-conversion data yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

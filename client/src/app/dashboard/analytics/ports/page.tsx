import { Map as MapIcon } from "lucide-react";
import { ExportButtons } from "@/components/analytics/ExportButtons";
import { formatRate, getPortAnalytics, requireAnalyticsWorkspace } from "@/lib/analytics-data";

export const dynamic = "force-dynamic";

export default async function PortAnalyticsPage() {
  const { workspaceId } = await requireAnalyticsWorkspace();
  const data = await getPortAnalytics(workspaceId);
  const maxRate = Math.max(0.0001, ...data.ports.map((p) => p.replyRate));

  const heatmapPorts = Array.from(new Set(data.heatmap.map((row) => row.portCode))).sort();
  const heatmapTypes = Array.from(new Set(data.heatmap.map((row) => row.vesselType))).sort();
  const heatIndex = new Map(data.heatmap.map((row) => [`${row.portCode}|${row.vesselType}`, row]));

  return (
    <div className="space-y-6" id="port-analytics-export">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <MapIcon className="h-6 w-6 text-ocean" />
            <div>
              <h2 className="text-2xl font-semibold text-slate-950">Port performance</h2>
              <p className="text-sm text-slate-600">Reply rate by port, Day-N timing, and port × vessel-type heat map.</p>
            </div>
          </div>
          <ExportButtons pdfFilename="marimail-port-performance" pdfTargetId="port-analytics-export" csvHref={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/analytics/ports.csv`} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Reply rate by port</h3>
        <div className="mt-4 space-y-2">
          {data.ports.length === 0 ? (
            <p className="text-sm text-slate-500">No campaign activity yet — once campaigns send, this chart populates.</p>
          ) : (
            data.ports.map((port) => (
              <div key={port.portCode} className="flex items-center gap-3 text-sm">
                <div className="w-44 truncate font-medium text-slate-900">{port.portName}</div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-ocean" style={{ width: `${Math.min(100, (port.replyRate / maxRate) * 100)}%` }} />
                </div>
                <div className="w-20 text-right text-xs text-slate-500">{formatRate(port.replyRate)}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Best Day-N timing</h3>
          <p className="text-xs text-slate-500">Where each step in the IPC sequence converts best</p>
        </div>
        <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Day before ETA</th>
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Replied</th>
                <th className="px-3 py-2">Reply rate</th>
              </tr>
            </thead>
            <tbody>
              {data.bestStep.map((step) => (
                <tr key={step.daysBefore} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">Day -{step.daysBefore}</td>
                  <td className="px-3 py-2 text-slate-600">{step.sent}</td>
                  <td className="px-3 py-2 text-slate-600">{step.replied}</td>
                  <td className="px-3 py-2 text-slate-600">{formatRate(step.replyRate)}</td>
                </tr>
              ))}
              {data.bestStep.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">No ETA-step events yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Port × Vessel-type heat map</h3>
        {heatmapPorts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No heat-map data yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-1 text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-slate-500">Port</th>
                  {heatmapTypes.map((type) => (
                    <th key={type} className="px-2 py-1 text-left text-slate-500">{type.replace(/_/g, " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapPorts.map((port) => (
                  <tr key={port}>
                    <td className="px-2 py-1 font-medium text-slate-700">{port}</td>
                    {heatmapTypes.map((type) => {
                      const cell = heatIndex.get(`${port}|${type}`);
                      const intensity = cell ? Math.min(1, cell.replyRate / Math.max(maxRate, 0.0001)) : 0;
                      return (
                        <td
                          key={type}
                          className="rounded-md px-2 py-1 text-center text-slate-700"
                          style={{ backgroundColor: cell ? `rgba(0, 119, 182, ${0.15 + intensity * 0.65})` : "rgba(148,163,184,0.1)" }}
                          title={cell ? `Sent ${cell.sent}, replied ${cell.replied}` : "No data"}
                        >
                          {cell ? formatRate(cell.replyRate) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Detail table</h3>
        <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Port</th>
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Open rate</th>
                <th className="px-3 py-2">Reply rate</th>
                <th className="px-3 py-2">Active campaigns</th>
              </tr>
            </thead>
            <tbody>
              {data.ports.map((port) => (
                <tr key={port.portCode} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{port.portName} <span className="text-xs text-slate-500">({port.portCode})</span></td>
                  <td className="px-3 py-2 text-slate-600">{port.sent}</td>
                  <td className="px-3 py-2 text-slate-600">{formatRate(port.openRate)}</td>
                  <td className="px-3 py-2 text-slate-600">{formatRate(port.replyRate)}</td>
                  <td className="px-3 py-2 text-slate-600">{port.campaigns}</td>
                </tr>
              ))}
              {data.ports.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">Nothing to show yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

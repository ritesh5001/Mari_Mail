import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MessageCircle, Eye, Wrench } from "lucide-react";
import { ExportButtons } from "@/components/analytics/ExportButtons";
import { ServiceRecordForm } from "@/components/analytics/ServiceRecordForm";
import { formatRate, getVesselCrm, requireAnalyticsWorkspace } from "@/lib/analytics-data";

export const dynamic = "force-dynamic";

export default async function VesselCrmPage({ params }: { params: { imo: string } }) {
  const { workspaceId } = await requireAnalyticsWorkspace();
  const crm = await getVesselCrm(workspaceId, params.imo);
  if (!crm) notFound();

  const { vessel, services, timeline, totals, lastContactedAt, timesContacted } = crm;
  const sent = totals.SENT ?? 0;
  const opened = totals.OPENED ?? 0;
  const clicked = totals.CLICKED ?? 0;
  const replied = totals.REPLIED ?? 0;

  return (
    <div className="space-y-6" id="vessel-crm-export">
      <Link href={`/dashboard/vessels/${vessel.imoNumber}`} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-ocean">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to vessel
      </Link>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Vessel CRM history</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">{vessel.vesselName}</h2>
            <p className="text-sm text-slate-600">IMO {vessel.imoNumber} · {vessel.vesselType.replace(/_/g, " ")}</p>
          </div>
          <ExportButtons pdfFilename={`marimail-crm-${vessel.imoNumber}`} pdfTargetId="vessel-crm-export" />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat label="Last contacted" value={lastContactedAt ? new Date(lastContactedAt).toLocaleDateString() : "—"} />
          <Stat label="Times contacted" value={timesContacted.toString()} />
          <Stat label="Reply rate" value={formatRate(sent ? replied / sent : 0)} />
          <Stat label="Open rate" value={formatRate(sent ? opened / sent : 0)} />
        </dl>
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Interaction timeline</h3>
          <ul className="mt-3 space-y-3">
            {timeline.length === 0 ? (
              <li className="text-sm text-slate-500">No campaign emails sent to this vessel&apos;s contacts yet.</li>
            ) : (
              timeline.map((event) => {
                const Icon = event.eventType === "REPLIED" ? MessageCircle : event.eventType === "OPENED" ? Eye : Mail;
                return (
                  <li key={event.id} className="flex gap-3 rounded-md border border-slate-100 bg-slate-50 p-3 text-sm">
                    <Icon className="mt-0.5 h-4 w-4 text-ocean" />
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{event.eventType.toLowerCase()} · {event.campaign?.name ?? "Unknown campaign"}</p>
                      <p className="text-xs text-slate-500">{event.contact?.companyName ?? "—"} · {event.contact?.firstName ?? ""} {event.contact?.lastName ?? ""} · {event.contact?.email ?? ""}</p>
                      {event.sequence ? <p className="text-xs text-slate-500">Step {event.sequence.stepOrder} — {event.sequence.subject}</p> : null}
                      <p className="text-xs text-slate-400">{new Date(event.occurredAt).toLocaleString()}</p>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </article>

        <article className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Service history</h3>
              <Wrench className="h-4 w-4 text-ocean" />
            </div>
            {services.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No services logged yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {services.map((service) => (
                  <li key={service.id} className="rounded-md border border-slate-100 p-2">
                    <p className="font-medium text-slate-900">{service.serviceName}</p>
                    <p className="text-xs text-slate-500">
                      {service.portCode ?? "—"} · {new Date(service.serviceDate).toLocaleDateString()}
                      {service.amount !== null && service.amount !== undefined ? ` · ${service.currency ?? "USD"} ${service.amount.toLocaleString("en")}` : ""}
                    </p>
                    {service.notes ? <p className="mt-1 text-xs text-slate-500">{service.notes}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ServiceRecordForm imoNumber={vessel.imoNumber} />
        </article>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Funnel totals</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat label="Sent" value={sent.toString()} />
          <Stat label="Opened" value={opened.toString()} />
          <Stat label="Clicked" value={clicked.toString()} />
          <Stat label="Replied" value={replied.toString()} />
        </dl>
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

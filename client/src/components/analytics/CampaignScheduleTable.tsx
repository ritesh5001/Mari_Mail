import { Clock, Mail, Ship } from "lucide-react";
import type { CampaignScheduleData, ScheduleStepStatus } from "@/lib/analytics-data";

/** Full UTC timestamp, e.g. "14 Jul 2026, 12:30 UTC". */
function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(d)} UTC`;
}

const STATUS_STYLE: Record<ScheduleStepStatus, string> = {
  SENT: "bg-emerald-100 text-emerald-700",
  SCHEDULED: "bg-ocean/10 text-ocean",
  SKIPPED: "bg-slate-100 text-slate-500",
  PENDING: "bg-amber-100 text-amber-700",
  FAILED: "bg-red-100 text-red-700",
  BOUNCED: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<ScheduleStepStatus, string> = {
  SENT: "Sent",
  SCHEDULED: "Scheduled",
  SKIPPED: "Skipped (window passed)",
  PENDING: "Pending",
  FAILED: "Failed",
  BOUNCED: "Bounced",
};

export function CampaignScheduleTable({ schedule }: { schedule: CampaignScheduleData }) {
  const { recipients, isEta } = schedule;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Delivery schedule — who gets which mail, when
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        {isEta
          ? "Each step fires relative to the vessel's ETA (times in UTC). Steps whose days-before-ETA window had already passed at launch are marked Skipped."
          : "Each step sends on the schedule window after launch (times in UTC)."}
      </p>

      {recipients.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No recipients enrolled yet. Launch the campaign (or wait for a matching ETA) to populate the schedule.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {recipients.map((recipient) => (
            <div key={recipient.campaignContactId} className="overflow-hidden rounded-lg border border-slate-200">
              {/* Recipient header */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  {recipient.name}
                </span>
                <span className="text-xs text-slate-500">{recipient.email}</span>
                {recipient.companyName ? (
                  <span className="text-xs text-slate-400">· {recipient.companyName}</span>
                ) : null}
                {recipient.vesselName ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-ocean/10 px-2 py-0.5 text-[11px] font-semibold text-ocean">
                    <Ship className="h-3 w-3" />
                    {recipient.vesselName}
                    {recipient.imoNumber ? ` · IMO ${recipient.imoNumber}` : ""}
                  </span>
                ) : null}
                {recipient.eta ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-300"
                    title={`Vessel ETA${recipient.etaPort ? ` — ${recipient.etaPort}` : ""} (UTC)`}
                  >
                    <Clock className="h-3 w-3" />
                    ETA {formatWhen(recipient.eta)}
                    {recipient.etaPort ? ` · ${recipient.etaPort}` : ""}
                  </span>
                ) : null}
              </div>

              {/* Per-step schedule */}
              <table className="min-w-full text-sm">
                <thead className="bg-white text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Step</th>
                    <th className="px-4 py-2 font-semibold">Subject</th>
                    <th className="px-4 py-2 font-semibold">Timing</th>
                    <th className="px-4 py-2 font-semibold">When (UTC)</th>
                    <th className="px-4 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recipient.steps.map((step) => (
                    <tr key={step.stepOrder}>
                      <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">Step {step.stepOrder}</td>
                      <td className="max-w-xs truncate px-4 py-2 text-slate-600" title={step.subject}>
                        {step.subject || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                        {step.delayType === "DAYS_BEFORE_ETA"
                          ? `${step.delayValue} day${step.delayValue === 1 ? "" : "s"} before ETA`
                          : step.delayValue === 0
                            ? "On launch"
                            : `+${step.delayValue} day${step.delayValue === 1 ? "" : "s"}`}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-700">{formatWhen(step.at)}</td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[step.status]}`}>
                          {STATUS_LABEL[step.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { ChevronRight, Clock, Mail, Ship } from "lucide-react";
import type { StepBreakdownRow, StepMailRow } from "@/lib/campaign-data";

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function delayLabel(row: StepBreakdownRow) {
  if (row.stepOrder === 1 && row.delayValue === 0) return "Sends first";
  if (row.delayType === "DAYS_BEFORE_ETA") {
    return `${row.delayValue} day${row.delayValue === 1 ? "" : "s"} before ETA`;
  }
  return `+${row.delayValue} day${row.delayValue === 1 ? "" : "s"} after previous step`;
}

function stateTone(state: StepMailRow["state"]) {
  if (state === "SENT") return "bg-emerald-100 text-emerald-700";
  if (state === "FAILED") return "bg-red-100 text-red-700";
  if (state === "SCHEDULED") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

/**
 * Every sequence step, always listed — each with its own to-go / sent / pending
 * counts, expanding to the individual mails and their send times.
 */
export function CampaignStepBreakdown({ steps }: { steps: StepBreakdownRow[] }) {
  // Step 1 open by default: it's the one with something happening on a fresh
  // campaign, and an all-collapsed list reads as an empty page.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(steps.length ? [steps[0].sequenceId] : []),
  );

  function toggle(sequenceId: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(sequenceId)) next.delete(sequenceId);
      else next.add(sequenceId);
      return next;
    });
  }

  if (steps.length === 0) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
        This campaign has no sequence steps yet.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {steps.map((step) => {
        const isOpen = open.has(step.sequenceId);
        const nextLabel = formatDate(step.nextAt);
        return (
          <div
            key={step.sequenceId}
            className="overflow-hidden rounded-md border border-slate-200 bg-white"
          >
            <button
              type="button"
              onClick={() => toggle(step.sequenceId)}
              aria-expanded={isOpen}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
            >
              <ChevronRight
                className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-950">Step {step.stepOrder}</span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="truncate text-sm text-slate-600">
                    {step.subject || "(no subject)"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="font-medium text-slate-700">
                    {step.toGo} mail{step.toGo === 1 ? "" : "s"} in this step
                  </span>
                  <span className="text-emerald-700">{step.sent} sent</span>
                  <span className="text-amber-700">{step.pending} pending</span>
                  {step.failed > 0 ? <span className="text-red-700">{step.failed} failed</span> : null}
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">{delayLabel(step)}</span>
                  {nextLabel ? (
                    <>
                      <span className="text-slate-400">·</span>
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Clock className="h-3 w-3" />
                        next {nextLabel}
                        {step.nextAtProjected ? " (projected)" : ""}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </button>

            {isOpen ? (
              <div className="border-t border-slate-100">
                {step.mails.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-500">
                    No recipients are enrolled for this step yet.
                  </p>
                ) : (
                  <div className="max-h-[calc(100vh-320px)] overflow-auto overscroll-x-contain">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 z-30 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226,232,240)]">
                        <tr>
                          <th className="px-4 py-2">Recipient</th>
                          <th className="px-4 py-2">Mail</th>
                          <th className="px-4 py-2">Vessel</th>
                          <th className="px-4 py-2">Status</th>
                          <th className="px-4 py-2">Send time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {step.mails.map((mail) => {
                          const when = formatDate(mail.at);
                          return (
                            <tr
                              key={mail.contactId}
                              className="border-t border-slate-100 align-top"
                            >
                              <td className="px-4 py-3">
                                <p className="font-medium text-slate-950">{mail.name}</p>
                                <p className="text-xs text-slate-500">{mail.email}</p>
                                {mail.companyName ? (
                                  <p className="text-xs text-slate-400">{mail.companyName}</p>
                                ) : null}
                              </td>
                              <td className="max-w-xs px-4 py-3">
                                <p className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                                  <Mail className="h-3 w-3 shrink-0 text-slate-400" />
                                  <span className="truncate">{step.subject || "(no subject)"}</span>
                                </p>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-600">
                                {mail.vesselName ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <Ship className="h-3 w-3 shrink-0 text-slate-400" />
                                    <span>
                                      {mail.vesselName}
                                      {mail.vesselImo ? (
                                        <span className="block text-slate-400">
                                          IMO {mail.vesselImo}
                                        </span>
                                      ) : null}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stateTone(mail.state)}`}
                                >
                                  {mail.state}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-xs">
                                {when ? (
                                  <>
                                    <span
                                      className={mail.state === "SENT" ? "text-slate-600" : "text-amber-700"}
                                    >
                                      {when}
                                    </span>
                                    {mail.projected ? (
                                      <span
                                        className="block text-slate-400"
                                        title="Estimated from this step's delay — the exact time is set when the step is queued."
                                      >
                                        projected
                                      </span>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className="text-slate-400">
                                    {mail.state === "FAILED" ? "—" : "not scheduled yet"}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronRight, Clock, Loader2, Mail, Send, Ship, XCircle } from "lucide-react";
import type { StepBreakdownRow, StepMailRow } from "@/lib/campaign-data";
import { apiFetch } from "@/lib/browser-fetch";
import { SentMessageViewer } from "./SentMessageViewer";

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
type PendingAction = { key: string; action: "send" | "reschedule" | "expire" };

export function CampaignStepBreakdown({
  steps,
  campaignId,
}: {
  steps: StepBreakdownRow[];
  campaignId: string;
}) {
  const router = useRouter();
  // Step 1 open by default: it's the one with something happening on a fresh
  // campaign, and an all-collapsed list reads as an empty page.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(steps.length ? [steps[0].sequenceId] : []),
  );
  // Currently opened mail in the inbox-style viewer. Only SENT mails have a
  // stored copy to show; other states no-op the click.
  const [viewing, setViewing] = useState<{
    contactId: string;
    stepOrder: number;
    recipientName: string;
    recipientEmail: string;
  } | null>(null);
  // Which per-row action is in-flight — {key}=`${stepOrder}:${contactId}`,
  // {action}=which of the three we're waiting on. Used to swap the button
  // to a spinner and disable siblings so double-clicks can't fan out.
  const [pending, setPending] = useState<PendingAction | null>(null);
  // Row-scoped inline error banner shown right under the action buttons.
  const [rowError, setRowError] = useState<{ key: string; message: string } | null>(null);
  // Which row's "Reschedule" datetime input is open. Only one at a time —
  // opening another closes the previous. Keyed same as `pending`.
  const [rescheduleOpen, setRescheduleOpen] = useState<string | null>(null);

  const rowKey = (stepOrder: number, contactId: string) => `${stepOrder}:${contactId}`;

  async function fireSendNow(stepOrder: number, contactId: string) {
    const key = rowKey(stepOrder, contactId);
    setPending({ key, action: "send" });
    setRowError(null);
    try {
      const res = await apiFetch(`/api/campaigns/${campaignId}/send-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [contactId], stepOrder }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setRowError({ key, message: payload?.error?.message ?? `Send failed (${res.status})` });
        return;
      }
      router.refresh();
    } catch (err) {
      setRowError({ key, message: err instanceof Error ? err.message : "Network error" });
    } finally {
      setPending(null);
    }
  }

  async function fireReschedule(stepOrder: number, contactId: string, fireAtLocal: string) {
    const key = rowKey(stepOrder, contactId);
    const fireAt = new Date(fireAtLocal);
    if (Number.isNaN(fireAt.getTime())) {
      setRowError({ key, message: "Pick a valid date and time" });
      return;
    }
    if (fireAt.getTime() < Date.now()) {
      setRowError({ key, message: "New fire time must be in the future" });
      return;
    }
    setPending({ key, action: "reschedule" });
    setRowError(null);
    try {
      const res = await apiFetch(`/api/campaigns/${campaignId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, stepOrder, fireAt: fireAt.toISOString() }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setRowError({ key, message: payload?.error?.message ?? `Reschedule failed (${res.status})` });
        return;
      }
      setRescheduleOpen(null);
      router.refresh();
    } catch (err) {
      setRowError({ key, message: err instanceof Error ? err.message : "Network error" });
    } finally {
      setPending(null);
    }
  }

  async function fireMarkExpired(stepOrder: number, contactId: string) {
    const key = rowKey(stepOrder, contactId);
    setPending({ key, action: "expire" });
    setRowError(null);
    try {
      const res = await apiFetch(`/api/campaigns/${campaignId}/mark-expired`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, stepOrder }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setRowError({ key, message: payload?.error?.message ?? `Mark-expired failed (${res.status})` });
        return;
      }
      router.refresh();
    } catch (err) {
      setRowError({ key, message: err instanceof Error ? err.message : "Network error" });
    } finally {
      setPending(null);
    }
  }

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
      {viewing ? (
        <SentMessageViewer
          campaignId={campaignId}
          contactId={viewing.contactId}
          stepOrder={viewing.stepOrder}
          recipientName={viewing.recipientName}
          recipientEmail={viewing.recipientEmail}
          onClose={() => setViewing(null)}
        />
      ) : null}
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
                          const openable = mail.state === "SENT";
                          // A SCHEDULED row whose fire time is in the past is
                          // stuck — the scheduler won't automatically pull it
                          // forward, and the send window may have moved on.
                          // Surface it visibly and let the user Send / Reschedule /
                          // Mark expired directly from the row.
                          const isOverdue =
                            mail.state === "SCHEDULED" &&
                            mail.at != null &&
                            new Date(mail.at).getTime() < Date.now();
                          const key = rowKey(step.stepOrder, mail.contactId);
                          const isRowBusy = pending?.key === key;
                          const rowErrorMsg = rowError?.key === key ? rowError.message : null;
                          const isRescheduling = rescheduleOpen === key;
                          return (
                            <tr
                              key={mail.contactId}
                              onClick={
                                openable && !isOverdue
                                  ? () =>
                                      setViewing({
                                        contactId: mail.contactId,
                                        stepOrder: step.stepOrder,
                                        recipientName: mail.name,
                                        recipientEmail: mail.email,
                                      })
                                  : undefined
                              }
                              className={`border-t align-top ${
                                isOverdue
                                  ? "border-red-100 bg-red-50/50"
                                  : "border-slate-100"
                              } ${openable && !isOverdue ? "cursor-pointer hover:bg-slate-50" : ""}`}
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
                                {openable && !isOverdue ? (
                                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-ocean">
                                    Click to open
                                  </p>
                                ) : null}
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
                                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                    isOverdue ? "bg-red-100 text-red-700" : stateTone(mail.state)
                                  }`}
                                >
                                  {isOverdue ? "OVERDUE" : mail.state}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-xs">
                                {when ? (
                                  <>
                                    <span
                                      className={
                                        isOverdue
                                          ? "text-red-700 line-through"
                                          : mail.state === "SENT"
                                            ? "text-slate-600"
                                            : "text-amber-700"
                                      }
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
                                    {isOverdue ? (
                                      <div
                                        className="mt-2 flex flex-col gap-1.5"
                                        onClick={(event) => event.stopPropagation()}
                                      >
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <button
                                            type="button"
                                            disabled={isRowBusy}
                                            onClick={() => fireSendNow(step.stepOrder, mail.contactId)}
                                            className="inline-flex items-center gap-1 rounded-md bg-ocean px-2 py-1 text-[11px] font-semibold text-white hover:bg-ocean/90 disabled:opacity-50"
                                          >
                                            {pending?.key === key && pending.action === "send" ? (
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                              <Send className="h-3 w-3" />
                                            )}
                                            Send now
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isRowBusy}
                                            onClick={() => {
                                              setRowError(null);
                                              setRescheduleOpen((prev) => (prev === key ? null : key));
                                            }}
                                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-ocean/40 hover:text-ocean disabled:opacity-50"
                                          >
                                            <CalendarClock className="h-3 w-3" />
                                            Reschedule
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isRowBusy}
                                            onClick={() => fireMarkExpired(step.stepOrder, mail.contactId)}
                                            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                          >
                                            {pending?.key === key && pending.action === "expire" ? (
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                              <XCircle className="h-3 w-3" />
                                            )}
                                            Mark expired
                                          </button>
                                        </div>
                                        {isRescheduling ? (
                                          <RescheduleBox
                                            busy={pending?.key === key && pending.action === "reschedule"}
                                            onSubmit={(value) => fireReschedule(step.stepOrder, mail.contactId, value)}
                                            onCancel={() => setRescheduleOpen(null)}
                                          />
                                        ) : null}
                                        {rowErrorMsg ? (
                                          <p className="text-[11px] font-medium text-red-700">{rowErrorMsg}</p>
                                        ) : null}
                                      </div>
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

/**
 * Inline datetime input rendered under an OVERDUE row's Reschedule button.
 * Defaults to now+15min so a quick "just fire soon" retry is one Enter away.
 */
function RescheduleBox({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(() => {
    // <input type=datetime-local> wants "YYYY-MM-DDTHH:mm" in local time.
    const soon = new Date(Date.now() + 15 * 60 * 1000);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
  });
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white p-2">
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-800 focus:border-ocean focus:outline-none"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => onSubmit(value)}
        className="inline-flex items-center gap-1 rounded-md bg-ocean px-2 py-1 text-[11px] font-semibold text-white hover:bg-ocean/90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarClock className="h-3 w-3" />}
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mail, MailOpen, MousePointerClick, Reply, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

type SendRow = {
  id: string;
  occurredAt: string;
  eventType: "SENT" | "FAILED" | "BOUNCED_HARD" | "BOUNCED_SOFT";
  messageId: string | null;
  contact: {
    id: string;
    name: string;
    email: string;
    company: string | null;
  } | null;
  step: { stepOrder: number; subject: string } | null;
  from: { id: string; email: string; displayName: string | null } | null;
  variant: string | null;
  failureReason: string | null;
  opened: boolean;
  clicked: boolean;
  replied: boolean;
};

const PAGE_SIZE = 100;

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusStyles: Record<SendRow["eventType"], string> = {
  SENT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  FAILED: "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  BOUNCED_HARD: "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  BOUNCED_SOFT: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
};

const statusLabels: Record<SendRow["eventType"], string> = {
  SENT: "Sent",
  FAILED: "Failed",
  BOUNCED_HARD: "Bounced",
  BOUNCED_SOFT: "Soft bounce",
};

type ResetState = "idle" | "resetting" | "success" | "error";

export function CampaignSentTab({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<SendRow[]>([]);
  const [total, setTotal] = useState(0);
  const [resetByContact, setResetByContact] = useState<Record<string, ResetState>>({});

  async function resetContact(contactId: string) {
    setResetByContact((s) => ({ ...s, [contactId]: "resetting" }));
    try {
      const res = await apiFetch(
        `/api/campaigns/${campaignId}/contacts/${contactId}/reset`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(String(res.status));
      setResetByContact((s) => ({ ...s, [contactId]: "success" }));
      // Auto-clear the confirmation after 3s so repeated resets don't
      // leave the row visually stuck in "reset" state.
      window.setTimeout(() => {
        setResetByContact((s) => {
          const next = { ...s };
          delete next[contactId];
          return next;
        });
      }, 3000);
    } catch {
      setResetByContact((s) => ({ ...s, [contactId]: "error" }));
    }
  }

  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/campaigns/${campaignId}/sends?take=${PAGE_SIZE}&skip=${skip}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as {
          data: { sends: SendRow[]; total: number };
        };
      })
      .then((payload) => {
        if (cancelled) return;
        setRows(payload.data.sends);
        setTotal(payload.data.total);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(`Could not load sends (${(err as Error).message}).`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, skip]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading sends…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
        {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white p-10 text-center dark:border-white/10 dark:bg-white/[0.03]">
        <Mail className="h-8 w-8 text-slate-300 dark:text-white/25" />
        <p className="text-sm font-medium text-slate-700 dark:text-white/80">
          No emails sent yet.
        </p>
        <p className="text-xs text-slate-500 dark:text-white/50">
          Sends will appear here as the campaign processes leads.
        </p>
      </div>
    );
  }

  const hasMore = skip + rows.length < total;
  const hasPrev = skip > 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-white/[0.06]">
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-white">Outgoing mail</p>
          <p className="text-xs text-slate-500 dark:text-white/55">
            {total} total · showing {skip + 1}–{skip + rows.length}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!hasMore}
            onClick={() => setSkip(skip + PAGE_SIZE)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80"
          >
            Next
          </button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-320px)] overflow-auto overscroll-x-contain">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-30 shadow-[0_1px_0_0_rgb(226,232,240)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:border-white/[0.06] dark:bg-[#12121a] dark:text-white/55">
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">To</th>
              <th className="px-4 py-2 font-medium">From</th>
              <th className="px-4 py-2 font-medium">Step</th>
              <th className="px-4 py-2 font-medium">Subject</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Engagement</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {rows.map((row) => (
              <tr key={row.id} className="align-top hover:bg-slate-50/60 dark:hover:bg-white/[0.02]">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-white/70">
                  {formatWhen(row.occurredAt)}
                </td>
                <td className="px-4 py-3">
                  {row.contact ? (
                    <>
                      <div className="text-sm font-medium text-slate-950 dark:text-white">
                        {row.contact.name || row.contact.email}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-white/55">
                        {row.contact.email}
                        {row.contact.company ? ` · ${row.contact.company}` : ""}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-white/40">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700 dark:text-white/75">
                  {row.from?.email ?? <span className="text-slate-400 dark:text-white/40">—</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-white/70">
                  {row.step ? (
                    <>
                      Step {row.step.stepOrder}
                      {row.variant ? (
                        <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500 dark:bg-white/10 dark:text-white/60">
                          {row.variant}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-slate-400 dark:text-white/40">—</span>
                  )}
                </td>
                <td className="max-w-md px-4 py-3 text-xs text-slate-800 dark:text-white/80">
                  <span className="line-clamp-2">{row.step?.subject ?? "—"}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusStyles[row.eventType]}`}
                    title={row.failureReason ?? undefined}
                  >
                    {row.eventType === "SENT" ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                    {statusLabels[row.eventType]}
                  </span>
                  {row.failureReason ? (
                    <div className="mt-1 max-w-xs text-[11px] text-rose-600 dark:text-rose-300">
                      {row.failureReason}
                    </div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <EngagementChip active={row.opened} icon={<MailOpen className="h-3 w-3" />} label="Opened" />
                    <EngagementChip active={row.clicked} icon={<MousePointerClick className="h-3 w-3" />} label="Clicked" />
                    <EngagementChip active={row.replied} icon={<Reply className="h-3 w-3" />} label="Replied" />
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {row.contact ? (
                    (() => {
                      const state = resetByContact[row.contact.id] ?? "idle";
                      if (state === "success") {
                        return (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Reset — you can Send Now again
                          </span>
                        );
                      }
                      if (state === "error") {
                        return (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                            <AlertCircle className="h-3 w-3" />
                            Reset failed
                          </span>
                        );
                      }
                      const contactId = row.contact.id;
                      return (
                        <button
                          type="button"
                          disabled={state === "resetting"}
                          onClick={() => resetContact(contactId)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:border-slate-300 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/75"
                          title="Reset this contact's campaign state so you can re-fire Send Now"
                        >
                          {state === "resetting" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          Reset
                        </button>
                      );
                    })()
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-white/40">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EngagementChip({
  active,
  icon,
  label,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        active
          ? "bg-sky-100 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300"
          : "bg-slate-100 text-slate-400 dark:bg-white/[0.06] dark:text-white/40"
      }`}
      title={label}
    >
      {icon}
      {label}
    </span>
  );
}

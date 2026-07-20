"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Send, X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

type Recipient = {
  contactId: string;
  email: string;
  name: string;
  companyName: string | null;
  status: string;
};

type SendNowResult = {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ contactId: string; email: string; reason: string }>;
  skippedDetails: Array<{ contactId: string; email: string; reason: string }>;
};

const TERMINAL_STATUSES = new Set([
  "SENT",
  "OPENED",
  "CLICKED",
  "REPLIED",
  "BOUNCED",
  "UNSUBSCRIBED",
  "FAILED",
]);

export function SendCampaignNowButton({
  campaignId,
  recipients,
}: {
  campaignId: string;
  recipients: Recipient[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SendNowResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default: every contact that hasn't already been sent / bounced / etc.
  const defaultSelected = useMemo(() => {
    return new Set(
      recipients
        .filter((r) => !TERMINAL_STATUSES.has(r.status))
        .map((r) => r.contactId),
    );
  }, [recipients]);
  const [selected, setSelected] = useState<Set<string>>(defaultSelected);

  function openModal() {
    setSelected(defaultSelected);
    setError(null);
    setResult(null);
    setOpen(true);
  }

  function toggleOne(contactId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  const eligibleRecipients = recipients.filter((r) => !TERMINAL_STATUSES.has(r.status));
  const allEligibleSelected =
    eligibleRecipients.length > 0 &&
    eligibleRecipients.every((r) => selected.has(r.contactId));

  function toggleAll() {
    if (allEligibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligibleRecipients.map((r) => r.contactId)));
    }
  }

  async function trigger() {
    if (selected.size === 0) return;
    setPending(true);
    setError(null);
    setResult(null);

    try {
      const response = await apiFetch(`/api/campaigns/${campaignId}/send-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: Array.from(selected) }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { code?: string; message?: string } }
          | null;
        const code = payload?.error?.code;
        const message = payload?.error?.message ?? `Send-now failed (${response.status})`;
        // Attach a hint for the most common blockers so the user knows what to fix.
        const hint =
          code === "NO_SENDING_INBOX"
            ? " Connect a verified inbox under Settings → Inboxes, then try again."
            : response.status === 401
              ? " Your session may have expired — sign in again."
              : response.status === 404
                ? " This campaign no longer exists or isn't in your workspace."
                : "";
        setError(`${message}${hint}`);
        return;
      }

      const payload = (await response.json()) as { data: SendNowResult };
      setResult(payload.data);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setError(`Couldn't reach the send-now endpoint: ${message}. Check your connection and try again.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-2 rounded-md bg-ocean px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-ocean/90"
      >
        <Send className="h-4 w-4" />
        Send now
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-[#0F0D14]">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div>
                <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
                  Send now
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-white/55">
                  Pick the recipients who should receive Step 1 right now. Bypasses the
                  scheduled send window and uses the same provider pipeline a campaign
                  send uses.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="overflow-y-auto px-5 py-3">
              {recipients.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  No recipients targeted on this campaign yet.
                </p>
              ) : (
                <>
                  <label className="flex items-center gap-2 border-b border-slate-100 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:text-white/45">
                    <input
                      type="checkbox"
                      checked={allEligibleSelected}
                      onChange={toggleAll}
                      disabled={eligibleRecipients.length === 0}
                      className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                    />
                    Recipient · {selected.size} selected of {eligibleRecipients.length} eligible
                  </label>
                  <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/5">
                    {recipients.map((recipient) => {
                      const terminal = TERMINAL_STATUSES.has(recipient.status);
                      const isSelected = selected.has(recipient.contactId);
                      return (
                        <li key={recipient.contactId}>
                          <label
                            className={`flex items-start gap-3 px-1 py-2.5 text-sm ${
                              terminal
                                ? "cursor-not-allowed opacity-60"
                                : "cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={terminal}
                              onChange={() => toggleOne(recipient.contactId)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-slate-950 dark:text-white">
                                {recipient.name}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-white/55">
                                {recipient.email}
                                {recipient.companyName ? ` · ${recipient.companyName}` : ""}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                recipient.status === "SCHEDULED"
                                  ? "bg-amber-100 text-amber-700"
                                  : terminal
                                    ? "bg-slate-200 text-slate-600"
                                    : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {recipient.status}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {error ? (
                <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="break-words">{error}</span>
                </div>
              ) : null}

              {result ? (
                (() => {
                  const nothingSent = result.sent === 0 && result.total > 0;
                  const allGood = result.sent > 0 && result.failed === 0 && result.skipped === 0;
                  const border = nothingSent
                    ? "border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10"
                    : allGood
                      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                      : "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10";
                  return (
                    <div className={`mt-4 rounded-md border p-3 text-sm ${border}`}>
                      <p className="flex items-center gap-1.5 font-semibold">
                        {allGood ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <AlertCircle className={`h-4 w-4 ${nothingSent ? "text-red-600" : "text-amber-600"}`} />
                        )}
                        {nothingSent
                          ? "No email was sent"
                          : `${result.sent} sent${result.failed > 0 ? ` · ${result.failed} failed` : ""}${result.skipped > 0 ? ` · ${result.skipped} skipped` : ""}`}
                        <span className="font-normal text-slate-500 dark:text-white/50"> of {result.total}</span>
                      </p>
                      {nothingSent && result.errors.length === 0 && result.skippedDetails.length === 0 ? (
                        <p className="mt-1 text-xs text-red-700">
                          The server accepted the request but the send pipeline returned no outcome. Check the campaign has an active sequence step and a verified sending inbox.
                        </p>
                      ) : null}
                      {result.errors.length > 0 ? (
                        <>
                          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-red-700">Failed</p>
                          <ul className="mt-1 space-y-1 text-xs text-red-700">
                            {result.errors.map((err) => (
                              <li key={err.contactId} className="break-words">
                                <span className="font-mono">{err.email}</span>: {err.reason}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {result.skippedDetails.length > 0 ? (
                        <>
                          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Skipped</p>
                          <ul className="mt-1 space-y-1 text-xs text-amber-700">
                            {result.skippedDetails.map((item) => (
                              <li key={item.contactId} className="break-words">
                                <span className="font-mono">{item.email}</span>: {item.reason}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </div>
                  );
                })()
              ) : null}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-white/10">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/[0.06]"
              >
                {result ? "Close" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={trigger}
                disabled={pending || selected.size === 0}
                className="inline-flex items-center gap-2 rounded-md bg-ocean px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-ocean/90 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {pending ? "Sending…" : `Send to ${selected.size}`}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}

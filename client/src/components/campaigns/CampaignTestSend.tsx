"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mail, Send } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

type SendResult =
  | {
      kind: "ok";
      messageId: string;
      to: string;
      sender: { provider: string; fromEmail: string; platformDefault: boolean };
    }
  | { kind: "err"; message: string };

type SenderInfo = {
  ready: boolean;
  provider?: string;
  fromEmail?: string;
  fromName?: string | null;
  platformDefault?: boolean;
  domain?: string;
};

export function CampaignTestSend() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("MariMail campaign flow test");
  const [body, setBody] = useState("Hello,\n\nThis is a test of the MariMail campaign send pipeline.\n");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [sender, setSender] = useState<SenderInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/campaigns/test-send/sender`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { data?: SenderInfo } | null) => {
        if (!cancelled) setSender(payload?.data ?? { ready: false });
      })
      .catch(() => {
        if (!cancelled) setSender({ ready: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function send() {
    if (!to.trim()) return;
    setSending(true);
    setResult(null);

    const response = await apiFetch(`/api/campaigns/test-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: to.trim(), subject, body }),
    });
    setSending(false);

    const payload = (await response.json().catch(() => null)) as
      | {
          data?: {
            messageId: string;
            to: string;
            sender: { provider: string; fromEmail: string; platformDefault: boolean };
          };
          error?: { message?: string };
        }
      | null;

    if (!response.ok || !payload?.data) {
      setResult({
        kind: "err",
        message: payload?.error?.message ?? `Test failed (${response.status})`,
      });
      return;
    }
    setResult({
      kind: "ok",
      messageId: payload.data.messageId,
      to: payload.data.to,
      sender: payload.data.sender,
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-950 dark:text-white">
            Send a test email
          </h3>
          <p className="mt-1 text-xs text-slate-600 dark:text-white/55">
            Sends one message through the exact same pipeline a real campaign uses
            (platform inbox → transport → provider). Use this to confirm sending works
            before launching a campaign, or to debug why one isn&apos;t firing.
          </p>
        </div>
      </div>

      {sender ? (
        sender.ready ? (
          <div className="mt-4 flex flex-wrap items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-ocean" />
            <div className="min-w-0">
              <p>
                Will send <strong>From:</strong>{" "}
                <span className="font-mono">
                  {sender.fromName ? `${sender.fromName} <${sender.fromEmail}>` : sender.fromEmail}
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/50">
                via <strong>{sender.provider}</strong>
                {sender.platformDefault ? " · platform default" : ""} · domain{" "}
                <span className="font-mono">{sender.domain}</span> must be verified with this provider for sends to succeed.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/15 dark:text-amber-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No sender is configured on the backend. Set <span className="font-mono">PLATFORM_RESEND_API_KEY</span> and{" "}
              <span className="font-mono">PLATFORM_FROM_EMAIL</span> in the server env, then refresh.
            </span>
          </div>
        )
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600 dark:text-white/65">
          Recipient
          <input
            type="email"
            value={to}
            onChange={(event) => setTo(event.currentTarget.value)}
            placeholder="someone@example.com"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-[#262631] dark:bg-[#08080B] dark:text-white/85"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600 dark:text-white/65">
          Subject
          <input
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.currentTarget.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-[#262631] dark:bg-[#08080B] dark:text-white/85"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600 md:col-span-2 dark:text-white/65">
          Body
          <textarea
            value={body}
            onChange={(event) => setBody(event.currentTarget.value)}
            rows={6}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm dark:border-[#262631] dark:bg-[#08080B] dark:text-white/85"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-400">
          Sent as plain text. Will be delivered through your workspace&apos;s active sender (platform Resend by default).
        </p>
        <button
          type="button"
          onClick={send}
          disabled={sending || !to.trim() || !subject.trim() || !body.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-ocean disabled:opacity-50 dark:bg-accent-600 dark:hover:bg-accent-500"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? "Sending…" : "Send test email"}
        </button>
      </div>

      {result?.kind === "ok" ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/15 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Sent to {result.to}</p>
            <p className="mt-0.5 text-xs">
              via <span className="font-mono">{result.sender.fromEmail}</span> ({result.sender.provider}
              {result.sender.platformDefault ? " · platform default" : ""}) — messageId{" "}
              <span className="font-mono">{result.messageId}</span>
            </p>
          </div>
        </div>
      ) : null}
      {result?.kind === "err" ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/15 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-words">{result.message}</span>
        </div>
      ) : null}
    </section>
  );
}

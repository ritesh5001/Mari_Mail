"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, Mail, X } from "lucide-react";
import type { SentMessagePayload } from "@/app/api/campaigns/[id]/sent-message/route";

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

/**
 * Reads a SentMessage row and shows it inbox-style: from / to / subject
 * header, followed by the exact HTML that went out. Rendered inside a sandboxed
 * iframe so third-party mail HTML (external styles, weird tags) can't reach
 * into the app.
 */
export function SentMessageViewer({
  campaignId,
  contactId,
  stepOrder,
  recipientName,
  recipientEmail,
  onClose,
}: {
  campaignId: string;
  contactId: string;
  stepOrder: number;
  recipientName: string;
  recipientEmail: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; message: SentMessagePayload }
  >({ status: "loading" });
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const url = `/api/campaigns/${campaignId}/sent-message?contactId=${encodeURIComponent(contactId)}&stepOrder=${stepOrder}`;
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error(
              "This mail was sent before the inbox viewer shipped, so there is no stored copy. New sends will appear here.",
            );
          }
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        return (await res.json()) as SentMessagePayload;
      })
      .then((message) => {
        if (cancelled) return;
        setState({ status: "ready", message });
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setState({ status: "error", message: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, contactId, stepOrder]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <Mail className="h-3.5 w-3.5" />
              <span>Step {stepOrder} · sent to {recipientName}</span>
            </div>
            <h2 className="mt-1 truncate text-lg font-semibold text-slate-950">
              {state.status === "ready" ? state.message.subject : recipientEmail}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {state.status === "loading" ? (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading message…
          </div>
        ) : state.status === "error" ? (
          <div className="flex flex-1 items-start gap-2 px-6 py-8 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{state.message}</p>
          </div>
        ) : (
          <ReadyView
            message={state.message}
            recipientEmail={recipientEmail}
            showRaw={showRaw}
            onToggleRaw={() => setShowRaw((raw) => !raw)}
          />
        )}
      </div>
    </div>
  );
}

function ReadyView({
  message,
  recipientEmail,
  showRaw,
  onToggleRaw,
}: {
  message: SentMessagePayload;
  recipientEmail: string;
  showRaw: boolean;
  onToggleRaw: () => void;
}) {
  return (
    <>
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-sm">
        <MetaRow label="From" value={message.fromAddress} />
        <MetaRow label="To" value={message.toAddress || recipientEmail} />
        {message.replyTo && message.replyTo !== message.fromAddress ? (
          <MetaRow label="Reply-To" value={message.replyTo} />
        ) : null}
        <MetaRow label="Sent" value={formatDate(message.sentAt)} />
        {message.inbox ? (
          <MetaRow
            label="Mailbox"
            value={`${message.inbox.email}${message.inbox.fromEmail && message.inbox.fromEmail !== message.inbox.email ? ` (as ${message.inbox.fromEmail})` : ""}`}
          />
        ) : null}
        {message.messageId ? (
          <MetaRow label="Message-ID" value={message.messageId} mono />
        ) : null}
        {message.variant && message.variant !== "A" ? (
          <MetaRow label="A/B variant" value={message.variant} />
        ) : null}
      </div>

      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-2 text-xs text-slate-500">
        <span>Rendered mail (exactly what was delivered)</span>
        <button
          type="button"
          onClick={onToggleRaw}
          className="rounded border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-600 hover:border-ocean/30 hover:text-ocean"
        >
          {showRaw ? "Show HTML preview" : "Show plain-text alternate"}
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        {showRaw ? (
          <pre className="whitespace-pre-wrap px-5 py-4 font-mono text-xs text-slate-800">
            {message.bodyText || "(no plain-text alternate)"}
          </pre>
        ) : (
          <MailBodyFrame html={message.bodyHtml} />
        )}
      </div>
    </>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3 py-0.5">
      <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className={`min-w-0 flex-1 break-all text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Sandboxed iframe so mail HTML — which routinely brings inline `<style>`,
 * base fonts and layout tricks — can't leak into or clobber the app's styles,
 * and any embedded script is neutralized.
 */
function MailBodyFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const doc = useMemo(
    () => `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f172a;padding:16px;margin:0;line-height:1.5;font-size:14px}img{max-width:100%;height:auto}a{color:#2563eb}</style></head><body>${html}</body></html>`,
    [html],
  );

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    // srcDoc is set via prop; also autosize height to content when the iframe
    // loads so short mails don't leave a big empty area below.
    const onLoad = () => {
      try {
        const inner = frame.contentDocument;
        if (!inner) return;
        const height = Math.max(200, inner.body.scrollHeight + 32);
        frame.style.height = `${height}px`;
      } catch {
        // cross-origin defensively swallowed — the sandbox default keeps us
        // same-origin, but any mail using srcdoc quirks shouldn't crash the UI.
      }
    };
    frame.addEventListener("load", onLoad);
    return () => frame.removeEventListener("load", onLoad);
  }, [doc]);

  return (
    <iframe
      ref={ref}
      title="Rendered mail"
      srcDoc={doc}
      sandbox="allow-same-origin allow-popups"
      className="block w-full border-0"
      style={{ height: 400 }}
    />
  );
}

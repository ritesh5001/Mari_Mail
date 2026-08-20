"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Mail,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  Server,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/browser-fetch";
import { EditInboxModal } from "@/components/inboxes/EditInboxModal";

type Provider = "SMTP" | "GMAIL" | "OUTLOOK";
type Status = "ACTIVE" | "PAUSED" | "WARMING" | "ERROR";

type Inbox = {
  id: string;
  email: string;
  displayName: string | null;
  provider: string;
  status: Status;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpSecure: boolean;
  fromEmail: string | null;
  fromName: string | null;
  dailyLimit: number;
  sendGapMinSeconds: number;
  sendGapMaxSeconds: number;
  todaySent: number;
  warmupEnabled: boolean;
  warmupDay: number;
  spfOk: boolean;
  dkimOk: boolean;
  dmarcOk: boolean;
  healthScore: number;
  hasPassword: boolean;
  hasOAuthTokens: boolean;
  createdAt: string;
};

const statusStyles: Record<Status, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  WARMING: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  PAUSED: "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-white/60",
  ERROR: "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

function providerLabel(provider: string) {
  if (provider === "GMAIL") return "Gmail (OAuth)";
  if (provider === "OUTLOOK") return "Outlook (OAuth)";
  if (provider === "SMTP") return "SMTP";
  return provider;
}

export function InboxesManager({
  initialInboxes,
  userEmail,
  oauthStatus,
  loadFailed = false,
}: {
  initialInboxes: Inbox[];
  userEmail: string;
  oauthStatus: string | null;
  /** True when the inbox list couldn't be fetched — distinct from "none yet". */
  loadFailed?: boolean;
}) {
  const [inboxes, setInboxes] = useState(initialInboxes);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<Inbox | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(
    oauthBannerFrom(oauthStatus),
  );

  async function refresh() {
    try {
      const res = await apiFetch(`/api/inboxes`);
      if (!res.ok) return;
      const payload = (await res.json()) as { data: { accounts: Inbox[] } };
      setInboxes(payload.data.accounts);
    } catch {
      // ignore — page-level refresh handles retries
    }
  }

  async function togglePaused(inbox: Inbox) {
    const next: Status = inbox.status === "PAUSED" ? "ACTIVE" : "PAUSED";
    const previous = inboxes;
    setInboxes((list) => list.map((i) => (i.id === inbox.id ? { ...i, status: next } : i)));
    try {
      const res = await apiFetch(`/api/inboxes/${inbox.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setInboxes(previous);
      setBanner({ kind: "error", text: "Failed to update inbox status." });
    }
  }

  async function deleteInbox(inbox: Inbox) {
    if (!confirm(`Remove ${inbox.email}? This cannot be undone.`)) return;
    const previous = inboxes;
    setInboxes((list) => list.filter((i) => i.id !== inbox.id));
    try {
      const res = await apiFetch(`/api/inboxes/${inbox.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
    } catch {
      setInboxes(previous);
      setBanner({ kind: "error", text: "Failed to remove inbox." });
    }
  }

  async function sendTest(inbox: Inbox) {
    const to = window.prompt("Send a test email to:", userEmail);
    if (!to) return;
    try {
      const res = await apiFetch(`/api/inboxes/${inbox.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setBanner({ kind: "error", text: payload?.error?.message ?? "Test send failed." });
        return;
      }
      setBanner({ kind: "ok", text: `Test message sent to ${to}.` });
    } catch {
      setBanner({ kind: "error", text: "Test send failed." });
    }
  }

  return (
    <div className="space-y-6">
      {banner ? (
        <div
          className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
            className="text-current opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {/* One page title. It used to be breadcrumb "Inboxes" + eyebrow
                "YOUR INBOXES" + an h1 that was an instruction ("Connect a
                mailbox to send from") which stayed wrong once you had five. */}
            <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Inboxes</h1>
          </div>
          {/* Hidden while the list is empty — the empty state below already
              carries the one call to action, and two identical buttons a few
              hundred pixels apart just asks which one is the real one. */}
          {inboxes.length > 0 ? (
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-[#ffffff] shadow-sm transition-colors hover:bg-accent-600"
            >
              <Plus className="h-4 w-4" />
              Connect inbox
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        {loadFailed ? (
          // Distinct from "none yet" — telling someone with mailboxes already
          // connected that they have none invites a needless reconnect.
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Couldn&rsquo;t load your inboxes
            </p>
            <p className="max-w-sm text-xs text-slate-500 dark:text-white/50">
              This is a display problem — any mailboxes you&rsquo;ve connected are still there and
              still sending. Reload to try again.
            </p>
            <Link
              href="/dashboard/inboxes"
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-[#ffffff] transition-colors hover:bg-accent-600"
            >
              Reload
            </Link>
          </div>
        ) : inboxes.length === 0 ? (
          // The empty state carries the setup guidance, because this is the
          // step people get stuck on — especially Gmail/Outlook with 2FA, where
          // the account password silently fails and an app password is needed.
          <div className="px-6 py-12">
            <div className="mx-auto max-w-lg text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-accent-500/10">
                <Mail className="h-6 w-6 text-accent-600 dark:text-accent-300" />
              </div>
              <p className="text-base font-semibold text-slate-900 dark:text-white">
                Connect your first inbox
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500 dark:text-white/55">
                Campaigns send from your own mailbox, so replies land in your inbox and your domain
                builds its own reputation. This takes about a minute.
              </p>
              <button
                type="button"
                onClick={() => setWizardOpen(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-[#ffffff] transition-colors hover:bg-accent-600"
              >
                <Plus className="h-4 w-4" />
                Connect inbox
              </button>
            </div>

            <div className="mx-auto mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                { icon: Mail, title: "Gmail", body: "One-click sign-in with Google. No password needed." },
                { icon: Mail, title: "Outlook / M365", body: "One-click sign-in with Microsoft." },
                { icon: Server, title: "Any SMTP", body: "Host, port and username — plus an app password if 2FA is on." },
              ].map((opt) => {
                const Icon = opt.icon;
                return (
                  <div
                    key={opt.title}
                    className="rounded-lg border border-slate-200 p-3 text-left dark:border-white/10"
                  >
                    <Icon className="mb-2 h-4 w-4 text-slate-400 dark:text-white/40" />
                    <p className="text-sm font-semibold text-slate-800 dark:text-white/90">{opt.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-white/45">{opt.body}</p>
                  </div>
                );
              })}
            </div>

            <p className="mx-auto mt-6 flex max-w-md items-start justify-center gap-2 text-center text-xs text-slate-400 dark:text-white/35">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Credentials are encrypted at rest and only ever used to send your campaigns.
              </span>
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {inboxes.map((inbox) => (
              <li key={inbox.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                      {inbox.displayName ?? inbox.email}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusStyles[inbox.status]}`}
                    >
                      {inbox.status.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-white/55">
                    {inbox.email} · {providerLabel(inbox.provider)}
                    {inbox.provider === "SMTP" && inbox.smtpHost
                      ? ` · ${inbox.smtpHost}:${inbox.smtpPort ?? ""}`
                      : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-white/50">
                    <span>
                      Sent today: <strong className="text-slate-800 dark:text-white/80">{inbox.todaySent}</strong> / {inbox.dailyLimit}
                    </span>
                    {inbox.sendGapMinSeconds > 0 || inbox.sendGapMaxSeconds > 0 ? (
                      <span>
                        Gap:{" "}
                        <strong className="text-slate-800 dark:text-white/80">
                          {Math.round(inbox.sendGapMinSeconds / 60)}–
                          {Math.round(inbox.sendGapMaxSeconds / 60)} min
                        </strong>
                      </span>
                    ) : null}
                    <DnsChip label="SPF" ok={inbox.spfOk} />
                    <DnsChip label="DKIM" ok={inbox.dkimOk} />
                    <DnsChip label="DMARC" ok={inbox.dmarcOk} />
                    {inbox.warmupEnabled ? (
                      <span>Warm-up day {inbox.warmupDay}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditing(inbox)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80"
                    title="Edit this mailbox's settings and credentials"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => sendTest(inbox)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80"
                    title="Send a test email from this inbox"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Test
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePaused(inbox)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/80"
                    title={inbox.status === "PAUSED" ? "Resume sending" : "Pause sending"}
                  >
                    {inbox.status === "PAUSED" ? (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        Resume
                      </>
                    ) : (
                      <>
                        <Pause className="h-3.5 w-3.5" />
                        Pause
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteInbox(inbox)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                    aria-label="Remove inbox"
                    title="Remove inbox"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {wizardOpen ? (
        <ConnectWizard
          onClose={() => setWizardOpen(false)}
          onConnected={async () => {
            setWizardOpen(false);
            setBanner({ kind: "ok", text: "Inbox connected." });
            await refresh();
          }}
        />
      ) : null}

      {editing ? (
        <EditInboxModal
          inbox={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setBanner({ kind: "ok", text: "Mailbox updated." });
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function DnsChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${
        ok
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/50"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
      {label}
    </span>
  );
}

/**
 * Explains an OAuth outcome in terms the reader can act on.
 *
 * Every failure used to be "Gmail connection failed. Please try again." — for
 * causes where retrying can never work. A redirect-URI mismatch or a bad
 * client secret is a setup problem an admin must fix, and telling someone to
 * retry it just wastes their afternoon.
 */
function oauthBannerFrom(status: string | null): { kind: "ok" | "error"; text: string } | null {
  if (!status) return null;

  if (status === "google-connected") return { kind: "ok", text: "Gmail inbox connected." };
  if (status === "outlook-connected") return { kind: "ok", text: "Outlook inbox connected." };

  if (status === "session-expired") {
    return {
      kind: "error",
      text: "Your session expired before the connection started. Refresh the page and try again.",
    };
  }
  if (status === "google-not-configured" || status === "outlook-not-configured") {
    const name = status.startsWith("google") ? "Google" : "Microsoft";
    return {
      kind: "error",
      text: `${name} sign-in isn't configured on the server. An admin needs to add the OAuth client ID and secret — retrying won't help.`,
    };
  }
  if (status === "missing" || status === "invalid") {
    return {
      kind: "error",
      text: "That sign-in link had expired. Start the connection again — links are valid for 10 minutes.",
    };
  }

  // provider-prefixed failures, e.g. "google-redirect-mismatch"
  const provider = status.startsWith("google-")
    ? "Gmail"
    : status.startsWith("outlook-")
      ? "Outlook"
      : null;
  if (!provider) return null;
  const reason = status.slice(status.indexOf("-") + 1);

  switch (reason) {
    case "denied":
      return {
        kind: "error",
        text: `You cancelled at the ${provider === "Gmail" ? "Google" : "Microsoft"} consent screen, so nothing was connected.`,
      };
    case "redirect-mismatch":
      return {
        kind: "error",
        text: `${provider} rejected the redirect URL. The callback address registered with the provider doesn't match this server — an admin needs to fix it; retrying won't help.`,
      };
    case "bad-client":
      return {
        kind: "error",
        text: `${provider} rejected our app credentials. The client ID or secret is wrong or has been revoked — an admin needs to update it.`,
      };
    case "expired-code":
      return {
        kind: "error",
        text: `The ${provider} sign-in took too long and expired. Try again — it should work straight away.`,
      };
    case "scope":
      return {
        kind: "error",
        text: `${provider} didn't grant permission to send mail. Make sure you accept the send-email permission when asked.`,
      };
    default:
      return { kind: "error", text: `${provider} connection failed. Please try again.` };
  }
}

function ConnectWizard({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: () => Promise<void>;
}) {
  const [provider, setProvider] = useState<Provider | null>(null);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0a0a0c]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-white/[0.06]">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
            {provider ? "Connect inbox" : "Choose your provider"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.05]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {!provider ? (
            <ProviderPicker onPick={setProvider} />
          ) : provider === "SMTP" ? (
            <SmtpForm
              onBack={() => setProvider(null)}
              onConnected={onConnected}
            />
          ) : (
            <OAuthConnect
              provider={provider}
              onBack={() => setProvider(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ProviderPicker({ onPick }: { onPick: (provider: Provider) => void }) {
  // Gmail and Outlook previously shared the same envelope icon, so the list
  // read as two identical rows. Letter marks in each provider's colour make
  // them scannable without shipping brand SVGs.
  const options: Array<{
    id: Provider;
    title: string;
    description: string;
    icon?: typeof Mail;
    mark?: string;
    markClass?: string;
  }> = [
    {
      id: "GMAIL",
      title: "Gmail",
      description: "Sign in with Google — no password needed.",
      mark: "G",
      markClass: "bg-red-500/10 text-red-600 dark:text-red-400",
    },
    {
      id: "OUTLOOK",
      title: "Outlook / Microsoft 365",
      description: "Sign in with Microsoft — no password needed.",
      mark: "O",
      markClass: "bg-accent-500/10 text-accent-600 dark:text-accent-400",
    },
    {
      id: "SMTP",
      title: "Any SMTP mailbox",
      description: "Host, port and username. Use an app password if 2FA is on.",
      icon: Server,
    },
  ];

  return (
    <ul className="space-y-2">
      {options.map((opt) => (
        <li key={opt.id}>
          <button
            type="button"
            onClick={() => onPick(opt.id)}
            className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 dark:hover:bg-white/[0.05]"
          >
            {opt.mark ? (
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${opt.markClass}`}
                aria-hidden
              >
                {opt.mark}
              </span>
            ) : opt.icon ? (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/60">
                <opt.icon className="h-4 w-4" />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-950 dark:text-white">{opt.title}</p>
              <p className="text-xs text-slate-500 dark:text-white/55">{opt.description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function OAuthConnect({
  provider,
  onBack,
}: {
  provider: "GMAIL" | "OUTLOOK";
  onBack: () => void;
}) {
  const path = provider === "GMAIL" ? "google" : "outlook";
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-white/70">
        You&apos;ll be redirected to {provider === "GMAIL" ? "Google" : "Microsoft"} to authorize
        MariMail to send email as you. We only request the &ldquo;send mail&rdquo; scope.
      </p>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-slate-500 hover:underline dark:text-white/60"
        >
          ← Back
        </button>
        <a
          href={`${apiBase}/api/inboxes/oauth/${path}/start`}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
        >
          Sign in with {provider === "GMAIL" ? "Google" : "Microsoft"}
        </a>
      </div>
    </div>
  );
}

type SmtpFormState = {
  email: string;
  displayName: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
  fromName: string;
  dailyLimit: string;
  sendGapMinMinutes: string;
  sendGapMaxMinutes: string;
};

function SmtpForm({
  onBack,
  onConnected,
}: {
  onBack: () => void;
  onConnected: () => Promise<void>;
}) {
  const [form, setForm] = useState<SmtpFormState>({
    email: "",
    displayName: "",
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPassword: "",
    smtpSecure: false,
    fromName: "",
    dailyLimit: "50",
    sendGapMinMinutes: "5",
    sendGapMaxMinutes: "20",
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tested, setTested] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof SmtpFormState>(key: K, value: SmtpFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setTested(null);
    setError(null);
  }

  function buildPayload() {
    const port = Number(form.smtpPort);
    const dailyLimit = Number(form.dailyLimit);
    const gapMinMinutes = Number(form.sendGapMinMinutes);
    const gapMaxMinutes = Number(form.sendGapMaxMinutes);
    return {
      email: form.email.trim(),
      displayName: form.displayName.trim() || undefined,
      provider: "SMTP" as const,
      smtpHost: form.smtpHost.trim(),
      smtpPort: Number.isFinite(port) ? port : undefined,
      smtpUser: form.smtpUser.trim(),
      smtpPassword: form.smtpPassword,
      smtpSecure: form.smtpSecure,
      fromName: form.fromName.trim() || undefined,
      dailyLimit:
        Number.isFinite(dailyLimit) && dailyLimit > 0 ? dailyLimit : undefined,
      // Stored as seconds server-side; the form collects minutes.
      sendGapMinSeconds: Number.isFinite(gapMinMinutes)
        ? Math.round(gapMinMinutes * 60)
        : undefined,
      sendGapMaxSeconds: Number.isFinite(gapMaxMinutes)
        ? Math.round(gapMaxMinutes * 60)
        : undefined,
    };
  }

  async function sendTest() {
    setTesting(true);
    setTested(null);
    setError(null);
    try {
      const res = await apiFetch(`/api/inboxes/test-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildPayload(), to: form.email.trim() }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { data?: { ok: boolean; to: string }; error?: { message?: string } }
        | null;
      if (!res.ok) {
        setTested({
          ok: false,
          message: payload?.error?.message ?? "Test failed. Check host, port, and credentials.",
        });
        return;
      }
      setTested({
        ok: true,
        message: `Test message sent to ${payload?.data?.to ?? form.email}.`,
      });
    } catch {
      setTested({ ok: false, message: "Test failed. Check host, port, and credentials." });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/inboxes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(payload?.error?.message ?? "Could not save this inbox.");
        return;
      }
      await onConnected();
    } catch {
      setError("Could not save this inbox.");
    } finally {
      setSaving(false);
    }
  }

  const gapInvalid =
    form.sendGapMinMinutes.length > 0 &&
    form.sendGapMaxMinutes.length > 0 &&
    Number(form.sendGapMaxMinutes) < Number(form.sendGapMinMinutes);

  const canSubmit =
    form.email.length > 3 &&
    form.smtpHost.length > 0 &&
    form.smtpPort.length > 0 &&
    form.smtpUser.length > 0 &&
    form.smtpPassword.length > 0 &&
    !gapInvalid;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="From email"
          value={form.email}
          onChange={(value) => update("email", value)}
          placeholder="you@yourdomain.com"
          type="email"
          required
        />
        <TextField
          label="Display name"
          value={form.displayName}
          onChange={(value) => update("displayName", value)}
          placeholder="Your Name"
        />
        <TextField
          label="SMTP host"
          value={form.smtpHost}
          onChange={(value) => update("smtpHost", value)}
          placeholder="smtp.gmail.com"
          required
        />
        <TextField
          label="Port"
          value={form.smtpPort}
          onChange={(value) => update("smtpPort", value)}
          placeholder="587"
          required
        />
        <TextField
          label="Username"
          value={form.smtpUser}
          onChange={(value) => update("smtpUser", value)}
          placeholder="you@yourdomain.com"
          required
        />
        <TextField
          label="Password"
          value={form.smtpPassword}
          onChange={(value) => update("smtpPassword", value)}
          placeholder="app password or SMTP secret"
          type="password"
          required
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-white/70">
        <input
          type="checkbox"
          checked={form.smtpSecure}
          onChange={(event) => update("smtpSecure", event.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Use TLS on connect (usually only for port 465; leave off for 587/STARTTLS)
      </label>

      <div className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
        <p className="text-xs font-semibold text-slate-700 dark:text-white/80">
          Sending limits
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/50">
          Caps how much this inbox sends per day and paces consecutive emails.
          Each send waits a fresh random gap between the min and max below —
          more human-like pacing protects deliverability.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <TextField
            label="Daily limit"
            value={form.dailyLimit}
            onChange={(value) => update("dailyLimit", value)}
            placeholder="50"
            type="number"
          />
          <TextField
            label="Min gap (minutes)"
            value={form.sendGapMinMinutes}
            onChange={(value) => update("sendGapMinMinutes", value)}
            placeholder="5"
            type="number"
          />
          <TextField
            label="Max gap (minutes)"
            value={form.sendGapMaxMinutes}
            onChange={(value) => update("sendGapMaxMinutes", value)}
            placeholder="20"
            type="number"
          />
        </div>
        {gapInvalid ? (
          <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-300">
            Max gap must be greater than or equal to the min gap.
          </p>
        ) : null}
      </div>

      {tested ? (
        <div
          className={`rounded-md border p-2 text-xs ${
            tested.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
          }`}
        >
          {tested.message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-slate-500 hover:underline dark:text-white/60"
        >
          ← Back
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={sendTest}
            disabled={!canSubmit || testing || saving}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send test
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSubmit || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save inbox
          </button>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-xs">
      <span className="font-medium text-slate-600 dark:text-white/70">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
      />
    </label>
  );
}

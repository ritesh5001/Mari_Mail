"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Mail,
  Pause,
  Play,
  Plus,
  Send,
  Server,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

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
}: {
  initialInboxes: Inbox[];
  userEmail: string;
  oauthStatus: string | null;
}) {
  const [inboxes, setInboxes] = useState(initialInboxes);
  const [wizardOpen, setWizardOpen] = useState(false);
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
            <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Your inboxes</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">
              Connect a mailbox to send from
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
              Connect your Gmail, Outlook, or any SMTP mailbox. MariMail sends campaigns from these
              inboxes using rotation and warm-up.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" />
            Connect inbox
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        {inboxes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <Mail className="h-8 w-8 text-slate-300 dark:text-white/30" />
            <p className="text-sm font-medium text-slate-700 dark:text-white/80">
              No inboxes connected yet.
            </p>
            <p className="text-xs text-slate-500 dark:text-white/50">
              Connect your first inbox to start sending.
            </p>
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80"
            >
              <Plus className="h-3.5 w-3.5" />
              Connect inbox
            </button>
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

function oauthBannerFrom(status: string | null): { kind: "ok" | "error"; text: string } | null {
  if (!status) return null;
  switch (status) {
    case "google-connected":
      return { kind: "ok", text: "Gmail inbox connected." };
    case "outlook-connected":
      return { kind: "ok", text: "Outlook inbox connected." };
    case "google-failed":
      return { kind: "error", text: "Gmail connection failed. Please try again." };
    case "outlook-failed":
      return { kind: "error", text: "Outlook connection failed. Please try again." };
    case "missing":
    case "invalid":
      return { kind: "error", text: "OAuth callback was invalid — please retry." };
    default:
      return null;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
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
  const options: Array<{ id: Provider; title: string; description: string; icon: typeof Mail }> = [
    {
      id: "GMAIL",
      title: "Gmail",
      description: "Sign in with Google to connect a Gmail account.",
      icon: Mail,
    },
    {
      id: "OUTLOOK",
      title: "Outlook / Microsoft 365",
      description: "Sign in with Microsoft to connect an Outlook mailbox.",
      icon: Mail,
    },
    {
      id: "SMTP",
      title: "Any SMTP mailbox",
      description: "Connect using host, port, username, and password (or app password).",
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
            <opt.icon className="h-5 w-5 text-slate-500 dark:text-white/60" />
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

  const canSubmit =
    form.email.length > 3 &&
    form.smtpHost.length > 0 &&
    form.smtpPort.length > 0 &&
    form.smtpUser.length > 0 &&
    form.smtpPassword.length > 0;

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

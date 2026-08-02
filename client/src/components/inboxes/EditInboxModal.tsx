"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

type EditableInbox = {
  id: string;
  email: string;
  displayName: string | null;
  provider: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpSecure: boolean;
  hasPassword: boolean;
};

/**
 * Correct the credentials on an already-connected mailbox.
 *
 * There was no way to do this: a mailbox saved with a typo'd host or a stale
 * app password could only be deleted and re-added, which throws away its
 * warm-up progress, its send history and its rotation weight — real damage for
 * a one-character mistake.
 *
 * The password field is deliberately optional. The stored secret is encrypted
 * and never leaves the server, so it cannot be pre-filled; leaving the field
 * blank omits it from the PATCH entirely and the existing password survives.
 * Pre-filling a fake value would be worse — it would either overwrite the real
 * password with placeholder text or lie about what is stored.
 */
export function EditInboxModal({
  inbox,
  onClose,
  onSaved,
}: {
  inbox: EditableInbox;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(inbox.displayName ?? "");
  const [smtpHost, setSmtpHost] = useState(inbox.smtpHost ?? "");
  const [smtpPort, setSmtpPort] = useState(String(inbox.smtpPort ?? 587));
  const [smtpUser, setSmtpUser] = useState(inbox.smtpUser ?? "");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(inbox.smtpSecure);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSmtp = inbox.provider === "SMTP";

  function touched() {
    setTested(null);
    setError(null);
  }

  /**
   * Verifies the credentials WITHOUT saving, so a correction can be confirmed
   * before it replaces something that might still work.
   *
   * Only possible when a password has been typed — `test-credentials` needs the
   * real secret and the stored one is not readable from here. Testing with the
   * saved password is what the row's own Test button is for, after saving.
   */
  async function runTest() {
    setTesting(true);
    setTested(null);
    setError(null);
    try {
      const res = await apiFetch(`/api/inboxes/test-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inbox.email,
          provider: "SMTP",
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort) || 587,
          smtpUser: smtpUser.trim(),
          smtpPassword,
          smtpSecure,
          to: inbox.email,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setTested(
        res.ok
          ? { ok: true, message: `Connected — a test message went to ${inbox.email}.` }
          : {
              ok: false,
              message:
                payload?.error?.message ?? "Couldn't connect. Check the host, port and password.",
            },
      );
    } catch {
      setTested({ ok: false, message: "Couldn't reach MariMail to run the test." });
    }
    setTesting(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        displayName: displayName.trim() || null,
      };
      if (isSmtp) {
        body.smtpHost = smtpHost.trim();
        body.smtpPort = Number(smtpPort) || 587;
        body.smtpUser = smtpUser.trim();
        body.smtpSecure = smtpSecure;
        // Omitted entirely when blank — see the note above.
        if (smtpPassword) body.smtpPassword = smtpPassword;
      }

      const res = await apiFetch(`/api/inboxes/${inbox.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Couldn't save those changes.");
        setSaving(false);
        return;
      }
      await onSaved();
      onClose();
    } catch {
      setError("Couldn't reach MariMail. Check your connection and try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0a0a0c]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-white/[0.06]">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
            Edit {inbox.email}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <Field label="Display name">
            <input
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                touched();
              }}
              placeholder="Sales Team"
              className={inputCls}
            />
          </Field>

          {isSmtp ? (
            <>
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <Field label="SMTP host">
                  <input
                    value={smtpHost}
                    onChange={(e) => {
                      setSmtpHost(e.target.value);
                      touched();
                    }}
                    placeholder="smtp.hostinger.com"
                    className={inputCls}
                  />
                </Field>
                <Field label="Port">
                  <input
                    value={smtpPort}
                    onChange={(e) => {
                      setSmtpPort(e.target.value);
                      touched();
                    }}
                    inputMode="numeric"
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Username">
                <input
                  value={smtpUser}
                  onChange={(e) => {
                    setSmtpUser(e.target.value);
                    touched();
                  }}
                  placeholder={inbox.email}
                  className={inputCls}
                />
              </Field>

              <Field
                label="Password"
                hint={
                  inbox.hasPassword
                    ? "Leave blank to keep the current password."
                    : "No password is stored for this mailbox yet."
                }
              >
                <input
                  type="password"
                  value={smtpPassword}
                  onChange={(e) => {
                    setSmtpPassword(e.target.value);
                    touched();
                  }}
                  placeholder={inbox.hasPassword ? "••••••••  (unchanged)" : "App password"}
                  autoComplete="new-password"
                  className={inputCls}
                />
              </Field>

              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-white/70">
                <input
                  type="checkbox"
                  checked={smtpSecure}
                  onChange={(e) => {
                    setSmtpSecure(e.target.checked);
                    touched();
                  }}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-accent-500 focus:ring-accent-400"
                />
                Use TLS on connect (port 465). Leave off for STARTTLS on 587.
              </label>

              {tested ? (
                <p
                  className={`rounded-md px-3 py-2 text-xs ${
                    tested.ok
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                  }`}
                >
                  {tested.message}
                </p>
              ) : null}
            </>
          ) : (
            /* OAuth mailboxes hold no password to correct — the fix for a bad
               Gmail/Outlook connection is to re-authorise, which replaces the
               stored tokens on the existing row rather than creating a second
               one. */
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-white/[0.04] dark:text-white/60">
              This mailbox signs in through{" "}
              {inbox.provider === "GMAIL" ? "Google" : "Microsoft"}, so there are no credentials to
              retype. If it has stopped sending, reconnect it from{" "}
              <span className="font-medium">Connect inbox</span> using the same address — that
              refreshes the authorisation on this mailbox and keeps its warm-up progress.
            </p>
          )}

          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 dark:border-white/[0.06]">
          {isSmtp ? (
            <button
              type="button"
              onClick={() => void runTest()}
              disabled={testing || saving || !smtpPassword}
              title={
                smtpPassword
                  ? "Send a test message with these credentials without saving"
                  : "Enter the password to test before saving"
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 disabled:opacity-50 dark:border-white/10 dark:text-white/80"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Test without saving
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-white/60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-4 py-1.5 text-xs font-semibold text-[#ffffff] transition hover:bg-accent-600 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-accent-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-white/70">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-1 text-[11px] text-slate-400 dark:text-white/35">{hint}</p>
      ) : null}
    </div>
  );
}

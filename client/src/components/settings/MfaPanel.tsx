"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

/**
 * Authenticator secrets are read and typed by hand, so they are shown in
 * four-character groups — an unbroken 32-character string is where transcription
 * errors come from.
 */
function groupSecret(secret: string) {
  return (secret.match(/.{1,4}/g) ?? [secret]).join(" ");
}

type Stage =
  | { step: "idle" }
  | { step: "enrolling"; secret: string; otpauthUri: string }
  | { step: "codes"; recoveryCodes: string[] };

/**
 * Two-factor enrolment.
 *
 * There is no QR code here, deliberately: the project has no QR library and
 * adding an npm dependency isn't mine to decide. Every authenticator app
 * accepts a typed setup key, and on a phone the `otpauth://` link opens the
 * app directly — so this is complete, just one tap longer on desktop.
 */
export function MfaPanel({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ step: "idle" });
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [disabling, setDisabling] = useState(false);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/auth/mfa/setup", { method: "POST" });
      const payload = (await res.json()) as {
        data?: { secret: string; otpauthUri: string };
        error?: { message?: string };
      };
      if (!res.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Could not start setup");
      }
      setStage({ step: "enrolling", ...payload.data });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (code.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/auth/mfa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const payload = (await res.json()) as {
        data?: { recoveryCodes: string[] };
        error?: { message?: string };
      };
      if (!res.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "That code isn't valid");
      }
      // The only time the plaintext recovery codes are ever available.
      setStage({ step: "codes", recoveryCodes: payload.data.recoveryCodes });
      setCode("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/auth/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(payload.error?.message ?? "Could not turn two-factor off");
      setPassword("");
      setDisabling(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ── Recovery codes, shown once after a successful enrolment ──
  if (stage.step === "codes") {
    return (
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="h-4 w-4" />
          Two-factor is on
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-white/60">
          Save these recovery codes somewhere safe. Each one signs you in once if you lose your
          authenticator. <strong>They will not be shown again.</strong>
        </p>
        <ul className="mt-3 grid max-w-md grid-cols-2 gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm dark:border-white/10 dark:bg-white/[0.03]">
          {stage.recoveryCodes.map((recovery) => (
            <li key={recovery} className="text-slate-800 dark:text-white/80">
              {recovery}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <CopyButton
            value={stage.recoveryCodes.join("\n")}
            copied={copied}
            onCopy={() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            label="Copy codes"
          />
          <button
            type="button"
            onClick={() => {
              setStage({ step: "idle" });
              router.refresh();
            }}
            className="rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600"
          >
            I&rsquo;ve saved them
          </button>
        </div>
      </div>
    );
  }

  // ── Enrolment in progress ──
  if (stage.step === "enrolling") {
    return (
      <div className="max-w-md">
        <ol className="space-y-3 text-sm text-slate-600 dark:text-white/60">
          <li>
            <span className="font-medium text-slate-900 dark:text-white">1. Add the key</span> to
            your authenticator app:
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[13px] tracking-wider text-slate-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-white">
                {groupSecret(stage.secret)}
              </code>
              <CopyButton
                value={stage.secret}
                copied={copied}
                onCopy={() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              />
            </div>
            <a
              href={stage.otpauthUri}
              className="mt-1.5 inline-block text-xs font-semibold text-accent-600 dark:text-accent-300"
            >
              Or open your authenticator app directly
            </a>
          </li>
          <li>
            <label
              htmlFor="mfa-code"
              className="font-medium text-slate-900 dark:text-white"
            >
              2. Enter the 6-digit code it shows
            </label>
            <input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && confirm()}
              placeholder="000000"
              className="mt-1.5 w-40 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tracking-widest text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
            />
          </li>
        </ol>

        {error ? <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p> : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={busy || code.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Turn on
          </button>
          <button
            type="button"
            onClick={() => {
              setStage({ step: "idle" });
              setCode("");
              setError(null);
            }}
            className="rounded-md px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/[0.06]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Already on ──
  if (enabled) {
    return (
      <div className="max-w-md">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="h-4 w-4" />
          Two-factor is on
        </div>

        {disabling ? (
          <div className="mt-3">
            <label
              htmlFor="mfa-password"
              className="block text-xs font-medium text-slate-600 dark:text-white/60"
            >
              Confirm your password to turn it off
            </label>
            <input
              id="mfa-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && disable()}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
            />
            {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={disable}
                disabled={busy || !password}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Turn off
              </button>
              <button
                type="button"
                onClick={() => {
                  setDisabling(false);
                  setPassword("");
                  setError(null);
                }}
                className="rounded-md px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/[0.06]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDisabling(true)}
            className="mt-3 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-red-300 hover:text-red-600 dark:border-white/10 dark:text-white/70 dark:hover:border-red-400/40 dark:hover:text-red-400"
          >
            Turn off
          </button>
        )}
      </div>
    );
  }

  // ── Off ──
  return (
    <div>
      {error ? <p className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      <button
        type="button"
        onClick={startSetup}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Set up two-factor
      </button>
    </div>
  );
}

function CopyButton({
  value,
  copied,
  onCopy,
  label,
}: {
  value: string;
  copied: boolean;
  onCopy: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        onCopy();
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-accent-400 hover:text-accent-600 dark:border-white/10 dark:text-white/70 dark:hover:border-accent-400/50 dark:hover:text-accent-300"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label ?? (copied ? "Copied" : "Copy")}
    </button>
  );
}

"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { passwordProblem } from "@marimail/utils/password-policy";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { apiFetch } from "@/lib/browser-fetch";

/**
 * Reuses the same `PasswordStrength` checklist the register and reset forms
 * use, and the same shared `passwordProblem` the API validates with — so a
 * satisfied checklist always means the server will accept it.
 */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && next !== confirm;
  const policyProblem = next.length > 0 ? passwordProblem(next) : null;
  const ready = current.length > 0 && next.length > 0 && !mismatch && !policyProblem;

  async function submit() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      const res = await apiFetch("/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const payload = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(payload.error?.message ?? "Could not change your password");
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md space-y-3">
      <Field
        id="current-password"
        label="Current password"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
      />
      <Field
        id="new-password"
        label="New password"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
      />
      {next.length > 0 ? <PasswordStrength password={next} /> : null}
      <Field
        id="confirm-password"
        label="Confirm new password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
      />

      {mismatch ? (
        <p className="text-xs text-red-600 dark:text-red-400">Passwords don&rsquo;t match.</p>
      ) : null}
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      {done ? (
        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
          Password changed.
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={!ready || saving}
        className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Change password
      </button>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-600 dark:text-white/60">
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
      />
    </div>
  );
}

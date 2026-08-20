"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

/**
 * Email is shown but not editable. Changing a login address needs a
 * verify-the-new-address round trip so a typo can't lock someone out of their
 * own account, and no endpoint does that yet — so it renders as a read-only
 * fact rather than an input that silently fails.
 */
export function ProfileForm({
  name: initialName,
  email,
  emailVerified,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const dirty = trimmed !== initialName.trim();

  async function save() {
    if (!trimmed || !dirty) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await apiFetch("/auth/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const payload = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) throw new Error(payload.error?.message ?? "Could not save your name");
      setSaved(true);
      // The name is rendered from the session in the header and elsewhere, so
      // refresh the server components rather than leaving a stale copy on
      // screen next to the new one.
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <div>
        <label
          htmlFor="profile-name"
          className="block text-xs font-medium text-slate-600 dark:text-white/60"
        >
          Name
        </label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
          onKeyDown={(event) => event.key === "Enter" && save()}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
          placeholder="Your name"
        />
      </div>

      <div>
        <span className="block text-xs font-medium text-slate-600 dark:text-white/60">Email</span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-900 dark:text-white">{email}</span>
          {emailVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/12 dark:text-amber-300">
              Not verified
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
          Contact support to change the address you sign in with.
        </p>
      </div>

      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || !trimmed || saving}
          className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save
        </button>
        {saved && !dirty ? (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Saved</span>
        ) : null}
      </div>
    </div>
  );
}

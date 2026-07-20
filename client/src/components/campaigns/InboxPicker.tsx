"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

type InboxOption = {
  id: string;
  email: string;
  displayName: string | null;
  provider: string;
  status: "ACTIVE" | "PAUSED" | "WARMING" | "ERROR";
};

// Backend semantics: [] = rotate across every connected user inbox.
// Non-empty array = restrict rotation to exactly these inbox ids.
export function InboxPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [inboxes, setInboxes] = useState<InboxOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/inboxes`)
      .then(async (r) => {
        if (!r.ok) throw new Error("failed");
        return (await r.json()) as { data: { accounts: InboxOption[] } };
      })
      .then((payload) => {
        if (cancelled) return;
        // Rotation only picks ACTIVE/WARMING inboxes, so hide the rest to avoid
        // false expectations.
        const usable = payload.data.accounts.filter(
          (a) => a.status === "ACTIVE" || a.status === "WARMING",
        );
        setInboxes(usable);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load inboxes.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mode: "ALL" | "SPECIFIC" = value.length === 0 ? "ALL" : "SPECIFIC";

  // Prune stale ids that reference deleted / paused inboxes so the picker
  // reflects reality even if the campaign was configured months ago.
  const validSelectedIds = useMemo(() => {
    if (!inboxes) return value;
    const usable = new Set(inboxes.map((i) => i.id));
    return value.filter((id) => usable.has(id));
  }, [inboxes, value]);

  useEffect(() => {
    if (inboxes && validSelectedIds.length !== value.length) {
      onChange(validSelectedIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboxes]);

  function setMode(next: "ALL" | "SPECIFIC") {
    if (disabled) return;
    if (next === "ALL") onChange([]);
    // If switching to SPECIFIC with nothing selected, prefill with the first
    // inbox so the campaign isn't left in an "empty specific list" state
    // (which the backend would treat as ALL — confusing).
    else if (value.length === 0 && inboxes && inboxes.length > 0) onChange([inboxes[0].id]);
    else onChange(value);
  }

  function toggleInbox(id: string) {
    if (disabled) return;
    onChange(value.includes(id) ? value.filter((i) => i !== id) : [...value, id]);
  }

  if (error) {
    return (
      <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{error}</p>
    );
  }

  if (inboxes === null) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-white/50">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading inboxes…
      </div>
    );
  }

  if (inboxes.length === 0) {
    return (
      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        No connected inboxes.{" "}
        <Link href="/dashboard/inboxes" className="font-semibold underline">
          Connect one
        </Link>{" "}
        before launching this campaign.
      </div>
    );
  }

  // Single-inbox convenience: show what it is and skip the toggle entirely.
  if (inboxes.length === 1) {
    const only = inboxes[0];
    return (
      <div className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75">
        <Inbox className="h-3.5 w-3.5 text-slate-400" />
        Sending from <strong className="font-semibold">{only.email}</strong>
      </div>
    );
  }

  return (
    <div className={`mt-2 space-y-2 ${disabled ? "opacity-70" : ""}`}>
      <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-xs dark:border-white/10 dark:bg-white/[0.03]">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMode("ALL")}
          className={`rounded-[5px] px-3 py-1 font-medium transition ${
            mode === "ALL"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "text-slate-600 dark:text-white/70"
          }`}
        >
          Rotate across all
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMode("SPECIFIC")}
          className={`rounded-[5px] px-3 py-1 font-medium transition ${
            mode === "SPECIFIC"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "text-slate-600 dark:text-white/70"
          }`}
        >
          Choose specific
        </button>
      </div>

      {mode === "SPECIFIC" ? (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-1 dark:border-white/10">
          {inboxes.map((inbox) => {
            const checked = value.includes(inbox.id);
            return (
              <li key={inbox.id}>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition ${
                    disabled ? "cursor-not-allowed" : "hover:bg-slate-50 dark:hover:bg-white/[0.05]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleInbox(inbox.id)}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  <span className="flex-1 truncate">
                    <span className="font-medium text-slate-800 dark:text-white/85">
                      {inbox.email}
                    </span>
                    {inbox.status === "WARMING" ? (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                        warming
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
          {value.length === 0 ? (
            <li className="px-2 py-1 text-[11px] text-rose-600 dark:text-rose-300">
              Pick at least one inbox, or switch back to &ldquo;Rotate across all&rdquo;.
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-500 dark:text-white/45">
          Sends will rotate across all {inboxes.length} connected inbox
          {inboxes.length === 1 ? "" : "es"}.
        </p>
      )}
    </div>
  );
}

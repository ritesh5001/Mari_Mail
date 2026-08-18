"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, Ban, Building2, Loader2, Plus, Trash2, User } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import { cn } from "@/lib/cn";
import type { BlockDTO, BlocklistDTO } from "@/app/dashboard/blocked/page";

/**
 * The workspace do-not-contact list.
 *
 * Two tabs because the two kinds behave differently and users think about them
 * differently: one person you've decided not to mail, versus an entire company
 * — a customer you already serve, a competitor, an account that asked to be
 * left alone. A company block covers everyone at its domain, including people
 * not in the database yet, which is the whole reason it exists as its own kind
 * rather than a bulk contact block.
 */
export function BlocklistAdmin({ initial }: { initial: BlocklistDTO }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"CONTACT" | "COMPANY">("CONTACT");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [reason, setReason] = useState("");

  const reload = useCallback(async () => {
    const res = await apiFetch(`/api/blocklist`);
    if (!res.ok) return;
    const payload = (await res.json()) as { data: BlocklistDTO };
    setData(payload.data);
  }, []);

  async function add() {
    const value = input.trim();
    if (!value) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    // One field, two meanings: on the Contacts tab it is an email address; on
    // the Companies tab it is a domain or a company name. Anything with an @
    // on the company tab is read as "the company behind this address".
    const body =
      tab === "CONTACT"
        ? { kind: "CONTACT", email: value, reason: reason.trim() || undefined }
        : {
            kind: "COMPANY",
            ...(value.includes("@")
              ? { email: value }
              : value.includes(".")
                ? { domain: value }
                : { companyName: value }),
            label: value,
            reason: reason.trim() || undefined,
          };

    const res = await apiFetch(`/api/blocklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(payload?.error?.message ?? "Could not add that block.");
      return;
    }
    const payload = (await res.json()) as { data: { cancelledSends: number } };
    setInput("");
    setReason("");
    setNotice(
      payload.data.cancelledSends > 0
        ? `Blocked. ${payload.data.cancelledSends} queued send${payload.data.cancelledSends === 1 ? "" : "s"} stood down.`
        : "Blocked. They will not be added to any campaign.",
    );
    await reload();
  }

  async function remove(block: BlockDTO) {
    setRemoving(block.id);
    setError(null);
    setNotice(null);
    const res = await apiFetch(`/api/blocklist/${block.id}`, { method: "DELETE" });
    setRemoving(null);
    if (!res.ok) {
      setError("Could not remove that block.");
      return;
    }
    await reload();
  }

  const rows = data.blocks.filter((block) => block.kind === tab);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Do not contact</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-950 dark:text-white">
          <Ban className="h-6 w-6 text-ocean" />
          Blocked
        </h1>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <div className="flex gap-2 border-b border-slate-200 px-4 pt-4 dark:border-white/[0.08]">
          {(
            [
              ["CONTACT", "Contacts", data.counts.contacts],
              ["COMPANY", "Companies", data.counts.companies],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "-mb-px flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition",
                tab === key
                  ? "border-ocean text-ocean"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-white/50 dark:hover:text-white/80",
              )}
            >
              {key === "CONTACT" ? <User className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
              {label}
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-white/10 dark:text-white/60">
                {count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3 p-4">
          <label className="min-w-[240px] flex-1 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-white/50">
              {tab === "CONTACT" ? "Email address" : "Company domain or name"}
            </span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
              placeholder={tab === "CONTACT" ? "captain@example.com" : "example.com"}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
            />
          </label>
          <label className="min-w-[200px] flex-1 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-white/50">
              Reason (optional)
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Existing customer"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
            />
          </label>
          <button
            type="button"
            onClick={() => void add()}
            disabled={saving || !input.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-ocean px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Block
          </button>
        </div>

        {(error || notice) && (
          <div
            className={cn(
              "mx-4 mb-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
              error
                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200",
            )}
          >
            {error ? <AlertTriangle className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            {error ?? notice}
          </div>
        )}

        <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          {rows.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-slate-500 dark:text-white/50">
              Nothing blocked yet. You can also block straight from a search result.
            </li>
          ) : (
            rows.map((block) => (
              <li key={block.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                    {block.label ?? block.value}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-white/50">
                    {block.value}
                    {block.reason ? ` · ${block.reason}` : ""}
                    {" · "}
                    {new Date(block.createdAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(block)}
                  disabled={removing === block.id}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-50 dark:border-white/10 dark:text-white/60"
                >
                  {removing === block.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Unblock
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

"use client";

import { useCallback, useState } from "react";
import { InfoHint } from "@/components/ui/InfoHint";
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
  const [search, setSearch] = useState("");
  // A block that is waiting for the user to confirm its impact.
  const [pending, setPending] = useState<
    null | { values: string[]; contacts: number; lists: number; queuedSends: number }
  >(null);

  const reload = useCallback(async () => {
    const res = await apiFetch(`/api/blocklist`);
    if (!res.ok) return;
    const payload = (await res.json()) as { data: BlocklistDTO };
    setData(payload.data);
  }, []);

  /** Turns one typed line into the request body for its tab. */
  function bodyFor(value: string) {
    // One field, two meanings: on the Contacts tab it is an email address; on
    // the Companies tab it is a domain or a company name. Anything with an @
    // on the company tab is read as "the company behind this address".
    return tab === "CONTACT"
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
  }

  /**
   * Ask what this block would do before doing it.
   *
   * Removing people from lists cannot be undone by unblocking, so a company
   * block that quietly empties four lists has to be a decision, not a
   * discovery. Blocks that touch nothing skip the prompt entirely — most do.
   */
  async function add() {
    const values = parseValues();
    if (values.length === 0) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    const impact = { contacts: 0, lists: 0, queuedSends: 0 };
    for (const value of values) {
      const res = await apiFetch(`/api/blocklist/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyFor(value)),
      });
      if (!res.ok) continue; // a bad entry surfaces properly during commit
      const payload = (await res.json()) as {
        data: { contacts: number; lists: number; queuedSends: number };
      };
      impact.contacts += payload.data.contacts;
      impact.lists += payload.data.lists;
      impact.queuedSends += payload.data.queuedSends;
    }
    setSaving(false);

    if (impact.contacts === 0) {
      await commit(values);
      return;
    }
    setPending({ values, ...impact });
  }

  function parseValues() {
    // Accept a pasted list — one per line or comma-separated. Blocking a
    // competitor's twelve domains was twelve trips through this form.
    return Array.from(
      new Set(
        input
          .split(/[\n,;]+/)
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    );
  }

  async function commit(values: string[]) {
    setPending(null);
    setSaving(true);
    setError(null);
    setNotice(null);

    const impact = { contacts: 0, lists: 0, cancelledSends: 0 };
    const failures: string[] = [];

    for (const value of values) {
      const res = await apiFetch(`/api/blocklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyFor(value)),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        failures.push(`${value}: ${payload?.error?.message ?? "could not be blocked"}`);
        continue;
      }
      const payload = (await res.json()) as {
        data: { impact?: { contacts: number; lists: number; cancelledSends: number } };
      };
      impact.contacts += payload.data.impact?.contacts ?? 0;
      impact.lists += payload.data.impact?.lists ?? 0;
      impact.cancelledSends += payload.data.impact?.cancelledSends ?? 0;
    }

    setSaving(false);
    if (failures.length === values.length) {
      setError(failures[0]);
      return;
    }
    if (failures.length > 0) setError(`${failures.length} could not be blocked — ${failures[0]}`);

    setInput("");
    setReason("");
    // Say what actually happened. "Blocked." on its own gave no sign that a
    // company block had just pulled twelve people out of four lists, which is
    // why the feature felt like it did nothing.
    const parts: string[] = [];
    const blocked = values.length - failures.length;
    parts.push(`Blocked ${blocked} ${tab === "CONTACT" ? "contact" : "company"}${blocked === 1 ? "" : "s"}.`);
    if (impact.contacts > 0) {
      parts.push(
        `Removed ${impact.contacts} contact${impact.contacts === 1 ? "" : "s"} from ${impact.lists} list${impact.lists === 1 ? "" : "s"}.`,
      );
    }
    if (impact.cancelledSends > 0) {
      parts.push(`${impact.cancelledSends} queued send${impact.cancelledSends === 1 ? "" : "s"} stood down.`);
    }
    if (impact.contacts === 0) parts.push("They will not appear in searches or lists.");
    setNotice(parts.join(" "));
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
    const payload = (await res.json().catch(() => null)) as
      | { data?: { resumedSends?: number } }
      | null;
    const resumed = payload?.data?.resumedSends ?? 0;
    // Say what unblocking did and, just as importantly, what it did not do —
    // the list memberships are gone for good, and finding that out later would
    // be a nasty surprise.
    setNotice(
      resumed > 0
        ? `Unblocked. ${resumed} paused send${resumed === 1 ? "" : "s"} resumed. They are not added back to any list.`
        : "Unblocked. They can be contacted again, but are not added back to any list.",
    );
    await reload();
  }

  const needle = search.trim().toLowerCase();
  const rows = data.blocks
    .filter((block) => block.kind === tab)
    .filter(
      (block) =>
        !needle ||
        block.value.toLowerCase().includes(needle) ||
        (block.label ?? "").toLowerCase().includes(needle),
    );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Do not contact</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-950 dark:text-white">
          <Ban className="h-6 w-6 text-ocean" />
          Blocked
          <InfoHint>Anyone here is excluded from every campaign in this workspace. Blocking a company covers everyone at its domain — including people not in your contacts yet — and anything already queued for them is stood down.</InfoHint>
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
            {/* A textarea, not an input: several can be pasted at once, one per
                line. Enter still submits; Shift+Enter starts a new line. */}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void add();
                }
              }}
              rows={input.includes("\n") ? 4 : 1}
              placeholder={
                tab === "CONTACT" ? "captain@example.com" : "example.com — or paste several, one per line"
              }
              className="mt-1 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
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

        {/* Impact confirmation. Only appears when the block would actually
            take people out of lists — the common case (a company nobody has
            contacts for yet) blocks immediately with no extra click. */}
        {pending ? (
          <div className="mx-4 mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              This removes {pending.contacts} contact{pending.contacts === 1 ? "" : "s"} from{" "}
              {pending.lists} list{pending.lists === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/80">
              {pending.queuedSends > 0
                ? `${pending.queuedSends} queued send${pending.queuedSends === 1 ? "" : "s"} will be stood down. `
                : ""}
              Unblocking later lets you contact them again, but does not put them back in those lists.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void commit(pending.values)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                Block anyway
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-500/15"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

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

        {data.blocks.filter((block) => block.kind === tab).length > 5 ? (
          <div className="border-t border-slate-100 px-4 py-2 dark:border-white/[0.06]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${tab === "CONTACT" ? "blocked contacts" : "blocked companies"}…`}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
            />
          </div>
        ) : null}

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
                    {block.kind === "COMPANY" && block.label && block.label !== block.value
                      ? `matches ${block.value}`
                      : block.value}
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

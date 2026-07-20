"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Lock, Search, Ship } from "lucide-react";
import type { StagedGroup } from "@/lib/campaign-data";
import { apiFetch } from "@/lib/browser-fetch";

/**
 * Review queue for contacts pulled in by a list change after the campaign went
 * live. Nothing here has been emailed — these rows are held by the send paths
 * until the user confirms, which is the whole point of the panel.
 */
export function StagedReviewPanel({
  campaignId,
  groups,
  onFindPeople,
}: {
  campaignId: string;
  groups: StagedGroup[];
  onFindPeople: (group: StagedGroup) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | "confirm" | "dismiss">(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const totals = useMemo(() => {
    const contacts = groups.flatMap((group) => group.contacts);
    return {
      contacts: contacts.length,
      vessels: groups.filter((group) => group.vessel).length,
      selectable: contacts.filter((contact) => !contact.locked).length,
    };
  }, [groups]);

  function toggle(contactId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  function toggleGroup(group: StagedGroup) {
    const ids = group.contacts.filter((c) => !c.locked).map((c) => c.contactId);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function submit(action: "confirm" | "dismiss") {
    if (!selected.size) return;
    setBusy(action);
    setError(null);
    setWarnings([]);
    try {
      const res = await apiFetch(`/api/campaigns/${campaignId}/staged/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: Array.from(selected) }),
      });
      const payload = (await res.json()) as {
        data?: { warnings?: string[] };
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(payload.error?.message ?? `Failed to ${action}`);
        return;
      }
      setWarnings(payload.data?.warnings ?? []);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!groups.length) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-5 dark:border-amber-500/30 dark:bg-amber-500/[0.06]">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <h3 className="text-base font-semibold text-amber-900 dark:text-amber-200">
            {totals.contacts} new contact{totals.contacts === 1 ? "" : "s"}
            {totals.vessels > 0
              ? ` from ${totals.vessels} new vessel${totals.vessels === 1 ? "" : "s"}`
              : ""}{" "}
            — needs review
          </h3>
          <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-200/70">
            These were added to the campaign&rsquo;s list after it went live. Nobody is emailed
            until you confirm.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {groups.map((group) => {
          const key = group.vessel?.id ?? "__none__";
          const selectableIds = group.contacts.filter((c) => !c.locked).map((c) => c.contactId);
          const allOn = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
          return (
            <div
              key={key}
              className="rounded-md border border-amber-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allOn}
                    disabled={!selectableIds.length}
                    onChange={() => toggleGroup(group)}
                    className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean dark:border-white/20"
                  />
                  <Ship className="h-4 w-4 text-slate-400 dark:text-white/40" />
                  <span className="text-sm font-semibold text-slate-950 dark:text-white">
                    {group.vessel
                      ? `${group.vessel.vesselName} (IMO ${group.vessel.imoNumber})`
                      : "Other new contacts"}
                  </span>
                  {group.vessel?.nextEta ? (
                    <span className="text-xs text-slate-500 dark:text-white/50">
                      · ETA {new Date(group.vessel.nextEta).toLocaleDateString()}
                      {group.vessel.nextEtaPort ? ` · ${group.vessel.nextEtaPort}` : ""}
                    </span>
                  ) : null}
                </label>
                {group.companyNames.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onFindPeople(group)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-ocean hover:text-ocean dark:border-white/15 dark:text-white/70 dark:hover:text-white"
                  >
                    <Search className="h-3 w-3" />
                    Find more people at {group.companyNames[0]}
                  </button>
                ) : null}
              </div>

              <div className="mt-2 divide-y divide-slate-100 dark:divide-white/[0.06]">
                {group.contacts.map((contact) => (
                  <label
                    key={contact.contactId}
                    className={`flex items-center gap-3 py-2 text-sm ${
                      contact.locked ? "opacity-60" : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(contact.contactId)}
                      disabled={contact.locked}
                      onChange={() => toggle(contact.contactId)}
                      className="h-4 w-4 rounded border-slate-300 text-ocean focus:ring-ocean dark:border-white/20"
                    />
                    <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-white/85">
                      {contact.firstName} {contact.lastName}
                      {contact.title ? (
                        <span className="text-slate-500 dark:text-white/50"> · {contact.title}</span>
                      ) : null}
                    </span>
                    <span className="hidden min-w-0 flex-1 truncate text-slate-500 dark:text-white/50 sm:block">
                      {contact.locked ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                          <Lock className="h-3 w-3" />
                          Email not revealed yet
                        </span>
                      ) : (
                        contact.email
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {error ? <p className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p> : null}
      {warnings.map((warning) => (
        <p key={warning} className="mt-3 text-sm text-amber-800 dark:text-amber-300">
          {warning}
        </p>
      ))}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!selected.size || busy !== null}
          onClick={() => submit("confirm")}
          className="inline-flex items-center gap-2 rounded-md bg-[#4F6DFF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#3B4FE6] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Add {selected.size || ""} selected to campaign
        </button>
        <button
          type="button"
          disabled={!selected.size || busy !== null}
          onClick={() => submit("dismiss")}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/[0.06]"
        >
          {busy === "dismiss" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Dismiss
        </button>
        {totals.selectable === 0 ? (
          <span className="text-xs text-amber-800 dark:text-amber-300">
            Every candidate needs its email revealed before it can be added.
          </span>
        ) : null}
      </div>
    </div>
  );
}

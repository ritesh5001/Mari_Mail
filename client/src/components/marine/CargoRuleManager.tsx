"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import { formatVesselEnum } from "@/lib/vessel-filter-options";
import { TokenInput } from "@/components/settings/rules/TokenInput";
import { VesselTypePicker } from "@/components/settings/rules/VesselTypePicker";

type CampaignOption = { id: string; name: string };
type Rule = {
  id: string;
  previousCargo: string[];
  nextCargo: string[];
  vesselTypes: string[];
  campaignName: string;
  autoEnroll: boolean;
  workspaceScoped: boolean;
};

/**
 * Cargo change rules.
 *
 * Rewritten alongside the port rules, and with one outright bug fixed: the old
 * form's submit handler read `form.getAll("vesselTypes")`, but the form had no
 * vessel-types field anywhere in it. Every rule was therefore created with an
 * empty array while the table beside it rendered a "Vessel Types" column that
 * could never show anything — the control had been dropped without the
 * handler or the table following.
 */
export function CargoRuleManager({
  rules,
  campaigns,
}: {
  rules: Rule[];
  campaigns: CampaignOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [previousCargo, setPreviousCargo] = useState<string[]>([]);
  const [nextCargo, setNextCargo] = useState<string[]>([]);
  const [vesselTypes, setVesselTypes] = useState<string[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [autoEnroll, setAutoEnroll] = useState(true);
  const [saving, setSaving] = useState(false);

  const ready = Boolean(campaignId && nextCargo.length > 0);

  function resetDraft() {
    setPreviousCargo([]);
    setNextCargo([]);
    setVesselTypes([]);
    setCampaignId("");
    setAutoEnroll(true);
  }

  async function createRule() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/cargo-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previousCargo, nextCargo, vesselTypes, campaignId, autoEnroll }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "Failed to create rule");
      }
      resetDraft();
      setAdding(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(id: string) {
    setError(null);
    try {
      const response = await apiFetch(`/api/cargo-rules/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "Failed to delete rule");
      }
      setDeletingId(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {rules.length === 0 && !adding ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center dark:border-white/10">
          <p className="text-sm text-slate-600 dark:text-white/60">No cargo rules yet.</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-white/45">
            A vessel switching trade — coal out, grain in — is often a vessel changing supplier. A
            rule catches that moment and starts a campaign.
          </p>
        </div>
      ) : null}

      {rules.length > 0 ? (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-white/[0.06] dark:border-white/10">
          {rules.map((rule) => (
            <li key={rule.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-700 dark:text-white/70">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {rule.previousCargo.length === 0 ? "Any cargo" : rule.previousCargo.join(", ")}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-white/35" />
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {rule.nextCargo.length === 0 ? "any cargo" : rule.nextCargo.join(", ")}
                    </span>
                    <span className="text-slate-400 dark:text-white/35">
                      {rule.autoEnroll ? "· enrol in" : "· suggest"}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {rule.campaignName}
                    </span>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400 dark:text-white/30">
                    <span>
                      {rule.vesselTypes.length === 0
                        ? "Any vessel type"
                        : rule.vesselTypes.map(formatVesselEnum).join(", ")}
                    </span>
                    {!rule.autoEnroll ? (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700 dark:bg-amber-500/12 dark:text-amber-300">
                        Needs review
                      </span>
                    ) : null}
                    {!rule.workspaceScoped ? (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-500 dark:bg-white/[0.06] dark:text-white/45">
                        Built-in
                      </span>
                    ) : null}
                  </p>
                </div>

                {rule.workspaceScoped ? (
                  <button
                    type="button"
                    onClick={() => setDeletingId(rule.id)}
                    aria-label="Delete rule"
                    className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              {deletingId === rule.id ? (
                <div className="mt-2 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 dark:bg-red-500/10">
                  <p className="flex-1 text-xs text-red-700 dark:text-red-300">
                    Delete this rule? This can&rsquo;t be undone.
                  </p>
                  <button
                    type="button"
                    onClick={() => deleteRule(rule.id)}
                    className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(null)}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 dark:text-white/60"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <div className="rounded-lg border border-slate-200 p-4 dark:border-white/10">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="cargo-prev"
                className="block text-xs font-medium text-slate-600 dark:text-white/60"
              >
                Previous cargo
              </label>
              <div className="mt-1">
                <TokenInput
                  id="cargo-prev"
                  value={previousCargo}
                  onChange={setPreviousCargo}
                  placeholder="COAL — Enter to add"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-white/45">
                Leave empty to match whatever it was carrying before.
              </p>
            </div>

            <div>
              <label
                htmlFor="cargo-next"
                className="block text-xs font-medium text-slate-600 dark:text-white/60"
              >
                Next cargo
              </label>
              <div className="mt-1">
                <TokenInput
                  id="cargo-next"
                  value={nextCargo}
                  onChange={setNextCargo}
                  placeholder="GRAIN — Enter to add"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-white/45">
                Required. The rule fires when the next cargo is one of these.
              </p>
            </div>

            <div className="md:col-span-2">
              <span className="block text-xs font-medium text-slate-600 dark:text-white/60">
                Vessel types
              </span>
              <div className="mt-1.5">
                <VesselTypePicker value={vesselTypes} onChange={setVesselTypes} />
              </div>
            </div>

            <div>
              <label
                htmlFor="cargo-campaign"
                className="block text-xs font-medium text-slate-600 dark:text-white/60"
              >
                Campaign
              </label>
              <select
                id="cargo-campaign"
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
              >
                <option value="">Choose a campaign…</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
              {campaigns.length === 0 ? (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  You have no campaigns yet — create one first.
                </p>
              ) : null}
            </div>

            <div className="flex items-start">
              <label className="mt-5 flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoEnroll}
                  onChange={(event) => setAutoEnroll(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500 dark:border-white/20"
                />
                <span>
                  <span className="font-medium text-slate-900 dark:text-white">Enrol automatically</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-white/45">
                    Off means matches wait for your review.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={createRule}
              disabled={!ready || saving || pending}
              className="inline-flex items-center gap-2 rounded-md bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add rule
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                resetDraft();
                setError(null);
              }}
              className="rounded-md px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            {!ready ? (
              <span className="text-xs text-slate-400 dark:text-white/30">
                Add a next cargo and choose a campaign.
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-accent-400 hover:text-accent-600 dark:border-white/10 dark:text-white/70 dark:hover:border-accent-400/50 dark:hover:text-accent-300"
        >
          <Plus className="h-4 w-4" />
          New rule
        </button>
      )}
    </div>
  );
}

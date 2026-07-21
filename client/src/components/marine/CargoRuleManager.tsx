"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/browser-fetch";
import { useClientSort } from "@/hooks/useClientSort";
import { SortableHeader } from "@/components/table/SortableHeader";

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

export function CargoRuleManager({ rules, campaigns }: { rules: Rule[]; campaigns: CampaignOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { sorted, sort, toggle } = useClientSort(rules, {
    previousCargo: (r) => r.previousCargo.join(", "),
    nextCargo: (r) => r.nextCargo.join(", "),
    vesselTypes: (r) => r.vesselTypes.join(", "),
    campaign: (r) => r.campaignName,
    autoEnroll: (r) => r.autoEnroll,
  });

  async function createRule(form: FormData) {
    setError(null);
    const split = (input: string) => input.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    const body = {
      previousCargo: split(String(form.get("previousCargo") || "")),
      nextCargo: split(String(form.get("nextCargo") || "")),
      vesselTypes: form.getAll("vesselTypes").map(String),
      campaignId: String(form.get("campaignId")),
      autoEnroll: form.get("autoEnroll") === "on",
    };
    const response = await apiFetch(`/api/cargo-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      setError(payload.error?.message ?? "Failed to create rule");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function deleteRule(id: string) {
    const response = await apiFetch(`/api/cargo-rules/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      setError(payload.error?.message ?? "Failed to delete rule");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Existing Rules</h3>
        <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <SortableHeader label="Previous Cargo" sortKey="previousCargo" sort={sort} onSort={toggle} className="px-3 py-2" />
                <SortableHeader label="Next Cargo" sortKey="nextCargo" sort={sort} onSort={toggle} className="px-3 py-2" />
                <SortableHeader label="Vessel Types" sortKey="vesselTypes" sort={sort} onSort={toggle} className="px-3 py-2" />
                <SortableHeader label="Campaign" sortKey="campaign" sort={sort} onSort={toggle} className="px-3 py-2" />
                <SortableHeader label="Auto-Enroll" sortKey="autoEnroll" sort={sort} onSort={toggle} className="px-3 py-2" />
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((rule) => (
                <tr key={rule.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-600">{rule.previousCargo.length === 0 ? "ANY" : rule.previousCargo.join(", ")}</td>
                  <td className="px-3 py-2 text-slate-600">{rule.nextCargo.length === 0 ? "ANY" : rule.nextCargo.join(", ")}</td>
                  <td className="px-3 py-2 text-slate-600">{rule.vesselTypes.length === 0 ? "All" : rule.vesselTypes.join(", ")}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{rule.campaignName}</td>
                  <td className="px-3 py-2 text-slate-600">{rule.autoEnroll ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-right">
                    {rule.workspaceScoped ? (
                      <button onClick={() => deleteRule(rule.id)} className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                    ) : (
                      <span className="text-xs text-slate-400">Default</span>
                    )}
                  </td>
                </tr>
              ))}
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">No cargo change rules yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Add Rule</h3>
        <form
          className="mt-3 grid gap-3 md:grid-cols-2"
          action={(formData) => {
            createRule(formData);
          }}
        >
          <label className="text-sm">
            Previous Cargo (comma separated, empty = ANY)
            <input name="previousCargo" placeholder="COAL, IRON_ORE" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            Next Cargo (comma separated)
            <input name="nextCargo" required placeholder="GRAIN" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            Campaign
            <select name="campaignId" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Choose campaign…</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="autoEnroll" defaultChecked /> Auto-enroll matching ETAs
          </label>
          <div className="md:col-span-2 flex items-center justify-end gap-3">
            {error ? <p className="mr-auto text-sm text-red-600">{error}</p> : null}
            <button type="submit" disabled={pending} className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {pending ? "Saving…" : "Add Rule"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

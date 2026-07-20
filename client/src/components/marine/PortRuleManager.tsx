"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/browser-fetch";

type PortOption = { portCode: string; portName: string };
type CampaignOption = { id: string; name: string };
type Rule = {
  id: string;
  portCode: string;
  portName: string;
  vesselTypes: string[];
  campaignId: string;
  campaignName: string;
  autoEnroll: boolean;
  priority: number;
  workspaceScoped: boolean;
};

const vesselTypeOptions = [
  "BULK_CARRIER",
  "TANKER_CRUDE",
  "TANKER_PRODUCT",
  "TANKER_CHEMICAL",
  "TANKER_LPG",
  "TANKER_LNG",
  "CONTAINER",
  "GENERAL_CARGO",
  "RORO",
  "OFFSHORE_PSV",
  "OFFSHORE_AHTS",
  "FERRY",
  "CRUISE",
  "DREDGER",
  "HEAVY_LIFT",
  "BARGE",
  "SUPPLY_BOAT",
  "RESEARCH",
  "OTHER",
];

export function PortRuleManager({ rules, campaigns, ports }: { rules: Rule[]; campaigns: CampaignOption[]; ports: PortOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function createRule(form: FormData) {
    setError(null);
    const body = {
      portCode: String(form.get("portCode")),
      vesselTypes: form.getAll("vesselTypes").map(String),
      campaignId: String(form.get("campaignId")),
      autoEnroll: form.get("autoEnroll") === "on",
      priority: Number(form.get("priority") || 100),
    };
    const response = await apiFetch(`/api/port-rules`, {
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
    const response = await apiFetch(`/api/port-rules/${id}`, {
      method: "DELETE",
    });
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
                <th className="px-3 py-2">Port</th>
                <th className="px-3 py-2">Vessel Types</th>
                <th className="px-3 py-2">Campaign</th>
                <th className="px-3 py-2">Auto-Enroll</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{rule.portName} ({rule.portCode})</td>
                  <td className="px-3 py-2 text-slate-600">{rule.vesselTypes.length === 0 ? "All types" : rule.vesselTypes.join(", ")}</td>
                  <td className="px-3 py-2 text-slate-600">{rule.campaignName}</td>
                  <td className="px-3 py-2 text-slate-600">{rule.autoEnroll ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-slate-600">{rule.priority}</td>
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
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">No port campaign rules yet.</td>
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
            Port
            <select name="portCode" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Choose port…</option>
              {ports.map((port) => (
                <option key={port.portCode} value={port.portCode}>{port.portName} ({port.portCode})</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Campaign
            <select name="campaignId" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Choose campaign…</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            Vessel Types (leave none for all types)
            <select multiple name="vesselTypes" className="mt-1 h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {vesselTypeOptions.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Priority
            <input name="priority" type="number" defaultValue={100} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
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

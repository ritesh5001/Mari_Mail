import Link from "next/link";
import { formatEnum } from "@/lib/contact-data";
import { listCampaignsForWorkspace, listPortRules, listPorts, requireEtaWorkspaceId } from "@/lib/eta-data";
import { PortRuleManager } from "@/components/marine/PortRuleManager";

export const dynamic = "force-dynamic";

export default async function PortRulesPage() {
  const { workspaceId } = await requireEtaWorkspaceId();
  const [rules, campaigns, ports] = await Promise.all([
    listPortRules(workspaceId),
    listCampaignsForWorkspace(workspaceId),
    listPorts(),
  ]);

  return (
    <div className="space-y-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Settings</p>
        <h2 className="text-2xl font-semibold text-slate-950">Port Campaign Rules</h2>
        <p className="mt-1 text-sm text-slate-600">
          Auto-assign an ETA-triggered campaign when a vessel of a given type arrives at a specific port. Rules are scored by
          priority — lowest fires first.
        </p>
        <p className="mt-1 text-xs text-slate-400"><Link className="text-ocean hover:underline" href="/dashboard/settings/cargo-rules">Cargo change rules →</Link></p>
      </header>
      <PortRuleManager rules={rules.map((rule) => ({
        id: rule.id,
        portCode: rule.portCode,
        portName: rule.port?.portName ?? rule.portCode,
        vesselTypes: rule.vesselTypes.map((type) => String(type)),
        campaignId: rule.campaignId,
        campaignName: rule.campaign.name,
        autoEnroll: rule.autoEnroll,
        priority: rule.priority,
        workspaceScoped: rule.workspaceId !== null,
      }))} campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))} ports={ports.map((p) => ({ portCode: p.portCode, portName: p.portName }))} />
      <p className="text-xs text-slate-400">Tip: priority 10 = highest urgency. {formatEnum("PORT_BASED")} campaigns appear first in the campaign picker.</p>
    </div>
  );
}

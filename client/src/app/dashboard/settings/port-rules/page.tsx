import { formatEnum } from "@/lib/contact-data";
import { SettingsCard } from "@/components/settings/SettingsCard";
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
    <SettingsCard
      title="Port campaign rules"
      description="Automatically enrol a vessel in a campaign when it arrives at a given port. Priority 10 is the highest — the first matching rule wins."
    >
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
      <p className="mt-3 text-xs text-slate-500 dark:text-white/45">
        {formatEnum("PORT_BASED")} campaigns appear first in the campaign picker.
      </p>
    </SettingsCard>
  );
}
